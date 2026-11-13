/* Amazon SES send via SigV4 (no AWS SDK). Platform From identity for v1. */
import { createHash, createHmac } from 'node:crypto';

function env(name: string) {
  return process.env[name]?.trim() || '';
}

export function sesConfigured() {
  return Boolean(env('AWS_ACCESS_KEY_ID') && env('AWS_SECRET_ACCESS_KEY') && env('AWS_REGION') && (env('SES_FROM_EMAIL') || env('SES_FROM_DOMAIN')));
}

export function sesFromEmail() {
  if (env('SES_FROM_EMAIL')) return env('SES_FROM_EMAIL');
  const domain = env('SES_FROM_DOMAIN');
  return domain ? `noreply@${domain}` : '';
}

function hmac(key: Buffer | string, data: string) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: string) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export type SesSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyTo?: string | null;
  listUnsubscribeUrl?: string;
  listUnsubscribePost?: boolean;
};

export async function sesSendEmail(input: SesSendInput): Promise<{ messageId: string }> {
  if (!sesConfigured()) throw new Error('SES is not configured');
  const region = env('AWS_REGION');
  const accessKey = env('AWS_ACCESS_KEY_ID');
  const secret = env('AWS_SECRET_ACCESS_KEY');
  const fromEmail = sesFromEmail();
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
  // Simple header for List-Unsubscribe via Destination… not supported on classic SendEmail —
  // use SendRawEmail when we need custom headers. For v1, include unsubscribe link in body;
  // add List-Unsubscribe via raw MIME when token URL is present.
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
    : await signedSesPost(region, accessKey, secret, host, params.toString());

  const messageId = body.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1]
    || body.match(/"MessageId"\s*:\s*"([^"]+)"/)?.[1]
    || '';
  if (!messageId) throw new Error(`SES send failed: ${body.slice(0, 300)}`);
  return { messageId };
}

async function signedSesPost(region: string, accessKey: string, secret: string, host: string, payload: string) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 'ses';
  const contentType = 'application/x-www-form-urlencoded; charset=utf-8';
  const payloadHash = sha256(payload);
  const headers: Record<string, string> = {
    host,
    'content-type': contentType,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}/`, { method: 'POST', headers, body: payload });
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
  return signedSesPost(region, accessKey, secret, host, params.toString());
}
