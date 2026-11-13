import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';

type Insight = {
  status: string;
  summary: string | null;
  outcome: string | null;
  friction: number | null;
  worthWatching: boolean | null;
  primaryInterest: string | null;
  emailReady?: boolean | null;
  emailReadyConfidence?: number | null;
  stage?: string | null;
  intent?: number | null;
  highlights?: string[];
  emailHooks?: string[];
  insightVersion?: number;
  generatedAt?: string | null;
  error?: string | null;
};

const CURRENT_INSIGHT_VERSION = 2;

function insightNeedsRefresh(insight: Insight | null | undefined) {
  if (!insight || insight.status !== 'ready' || !insight.summary) return true;
  return (insight.insightVersion || 1) < CURRENT_INSIGHT_VERSION;
}

type Manifest = {
  id: string;
  status: string;
  hasFullSnapshot: boolean;
  gaps: boolean;
  chunks: { seq: number; url: string; hasFullSnapshot: boolean }[];
  insight?: Insight | null;
  insightsEnabled?: boolean;
};

type RrwebEvent = { type: number; timestamp?: number; data?: unknown };

type PlayerCtor = new (opts: { target: HTMLElement; props: Record<string, unknown> }) => {
  $destroy?: () => void;
  destroy?: () => void;
};

let playerPromise: Promise<PlayerCtor> | null = null;

/** Warm the player script/CSS so the first Watch click feels instant. */
export function prefetchReplayPlayer() {
  void loadPlayer();
}

function loadPlayer() {
  if (playerPromise) return playerPromise;
  playerPromise = new Promise<PlayerCtor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-rrweb-player]');
    const ready = () => {
      // @ts-expect-error rrweb player UMD global
      const Player = window.rrwebPlayer;
      if (typeof Player === 'function') resolve(Player);
      else {
        playerPromise = null;
        reject(new Error('Player library loaded without a constructor'));
      }
    };
    if (existing) {
      if (existing.dataset.loaded === '1') ready();
      else {
        existing.addEventListener('load', () => ready(), { once: true });
        existing.addEventListener('error', () => {
          playerPromise = null;
          reject(new Error('Player script failed'));
        }, { once: true });
      }
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
    script.onerror = () => {
      playerPromise = null;
      reject(new Error('Unable to load player script'));
    };
    document.head.appendChild(script);
  });
  return playerPromise;
}

function fmtClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function frictionLabel(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < 0.75) return 'No friction';
  if (value < 1.5) return 'Low friction';
  if (value < 2.25) return 'Medium friction';
  return 'High friction';
}

