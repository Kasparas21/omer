import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';

type Manifest = {
  id: string;
  status: string;
  hasFullSnapshot: boolean;
  gaps: boolean;
  chunks: { seq: number; url: string; hasFullSnapshot: boolean }[];
};

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
    let player: { destroy?: () => void } | null = null;
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/replays/${replayId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('replay');
        const manifest: Manifest = await res.json();
        if (cancelled) return;
        if (manifest.status === 'expired') {
          setStatus('Replay expired');
          setFailed(true);
          return;
        }
        if (manifest.status === 'incomplete' || !manifest.chunks.length) {
          setStatus(manifest.chunks.length ? 'Recording still incomplete' : 'No recording chunks yet — keep the tab open a few more seconds, then reopen.');
          setFailed(true);
          return;
        }
        const events: unknown[] = [];
        for (const chunk of manifest.chunks) {
          const chunkRes = await fetch(chunk.url, { credentials: 'same-origin', cache: 'no-store' });
          if (!chunkRes.ok) throw new Error(`chunk ${chunk.seq}`);
          const part = await chunkRes.json();
          if (Array.isArray(part)) events.push(...part);
        }
        if (!events.length) {
          setStatus('Recording incomplete');
          setFailed(true);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[data-rrweb-player]');
          if (existing) { resolve(); return; }
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://cdn.jsdelivr.net/npm/rrweb-player@1.0.0-alpha.4/dist/style.css';
          document.head.appendChild(link);
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/rrweb-player@1.0.0-alpha.4/dist/index.js';
          script.dataset.rrwebPlayer = '1';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('player'));
          document.head.appendChild(script);
        });
        if (cancelled || !host.current) return;
        // @ts-expect-error rrweb player global
        const Player = window.rrwebPlayer || window.rrweb?.player;
        if (!Player) throw new Error('player missing');
        host.current.innerHTML = '';
        player = new Player({
          target: host.current,
          props: {
            events,
            width: Math.min(920, host.current.clientWidth || 720),
            height: 480,
            autoPlay: true,
            showController: true,
          },
        });
        setStatus(manifest.gaps || !manifest.hasFullSnapshot ? 'Partial recording' : 'Playing');
      } catch {
        if (!cancelled) { setFailed(true); setStatus('Unable to load this replay'); }
      }
    }
    void load();
    return () => { cancelled = true; try { player?.destroy?.(); } catch { /* ignore */ } };
  }, [projectId, replayId]);

  return (
    <div className="rp-page">
      <button type="button" className="profile-back" onClick={onBack}><Icon name="arrowLeft" /> Profile</button>
      <section className="v2-card rp-shell">
        <header><Icon name="play" /><h3>Session replay</h3><span className="rp-status">{status}</span></header>
        <div className="v2-in">
          {failed ? <p className="ho-empty">{status}</p> : <div className="rp-stage" ref={host} />}
        </div>
      </section>
    </div>
  );
}
