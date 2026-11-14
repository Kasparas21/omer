/* Settings → Integrations: logo cards + connect modal (Stripe / Dodo / RevenueCat). */
import { useCallback, useEffect, useId, useState } from 'react';
import { BrandLogo } from './ui/brandLogos';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type Provider = 'stripe' | 'dodo' | 'revenuecat';

type Integration = {
  provider: Provider;
  status: 'none' | 'connected' | 'invalid' | 'error';
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  accountId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  available: boolean;
};

const META: Record<Provider, {
  label: string;
  blurb: string;
  placeholder: string;
  keyLabel: string;
  tipHref: string | null;
  tipLabel: string;
}> = {
  stripe: {
    label: 'Stripe',
    blurb: 'Track revenue attribution from Stripe.',
    placeholder: 'rk_live_…',
    keyLabel: 'Restricted API key',
    tipHref: 'https://docs.stripe.com/keys/restricted-api-keys',
    tipLabel: 'Stripe key guide',
  },
  dodo: {
    label: 'Dodo Payments',
    blurb: 'Track revenue attribution from Dodo Payments.',
    placeholder: 'Your API key…',
    keyLabel: 'API key',
    tipHref: 'https://docs.dodopayments.com/api-reference/introduction',
    tipLabel: 'Dodo integration guide',
  },
  revenuecat: {
    label: 'RevenueCat',
    blurb: 'Track subscription revenue from RevenueCat.',
    placeholder: 'sk_…',
    keyLabel: 'Secret API key',
    tipHref: 'https://www.revenuecat.com/docs/welcome/authentication',
    tipLabel: 'RevenueCat key guide',
  },
};