export function ReplayPlayer({ projectId, replayId, onBack }: {
  projectId: string;
  replayId: string;
  onBack: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading replay…');
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [meta, setMeta] = useState<{ spanLabel: string; chunks: number } | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightsEnabled, setInsightsEnabled] = useState(false);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let player: { $destroy?: () => void; destroy?: () => void } | null = null;

    async function requestSummary() {
      setInsightBusy(true);
      setInsightError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/replays/${replayId}/summary`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setInsightError(typeof body.error === 'string' ? body.error : 'Unable to generate summary');
          if (body.insight) setInsight(body.insight as Insight);
          return;
        }
        setInsight((body.insight as Insight) || null);
      } catch {
        if (!cancelled) setInsightError('Unable to generate summary');
      } finally {
        if (!cancelled) setInsightBusy(false);
      }
    }

    async function load() {
      try {
        setFailed(false);
        setMeta(null);
        setInsight(null);
        setInsightError(null);
        setProgress(8);
        setStatus('Fetching recording…');
        const playerReady = loadPlayer();
        const res = await fetch(`/api/projects/${projectId}/replays/${replayId}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(res.status === 401 ? 'Sign in again to view replays' : `Replay missing (${res.status})`);
        const manifest: Manifest = await res.json();
        if (cancelled) return;
        setInsightsEnabled(Boolean(manifest.insightsEnabled));
        if (manifest.insight?.status === 'ready') setInsight(manifest.insight);
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

        // Kick off / refresh summary without blocking playback.
        if (manifest.insightsEnabled && insightNeedsRefresh(manifest.insight)) {
          void requestSummary();
        }

        setProgress(18);
        setStatus(`Loading ${manifest.chunks.length} part${manifest.chunks.length === 1 ? '' : 's'}…`);
        let done = 0;
        const parts = await Promise.all(manifest.chunks.map(async (chunk) => {
          const chunkRes = await fetch(chunk.url, { credentials: 'same-origin', cache: 'force-cache' });
          if (!chunkRes.ok) throw new Error(`Chunk ${chunk.seq} failed (${chunkRes.status})`);
          const part = await chunkRes.json();
          done += 1;
          if (!cancelled) {
            setProgress(18 + Math.round((done / manifest.chunks.length) * 62));
            setStatus(`Loading ${done}/${manifest.chunks.length}…`);
          }
          return { seq: chunk.seq, part };
        }));
        if (cancelled) return;

        const events: RrwebEvent[] = [];
        for (const { part } of parts.sort((a, b) => a.seq - b.seq)) {
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
        const spanMs = (events[events.length - 1]?.timestamp || 0) - (events[0]?.timestamp || 0);
        if (events.length === 1 || spanMs < 50) {
          const base = events[0].timestamp || Date.now();
          if (!events.some((e) => e?.type === 4)) {
            events.unshift({ type: 4, data: { href: location.origin, width: 1280, height: 720 }, timestamp: base - 1 });
          }
          if (spanMs < 50) {
            events.push({ type: 3, data: { source: 0 }, timestamp: base + Math.max(50, spanMs + 1) });
          }
        }

        setProgress(88);
        setStatus('Starting player…');
        const Player = await playerReady;
        if (cancelled) return;
        const stage = host.current;
        if (!stage) throw new Error('Player stage missing');
        stage.innerHTML = '';
        const width = Math.min(960, Math.max(320, stage.clientWidth || 720));
        const height = Math.round(Math.min(560, Math.max(360, width * 0.62)));
        player = new Player({
          target: stage,
          props: {
            events,
            width,
            height,
            autoPlay: true,
            showController: true,
            skipInactive: true,
            speed: 1,
            speedOption: [1, 2, 4, 8],
          },
        });
        setProgress(100);
        setMeta({ spanLabel: fmtClock(spanMs), chunks: manifest.chunks.length });
        if (spanMs < 50) setStatus('Still frame only — no motion was captured');
        else setStatus(manifest.gaps || !manifest.hasFullSnapshot ? 'Partial recording' : 'Playing');
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

  const loading = !failed && progress < 100 && status !== 'Playing' && status !== 'Partial recording' && !status.startsWith('Still');
  const friction = frictionLabel(insight?.friction ?? null);
  const emailReadyPct = insight?.emailReadyConfidence != null
    ? Math.round(Math.max(0, Math.min(1, insight.emailReadyConfidence)) * 100)
    : null;

  return (
    <div className="rp-page">
      <button type="button" className="profile-back" onClick={onBack}><Icon name="arrowLeft" /> Profile</button>
      <section className="v2-card rp-shell" aria-busy={loading}>
        <header className="rp-head">
          <div className="rp-head-title">
            <Icon name="play" />
            <h3>Session replay</h3>
          </div>
          <div className="rp-head-meta">
            {meta && <span className="rp-chip">{meta.spanLabel}</span>}
            {meta && <span className="rp-chip muted">{meta.chunks} part{meta.chunks === 1 ? '' : 's'}</span>}
            <span className={`rp-status${failed ? ' is-bad' : ''}${loading ? ' is-load' : ''}`}>{status}</span>
          </div>
        </header>

        {insightsEnabled && (
          <div className="rp-insight">
            {insightBusy && !insight?.summary && <p className="rp-insight-status">Reading the session…</p>}
            {insight?.summary && (
              <>
                <p className="rp-insight-text">{insight.summary}</p>
                <div className="rp-insight-chips">
                  {insight.outcome && <span className="rp-chip">{insight.outcome}</span>}
                  {insight.stage && <span className="rp-chip muted">{insight.stage}</span>}
                  {friction && <span className="rp-chip muted">{friction}</span>}
                  {insight.worthWatching != null && (
                    <span className="rp-chip muted">{insight.worthWatching ? 'Worth watching' : 'Low priority'}</span>
                  )}
                  {insight.primaryInterest && <span className="rp-chip muted">{insight.primaryInterest}</span>}
                  {emailReadyPct != null && (
                    <span className={`rp-chip ${insight.emailReady ? '' : 'muted'}`.trim()}>
                      Email-ready {emailReadyPct}%
                    </span>
                  )}
                </div>
                {!!insight.highlights?.length && (
                  <ul className="rp-insight-list">
                    {insight.highlights.slice(0, 8).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {!!insight.emailHooks?.length && (
                  <div className="rp-insight-hooks">
                    <p className="rp-insight-hooks-label">Later email hooks</p>
                    <ul className="rp-insight-list">
                      {insight.emailHooks.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {!insightBusy && !insight?.summary && (
              <div className="rp-insight-actions">
                <p className="rp-insight-status">{insightError || 'No summary yet.'}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                  setInsightBusy(true);
                  setInsightError(null);
                  void fetch(`/api/projects/${projectId}/replays/${replayId}/summary`, {
                    method: 'POST',
                    credentials: 'same-origin',
                  }).then(async (res) => {
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setInsightError(typeof body.error === 'string' ? body.error : 'Unable to generate summary');
                      if (body.insight) setInsight(body.insight as Insight);
                      return;
                    }
                    setInsight((body.insight as Insight) || null);
                  }).catch(() => setInsightError('Unable to generate summary'))
                    .finally(() => setInsightBusy(false));
                }}>
                  Generate summary
                </button>
              </div>
            )}
          </div>
        )}

        <div className="rp-body">
          {failed && <p className="ho-empty rp-empty">{status}</p>}
          {loading && (
            <div className="rp-skeleton" aria-hidden="true">
              <div className="rp-skeleton-bar" style={{ width: `${Math.max(12, progress)}%` }} />
              <p>{status}</p>
            </div>
          )}
          <div className="rp-stage" ref={host} hidden={failed} data-ready={!loading && !failed ? '1' : '0'} />
        </div>
        {!failed && (
          <p className="rp-hint">
            Speed and skip-inactive live in the player bar. Skip inactive jumps quiet gaps; turn it off to watch the real timing.
          </p>
        )}
      </section>
    </div>
  );
}
