/* Settings → Integrations → AI assistants: add Omer to Claude, ChatGPT or Cursor (MCP), and manage the keys and apps that
   have access. The server URL is the same for all three; Claude and ChatGPT sign in through a Omer
   approval page, and Cursor or Claude Code can use that too or a personal API key. */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type Access = { id: string; type: 'key' | 'app'; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type Assistant = 'claude' | 'chatgpt' | 'cursor';

const FALLBACK_URL = `${typeof window === 'undefined' ? '' : window.location.origin}/mcp`;
const KEY_PLACEHOLDER = 'omk_YOUR_KEY';

function Mark({ id }: { id: Assistant }) {
  // Simple neutral marks: the assistant's initial shape, not a reproduction of its logo.
  if (id === 'claude') return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g stroke="#D97757" strokeWidth="2.4" strokeLinecap="round">{[0, 45, 90, 135].map((a) => <line key={a} x1="12" y1="3.5" x2="12" y2="20.5" transform={`rotate(${a} 12 12)`} />)}</g></svg>;
  if (id === 'chatgpt') return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6">{[0, 60, 120].map((a) => <ellipse key={a} cx="12" cy="12" rx="9" ry="4.2" transform={`rotate(${a} 12 12)`} />)}</g></svg>;
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" /><path d="M4 7.4 12 12l8-4.6M12 12v9.2" /></g></svg>;
}

const ASSISTANTS: { id: Assistant; name: string; blurb: string }[] = [
  { id: 'claude', name: 'Claude', blurb: 'Claude.ai, Claude Desktop and Claude Code.' },
  { id: 'chatgpt', name: 'ChatGPT', blurb: 'A custom connector in ChatGPT.' },
  { id: 'cursor', name: 'Cursor', blurb: 'One config entry, works in every project.' },
];

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

export function ConnectAI() {
  const [pick, setPick] = useState<Assistant>('claude');
  const [url, setUrl] = useState(FALLBACK_URL);
  const [access, setAccess] = useState<Access[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  /** A key is shown once, right after it is made. Only its hash is kept on the server. */
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/mcp/access');
    const data = await res.json().catch(() => ({})) as { endpoint?: string; access?: Access[]; error?: string };
    if (!res.ok || !data.access) throw new Error(data.error || 'Could not load access');
    setAccess(data.access);
    if (data.endpoint) setUrl(data.endpoint);
  }, []);

  useEffect(() => {
    void load().catch((e) => toast(e instanceof Error ? e.message : 'Could not load access', { kind: 'warn' }));
  }, [load]);

  const createKey = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/mcp/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await res.json().catch(() => ({})) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error || 'Could not create a key');
      setFresh(data.token);
      setName('');
      await load();
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
      await load();
      toast(row.type === 'key' ? 'Key deleted' : 'Disconnected');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove it', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const linked = (id: Assistant) => Boolean(access?.some((r) => (id === 'chatgpt' ? /chatgpt|openai/i : new RegExp(id, 'i')).test(r.name)));
  const key = fresh ?? KEY_PLACEHOLDER;
  const cursorJson = JSON.stringify({ mcpServers: { omer: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
  const cursorOauthJson = JSON.stringify({ mcpServers: { omer: { url } } }, null, 2);

  return (
    <div className="set-main solo ai-connect">
      <section className="ai-intro">
        <h3>AI assistants</h3>
        <p>Connect Claude, ChatGPT or Cursor and ask in plain words: how a store is doing, who is worth an email, draft it in your voice, send it, build a campaign. They get everything you can do in Omer, and nothing you can’t.</p>
        <div className="ai-url">
          <span className="ai-code-label">Server URL</span>
          <code>{url}</code>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(url)}><Icon name="copy" />Copy</button>
        </div>
      </section>

      <div className="set-int-tiles ai-tiles" role="tablist" aria-label="Assistant">
        {ASSISTANTS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={pick === a.id} className={`set-int-tile ai-tile${pick === a.id ? ' is-on' : ''}`} onClick={() => setPick(a.id)}>
            <span className="set-int-tile-mark"><Mark id={a.id} /></span>
            <h3>{a.name}</h3>
            <p>{a.blurb}</p>
            {linked(a.id) ? <span className="status-pill received"><Icon name="checkCircle" />Connected</span> : null}
          </button>
        ))}
      </div>

      <section className="ai-panel" aria-live="polite">
        {pick === 'claude' && (
          <>
            <h4>Claude.ai and Claude Desktop</h4>
            <Steps>
              <li>Open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>.</li>
              <li>Name it <b>Omer</b> and paste the server URL above.</li>
              <li>Click <b>Connect</b>. Omer opens: sign in and press <b>Allow</b>.</li>
              <li>In a chat, turn Omer on from the tools menu and ask, “How did my store do this week?”</li>
            </Steps>
            <h4>Claude Code</h4>
            <p className="ai-note">Sign in through the browser:</p>
            <Code value={`claude mcp add --transport http omer ${url}`} />
            <p className="ai-note">Then run <code>/mcp</code> inside Claude Code and choose Omer to approve. Or skip the browser with a key:</p>
            <Code value={`claude mcp add --transport http omer ${url} --header "Authorization: Bearer ${key}"`} />
          </>
        )}
        {pick === 'chatgpt' && (
          <>
            <h4>ChatGPT</h4>
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
            <h4>Cursor</h4>
            <Steps>
              <li>Open <b>Cursor Settings → Tools &amp; MCP → Add custom MCP</b> (this edits <code>~/.cursor/mcp.json</code>), or use <code>.cursor/mcp.json</code> inside one project.</li>
              <li>Add Omer with your API key (create one below), then save.</li>
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
            <b>Copy your new key now. It won’t be shown again.</b>
            <Code value={fresh} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFresh(null)}>Done</button>
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
            {access.map((row) => (
              <li key={row.id}>
                <span className="ai-list-copy">
                  <b>{row.name}</b>
                  <small>{row.type === 'key' ? `API key · ${row.prefix}…` : 'Connected app'} · {ago(row.lastUsedAt)}</small>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void revoke(row)}>{row.type === 'key' ? 'Delete' : 'Disconnect'}</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ai-note">No keys or connected apps yet.</p>
        )}
      </section>
    </div>
  );
}
