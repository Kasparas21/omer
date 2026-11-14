/* Settings → Integrations → AI assistants: add Omer to Claude, ChatGPT or Cursor (MCP), with the same
   logo-card feel as Stripe / Dodo / RevenueCat, and clear Connected feedback. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from './ui/brandLogos';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type Access = { id: string; type: 'key' | 'app'; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type Assistant = 'claude' | 'chatgpt' | 'cursor';

const FALLBACK_URL = `${typeof window === 'undefined' ? '' : window.location.origin}/mcp`;
const KEY_PLACEHOLDER = 'omk_YOUR_KEY';

const ASSISTANTS: { id: Assistant; name: string; blurb: string; logo: string }[] = [
  { id: 'claude', name: 'Claude', blurb: 'Claude.ai, Desktop and Code.', logo: 'claude' },
  { id: 'chatgpt', name: 'ChatGPT', blurb: 'Custom connector in ChatGPT.', logo: 'chatgpt' },
  { id: 'cursor', name: 'Cursor', blurb: 'One MCP entry for every project.', logo: 'cursor' },
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
  } catch {
    toast('Could not copy', { kind: 'warn' });
  }
}

function Code({ value, label }: { value: string; label?: string }) {
  return (
    <div className="ai-code">
      {label ? <span className="ai-code-label">{label}</span> : null}
      <pre><code>{value}</code></pre>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(value)}><Icon name="copy" />Copy</button>
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="ai-steps">{children}</ol>;
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

export function ConnectAI() {
  const [pick, setPick] = useState<Assistant>('claude');
  const [url, setUrl] = useState(FALLBACK_URL);
  const [access, setAccess] = useState<Access[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  /** A key is shown once, right after it is made. Only its hash is kept on the server. */
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

  // After OAuth, Claude/ChatGPT bounce back here — refresh when the tab is focused again.
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
        body: JSON.stringify({ name: name.trim() || 'Cursor' }),
      });
      const data = await res.json().catch(() => ({})) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error || 'Could not create a key');
      setFresh(data.token);
      setName('');
      setPick('cursor');
      await load({ quiet: true });
      toast('Key created — copy it now', { kind: 'ok' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create a key', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: Access) => {
    if (busy) return;
    if (!window.confirm(row.type === 'key' ? `Delete the key “${row.name}”? Anything using it stops working.` : `Disconnect ${row.name}? It will need your approval again.`)) return;
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
  const linkedCount = ASSISTANTS.filter((a) => linked(a.id)).length;
  const key = fresh ?? KEY_PLACEHOLDER;
  const cursorJson = JSON.stringify({ mcpServers: { omer: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
  const cursorOauthJson = JSON.stringify({ mcpServers: { omer: { url } } }, null, 2);
  const picked = ASSISTANTS.find((a) => a.id === pick)!;
  const pickLinked = linked(pick);

  return (
    <div className="set-main solo ai-connect">
      <section className="ai-intro">
        <div className="ai-intro-head">
          <div>
            <h3>AI assistants</h3>
            <p>Connect Claude, ChatGPT or Cursor and ask in plain words — how a store is doing, who is worth an email, draft it, send it, build a campaign. Same powers you have in Omer.</p>
          </div>
          {access && linkedCount > 0 ? (
            <span className="status-pill received ai-intro-status" role="status">
              <Icon name="checkCircle" />
              {linkedCount === 1 ? '1 connected' : `${linkedCount} connected`}
            </span>
          ) : null}
        </div>
        <div className="ai-url">
          <span className="ai-code-label">Server URL</span>
          <code>{url}</code>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(url)}><Icon name="copy" />Copy</button>
        </div>
      </section>

      <div className="set-int-tiles ai-tiles" role="tablist" aria-label="Assistant">
        {ASSISTANTS.map((a) => {
          const on = linked(a.id);
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={pick === a.id}
              className={`set-int-tile ai-tile${pick === a.id ? ' is-picked' : ''}${on ? ' is-on' : ''}`}
              onClick={() => setPick(a.id)}
            >
              <span className="set-int-tile-mark"><BrandLogo slug={a.logo} /></span>
              <h3>{a.name}</h3>
              <p>{a.blurb}</p>
              {on ? (
                <span className="status-pill received"><Icon name="checkCircle" />Connected</span>
              ) : (
                <span className="ai-tile-hint">Set up</span>
              )}
            </button>
          );
        })}
      </div>

      <section className={`ai-panel${pickLinked ? ' is-linked' : ''}`} aria-live="polite">
        <header className="ai-panel-head">
          <span className="set-int-tile-mark"><BrandLogo slug={picked.logo} /></span>
          <div className="ai-panel-copy">
            <h4>{picked.name}</h4>
            <p>{pickLinked ? 'Connected — ask it about your stores from the assistant.' : 'Follow the steps below to connect.'}</p>
          </div>
          {pickLinked ? <span className="status-pill received"><Icon name="checkCircle" />Connected</span> : null}
        </header>

        {pick === 'claude' && (
          <>
            <Steps>
              <li>Open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>.</li>
              <li>Name it <b>Omer</b> and paste the server URL above.</li>
              <li>Click <b>Connect</b>. Omer opens: sign in and press <b>Allow</b>.</li>
              <li>In a chat, turn Omer on from the tools menu and ask, “How did my store do this week?”</li>
            </Steps>
            <h4 className="ai-subhead">Claude Code</h4>
            <p className="ai-note">Sign in through the browser:</p>
            <Code value={`claude mcp add --transport http omer ${url}`} />
            <p className="ai-note">Then run <code>/mcp</code> inside Claude Code and choose Omer to approve. Or skip the browser with a key:</p>
            <Code value={`claude mcp add --transport http omer ${url} --header "Authorization: Bearer ${key}"`} />
          </>
        )}
        {pick === 'chatgpt' && (
          <>
            <Steps>
              <li>Open <b>Settings → Apps &amp; Connectors → Advanced settings</b> and turn on <b>Developer mode</b>. (Offered on paid plans; on Business and Enterprise a workspace admin may need to allow it.)</li>
              <li>Back in Connectors choose <b>Create</b>. Name it <b>Omer</b> and paste the server URL above as the MCP server URL.</li>
              <li>Set authentication to <b>OAuth</b> and create it. Omer opens: sign in and press <b>Allow</b>.</li>
              <li>In a new chat, add Omer from the <b>+</b> menu (Developer mode) and ask it anything about your stores.</li>
            </Steps>
            <p className="ai-note">ChatGPT labels move around between releases. Look for “custom connector”, “app” or “MCP server”.</p>
          </>
        )}
        {pick === 'cursor' && (
          <>
            <Steps>
              <li>Open <b>Cursor Settings → Tools &amp; MCP → Add custom MCP</b> (this edits <code>~/.cursor/mcp.json</code>), or use <code>.cursor/mcp.json</code> inside one project.</li>
              <li>Create a key below, paste the config, save — Cursor shows Omer as connected.</li>
            </Steps>
            <Code label="mcp.json" value={cursorJson} />
            <p className="ai-note">Prefer to sign in instead of using a key? Leave out <code>headers</code>; Cursor shows a Connect button that opens Omer.</p>
            {fresh ? null : <Code label="Sign in instead" value={cursorOauthJson} />}
          </>
        )}
      </section>

      <section className="ai-keys">
        <header>
          <h3>Keys and connected apps</h3>
          <p>Anything here can act as you. Delete what you don’t use.</p>
        </header>
        {fresh ? (
          <div className="ai-fresh" role="status">
            <div className="ai-fresh-head">
              <span className="status-pill received"><Icon name="checkCircle" />Key ready</span>
              <b>Copy it now — it won’t be shown again.</b>
            </div>
            <Code value={fresh} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void copy(fresh); setFresh(null); }}>
              <Icon name="copy" />Copy and dismiss
            </button>
          </div>
        ) : (
          <form className="ai-new" onSubmit={(e) => { e.preventDefault(); void createKey(); }}>
            <input className="input" value={name} maxLength={60} placeholder="Key name, e.g. Cursor on my laptop" onChange={(e) => setName(e.target.value)} aria-label="Key name" />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy}><Icon name="plus" />Create key</button>
          </form>
        )}
        {access === null ? (
          <p className="ai-note">Loading…</p>
        ) : access.length ? (
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
        ) : (
          <p className="ai-note">No keys or connected apps yet. Connect an assistant above — it’ll show up here.</p>
        )}
      </section>
    </div>
  );
}
