/* Settings → Integrations → AI assistants: one-click open into Claude / Cursor (prefilled),
   guided ChatGPT (no install deeplink yet). Same card language as Payments. */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { BrandLogo } from './ui/brandLogos';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type Access = { id: string; type: 'key' | 'app'; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type Assistant = 'claude' | 'chatgpt' | 'cursor';

const FALLBACK_URL = `${typeof window === 'undefined' ? '' : window.location.origin}/mcp`;

const ASSISTANTS: { id: Assistant; name: string; blurb: string; logo: string }[] = [
  { id: 'claude', name: 'Claude', blurb: 'Ask Claude about your stores.', logo: 'claude' },
  { id: 'chatgpt', name: 'ChatGPT', blurb: 'Ask ChatGPT about your stores.', logo: 'chatgpt' },
  { id: 'cursor', name: 'Cursor', blurb: 'Use Omer inside Cursor.', logo: 'cursor' },
];

/** Claude opens Add custom connector with name + URL already filled. */
function claudeInstallUrl(mcpUrl: string) {
  const q = new URLSearchParams({
    modal: 'add-custom-connector',
    connectorName: 'Omer',
    connectorUrl: mcpUrl,
  });
  return `https://claude.ai/customize/connectors?${q.toString()}`;
}

/** Cursor install link (HTTPS → app). Config is OAuth-only — no API key in the URL. */
function cursorInstallUrl(mcpUrl: string) {
  const config = btoa(JSON.stringify({ url: mcpUrl }));
  return `https://cursor.com/install-mcp?name=${encodeURIComponent('omer')}&config=${encodeURIComponent(config)}`;
}

function matchesAssistant(row: Access, id: Assistant) {
  if (id === 'chatgpt') return /chatgpt|openai/i.test(row.name);
  if (id === 'claude') return /claude|anthropic/i.test(row.name);
  if (id === 'cursor') return row.type === 'key' || /cursor/i.test(row.name);
  return false;
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Copied');
    return true;
  } catch {
    toast('Could not copy', { kind: 'warn' });
    return false;
  }
}

function ago(iso: string | null) {
  if (!iso) return 'Never used';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return 'Used just now';
  if (m < 60) return `Used ${m} min ago`;
  if (m < 1440) return `Used ${Math.round(m / 60)} h ago`;
  return `Used ${Math.round(m / 1440)} d ago`;
}

function logoForAccess(row: Access): string | null {
  if (row.type === 'key') return 'cursor';
  if (/chatgpt|openai/i.test(row.name)) return 'chatgpt';
  if (/claude|anthropic/i.test(row.name)) return 'claude';
  if (/cursor/i.test(row.name)) return 'cursor';
  return null;
}

