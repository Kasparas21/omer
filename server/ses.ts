/* Amazon SES send + Easy DKIM identities via SigV4 (no AWS SDK). */
import { createHash, createHmac } from 'node:crypto';

function env(name: string) {
  return process.env[name]?.trim() || '';
}

export function sesConfigured() {
  return Boolean(env('AWS_ACCESS_KEY_ID') && env('AWS_SECRET_ACCESS_KEY') && env('AWS_REGION') && (env('SES_FROM_EMAIL') || env('SES_FROM_DOMAIN')));
}

export function sesIdentityConfigured() {
  return Boolean(env('AWS_ACCESS_KEY_ID') && env('AWS_SECRET_ACCESS_KEY') && env('AWS_REGION'));
}

export function sesFromEmail() {
  if (env('SES_FROM_EMAIL')) return env('SES_FROM_EMAIL');
  const domain = env('SES_FROM_DOMAIN');
  return domain ? `noreply@${domain}` : '';
}

function hmac(key: Buffer | string, data: string) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: string | Buffer) {
  return createHash('sha256').update(data).digest('hex');
}

export type DnsRecord = { host: string; type: string; value: string };

export type SesSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  /** Override platform From when the merchant domain is verified. */
  fromEmail?: string | null;
  replyTo?: string | null;
  listUnsubscribeUrl?: string;
  listUnsubscribePost?: boolean;
};

export async function sesSendEmail(input: SesSendInput): Promise<{ messageId: string }> {
  if (!sesConfigured() && !input.fromEmail) throw new Error('SES is not configured');
  if (!sesIdentityConfigured()) throw new Error('SES is not configured');
  const region = env('AWS_REGION');
  const accessKey = env('AWS_ACCESS_KEY_ID');
  const secret = env('AWS_SECRET_ACCESS_KEY');
  const fromEmail = (input.fromEmail || sesFromEmail()).trim();
  if (!fromEmail) throw new Error('SES From address missing');
  const host = `email.${region}.amazonaws.com`;
  const from = `${JSON.stringify(input.fromName).slice(1, -1)} <${fromEmail}>`;

  const params = new URLSearchParams();
  params.set('Action', 'SendEmail');
  params.set('Version', '2010-12-01');
  params.set('Source', from);
  params.set('Destination.ToAddresses.member.1', input.to);
  params.set('Message.Subject.Data', input.subject);
  params.set('Message.Subject.Charset', 'UTF-8');
  params.set('Message.Body.Html.Data', input.html);
  params.set('Message.Body.Html.Charset', 'UTF-8');
  params.set('Message.Body.Text.Data', input.text);
  params.set('Message.Body.Text.Charset', 'UTF-8');
  if (input.replyTo) params.set('ReplyToAddresses.member.1', input.replyTo);
  if (env('SES_CONFIGURATION_SET')) params.set('ConfigurationSetName', env('SES_CONFIGURATION_SET'));
  const body = input.listUnsubscribeUrl
    ? await sendRaw(region, accessKey, secret, host, {
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      listUnsubscribeUrl: input.listUnsubscribeUrl,
      listUnsubscribePost: Boolean(input.listUnsubscribePost),
      configurationSet: env('SES_CONFIGURATION_SET') || undefined,
    })
    : await signedSesFormPost(region, accessKey, secret, host, params.toString());

  const messageId = body.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1]
    || body.match(/"MessageId"\s*:\s*"([^"]+)"/)?.[1]
    || '';
  if (!messageId) throw new Error(`SES send failed: ${body.slice(0, 300)}`);
  return { messageId };
}

async function signedSesFormPost(region: string, accessKey: string, secret: string, host: string, payload: string) {
  return signedRequest({
    region, accessKey, secret, host,
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: payload,
  });
}

