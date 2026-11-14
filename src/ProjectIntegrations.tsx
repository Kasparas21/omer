/* Settings → Integrations: Stripe connect (+ Dodo / RevenueCat soon). */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type Integration = {
  provider: 'stripe' | 'dodo' | 'revenuecat';
  status: 'none' | 'connected' | 'invalid' | 'error' | 'soon';
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  accountId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  available: boolean;
};

function Row({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`set-row${wide ? ' wide' : ''}`}>
      <div className="set-k"><b>{title}</b></div>
      <div className="set-v">{children}</div>
    </div>
  );
}

function labelFor(provider: Integration['provider']) {
  if (provider === 'stripe') return 'Stripe';
  if (provider === 'dodo') return 'Dodo Payments';
  return 'RevenueCat';
}

function statusMeta(row: Integration) {
  if (row.status === 'soon') return { text: 'Soon', className: 'status-pill', icon: 'clock' as const };
  if (row.status === 'connected') return { text: 'Connected', className: 'status-pill received', icon: 'checkCircle' as const };
  if (row.status === 'invalid') return { text: 'Invalid key', className: 'status-pill', icon: 'alert' as const };
  if (row.status === 'error') return { text: 'Needs attention', className: 'status-pill', icon: 'alert' as const };
  return { text: 'Not connected', className: 'status-pill', icon: 'link' as const };
}

