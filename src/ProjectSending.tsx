/* Settings → Sending: Omer SES (our service) or BYO Resend / Postmark. */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type DnsRecord = { host: string; type: string; value: string };
type Provider = 'ses' | 'resend' | 'postmark';
type Sending = {
  fromName: string;
  fromEmail: string;
  domain: string;
  provider: Provider;
  status: 'none' | 'pending' | 'verified' | 'failed';
  dnsRecords: DnsRecord[];
  verifiedAt: string | null;
  platformFrom: string;
  hasProviderKey: boolean;
  providers: { ses: boolean; resend: boolean; postmark: boolean };
  hint: string;
};

function Row({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`set-row${wide ? ' wide' : ''}`}>
      <div className="set-k"><b>{title}</b></div>
      <div className="set-v">{children}</div>
    </div>
  );
}

function statusLabel(status: Sending['status']) {
  if (status === 'verified') return { text: 'Verified — sends from your domain', className: 'status-pill received' };
  if (status === 'pending') return { text: 'Waiting on DNS', className: 'status-pill' };
  if (status === 'failed') return { text: 'Failed', className: 'status-pill' };
  return { text: 'Using Omer From until verified', className: 'status-pill' };
}

export function ProjectSending({ projectId }: { projectId: string }) {
  const [sending, setSending] = useState<Sending | null>(null);
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [provider, setProvider] = useState<Provider>('ses');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = (next: Sending) => {
    setSending(next);
    setFromName(next.fromName || '');
    setFromEmail(next.fromEmail || '');
    setDomain(next.domain || '');
    setProvider(next.provider || 'ses');
  };

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/sending`);
    const data = await res.json().catch(() => ({})) as { sending?: Sending; error?: string };
    if (!res.ok || !data.sending) throw new Error(data.error || 'Could not load sending');
    apply(data.sending);
  }, [projectId]);

  useEffect(() => {
    void load().catch((error) => toast(error instanceof Error ? error.message : 'Could not load sending', { kind: 'warn' }));
  }, [load]);

  const save = async (opts?: { startVerify?: boolean }) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sending`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromName,
          fromEmail,
          domain: domain || fromEmail.split('@')[1] || '',
          provider,
          providerApiKey: apiKey.trim() || undefined,
          startVerify: Boolean(opts?.startVerify),
        }),
      });
      const data = await res.json().catch(() => ({})) as { sending?: Sending; error?: string };
      if (!res.ok || !data.sending) throw new Error(data.error || 'Save failed');
      apply(data.sending);
      if (apiKey.trim()) setApiKey('');
      toast(opts?.startVerify ? (provider === 'ses' || provider === 'resend' ? 'Add the DNS records below' : 'Saved — verify in Postmark, then Check DNS') : 'Saved');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Save failed', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sending/check`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { sending?: Sending; error?: string };
      if (!res.ok || !data.sending) throw new Error(data.error || 'Check failed');
      apply(data.sending);
      toast(data.sending.status === 'verified' ? 'Domain verified — sends use your From' : 'Still waiting on DNS', { kind: data.sending.status === 'verified' ? undefined : 'warn' });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Check failed', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Copied');
    } catch {
      toast('Could not copy', { kind: 'warn' });
    }
  };

  if (!sending) {
    return (
      <div className="set-main solo">
        <Row title="Sending"><span className="omer-set-val">Loading…</span></Row>
      </div>
    );
  }

  const pill = statusLabel(sending.status);
  const records = sending.dnsRecords || [];
  const needsKey = provider === 'resend' || provider === 'postmark';

  return (
    <div className="set-main solo">
      <Row title="How you send" wide>
        <span className="omer-set-acts" style={{ flexWrap: 'wrap' }}>
          <button type="button" className={`btn btn-sm ${provider === 'ses' ? 'btn-primary' : 'btn-secondary'}`} disabled={busy || !sending.providers.ses} onClick={() => setProvider('ses')}>
            Omer (Amazon SES)
          </button>
          <button type="button" className={`btn btn-sm ${provider === 'resend' ? 'btn-primary' : 'btn-secondary'}`} disabled={busy} onClick={() => setProvider('resend')}>
            Your Resend
          </button>
          <button type="button" className={`btn btn-sm ${provider === 'postmark' ? 'btn-primary' : 'btn-secondary'}`} disabled={busy} onClick={() => setProvider('postmark')}>
            Your Postmark
          </button>
        </span>
      </Row>
      <Row title="About" wide>
        <span className="omer-set-val">{sending.hint || (provider === 'ses'
          ? 'We send on Amazon SES. After DNS verifies, mail is From your domain.'
          : 'Connect your own provider key. We never send through Omer’s SES for this project.')}</span>
      </Row>
      <Row title="From name">
        <input className="input" value={fromName} placeholder="Store name" onChange={(e) => setFromName(e.target.value)} onBlur={() => void save()} disabled={busy} />
      </Row>
      <Row title="From email">
        <input className="input" value={fromEmail} placeholder="hello@yourstore.com" onChange={(e) => setFromEmail(e.target.value)} onBlur={() => void save()} disabled={busy} />
      </Row>
      <Row title="Domain">
        <input className="input" value={domain} placeholder={fromEmail.includes('@') ? fromEmail.split('@')[1] : 'yourstore.com'} onChange={(e) => setDomain(e.target.value)} disabled={busy} />
      </Row>
      {needsKey ? (
        <Row title={provider === 'resend' ? 'Resend API key' : 'Postmark server token'} wide>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder={sending.hasProviderKey ? '••••••••  (saved — paste to replace)' : 'Paste key'}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
          />
        </Row>
      ) : null}
      <Row title="Status">
        <span className={pill.className}>{pill.text}</span>
      </Row>
      <Row title="Actions">
        <span className="omer-set-acts">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || (!domain && !fromEmail)} onClick={() => void save({ startVerify: true })}>
            {provider === 'postmark' ? 'Save & check' : 'Add domain'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !sending.domain} onClick={() => void check()}>
            Check DNS
          </button>
        </span>
      </Row>
      {records.length ? (
        <Row title="DNS records" wide>
          <div className="su-code omer-set-snippet set-dns">
            <table className="set-dns-table">
              <thead><tr><th>Type</th><th>Host</th><th>Value</th><th /></tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={`${r.type}-${r.host}-${r.value}`}>
                    <td>{r.type}</td>
                    <td><code>{r.host}</code></td>
                    <td><code>{r.value}</code></td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(r.value)} aria-label="Copy value">
                        <Icon name="copy" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Row>
      ) : null}
      <Row title="Until verified" wide>
        <span className="omer-set-val">
          Opportunity sends still go out from {sending.platformFrom || 'Omer’s platform address'} with your From name. After verify, From is your domain.
        </span>
      </Row>
      <Row title="Daily limit"><span className="status-pill">Soon</span></Row>
      <Row title="Quiet hours"><span className="status-pill">Soon</span></Row>
    </div>
  );
}
