import { createHash, createHmac, randomBytes } from 'node:crypto';

type PutResult = { key: string; bytes: number };

function required(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function objectStoreConfigured() {
  return Boolean(
    required('R2_ACCOUNT_ID')
    && required('R2_ACCESS_KEY_ID')
    && required('R2_SECRET_ACCESS_KEY')
    && required('R2_BUCKET'),
  );
}

function endpoint() {
  return required('R2_ENDPOINT')
    || `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
}

function bucket() {
  return required('R2_BUCKET')!;
}

/** Minimal AWS SigV4 for R2 PutObject / GetObject / DeleteObject. */
async function signedFetch(method: string, key: string, body?: Buffer, contentType?: string) {
  const accessKey = required('R2_ACCESS_KEY_ID')!;
  const secret = required('R2_SECRET_ACCESS_KEY')!;
  const region = process.env.R2_REGION?.trim() || 'auto';
  const host = new URL(endpoint()).host;
  const path = `/${bucket()}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash('sha256').update(body ?? '').digest('hex');
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  if (body) headers['content-length'] = String(body.length);
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = [
    method, path, '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const kDate = createHmac('sha256', `AWS4${secret}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${path}`, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 ${method} failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return response;
}

export async function putObject(key: string, body: Buffer, contentType = 'application/json'): Promise<PutResult> {
  if (!objectStoreConfigured()) throw new Error('R2 is not configured');
  await signedFetch('PUT', key, body, contentType);
  return { key, bytes: body.length };
}

export async function deleteObject(key: string) {
  if (!objectStoreConfigured()) return;
  await signedFetch('DELETE', key);
}

export async function getObject(key: string) {
  if (!objectStoreConfigured()) throw new Error('R2 is not configured');
  const response = await signedFetch('GET', key);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

/** Short-lived query-string signed GET URL for the dashboard player. */
export function signedGetUrl(key: string, expiresIn = 300) {
  if (!objectStoreConfigured()) throw new Error('R2 is not configured');
  const accessKey = required('R2_ACCESS_KEY_ID')!;
  const secret = required('R2_SECRET_ACCESS_KEY')!;
  const region = process.env.R2_REGION?.trim() || 'auto';
  const host = new URL(endpoint()).host;
  const path = `/${bucket()}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKey}/${credentialScope}`;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalRequest = [
    'GET', path, query.toString(),
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const kDate = createHmac('sha256', `AWS4${secret}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  query.set('X-Amz-Signature', signature);
  return `https://${host}${path}?${query.toString()}`;
}

export function objectKeyFor(projectId: string, sessionPk: string, batchId: string) {
  const salt = randomBytes(4).toString('hex');
  return `replays/${projectId}/${sessionPk}/${batchId}-${salt}.json`;
}
