/* High-confidence personal follow-ups: draft with Luna, then send when Sending is ready.
   Lower-confidence email-ready people stay in Opportunities for a manual draft. */
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { draftOpportunityEmail } from './email-draft';
import { sendOpportunityEmail } from './email-send';
import { loadSending, mailProvidersAvailable, resolveFrom } from './mail-transport';
import { projectOpportunities, projects, visitorInsights, visits } from './schema';

/** Match the “Email-ready 80%+” bar people expect when they see a strong score. */
export const PERSONAL_AUTO_CONFIDENCE = 0.8;
/** Don’t email while they’re still on the site (or just left). */
const COOL_MS = 2 * 60_000;
const BATCH = 8;

function sendingReady(projectName: string, sending: Awaited<ReturnType<typeof loadSending>>) {
  const providers = mailProvidersAvailable();
  if (!providers.ses && !providers.resend && !providers.postmark) return false;
  return Boolean(resolveFrom(projectName, sending).fromEmail);
}

async function visitorStillAround(db: NodePgDatabase, projectId: string, visitorId: string) {
  const [row] = await db.select({
    activeAt: visits.activeAt,
    seenAt: visits.seenAt,
  }).from(visits)
    .where(and(eq(visits.projectId, projectId), eq(visits.visitorId, visitorId)))
    .orderBy(desc(sql`coalesce(${visits.activeAt}, ${visits.seenAt})`))
    .limit(1);
  if (!row) return false;
  const at = Date.parse(String(row.activeAt ?? row.seenAt));
  return Number.isFinite(at) && Date.now() - at < COOL_MS;
}

async function processOne(db: NodePgDatabase, projectId: string, opportunityId: string, projectName: string) {
  const sending = await loadSending(db, projectId);
  if (!sendingReady(projectName, sending)) return 'skip-sending';

  const [opp] = await db.select().from(projectOpportunities)
    .where(and(
      eq(projectOpportunities.id, opportunityId),
      eq(projectOpportunities.projectId, projectId),
      isNull(projectOpportunities.campaignId),
    ))
    .limit(1);
  if (!opp || opp.suppressed || !opp.email) return 'skip';
  if (opp.status === 'sent' || opp.status === 'dismissed' || opp.status === 'converted') return 'skip';
  if (await visitorStillAround(db, projectId, opp.visitorId)) return 'wait';

  if (!opp.draftJson) {
    await draftOpportunityEmail(db, projectId, opportunityId);
  }
  await sendOpportunityEmail(db, projectId, opportunityId);
  return 'sent';
}

/** Draft + send personal opportunities that cleared the confidence bar. */
export async function processPersonalFollowups(db: NodePgDatabase, onlyProject?: string) {
  const providers = mailProvidersAvailable();
  if (!providers.ses && !providers.resend && !providers.postmark) return { sent: 0, waited: 0 };

  const projectRows = await db.select({
    id: projects.id,
    name: projects.name,
  }).from(projects)
    .where(and(
      eq(projects.personalFollowups, true),
      onlyProject ? eq(projects.id, onlyProject) : sql`true`,
    ));

  let sent = 0;
  let waited = 0;
  for (const project of projectRows) {
    const sending = await loadSending(db, project.id);
    if (!sendingReady(project.name, sending)) continue;

    const candidates = await db.select({
      id: projectOpportunities.id,
      confidence: visitorInsights.emailReadyConfidence,
    }).from(projectOpportunities)
      .innerJoin(visitorInsights, and(
        eq(visitorInsights.projectId, projectOpportunities.projectId),
        eq(visitorInsights.visitorId, projectOpportunities.visitorId),
      ))
      .where(and(
        eq(projectOpportunities.projectId, project.id),
        isNull(projectOpportunities.campaignId),
        eq(projectOpportunities.suppressed, false),
        inArray(projectOpportunities.status, ['review', 'ready_for_draft', 'drafted']),
        gte(visitorInsights.emailReadyConfidence, PERSONAL_AUTO_CONFIDENCE),
      ))
      .orderBy(desc(visitorInsights.emailReadyConfidence))
      .limit(BATCH);

    for (const row of candidates) {
      try {
        const result = await processOne(db, project.id, row.id, project.name);
        if (result === 'sent') sent += 1;
        else if (result === 'wait') waited += 1;
      } catch (error) {
        console.error('personal follow-up failed', project.id, row.id, error instanceof Error ? error.message : error);
      }
    }
  }
  return { sent, waited };
}

/** Fire-and-forget after a fresh high-confidence insight (still respects cool-down). */
export function kickPersonalFollowup(
  db: NodePgDatabase,
  projectId: string,
  opportunityId: string,
  confidence: number | null | undefined,
) {
  if (confidence == null || confidence < PERSONAL_AUTO_CONFIDENCE) return;
  void (async () => {
    const [project] = await db.select({ name: projects.name, on: projects.personalFollowups })
      .from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project?.on) return;
    try {
      await processOne(db, projectId, opportunityId, project.name);
    } catch (error) {
      console.error('personal follow-up kick failed', projectId, opportunityId, error instanceof Error ? error.message : error);
    }
  })();
}