function ConnectModal({
  provider,
  busy,
  onClose,
  onConnect,
}: {
  provider: Provider;
  busy: boolean;
  onClose: () => void;
  onConnect: (apiKey: string) => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const titleId = useId();
  const meta = META[provider];
  const can = apiKey.trim().length > 0 && !busy;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="cc-modal set-int-modal" role="presentation">
      <button type="button" className="cc-scrim" aria-label="Close" disabled={busy} onClick={onClose} />
      <section className="cc-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cc-inner">
          <button type="button" className="cc-x set-int-modal-x" aria-label="Close" disabled={busy} onClick={onClose}>
            <Icon name="x" />
          </button>
          <div className="cc-slide">
            <div className="cc-screen">
              <header className="cc-head">
                <span className="cc-chip">Connect integration</span>
                <span className="set-int-modal-mark"><BrandLogo slug={provider} /></span>
                <h2 id={titleId}>Connect {meta.label}</h2>
                <p>Add your {meta.keyLabel.toLowerCase()} to enable revenue attribution.</p>
              </header>

              {meta.tipHref ? (
                <p className="set-int-tip">
                  Tip: Follow our{' '}
                  <a href={meta.tipHref} target="_blank" rel="noreferrer">{meta.tipLabel}</a>
                  {' '}if you are unsure how to obtain this key.
                </p>
              ) : null}

              <label className="set-int-field">
                <span>{meta.keyLabel}</span>
                <input
                  className="cc-input"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  value={apiKey}
                  placeholder={meta.placeholder}
                  disabled={busy}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && can) onConnect(apiKey.trim());
                  }}
                />
              </label>

              <div className="cc-actions">
                <button type="button" className="cc-btn" disabled={busy} onClick={onClose}>Cancel</button>
                <button
                  type="button"
                  className="cc-btn is-primary"
                  disabled={!can}
                  onClick={() => onConnect(apiKey.trim())}
                >
                  {busy ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProviderCard({
  row,
  busy,
  onConnect,
  onSync,
  onDisconnect,
}: {
  row: Integration;
  busy: boolean;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const meta = META[row.provider];
  const connected = row.status === 'connected';
  const problem = row.status === 'invalid' || row.status === 'error';

  return (
    <article className={`set-int-tile${connected ? ' is-on' : ''}${problem ? ' is-warn' : ''}`}>
      <span className="set-int-tile-mark"><BrandLogo slug={row.provider} /></span>
      <h3>{meta.label}</h3>
      <p>{meta.blurb}</p>
      {connected ? (
        <div className="set-int-tile-acts">
          <span className="status-pill received"><Icon name="checkCircle" />Connected</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onSync}>
            <Icon name="rotate" />Sync
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm set-int-connect" disabled={busy} onClick={onConnect}>
          Connect
        </button>
      )}
      {row.lastError && problem ? <small className="set-int-err">{row.lastError}</small> : null}
    </article>
  );
}

export function ProjectIntegrations({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Integration[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Provider | null>(null);

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

  const connect = async (provider: Provider, apiKey: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/${provider}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json().catch(() => ({})) as { integrations?: Integration[]; synced?: number; error?: string };
      if (!res.ok || !data.integrations) throw new Error(data.error || 'Connect failed');
      apply(data.integrations);
      setModal(null);
      toast(typeof data.synced === 'number' ? `Connected · ${data.synced} payment${data.synced === 1 ? '' : 's'} synced` : 'Connected');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Connect failed', { kind: 'warn' });
      void load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const sync = async (provider: Provider) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/${provider}/sync`, { method: 'POST' });
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

  const disconnect = async (provider: Provider) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/${provider}/disconnect`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { integrations?: Integration[]; error?: string };
      if (!res.ok || !data.integrations) throw new Error(data.error || 'Disconnect failed');
      apply(data.integrations);
      toast(`${META[provider].label} disconnected`);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Disconnect failed', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  if (!rows) {
    return (
      <div className="set-main solo">
        <header className="set-int-section-head">
          <h3>Payments</h3>
          <p>Connect Stripe, Dodo or RevenueCat to attribute revenue.</p>
        </header>
        <div className="set-int-tiles set-int-tiles-skel" aria-busy="true">
          <div className="set-int-tile" /><div className="set-int-tile" /><div className="set-int-tile" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="set-main solo">
        <header className="set-int-section-head">
          <h3>Payments</h3>
          <p>Connect Stripe, Dodo or RevenueCat to attribute revenue.</p>
        </header>
        <div className="set-int-tiles">
          {rows.map((row) => (
            <ProviderCard
              key={row.provider}
              row={row}
              busy={busy}
              onConnect={() => setModal(row.provider)}
              onSync={() => void sync(row.provider)}
              onDisconnect={() => void disconnect(row.provider)}
            />
          ))}
        </div>
      </div>
      {modal ? (
        <ConnectModal
          provider={modal}
          busy={busy}
          onClose={() => { if (!busy) setModal(null); }}
          onConnect={(apiKey) => void connect(modal, apiKey)}
        />
      ) : null}
    </>
  );
}

export function DemoIntegrations() {
  const demo: Integration[] = [
    { provider: 'stripe', status: 'connected', hasApiKey: true, hasWebhookSecret: false, accountId: 'acct_demo', lastSyncAt: new Date().toISOString(), lastError: null, available: true },
    { provider: 'dodo', status: 'none', hasApiKey: false, hasWebhookSecret: false, accountId: null, lastSyncAt: null, lastError: null, available: true },
    { provider: 'revenuecat', status: 'none', hasApiKey: false, hasWebhookSecret: false, accountId: null, lastSyncAt: null, lastError: null, available: true },
  ];
  return (
    <div className="set-main solo">
      <header className="set-int-section-head">
        <h3>Payments</h3>
        <p>Connect Stripe, Dodo or RevenueCat to attribute revenue.</p>
      </header>
      <div className="set-int-tiles">
        {demo.map((row) => (
          <ProviderCard
            key={row.provider}
            row={row}
            busy={false}
            onConnect={() => toast('Demo store — connect on a real project')}
            onSync={() => {}}
            onDisconnect={() => {}}
          />
        ))}
      </div>
    </div>
  );
}
