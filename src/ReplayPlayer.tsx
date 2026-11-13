import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';

type Manifest = {
  id: string;
  status: string;
  hasFullSnapshot: boolean;
  gaps: boolean;
  chunks: { seq: number; url: string; hasFullSnapshot: boolean }[];
};

type RrwebEvent = { type: number; timestamp?: number; data?: unknown };

function loadPlayer() {
  return new Promise<new (opts: { target: HTMLElement; props: Record<string, unknown> }) => { $destroy?: () => void }>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-rrweb-player]');
    const ready = () => {
      // @ts-expect-error rrweb player UMD global
      const Player = window.rrwebPlayer;
      if (typeof Player === 'function') resolve(Player);
      else reject(new Error('Player library loaded without a constructor'));
    };
    if (existing) {
      if (existing.dataset.loaded === '1') ready();
      else existing.addEventListener('load', () => ready(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Player script failed')), { once: true });
      return;
    }
    if (!document.querySelector('link[data-rrweb-player-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/vendor/rrweb-player.css';
      link.dataset.rrwebPlayerCss = '1';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = '/vendor/rrweb-player.min.js';
    script.dataset.rrwebPlayer = '1';
    script.onload = () => { script.dataset.loaded = '1'; ready(); };
    script.onerror = () => reject(new Error('Unable to load player script'));
    document.head.appendChild(script);
  });
}

export function ReplayPlayer({ projectId, replayId, onBack }: {
  projectId: string;
  replayId: string;
  onBack: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading replay…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let player: { $destroy?: () => void; destroy?: () => void } | null = null;

    async function load() {
      try {
        setFailed(false);
        setStatus('Loading replay…');
        const res = await fetch(`/api/projects/${projectId}/replays/${replayId}`, { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) throw new Error(res.status === 401 ? 'Sign in again to view replays' : `Replay missing (${res.status})`);
        const manifest: Manifest = await res.json();
        if (cancelled) return;
        if (manifest.status === 'expired') {
          setStatus('Replay expired');
          setFailed(true);
          return;
        }
        if (manifest.status === 'incomplete' || !manifest.chunks.length) {
          setStatus(manifest.chunks.length
            ? 'Recording still incomplete'
            : 'No recording chunks yet — keep the tab open a few more seconds, then reopen.');
          setFailed(true);
          return;
        }

        const events: RrwebEvent[] = [];
        for (const chunk of manifest.chunks) {
          const chunkRes = await fetch(chunk.url, { credentials: 'same-origin', cache: 'no-store' });
          if (!chunkRes.ok) throw new Error(`Chunk ${chunk.seq} failed (${chunkRes.status})`);
          const part = await chunkRes.json();
          if (Array.isArray(part)) events.push(...part as RrwebEvent[]);
        }
        if (!events.length) {
          setStatus('Recording incomplete');
          setFailed(true);
          return;
        }
        if (!events.some((event) => event?.type === 2)) {
          setStatus('Recording has no full snapshot yet');
          setFailed(true);
          return;
        }
        events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        const Player = await loadPlayer();
        if (cancelled) return;
        const stage = host.current;
        if (!stage) throw new Error('Player stage missing');
        stage.innerHTML = '';
        player = new Player({
          target: stage,
          props: {
            events,
            width: Math.min(920, Math.max(320, stage.clientWidth || 720)),
            height: 480,
            autoPlay: true,
            showController: true,
            skipInactive: true,
          },
        });
        setStatus(manifest.gaps || !manifest.hasFullSnapshot ? 'Partial recording' : 'Playing');
      } catch (error) {
        if (!cancelled) {
          setFailed(true);
          setStatus(error instanceof Error ? error.message : 'Unable to load this replay');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      try { player?.$destroy?.() || player?.destroy?.(); } catch { /* ignore */ }
    };
  }, [projectId, replayId]);

  return (
    <div className="rp-page">
      <button type="button" className="profile-back" onClick={onBack}><Icon name="arrowLeft" /> Profile</button>
      <section className="v2-card rp-shell">
        <header><Icon name="play" /><h3>Session replay</h3><span className="rp-status">{status}</span></header>
        <div className="v2-in">
          {failed && <p className="ho-empty">{status}</p>}
          <div className="rp-stage" ref={host} hidden={failed} />
        </div>
      </section>
    </div>
  );
}
