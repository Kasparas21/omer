/* Small AES-GCM box for storing BYO provider API keys at rest. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function keyMaterial() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.SENDING_SECRET?.trim() || '';
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required to store provider keys');
  return createHash('sha256').update(`omer-sending-keys:${secret}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function openSecret(sealed: string): string {
  const [ver, ivB64, tagB64, dataB64] = sealed.split('.');
  if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Invalid sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}
