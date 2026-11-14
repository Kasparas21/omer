/* Send a drafted opportunity email via SES/Resend and log the message. */
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { appURL } from './auth';
import { loadBrand } from './brand-import';
import type { MailDocLike, PageStyleLike } from './email-html';
import { mailDocToHtml, mailDocToText } from './email-html';
import { personalize } from './campaign-runner';
import { brandFromStore, pageFromBrand } from './email-page';
import { trackingUrls } from './email-tracking';
import { loadSending, mailProvidersAvailable, sendViaTransport } from './mail-transport';
import { projectEmailMessages, projectOpportunities, projects } from './schema';

export async function sendOpportunityEmail(
  db: NodePgDatabase,
  projectId: string,
  opportunityId: string,
) {
  const providers = mailProvidersAvailable();
  if (!providers.ses && !providers.resend) throw new Error('Email sending is not configured');

  const [opp] = await db.select().from(projectOpportunities)
    .where(and(eq(projectOpportunities.id, opportunityId), eq(projectOpportunities.projectId, projectId)))
    .limit(1);
  if (!opp) throw new Error('Opportunity not found');
  if (opp.suppressed) throw new Error('This person unsubscribed');
  if (!opp.email) throw new Error('No email on this opportunity');
  if (!opp.draftJson || typeof opp.draftJson !== 'object') throw new Error('Draft this email before sending');

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error('Project not found');

  const brandFull = await loadBrand(db, projectId);
  let host = '';
  try { host = new URL(project.origin).host; } catch { host = project.origin; }
  const brand = brandFromStore(project.name, brandFull, host);
  const page = (opp.pageJson && typeof opp.pageJson === 'object')
    ? { ...pageFromBrand(brandFull), ...(opp.pageJson as Partial<PageStyleLike>) }
    : pageFromBrand(brandFull);
  // Any {{field}} still in the draft gets this person's details, else the fallback set in the editor.
  const doc = personalize(opp.draftJson as Parameters<typeof personalize>[0], {
    first_name: (opp.name ?? '').trim().split(/\s+/)[0] ?? '',
    full_name: (opp.name ?? '').trim(),
    email: opp.email,
    store_name: project.name,
  }) as unknown as MailDocLike;
  const sending = await loadSending(db, projectId);

  const [queued] = await db.insert(projectEmailMessages).values({
    projectId,
    opportunityId,
    visitorId: opp.visitorId,
    toEmail: opp.email,
    subject: doc.subject || 'Hello',
    status: 'queued',
    createdAt: new Date(),
  }).returning();

  const urls = trackingUrls(projectId, queued.id, opp.visitorId, appURL);
  const html = mailDocToHtml(doc, page, brand, {
    openPixel: urls.openPixel,
    unsubscribeUrl: urls.unsubscribe,
    wrapClick: urls.click,
    name: opp.name,
  });
  const text = mailDocToText(doc, brand, { name: opp.name, unsubscribeUrl: urls.unsubscribe });

  try {
    const { messageId, from } = await sendViaTransport({
      projectName: project.name,
      sending,
      to: opp.email,
      subject: doc.subject || 'Hello',
      html,
      text,
      listUnsubscribeUrl: urls.unsubscribe,
    });
    const now = new Date();
    const [sent] = await db.update(projectEmailMessages).set({
      status: 'sent',
      sesMessageId: messageId,
      provider: from.provider,
      fromEmail: from.fromEmail,
      sentAt: now,
    }).where(eq(projectEmailMessages.id, queued.id)).returning();

    await db.update(projectOpportunities).set({
      status: 'sent',
      updatedAt: now,
    }).where(eq(projectOpportunities.id, opportunityId));

    return { message: sent, tracking: { unsubscribe: urls.unsubscribe }, from };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed';
    await db.update(projectEmailMessages).set({
      status: 'failed',
      error: message.slice(0, 500),
    }).where(eq(projectEmailMessages.id, queued.id));
    throw error;
  }
}
