/* A store's campaigns on the server: list, save one, delete one; and images for emails (kept in R2 under an unguessable name, served publicly so inboxes can load them).
   The app owns the campaign's shape; the server checks the parts it relies on (id, name, trigger, size). */
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { projectCampaigns } from './schema';
import { getObject, objectStoreConfigured, putObject } from './object-store';
import { cleanTrigger } from './trigger-library';

export const CAMPAIGN_ID = /^[a-z0-9][a-z0-9-]{5,63}$/i;
const MAX_CAMPAIGNS = 100;

export async function listCampaigns(db: NodePgDatabase, projectId: string) {
  const rows = await db.select({ data: projectCampaigns.data }).from(projectCampaigns)
    .where(eq(projectCampaigns.projectId, projectId)).orderBy(asc(projectCampaigns.createdAt));
  return rows.map((r) => r.data);
}

/** Saves one campaign. Returns an error message, or null when saved. */
export async function saveCampaign(db: NodePgDatabase, projectId: string, id: string, input: unknown): Promise<string | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'campaign required.';
  const data: Record<string, unknown> = { ...(input as Record<string, unknown>), id };
  data.name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : 'New campaign';
  data.trigger = data.trigger == null ? null : cleanTrigger(data.trigger);
  data.mode = data.mode === 'auto' ? 'auto' : 'review';
  const settings = (data.settings && typeof data.settings === 'object' ? data.settings : {}) as Record<string, unknown>;
  data.settings = Object.fromEntries(['limit', 'who', 'freq', 'quiet', 'expires', 'from']
    .filter((k) => typeof settings[k] === 'string')
    .map((k) => [k, String(settings[k]).trim().slice(0, 80)]));
  const [existing] = await db.select({ id: projectCampaigns.id, projectId: projectCampaigns.projectId })
    .from(projectCampaigns).where(eq(projectCampaigns.id, id)).limit(1);
  if (existing && existing.projectId !== projectId) return 'Not found.';
  if (!existing) {
    const count = (await db.select({ id: projectCampaigns.id }).from(projectCampaigns).where(eq(projectCampaigns.projectId, projectId))).length;
    if (count >= MAX_CAMPAIGNS) return `Up to ${MAX_CAMPAIGNS} campaigns per store.`;
  }
  const now = new Date();
  await db.insert(projectCampaigns).values({ id, projectId, data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: projectCampaigns.id, set: { data, updatedAt: now } });
  return null;
}

export async function deleteCampaign(db: NodePgDatabase, projectId: string, id: string) {
  await db.delete(projectCampaigns).where(and(eq(projectCampaigns.id, id), eq(projectCampaigns.projectId, projectId)));
}

// ---------- Email images
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
export const ASSET_NAME = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/i;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageStorageReady() { return objectStoreConfigured(); }

/** Stores an uploaded image and returns the public path it's served from. */
export async function storeImage(projectId: string, type: string, bytes: Buffer) {
  const ext = IMAGE_TYPES[type.split(';')[0].trim().toLowerCase()];
  if (!ext) throw new Error('PNG, JPG, WebP or GIF only.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Up to 5 MB.');
  const name = `${projectId}/${randomUUID()}.${ext}`;
  await putObject(`email-assets/${name}`, bytes, type);
  return `/i/${name}`;
}

export async function loadImage(name: string) {
  if (!ASSET_NAME.test(name)) return null;
  if (!objectStoreConfigured()) return null;
  const body = await getObject(`email-assets/${name}`).catch(() => null);
  if (!body) return null;
  const ext = name.split('.').pop()!.toLowerCase();
  const type = Object.entries(IMAGE_TYPES).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
  return { body, type };
}
