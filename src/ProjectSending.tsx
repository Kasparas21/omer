/* Settings → Sending: Omer (hosted) or Custom (BYO Resend / Postmark). */
import { useCallback, useEffect, useState } from 'react';
import { BrandLogo } from './ui/brandLogos';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type DnsRecord = { host: string; type: string; value: string };
type Provider = 'ses' | 'resend' | 'postmark';
type Mode = 'omer' | 'custom';
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
};

function Row({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`set-row${wide ? ' wide' : ''}`}>
      <div className="set-k"><b>{title}</b></div>
      <div className="set-v">{children}</div>
    </div>
  );
}

function modeOf(provider: Provider): Mode {
  return provider === 'ses' ? 'omer' : 'custom';
}

function statusMeta(status: Sending['status']) {
  if (status === 'verified') {
    return { text: 'Verified', className: 'status-pill received', icon: 'checkCircle' as const };
  }
  if (status === 'pending') {
    return { text: 'Not verified', className: 'status-pill', icon: 'clock' as const };
  }
  if (status === 'failed') {
    return { text: 'Needs attention', className: 'status-pill', icon: 'alert' as const };
  }
  return { text: 'Not verified', className: 'status-pill', icon: 'mail' as const };
}

export function ProjectSending({ projectId }: { projectId: string }) {
  const [sending, setSending] = useState<Sending | null>(null);
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [provider, setProvider] = useState<Provider>('ses');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(false);

  const apply = (next: Sending) => {
    setSending(next);
    setFromName(next.fromName || '');
    setFromEmail(next.fromEmail || '');
    setDomain(next.domain || '');
    setProvider(next.provider || 'ses');
    if (next.status === 'pending' && (next.dnsRecords?.length || next.provider !== 'ses')) setDnsOpen(true);
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

  const save = async (opts?: { startVerify?: boolean; nextProvider?: Provider }) => {
    if (busy) return;
    const nextProvider = opts?.nextProvider || provider;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sending`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromName,
          fromEmail,
          domain: domain || fromEmail.split('@')[1] || '',
          provider: nextProvider,
          providerApiKey: apiKey.trim() || undefined,
          startVerify: Boolean(opts?.startVerify),
        }),
      });
      const data = await res.json().catch(() => ({})) as { sending?: Sending; error?: string };
      if (!res.ok || !data.sending) throw new Error(data.error || 'Save failed');
      apply(data.sending);
      if (apiKey.trim()) setApiKey('');
      if (opts?.startVerify) {
        setDnsOpen(true);
        toast(nextProvider === 'postmark' ? 'Confirm the sender in your provider, then check again' : 'Add the DNS records, then check');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Save failed', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const pickMode = (mode: Mode) => {
    const next: Provider = mode === 'omer' ? 'ses' : (provider === 'ses' ? 'resend' : provider);
    setProvider(next);
    void save({ nextProvider: next });
  };

  const pickCustom = (next: 'resend' | 'postmark') => {
    setProvider(next);
    void save({ nextProvider: next });
  };

  const check = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sending/check`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { sending?: Sending; error?: string };
      if (!res.ok || !data.sending) throw new Error(data.error || 'Check failed');
      apply(data.sending);
      toast(data.sending.status === 'verified' ? 'Domain verified' : 'Still not verified', { kind: data.sending.status === 'verified' ? undefined : 'warn' });
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

  const mode = modeOf(provider);
  const pill = statusMeta(sending.status);
  const records = sending.dnsRecords || [];
  const needsKey = mode === 'custom';
  const fromReady = Boolean(fromName.trim() && fromEmail.trim());
  const verified = sending.status === 'verified';

  return (
    <>
      <div className="set-main">
        <Row title="Send with">
          <div className="seg" role="group" aria-label="Send with">
            <button type="button" aria-pressed={mode === 'omer'} disabled={busy || !sending.providers.ses} onClick={() => pickMode('omer')}>
              <Icon name="ghost" />Omer
            </button>
            <button type="button" aria-pressed={mode === 'custom'} disabled={busy} onClick={() => pickMode('custom')}>
              <Icon name="sliders" />Custom
            </button>
          </div>
        </Row>

        {mode === 'custom' ? (
          <Row title="Provider">
            <div className="seg" role="group" aria-label="Provider">
              <button type="button" aria-pressed={provider === 'resend'} disabled={busy} onClick={() => pickCustom('resend')}>
                <BrandLogo slug="resend" />Resend
              </button>
              <button type="button" aria-pressed={provider === 'postmark'} disabled={busy} onClick={() => pickCustom('postmark')}>
                <BrandLogo slug="postmark" />Postmark
              </button>
            </div>
          </Row>
        ) : null}

        <Row title="From name">
          <input className="input" value={fromName} placeholder="Store name" onChange={(e) => setFromName(e.target.value)} onBlur={() => void save()} disabled={busy} />
        </Row>
        <Row title="From email">
          <input className="input" value={fromEmail} placeholder="hello@yourstore.com" onChange={(e) => setFromEmail(e.target.value)} onBlur={() => void save()} disabled={busy} />
        </Row>
        <Row title="Domain">
          <input
            className="input"
            value={domain}
            placeholder={fromEmail.includes('@') ? fromEmail.split('@')[1] : 'yourstore.com'}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={() => void save()}
            disabled={busy}
          />
        </Row>

        {needsKey ? (
          <Row title="API key" wide>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={sending.hasProviderKey ? 'Saved — paste a new key to replace' : 'Paste API key'}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={busy}
            />
          </Row>
        ) : null}

        <Row title="Domain status">
          <span className={pill.className}><Icon name={pill.icon} />{pill.text}</span>
        </Row>

        <Row title="Domain setup">
          <span className="omer-set-acts">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || (!domain && !fromEmail)} onClick={() => void save({ startVerify: true })}>
              <Icon name="link" />{verified ? 'Refresh setup' : 'Verify domain'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !sending.domain} onClick={() => void check()}>
              <Icon name="rotate" />Check
            </button>
          </span>
        </Row>

        {(records.length > 0 || sending.status === 'pending') ? (
          <Row title="DNS" wide>
            <details className="set-send-fold" open={dnsOpen} onToggle={(e) => setDnsOpen((e.target as HTMLDetailsElement).open)}>
              <summary>
                <Icon name="chevronRight" className="set-send-chevron" />
                <span>{records.length ? `${records.length} record${records.length === 1 ? '' : 's'}` : 'Waiting on DNS'}</span>
                <small>Add these at your DNS host</small>
              </summary>
              {records.length ? (
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
              ) : (
                <p className="omer-set-note">Confirm the sender in your provider, then hit Check.</p>
              )}
            </details>
          </Row>
        ) : null}

        <Row title="Daily limit"><span className="status-pill">Soon</span></Row>
        <Row title="Quiet hours"><span className="status-pill">Soon</span></Row>
      </div>

      <aside className="set-side">
        <div className="set-side-in">
          <div className="set-side-k">Sending</div>
          <p className="set-send-lede">
            {mode === 'omer'
              ? 'Omer sends for you. Included for now.'
              : provider === 'resend'
                ? 'Uses your Resend account.'
                : 'Uses your Postmark account.'}
          </p>
          <ul className="set-dns set-send-ticks">
            <li className={fromReady ? undefined : 'warn'}>
              <Icon name={fromReady ? 'check' : 'mail'} />
              <div><b>From address</b>{fromReady ? null : <small>Add name and email</small>}</div>
            </li>
            <li className={verified ? undefined : 'warn'}>
              <Icon name={verified ? 'check' : sending.status === 'pending' ? 'clock' : 'alert'} />
              <div>
                <b>Domain</b>
                <small>{verified ? 'Ready' : sending.status === 'pending' ? 'Waiting on DNS' : 'Not verified yet'}</small>
              </div>
            </li>
            <li className={verified ? undefined : 'warn'}>
              <Icon name={verified ? 'check' : 'send'} />
              <div>
                <b>Branded From</b>
                <small>{verified ? 'Sends as your domain' : `Until then: ${sending.platformFrom || 'Omer address'}`}</small>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </>
  );
}
