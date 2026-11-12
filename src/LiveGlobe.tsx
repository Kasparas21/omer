import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Radio, Volume2, VolumeX } from 'lucide-react';

export type LiveVisit = {
  id: string;
  seed: string;
  path: string;
  referrer: string;
  cc: string | null;
  city: string | null;
  place: string | null;
  lat: number | null;
  lng: number | null;
  seenAt: string;
};

type LivePayload = {
  online: number;
  minutes: number[];
  sources: { name: string; count: number }[];
  visits: LiveVisit[];
};

type GlobeApi = {
  destroy(): void;
  ping(match: (person: { seed?: string }) => boolean): void;
  focus(match: (person: { seed?: string }) => boolean): void;
};

function flagFace(cc: string) {
  const code = cc.toLowerCase();
  return `<img src="/assets/flags/${code}.svg" alt="" width="16" height="16" draggable="false">`;
}

function sourceLabel(name: string) {
  if (name === '(direct)') return 'Direct';
  if (name.includes('google')) return 'Google';
  if (name.includes('instagram')) return 'Instagram';
  if (name.includes('tiktok')) return 'TikTok';
  if (name.includes('facebook') || name.includes('meta')) return 'Facebook';
  return name;
}

function sourceClass(name: string) {
  if (name === '(direct)') return 'direct';
  if (name.includes('google')) return 'google';
  if (name.includes('instagram')) return 'instagram';
  if (name.includes('tiktok')) return 'tiktok';
  if (name.includes('facebook') || name.includes('meta')) return 'meta';
  return 'direct';
}

function ago(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function peopleFromVisits(visits: LiveVisit[]) {
  const seen = new Map<string, LiveVisit>();
  for (const visit of visits) {
    if (visit.lat == null || visit.lng == null || !visit.place || !visit.cc) continue;
    if (!seen.has(visit.seed)) seen.set(visit.seed, visit);
  }
  return [...seen.values()].map((visit) => ({
    seed: visit.seed,
    cc: visit.cc!,
    page: visit.path,
    place: { name: visit.place!, lat: visit.lat!, lng: visit.lng! },
  }));
}

export function LiveGlobe({ projectId }: { projectId: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeApi | null>(null);
  const [data, setData] = useState<LivePayload>({ online: 0, minutes: Array(60).fill(0), sources: [], visits: [] });
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<string>();
  const peak = Math.max(1, ...data.minutes);
  const sourceTotal = data.sources.reduce((sum, row) => sum + row.count, 0) || 1;
  const peopleKey = useMemo(() => peopleFromVisits(data.visits).map((p) => `${p.seed}:${p.place.name}`).join('|'), [data.visits]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/live`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload: LivePayload = await response.json();
        if (!cancelled) setData(payload);
      } catch {
        /* keep last good snapshot */
      }
    }
    void load();
    const poll = window.setInterval(() => { if (!document.hidden) void load(); }, 4000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; window.clearInterval(poll); window.clearInterval(tick); };
  }, [projectId]);

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let disposed = false;
    const people = peopleFromVisits(data.visits);
    const moduleUrl = '/globe/dotglobe.js';
    void import(/* @vite-ignore */ moduleUrl).then(async ({ createDotGlobe, preloadDotGlobe }) => {
      await preloadDotGlobe();
      if (disposed || !stage.current) return;
      globe.current?.destroy();
      stage.current.replaceChildren();
      const next = createDotGlobe(stage.current, {
        people,
        face: flagFace,
        autoSpin: true,
        quietIntro: true,
        maxZoom: 1.35,
        radiusScale: 1.12,
      }) as GlobeApi;
      globe.current = next;
      if (people[0]) next.ping((person) => person.seed === people[0].seed);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; globe.current?.destroy(); globe.current = null; };
  }, [projectId, peopleKey]);

  useEffect(() => {
    if (!focus) return;
    globe.current?.focus((person) => person.seed === focus);
    globe.current?.ping((person) => person.seed === focus);
  }, [focus, peopleKey]);

  return (
    <div className="globe-wrap has-panel" data-style="dots" id="globeWrap">
      <aside className="live-panel" id="livePanel">
        <section className="v2-card lvp-now">
          <header><Radio size={16} aria-hidden="true" /><h3>Right now</h3></header>
          <div className="v2-in">
            <div className="lvp-big">
              <b>{data.online}</b>
              <span><i className="lvp-dot" aria-hidden="true" />{data.online === 1 ? 'person on the site' : 'people on the site'}</span>
            </div>
            <div className="lvp-bars" aria-hidden="true">
              {data.minutes.map((count, index) => (
                <i key={index} className={index === data.minutes.length - 1 ? 'now' : undefined} style={{ ['--h' as string]: `${Math.max(8, (count / peak) * 100)}%` }} />
              ))}
            </div>
            <div className="lvp-foot"><span>Last hour</span><b>{data.minutes.reduce((a, b) => a + b, 0)} views</b></div>
          </div>
        </section>

        <section className="v2-card lvp-feed" id="liveVisits">
          <header><h3>Recent visits</h3></header>
          <div className="v2-in">
            {data.visits.length === 0 ? (
              <p className="omer-empty-note">Waiting for consented page views with location.</p>
            ) : (
              <ol id="lpFeed">
                {data.visits.slice(0, 24).map((visit) => (
                  <li key={visit.id}>
                    <button type="button" data-livego={visit.seed} aria-current={focus === visit.seed ? 'true' : undefined} onClick={() => setFocus(visit.seed)}>
                      <i className="lvp-dot" aria-hidden="true" />
                      {visit.cc
                        ? <img className="flag" src={`/assets/flags/${visit.cc}.svg`} alt="" width={16} height={16} draggable={false} />
                        : <span className="flag" aria-hidden="true" />}
                      <span className="lvp-page">{visit.path}</span>
                      <span className="lvp-city">{visit.city || visit.place || '—'}</span>
                      <time dateTime={visit.seenAt}>{ago(visit.seenAt, now)}</time>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <div className="lvp-breakdown">
          <section className="v2-card lvp-from">
            <header><h3>Sources</h3></header>
            <div className="v2-in">
              {data.sources.length === 0 ? (
                <p className="omer-empty-note">Sources fill in from referrers.</p>
              ) : (
                <table className="lvp-table">
                  <thead><tr><th scope="col">Source</th><th scope="col">Visitors</th><th scope="col">Share</th></tr></thead>
                  <tbody>
                    {data.sources.map((row) => (
                      <tr key={row.name}>
                        <th scope="row"><span className="lvp-name"><span className={`lvp-src ${sourceClass(row.name)}`} aria-hidden="true" /><span>{sourceLabel(row.name)}</span></span></th>
                        <td>{row.count}</td>
                        <td>{Math.round((row.count / sourceTotal) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </aside>

      <div className="globe-stage" id="globeStage" ref={stage}>
        {failed && <p className="globe-fallback">The globe couldn’t load.</p>}
      </div>

      <div className="live-ctl">
        <button type="button" className="live-ctl-btn" aria-pressed={sound} aria-label={sound ? 'Mute visit sounds' : 'Enable visit sounds'} onClick={() => setSound((value) => !value)}>
          {sound ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
        </button>
        <button type="button" className="live-ctl-btn" aria-label="Toggle full screen" onClick={() => {
          const root = document.getElementById('globeWrap');
          if (!root) return;
          if (!document.fullscreenElement) void root.requestFullscreen?.();
          else void document.exitFullscreen?.();
        }}>
          <Maximize2 size={19} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