export function ProjectIntegrations({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Integration[] | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const apply = (next: Integration[]) => setRows(next);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/integrations`);
    const data = await res.json().catch(() => ({})) as { integrations?: Integration[]; error?: string };
    if (!res.ok || !data.integrations) throw new Error(data.error || 'Could not load integrations');
    apply(data.integrations);
  }, [projectId]);

  useEffect(() => {
    void load().catch((error) => toast(error instanceof Error ? error.message : 'Could not load integrations', { kind: 'warn' }));
  }, [load]);

  const stripe = rows?.find((r) => r.provider === 'stripe') || null;
  const others = (rows || []).filter((r) => r.provider !== 'stripe');

  const connect = async () => {
    if (busy || !apiKey.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/stripe/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          webhookSecret: webhookSecret.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { integrations?: Integration[]; synced?: number; error?: string };
      if (!res.ok || !data.integrations) throw new Error(data.error || 'Connect failed');
      apply(data.integrations);
      setApiKey('');
      setWebhookSecret('');
      toast(typeof data.synced === 'number' ? `Connected · ${data.synced} payment${data.synced === 1 ? '' : 's'} synced` : 'Connected');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Connect failed', { kind: 'warn' });
      void load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/stripe/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { integrations?: Integration[]; synced?: number; error?: string };
      if (!res.ok || !data.integrations) throw new Error(data.error || 'Sync failed');
      apply(data.integrations);
      toast(`Synced · ${data.synced ?? 0} new`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Sync failed', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/stripe/disconnect`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { integrations?: Integration[]; error?: string };
      if (!res.ok || !data.integrations) throw new Error(data.error || 'Disconnect failed');
      apply(data.integrations);
      toast('Stripe disconnected');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Disconnect failed', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const saveWebhook = async () => {
    if (busy || !webhookSecret.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/stripe/webhook-secret`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookSecret: webhookSecret.trim() }),
      });
      const data = await res.json().catch(() => ({})) as { integrations?: Integration[]; error?: string };
      if (!res.ok || !data.integrations) throw new Error(data.error || 'Save failed');
      apply(data.integrations);
      setWebhookSecret('');
      toast('Webhook secret saved');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Save failed', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  if (!rows || !stripe) {
    return (
      <div className="set-main solo">
        <Row title="Integrations"><span className="omer-set-val">Loading…</span></Row>
      </div>
    );
  }

  const pill = statusMeta(stripe);
  const connected = stripe.status === 'connected';
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/v1/webhooks/stripe/${projectId}`
    : `/v1/webhooks/stripe/${projectId}`;

  return (
    <>
      <div className="set-main">
        <Row title="Stripe">
          <span className={pill.className}><Icon name={pill.icon} />{pill.text}</span>
        </Row>

        {!connected ? (
          <>
            <Row title="API key" wide>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={apiKey}
                placeholder="rk_live_… or sk_live_…"
                onChange={(e) => setApiKey(e.target.value)}
                disabled={busy}
              />
            </Row>
            <Row title="Connect">
              <span className="omer-set-acts">
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !apiKey.trim()} onClick={() => void connect()}>
                  <Icon name="link" />Connect Stripe
                </button>
              </span>
            </Row>
          </>
        ) : (
          <>
            <Row title="Account">
              <span className="omer-set-val">{stripe.accountId || 'Connected'}</span>
            </Row>
            <Row title="Last sync">
              <span className="omer-set-val">
                {stripe.lastSyncAt ? new Date(stripe.lastSyncAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              </span>
            </Row>
            <Row title="Actions">
              <span className="omer-set-acts">
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void sync()}>
                  <Icon name="rotate" />Sync now
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void disconnect()}>
                  Disconnect
                </button>
              </span>
            </Row>
          </>
        )}

        {stripe.lastError ? (
          <Row title="Error" wide>
            <span className="omer-set-note">{stripe.lastError}</span>
          </Row>
        ) : null}

        <Row title="Realtime" wide>
          <details className="set-send-fold" open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}>
            <summary>
              <Icon name="chevronRight" className="set-send-chevron" />
              <span>Webhook (optional)</span>
              <small>{stripe.hasWebhookSecret ? 'Secret saved' : 'For payments as they happen'}</small>
            </summary>
            <div className="set-int-adv">
              <p className="omer-set-note">In Stripe → Developers → Webhooks, add this endpoint and paste the signing secret.</p>
              <div className="su-code omer-set-snippet">
                <pre>{webhookUrl}</pre>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void navigator.clipboard.writeText(webhookUrl).then(() => toast('Copied')).catch(() => toast('Could not copy', { kind: 'warn' }))}
                >
                  <Icon name="copy" />Copy
                </button>
              </div>
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={webhookSecret}
                placeholder={stripe.hasWebhookSecret ? 'Saved — paste to replace' : 'whsec_…'}
                onChange={(e) => setWebhookSecret(e.target.value)}
                disabled={busy}
              />
              <span className="omer-set-acts">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !webhookSecret.trim() || !connected} onClick={() => void saveWebhook()}>
                  Save secret
                </button>
              </span>
            </div>
          </details>
        </Row>

        {others.map((row) => {
          const meta = statusMeta(row);
          return (
            <Row key={row.provider} title={labelFor(row.provider)}>
              <span className={meta.className}><Icon name={meta.icon} />{meta.text}</span>
            </Row>
          );
        })}
      </div>

      <aside className="set-side">
        <div className="set-side-in">
          <div className="set-side-k">Revenue</div>
          <p className="set-send-lede">Connect Stripe and we match payments to visitors by email and sessions.</p>
          <ul className="set-dns set-send-ticks">
            <li className={connected ? undefined : 'warn'}>
              <Icon name={connected ? 'check' : 'link'} />
              <div><b>Stripe key</b><small>{connected ? 'Valid' : 'Paste a restricted key'}</small></div>
            </li>
            <li className={connected && stripe.lastSyncAt ? undefined : 'warn'}>
              <Icon name={connected && stripe.lastSyncAt ? 'check' : 'rotate'} />
              <div><b>Payments</b><small>{connected ? 'Syncing into analytics' : 'Connect to import'}</small></div>
            </li>
            <li className={connected ? undefined : 'warn'}>
              <Icon name={connected ? 'check' : 'user'} />
              <div><b>Visitor match</b><small>Email, then source from last visit</small></div>
            </li>
          </ul>
          <p className="omer-set-note" style={{ marginTop: 14 }}>
            Needs read access to Charges, PaymentIntents, Customers, and Invoices. No card numbers.
          </p>
        </div>
      </aside>
    </>
  );
}

export function DemoIntegrations() {
  return (
    <>
      <div className="set-main">
        <Row title="Stripe"><span className="status-pill received"><Icon name="checkCircle" />Connected</span></Row>
        <Row title="Account"><span className="omer-set-val">acct_demo</span></Row>
        <Row title="Dodo Payments"><span className="status-pill">Soon</span></Row>
        <Row title="RevenueCat"><span className="status-pill">Soon</span></Row>
      </div>
      <aside className="set-side">
        <div className="set-side-in">
          <div className="set-side-k">Revenue</div>
          <p className="set-send-lede">Demo store · Stripe already connected.</p>
          <ul className="set-dns set-send-ticks">
            <li><Icon name="check" /><div><b>Stripe key</b><small>Valid</small></div></li>
            <li><Icon name="check" /><div><b>Payments</b><small>Syncing into analytics</small></div></li>
            <li><Icon name="check" /><div><b>Visitor match</b><small>Email + sessions</small></div></li>
          </ul>
        </div>
      </aside>
    </>
  );
}
