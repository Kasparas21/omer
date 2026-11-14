/* Settings → Integrations → AI assistants: same card → Connect modal pattern as Stripe. */
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

function ConnectModal({
  id,
  url,
  busy,
  freshKey,
  onClose,
  onCreateKey,
  onDone,
}: {
  id: Assistant;
  url: string;
  busy: boolean;
  freshKey: string | null;
  onClose: () => void;
  onCreateKey: () => void;
  onDone: () => void;
}) {
  const titleId = useId();
  const meta = ASSISTANTS.find((a) => a.id === id)!;
  const cursorJson = freshKey
    ? JSON.stringify({ mcpServers: { omer: { url, headers: { Authorization: `Bearer ${freshKey}` } } } }, null, 2)
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="cc-modal set-int-modal ai-modal" role="presentation">
      <button type="button" className="cc-scrim" aria-label="Close" disabled={busy} onClick={onClose} />
      <section className="cc-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cc-inner">
          <button type="button" className="cc-x set-int-modal-x" aria-label="Close" disabled={busy} onClick={onClose}>
            <Icon name="x" />
          </button>
          <div className="cc-slide">
            <div className="cc-screen">
              <header className="cc-head">
                <span className="cc-chip">Connect assistant</span>
                <span className="set-int-modal-mark"><BrandLogo slug={meta.logo} /></span>
                <h2 id={titleId}>Connect {meta.name}</h2>
                <p>
                  {id === 'cursor'
                    ? 'Create a key, paste one config into Cursor, done.'
                    : `Add Omer as a connector in ${meta.name}, then Allow when Omer opens.`}
                </p>
              </header>

              {(id === 'claude' || id === 'chatgpt') && (
                <>
                  <label className="set-int-field">
                    <span>Server URL</span>
                    <div className="ai-modal-url">
                      <code>{url}</code>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(url)}>
                        <Icon name="copy" />Copy
                      </button>
                    </div>
                  </label>
                  <ol className="ai-modal-steps">
                    {id === 'claude' ? (
                      <>
                        <li>In Claude: <b>Settings → Connectors → Add custom connector</b></li>
                        <li>Name it <b>Omer</b>, paste the URL, click <b>Connect</b></li>
                        <li>Sign in to Omer and press <b>Allow</b></li>
                      </>
                    ) : (
                      <>
                        <li>Turn on <b>Developer mode</b> in ChatGPT Apps &amp; Connectors</li>
                        <li>Create a connector named <b>Omer</b> with this URL (OAuth)</li>
                        <li>Sign in to Omer and press <b>Allow</b></li>
                      </>
                    )}
                  </ol>
                  <div className="cc-actions">
                    <button type="button" className="cc-btn" disabled={busy} onClick={onClose}>Cancel</button>
                    <button
                      type="button"
                      className="cc-btn is-primary"
                      disabled={busy}
                      onClick={() => { void copy(url); onDone(); }}
                    >
                      Copy URL & continue
                    </button>
                  </div>
                </>
              )}

              {id === 'cursor' && !freshKey && (
                <>
                  <p className="set-int-tip">We’ll create a key and copy a ready-made Cursor config for you.</p>
                  <div className="cc-actions">
                    <button type="button" className="cc-btn" disabled={busy} onClick={onClose}>Cancel</button>
                    <button type="button" className="cc-btn is-primary" disabled={busy} onClick={onCreateKey}>
                      {busy ? 'Creating…' : 'Create key & connect'}
                    </button>
                  </div>
                </>
              )}

              {id === 'cursor' && freshKey && cursorJson && (
                <>
                  <div className="ai-fresh ai-modal-fresh" role="status">
                    <div className="ai-fresh-head">
                      <span className="status-pill received"><Icon name="checkCircle" />Key ready</span>
                      <b>Copy once — it won’t be shown again.</b>
                    </div>
                    <div className="ai-modal-url">
                      <code className="ai-modal-key">{freshKey}</code>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(freshKey)}>
                        <Icon name="copy" />Copy key
                      </button>
                    </div>
                  </div>
                  <label className="set-int-field">
                    <span>Paste into Cursor Settings → Tools &amp; MCP</span>
                    <div className="ai-modal-code">
                      <pre><code>{cursorJson}</code></pre>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(cursorJson)}>
                        <Icon name="copy" />Copy config
                      </button>
                    </div>
                  </label>
                  <div className="cc-actions">
                    <button
                      type="button"
                      className="cc-btn is-primary"
                      onClick={() => { void copy(cursorJson); onDone(); }}
                    >
                      Copy config & done
                    </button>
                  </div>
                </>
              )}
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
  const [modal, setModal] = useState<Assistant | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
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

  const createKey = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/mcp/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Cursor' }),
      });
      const data = await res.json().catch(() => ({})) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error || 'Could not create a key');
      setFresh(data.token);
      await load({ quiet: true });
      toast('Key created — copy the config', { kind: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create a key', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
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
        <header className="ai-section-head">
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
              onConnect={() => { setFresh(null); setModal(a.id); }}
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

      {modal ? (
        <ConnectModal
          id={modal}
          url={url}
          busy={busy}
          freshKey={fresh}
          onClose={() => { if (!busy) { setModal(null); setFresh(null); } }}
          onCreateKey={() => void createKey()}
          onDone={() => {
            setModal(null);
            setFresh(null);
            toast(modal === 'cursor' ? 'Paste the config in Cursor' : `Finish Allow in ${ASSISTANTS.find((a) => a.id === modal)!.name}`, { kind: 'ok' });
            void load({ quiet: true });
          }}
        />
      ) : null}
    </>
  );
}
