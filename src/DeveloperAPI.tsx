/* Settings → Integrations → API: keys only. Examples live on /docs/api. */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';

type Access = { id: string; type: 'key' | 'app'; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type FreshKey = { token: string; name: string; id: string };

function ago(iso: string | null) {
  if (!iso) return 'Never used';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return 'Used just now';
  if (m < 60) return `Used ${m} min ago`;
  if (m < 1440) return `Used ${Math.round(m / 60)} h ago`;
  return `Used ${Math.round(m / 1440)} d ago`;
}

async function copyText(text: string, ok = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast('Could not copy', { kind: 'warn' });
  }
}

export function DeveloperAPI({ projectId }: { projectId: string }) {
  const [keys, setKeys] = useState<Access[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<FreshKey | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.tryomer.com';

  const load = useCallback(async () => {
    const res = await fetch('/api/mcp/access');
    const data = await res.json().catch(() => ({})) as { access?: Access[]; error?: string };
    if (!res.ok || !data.access) throw new Error(data.error || 'Could not load API access');
    setKeys(data.access.filter((r) => r.type === 'key'));
  }, []);

  useEffect(() => {
    void load().catch((e) => toast(e instanceof Error ? e.message : 'Could not load API access', { kind: 'warn' }));
  }, [load]);

  const createKey = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/mcp/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'API key' }),
      });
      const data = await res.json().catch(() => ({})) as FreshKey & { error?: string };
      if (!res.ok || !data.token) throw new Error(data.error || 'Could not create a key');
      setFresh({ token: data.token, name: data.name, id: data.id });
      await load();
      toast('API key created — copy it now');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create a key', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: Access) => {
    if (busy) return;
    if (!window.confirm(`Delete the key “${row.name}”? Scripts using it will stop working.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp/access/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete the key');
      if (fresh?.id === row.id) setFresh(null);
      await load();
      toast('Key deleted');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the key', { kind: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  if (!keys) {
    return (
      <div className="set-main solo api-dev" aria-busy="true">
        <header className="set-int-section-head">
          <h3>API</h3>
          <p>Loading…</p>
        </header>
      </div>
    );
  }

  return (
    <div className="set-main solo api-dev">
      <header className="set-int-section-head">
        <h3>API</h3>
        <p>
          Personal keys for scripts and agents.
          {' '}
          <a href="/docs/api" target="_blank" rel="noreferrer">API documentation</a>
        </p>
      </header>

      <div className="api-meta">
        <div className="api-base">
          <span>Base URL</span>
          <code>{origin}</code>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyText(origin, 'Base URL copied')}>
            Copy
          </button>
        </div>
        <div className="api-base">
          <span>Project id</span>
          <code>{projectId}</code>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyText(projectId, 'Project id copied')}>
            Copy
          </button>
        </div>
      </div>

      {fresh ? (
        <div className="ai-fresh api-fresh" role="status">
          <div className="ai-fresh-head">
            <b>Copy this key now</b>
            <span className="status-pill received"><Icon name="checkCircle" />Shown once</span>
          </div>
          <div className="ai-modal-url">
            <code className="ai-modal-key">{fresh.token}</code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyText(fresh.token, 'Key copied')}>
              Copy key
            </button>
          </div>
          <p className="omer-set-note">We cannot show it again. Store it somewhere safe.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFresh(null)}>Dismiss</button>
        </div>
      ) : null}

      <div className="api-keys-bar">
        <h4>Keys</h4>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void createKey()}>
          Create key
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="api-empty">No keys yet. Create one to authenticate as <code>Bearer omk_…</code>.</p>
      ) : (
        <ul className="ai-list api-key-list">
          {keys.map((row) => (
            <li key={row.id}>
              <span className="ai-list-mark"><Icon name="lock" /></span>
              <span className="ai-list-copy">
                <b>{row.name}</b>
                <small>{row.prefix}… · {ago(row.lastUsedAt)}</small>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void revoke(row)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DemoDeveloperAPI() {
  return (
    <div className="set-main solo api-dev">
      <header className="set-int-section-head">
        <h3>API</h3>
        <p>
          Personal keys for scripts and agents.
          {' '}
          <a href="/docs/api" target="_blank" rel="noreferrer">API documentation</a>
        </p>
      </header>
      <p className="api-empty">Demo store — open a real project to create keys.</p>
    </div>
  );
}