async function signedRequest(opts: {
  region: string;
  accessKey: string;
  secret: string;
  host: string;
  method: string;
  path: string;
  query?: string;
  headers?: Record<string, string>;
  body: string;
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 'ses';
  const payloadHash = sha256(opts.body);
  const headers: Record<string, string> = {
    host: opts.host,
    'x-amz-date': amzDate,
    ...opts.headers,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalQuery = opts.query || '';
  const canonicalRequest = [opts.method, opts.path, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${opts.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${opts.secret}`, dateStamp);
  const kRegion = hmac(kDate, opts.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${opts.host}${opts.path}${opts.query ? `?${opts.query}` : ''}`;
  const res = await fetch(url, { method: opts.method, headers, body: opts.method === 'GET' ? undefined : opts.body });
  const text = await res.text();
  if (!res.ok) throw new Error(`SES ${res.status}: ${text.slice(0, 400)}`);
  return text;
}

function encodeSubject(subject: string) {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

async function sendRaw(
  region: string,
  accessKey: string,
  secret: string,
  host: string,
  opts: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string | null;
    listUnsubscribeUrl: string;
    listUnsubscribePost: boolean;
    configurationSet?: string;
  },
) {
  const boundary = `omer_${Date.now().toString(36)}`;
  const unsub = opts.listUnsubscribePost
    ? `<${opts.listUnsubscribeUrl}>, <${opts.listUnsubscribeUrl}>`
    : `<${opts.listUnsubscribeUrl}>`;
  const textB64 = Buffer.from(opts.text, 'utf8').toString('base64');
  const htmlB64 = Buffer.from(opts.html, 'utf8').toString('base64');
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    'MIME-Version: 1.0',
    `List-Unsubscribe: ${unsub}`,
    ...(opts.listUnsubscribePost ? ['List-Unsubscribe-Post: List-Unsubscribe=One-Click'] : []),
    ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    textB64,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlB64,
    '',
    `--${boundary}--`,
    '',
  ];
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64');
  const params = new URLSearchParams();
  params.set('Action', 'SendRawEmail');
  params.set('Version', '2010-12-01');
  params.set('RawMessage.Data', raw);
  params.set('Destinations.member.1', opts.to);
  params.set('Source', opts.from);
  if (opts.configurationSet) params.set('ConfigurationSetName', opts.configurationSet);
  return signedSesFormPost(region, accessKey, secret, host, params.toString());
}

function dkimRecords(tokens: string[], signingHostedZone: string): DnsRecord[] {
  const zone = signingHostedZone.replace(/\.$/, '');
  return tokens.map((token) => ({
    host: `${token}._domainkey`,
    type: 'CNAME',
    value: `${token}.${zone}`,
  }));
}

export type SesIdentityStatus = {
  domain: string;
  verified: boolean;
  status: 'pending' | 'verified' | 'failed';
  dnsRecords: DnsRecord[];
  providerRef: string;
};

async function sesv2Json(method: string, path: string, body?: unknown) {
  if (!sesIdentityConfigured()) throw new Error('SES is not configured');
  const region = env('AWS_REGION');
  const accessKey = env('AWS_ACCESS_KEY_ID');
  const secret = env('AWS_SECRET_ACCESS_KEY');
  const host = `email.${region}.amazonaws.com`;
  const payload = body === undefined || method === 'GET' ? '' : JSON.stringify(body);
  const text = await signedRequest({
    region, accessKey, secret, host,
    method,
    path,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    body: payload,
  });
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function parseIdentity(domain: string, raw: Record<string, unknown>): SesIdentityStatus {
  const dkim = (raw.DkimAttributes || {}) as {
    Status?: string;
    Tokens?: string[];
    SigningHostedZone?: string;
  };
  const verifiedForSending = Boolean(raw.VerifiedForSendingStatus);
  const verification = String(raw.VerificationStatus || '');
  const dkimStatus = String(dkim.Status || '');
  const verified = verifiedForSending
    || verification === 'SUCCESS'
    || dkimStatus === 'SUCCESS';
  const failed = verification === 'FAILED' || dkimStatus === 'FAILED';
  const tokens = Array.isArray(dkim.Tokens) ? dkim.Tokens.filter((t): t is string => typeof t === 'string') : [];
  const zone = typeof dkim.SigningHostedZone === 'string' ? dkim.SigningHostedZone : `dkim.amazonses.com`;
  return {
    domain,
    verified,
    status: verified ? 'verified' : failed ? 'failed' : 'pending',
    dnsRecords: dkimRecords(tokens, zone),
    providerRef: domain,
  };
}

/** Create (or reuse) an Easy DKIM domain identity and return DNS CNAMEs. */
export async function sesEnsureDomainIdentity(domain: string): Promise<SesIdentityStatus> {
  const clean = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean)) throw new Error('Invalid domain');
  try {
    await sesv2Json('POST', '/v2/email/identities', { EmailIdentity: clean });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    // AlreadyExists is fine — fall through to Get.
    if (!/AlreadyExists|already exists|Conflict/i.test(msg)) throw error;
  }
  return sesGetDomainIdentity(clean);
}

export async function sesGetDomainIdentity(domain: string): Promise<SesIdentityStatus> {
  const clean = domain.trim().toLowerCase().replace(/\.$/, '');
  const raw = await sesv2Json('GET', `/v2/email/identities/${encodeURIComponent(clean)}`);
  return parseIdentity(clean, raw);
}
