/* Settings → Integrations → AI assistants: Connect opens a sticky Omer page that hands off to
   Claude / ChatGPT / Cursor without vanishing before Allow. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from './ui/brandLogos';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type Access = { id: string; type: 'key' | 'app'; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type Assistant = 'claude' | 'chatgpt' | 'cursor';

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
  const [access, setAccess] = useState<Access[] | null>(null);
  const [busy, setBusy] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const res = await fetch('/api/mcp/access');
    const data = await res.json().catch(() => ({})) as { access?: Access[]; error?: string };
    if (!res.ok || !data.access) throw new Error(data.error || 'Could not load access');

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
    // Sticky Omer page — Cursor/Claude handoff tabs often close; this one does not.
    window.open(`/connect/${id}`, '_blank', 'noopener,noreferrer');
    toast(
      id === 'chatgpt'
        ? 'Paste the URL in ChatGPT, then Allow on Omer'
        : `Finish setup in ${ASSISTANTS.find((a) => a.id === id)!.name}, then Allow on Omer`,
      { kind: 'ok' },
    );
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
  const apps = access?.filter((r) => r.type === 'app') ?? [];

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

      {apps.length > 0 ? (
        <section className="ai-keys" aria-label="Connected apps">
          <header>
            <h3>Connected apps</h3>
            <p>OAuth apps that can act as you. Personal API keys live under API below.</p>
          </header>
          <ul className="ai-list">
            {apps.map((row) => {
              const logo = logoForAccess(row);
              return (
                <li key={row.id}>
                  <span className="ai-list-mark">
                    {logo ? <BrandLogo slug={logo} /> : <Icon name="lock" />}
                  </span>
                  <span className="ai-list-copy">
                    <b>{row.name}</b>
                    <small>Connected app · {ago(row.lastUsedAt)}</small>
                  </span>
                  <span className="status-pill received ai-list-pill"><Icon name="checkCircle" />Live</span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void revoke(row)}>
                    Disconnect
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