function openExternal(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** ChatGPT has no prefill deeplink yet — copy URL and open ChatGPT. */
function ChatGptModal({
  url,
  onClose,
  onDone,
}: {
  url: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = async () => {
    await copy(url);
    openExternal('https://chatgpt.com/');
    onDone();
  };

  return (
    <div className="cc-modal set-int-modal ai-modal" role="presentation">
      <button type="button" className="cc-scrim" aria-label="Close" onClick={onClose} />
      <section className="cc-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cc-inner">
          <button type="button" className="cc-x set-int-modal-x" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
          <div className="cc-slide">
            <div className="cc-screen">
              <header className="cc-head">
                <span className="cc-chip">Connect assistant</span>
                <span className="set-int-modal-mark"><BrandLogo slug="chatgpt" /></span>
                <h2 id={titleId}>Connect ChatGPT</h2>
                <p>We’ll copy the Omer URL and open ChatGPT. Paste it as a custom connector (OAuth).</p>
              </header>
              <label className="set-int-field">
                <span>Server URL (copied for you)</span>
                <div className="ai-modal-url">
                  <code>{url}</code>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(url)}>
                    <Icon name="copy" />Copy
                  </button>
                </div>
              </label>
              <ol className="ai-modal-steps">
                <li>In ChatGPT: enable <b>Developer mode</b> under Connectors → Advanced</li>
                <li>Create a connector named <b>Omer</b>, paste the URL, auth = <b>OAuth</b></li>
                <li>When Omer opens, sign in and press <b>Allow</b></li>
              </ol>
              <div className="cc-actions">
                <button type="button" className="cc-btn" onClick={onClose}>Cancel</button>
                <button type="button" className="cc-btn is-primary" onClick={() => void start()}>
                  Open ChatGPT
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AssistantCard({
  id,
  connected,
  busy,
  onConnect,
  onDisconnect,
}: {
  id: Assistant;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const meta = ASSISTANTS.find((a) => a.id === id)!;
  return (
    <article className={`set-int-tile${connected ? ' is-on' : ''}`}>
      <span className="set-int-tile-mark"><BrandLogo slug={meta.logo} /></span>
      <h3>{meta.name}</h3>
      <p>{meta.blurb}</p>
      {connected ? (
        <div className="set-int-tile-acts">
          <span className="status-pill received"><Icon name="checkCircle" />Connected</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm set-int-connect" disabled={busy} onClick={onConnect}>
          Connect
        </button>
      )}
    </article>
  );
}

export function ConnectAI() {
  const [url, setUrl] = useState(FALLBACK_URL);
  const [access, setAccess] = useState<Access[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatgptOpen, setChatgptOpen] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const res = await fetch('/api/mcp/access');
    const data = await res.json().catch(() => ({})) as { endpoint?: string; access?: Access[]; error?: string };
    if (!res.ok || !data.access) throw new Error(data.error || 'Could not load access');
    if (data.endpoint) setUrl(data.endpoint);

    const next = data.access;
    const prev = knownIds.current;
    if (prev) {
      for (const row of next) {
        if (prev.has(row.id)) continue;
        if (row.type === 'app') toast(`${row.name} connected`, { kind: 'ok' });
        else if (!opts?.quiet) toast(`Key “${row.name}” ready`);
      }
    }
    knownIds.current = new Set(next.map((r) => r.id));
    setAccess(next);
    return next;
  }, []);

  useEffect(() => {
    void load().catch((e) => toast(e instanceof Error ? e.message : 'Could not load access', { kind: 'warn' }));
  }, [load]);

  useEffect(() => {
    const refresh = () => { void load({ quiet: true }).catch(() => undefined); };
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    const tick = window.setInterval(refresh, 12_000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(tick);
    };
  }, [load]);

  const startConnect = (id: Assistant) => {
    if (id === 'claude') {
      openExternal(claudeInstallUrl(url));
      toast('In Claude: confirm Omer, then Allow on Omer', { kind: 'ok' });
      return;
    }
    if (id === 'cursor') {
      openExternal(cursorInstallUrl(url));
      toast('In Cursor: install Omer, then Connect / Allow', { kind: 'ok' });
      return;
    }
    setChatgptOpen(true);
  };

  const disconnectAssistant = async (id: Assistant) => {
    if (busy || !access) return;
    const rows = access.filter((r) => matchesAssistant(r, id));
    if (!rows.length) return;
    const label = ASSISTANTS.find((a) => a.id === id)!.name;
    if (!window.confirm(`Disconnect ${label}? You’ll need to connect again.`)) return;
    setBusy(true);
    try {
      for (const row of rows) {
        const res = await fetch(`/api/mcp/access/${row.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Could not disconnect');
        knownIds.current?.delete(row.id);
      }
      await load({ quiet: true });
      toast(`${label} disconnected`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not disconnect', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: Access) => {
    if (busy) return;
    if (!window.confirm(row.type === 'key' ? `Delete the key “${row.name}”?` : `Disconnect ${row.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/access/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove it');
      knownIds.current?.delete(row.id);
      await load({ quiet: true });
      toast(row.type === 'key' ? 'Key deleted' : `${row.name} disconnected`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove it', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const linked = (id: Assistant) => Boolean(access?.some((r) => matchesAssistant(r, id)));

  if (!access) {
    return (
      <div className="set-main solo">
        <div className="set-int-tiles set-int-tiles-skel" aria-busy="true">
          <div className="set-int-tile" /><div className="set-int-tile" /><div className="set-int-tile" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="set-main solo ai-connect">
        <header className="set-int-section-head">
          <h3>AI assistants</h3>
          <p>Connect Claude, ChatGPT or Cursor — same access you have in Omer.</p>
        </header>

        <div className="set-int-tiles">
          {ASSISTANTS.map((a) => (
            <AssistantCard
              key={a.id}
              id={a.id}
              connected={linked(a.id)}
              busy={busy}
              onConnect={() => startConnect(a.id)}
              onDisconnect={() => void disconnectAssistant(a.id)}
            />
          ))}
        </div>

        {access.length > 0 ? (
          <section className="ai-keys" aria-label="Connected access">
            <header>
              <h3>Connected</h3>
              <p>Apps and keys that can act as you.</p>
            </header>
            <ul className="ai-list">
              {access.map((row) => {
                const logo = logoForAccess(row);
                return (
                  <li key={row.id}>
                    <span className="ai-list-mark">
                      {logo ? <BrandLogo slug={logo} /> : <Icon name="lock" />}
                    </span>
                    <span className="ai-list-copy">
                      <b>{row.name}</b>
                      <small>
                        {row.type === 'key' ? `API key · ${row.prefix}…` : 'Connected app'}
                        {' · '}
                        {ago(row.lastUsedAt)}
                      </small>
                    </span>
                    <span className="status-pill received ai-list-pill"><Icon name="checkCircle" />Live</span>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void revoke(row)}>
                      {row.type === 'key' ? 'Delete' : 'Disconnect'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {chatgptOpen ? (
        <ChatGptModal
          url={url}
          onClose={() => setChatgptOpen(false)}
          onDone={() => {
            setChatgptOpen(false);
            toast('Paste the URL in ChatGPT, then Allow on Omer', { kind: 'ok' });
            void load({ quiet: true });
          }}
        />
      ) : null}
    </>
  );
}
