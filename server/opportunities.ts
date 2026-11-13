/* Personal follow-up queue from email-ready visitor insights (no drafts/send yet). */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { identities, projectCampaignSuggestions, projectOpportunities, visitorInsights } from './schema';

const ACTIVE = ['review', 'hold', 'ready_for_draft', 'drafted', 'sent'] as const;

export async function upsertOpportunityFromInsight(
  db: NodePgDatabase,
  projectId: string,
  visitorId: string,
  insight: { emailReady: boolean; summaryText: string | null; emailHooks: string[] },
) {
  if (!insight.emailReady) return null;
  const [identity] = await db.select().from(identities)
    .where(and(eq(identities.projectId, projectId), eq(identities.visitorId, visitorId)))
    .limit(1);
  if (!identity?.email) return null;

  const hooks = insight.emailHooks.slice(0, 6);
  const reason = hooks[0] || 'Enough signal for a personal follow-up';
  const now = new Date();
  const [existing] = await db.select().from(projectOpportunities)
    .where(and(eq(projectOpportunities.projectId, projectId), eq(projectOpportunities.visitorId, visitorId)))
    .limit(1);

  if (existing) {
    if (existing.status === 'dismissed' || existing.suppressed) return existing;
    const keep = new Set(['hold', 'ready_for_draft', 'drafted', 'sent']);
    const [row] = await db.update(projectOpportunities).set({
      reason,
      hooksJson: hooks,
      insightSummary: insight.summaryText,
      email: identity.email,
      name: identity.name,
      updatedAt: now,
      status: keep.has(existing.status) ? existing.status : 'review',
    }).where(eq(projectOpportunities.id, existing.id)).returning();
    return row;
  }

  const [row] = await db.insert(projectOpportunities).values({
    projectId,
    visitorId,
    status: 'review',
    reason,
    hooksJson: hooks,
    insightSummary: insight.summaryText,
    email: identity.email,
    name: identity.name,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return row;
}

export async function listOpportunities(db: NodePgDatabase, projectId: string) {
  const rows = await db.select().from(projectOpportunities)
    .where(and(
      eq(projectOpportunities.projectId, projectId),
      inArray(projectOpportunities.status, [...ACTIVE, 'dismissed']),
    ))
    .orderBy(desc(projectOpportunities.updatedAt))
    .limit(80);
  return rows.map((row) => ({
    id: row.id,
    visitorId: row.visitorId,
    status: row.status,
    reason: row.reason,
    hooks: Array.isArray(row.hooksJson) ? row.hooksJson : [],
    insightSummary: row.insightSummary,
    email: row.email,
    name: row.name,
    suppressed: row.suppressed,
    hasDraft: Boolean(row.draftJson),
    draft: row.draftJson || null,
    page: row.pageJson || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function patchOpportunity(
  db: NodePgDatabase,
  projectId: string,
  opportunityId: string,
  status: string,
) {
  const allowed = new Set(['review', 'hold', 'dismissed', 'ready_for_draft', 'drafted', 'sent']);
  if (!allowed.has(status)) throw new Error('Invalid status');
  const [row] = await db.update(projectOpportunities).set({
    status,
    updatedAt: new Date(),
  }).where(and(
    eq(projectOpportunities.id, opportunityId),
    eq(projectOpportunities.projectId, projectId),
  )).returning();
  return row || null;
}

export async function getOpportunity(db: NodePgDatabase, projectId: string, opportunityId: string) {
  const [row] = await db.select().from(projectOpportunities)
    .where(and(eq(projectOpportunities.id, opportunityId), eq(projectOpportunities.projectId, projectId)))
    .limit(1);
  return row || null;
}

/** Rebuild suggestions from recent email-ready insights (shared hooks). */
export async function refreshCampaignSuggestions(db: NodePgDatabase, projectId: string) {
  const ready = await db.select({
    visitorId: visitorInsights.visitorId,
    hooks: visitorInsights.emailHooksJson,
    interests: visitorInsights.interestsJson,
    summary: visitorInsights.summaryText,
  }).from(visitorInsights)
    .where(and(
      eq(visitorInsights.projectId, projectId),
      eq(visitorInsights.status, 'ready'),
      eq(visitorInsights.emailReady, true),
    ))
    .limit(200);

  const buckets = new Map<string, { title: string; count: number; sample: string }>();
  for (const row of ready) {
    const hooks = Array.isArray(row.hooks) ? row.hooks.filter((h): h is string => typeof h === 'string') : [];
    const interests = Array.isArray(row.interests) ? row.interests.filter((h): h is string => typeof h === 'string') : [];
    const keyRaw = (hooks[0] || interests[0] || '').trim();
    if (!keyRaw) continue;
    const patternKey = keyRaw.toLowerCase().slice(0, 80);
    const prev = buckets.get(patternKey);
    if (prev) prev.count += 1;
    else buckets.set(patternKey, { title: keyRaw.slice(0, 72), count: 1, sample: (row.summary || keyRaw).slice(0, 160) });
  }

  let upserted = 0;
  for (const [patternKey, bucket] of buckets) {
    if (bucket.count < 3) continue;
    const now = new Date();
    await db.insert(projectCampaignSuggestions).values({
      projectId,
      patternKey,
      title: bucket.title,
      audienceSummary: `${bucket.count} people share this signal: ${bucket.sample}`,
      evidenceCount: bucket.count,
      status: 'suggested',
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [projectCampaignSuggestions.projectId, projectCampaignSuggestions.patternKey],
      set: {
        title: bucket.title,
        audienceSummary: `${bucket.count} people share this signal: ${bucket.sample}`,
        evidenceCount: bucket.count,
        updatedAt: now,
      },
    });
    upserted += 1;
  }
  return { upserted };
}

export async function listCampaignSuggestions(db: NodePgDatabase, projectId: string) {
  const rows = await db.select().from(projectCampaignSuggestions)
    .where(and(
      eq(projectCampaignSuggestions.projectId, projectId),
      inArray(projectCampaignSuggestions.status, ['suggested', 'accepted']),
    ))
    .orderBy(desc(projectCampaignSuggestions.evidenceCount))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    patternKey: row.patternKey,
    title: row.title,
    audienceSummary: row.audienceSummary,
    evidenceCount: row.evidenceCount,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function patchCampaignSuggestion(
  db: NodePgDatabase,
  projectId: string,
  suggestionId: string,
  status: string,
) {
  const allowed = new Set(['suggested', 'dismissed', 'accepted']);
  if (!allowed.has(status)) throw new Error('Invalid status');
  const [row] = await db.update(projectCampaignSuggestions).set({
    status,
    updatedAt: new Date(),
  }).where(and(
    eq(projectCampaignSuggestions.id, suggestionId),
    eq(projectCampaignSuggestions.projectId, projectId),
  )).returning();
  return row || null;
}
