import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import { SourceMark, sourceKey, sourceLabel } from './ui/sources';

import { isOnline, type LiveVisit, type LivePayload } from './live';

type GlobePerson = { seed?: string; cc: string; place: { name: string; lat: number; lng: number } };

// Kit "Dots" globe: each pin wears the visitor's country flag (kit flag(cc, 21)).
function flagFace(cc: string) {
  return `<span class="flag" style="width:21px;height:21px"><img src="/assets/flags/${cc.toLowerCase()}.svg" alt="" draggable="false"></span>`;
}

type GlobeApi = {
  destroy(): void;
  setPeople(people: ReturnType<typeof peopleFromVisits>): void;
  ping(match: (person: GlobePerson) => boolean): void;
  focus(match: (person: GlobePerson) => boolean): void;
};

function ago(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function peopleFromVisits(visits: LiveVisit[], now: number) {
  const seen = new Map<string, LiveVisit>();
  for (const visit of visits) {
    if (!isOnline(visit, now) || visit.lat == null || visit.lng == null || !visit.place || !visit.cc) continue;
    if (!seen.has(visit.seed)) seen.set(visit.seed, visit);
  }
  return [...seen.values()].map((visit) => ({
    seed: visit.seed,
    cc: visit.cc!,
    place: { name: visit.place!, lat: visit.lat!, lng: visit.lng! },
  }));
}

export function LiveGlobe({ data, loading, failed: connectionFailed, focusSeed, demo = false }: { data: LivePayload; loading: boolean; failed: boolean; focusSeed?: string; demo?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeApi | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<string>();
  const peak = Math.max(1, ...data.minutes.slice(-30));
  const sourceTotal = data.sources.reduce((sum, row) => sum + row.count, 0) || 1;
  const [showVisits, setShowVisits] = useState(false);
  const [ready, setReady] = useState(false);
  const [seenLive, setSeenLive] = useState<string>();
  const people = useMemo(() => peopleFromVisits(data.visits, now), [data.visits, now]);
  const peopleKey = JSON.stringify(people);
  const newest = data.visits[0];

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(tick); if (audio.current) void audio.current.close().catch(() => {}); };
  }, []);

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let disposed = false;
    void import('./globe/dotglobe.js').then(async ({ createDotGlobe, preloadDotGlobe }) => {
      await preloadDotGlobe();
      if (disposed || !stage.current) return;
      globe.current?.destroy();
      stage.current.replaceChildren();
      const next = createDotGlobe(stage.current, {
        face: flagFace,
        autoSpin: true,
        quietIntro: true,
        openOnFocus: false,
        maxZoom: 1.35,
        radiusScale: 1.12,
      }) as GlobeApi;
      globe.current = next;
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; globe.current?.destroy(); globe.current = null; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    globe.current?.setPeople(JSON.parse(peopleKey));
    if (newest && newest.id !== seenLive) {
      setSeenLive(newest.id);
      if (seenLive && sound && audio.current?.state === 'running') {
        const context = audio.current;
        const tone = context.createOscillator();
        const volume = context.createGain();
        const start = context.currentTime;
        tone.frequency.setValueAtTime(620, start);
        volume.gain.setValueAtTime(0.035, start);
        volume.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
        tone.connect(volume).connect(context.destination);
        tone.start(start);
        tone.stop(start + 0.14);
      }
      if (!seenLive && !focusSeed && Date.now() - Date.parse(newest.seenAt) < 20000) globe.current?.focus((person) => person.seed === newest.seed);
      globe.current?.ping((person) => person.seed === newest.seed);
    }
  }, [peopleKey, newest?.id, ready]);

  // Opened from People: turn to that person once their pin exists.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!ready || !focusSeed || opened || !people.some((p) => p.seed === focusSeed)) return;
    setOpened(true);
    setFocus(focusSeed);
    globe.current?.focus((person) => person.seed === focusSeed);
    globe.current?.ping((person) => person.seed === focusSeed);
  }, [ready, focusSeed, opened, peopleKey]);

  function focusVisit(visit: LiveVisit) {
    setFocus(visit.seed);
    globe.current?.focus((person) => person.seed === visit.seed);
    globe.current?.ping((person) => person.seed === visit.seed);
  }

  return (
    <div className="globe-wrap has-panel" data-style="dots" id="globeWrap">
      <aside className={`live-panel${showVisits ? ' visits-open' : ''}`} id="livePanel">
        <section className="v2-card lvp-now">
          <header><h3>Right now</h3></header>
          <div className="v2-in">
            <div className="lvp-big">
              <b>{data.online}</b>
              <span><i className="lvp-dot" aria-hidden="true" />{data.online === 1 ? 'Current visitor' : 'Current visitors'}</span>
            </div>
            <div className="lvp-bars" aria-hidden="true">
              {data.minutes.slice(-30).map((count, index) => (
                <i key={index} className={index === 29 ? 'now' : undefined} style={{ ['--h' as string]: `${Math.max(8, (count / peak) * 100)}%` }} />
              ))}
            </div>
            <div className="lvp-foot"><span>Last 30 min</span><b>{data.minutes.slice(-30).reduce((a, b) => a + b, 0)} views</b></div>
          </div>
        </section>

        <button className="btn btn-secondary lvp-visits-toggle" type="button" aria-expanded={showVisits} aria-controls="liveVisits" onClick={() => setShowVisits(!showVisits)}>{showVisits ? 'Hide recent visits' : 'Show recent visits'}</button>
        <section className="v2-card lvp-feed" id="liveVisits">
          <header><h3>Recent visits</h3></header>
          <div className="v2-in">
            {data.visits.length === 0 ? (
              <p className="omer-empty-note">{loading ? 'Loading visits…' : connectionFailed ? 'Live connection interrupted. Reconnecting…' : 'Waiting for a visit with analytics consent.'}</p>
            ) : (
              <ol id="lpFeed">
                {data.visits.slice(0, 24).map((visit) => (
                  <li key={visit.id}>
                    <button type="button" data-livego={visit.seed} aria-current={focus === visit.seed ? 'true' : undefined} disabled={!isOnline(visit, now) || visit.lat == null || visit.lng == null} onClick={() => focusVisit(visit)}>
                      <i className={`lvp-dot${isOnline(visit, now) ? ' is-live' : ' is-gone'}`} aria-hidden="true" />
                      {visit.cc
                        ? <img className="flag" src={`/assets/flags/${visit.cc}.svg`} alt="" width={16} height={16} draggable={false} />
                        : <span className="flag" aria-hidden="true" />}
                      <span className="lvp-page">{visit.path}</span>
                      <span className="lvp-city">{visit.city || visit.place || 'Location unavailable'}</span>
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
                  <thead><tr><th scope="col">Source</th><th scope="col">Views</th><th scope="col">Orders</th><th scope="col">Share</th></tr></thead>
                  <tbody>
                    {data.sources.map((row) => (
                      <tr key={row.name}>
                        <th scope="row"><span className="lvp-name"><span className={`lvp-src ${sourceKey(row.name)}`} aria-hidden="true"><SourceMark referrer={row.name} /></span><span>{sourceLabel(row.name)}</span></span></th>
                        <td>{row.count}</td>
                        <td>{demo ? Math.round(row.count * 0.03) : (row.orders ?? 0)}</td>
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
        <button type="button" className="live-ctl-btn" aria-pressed={sound} aria-label={sound ? 'Mute visit sounds' : 'Enable visit sounds'} onClick={() => {
          if (sound) { setSound(false); return; }
          if (typeof AudioContext === 'undefined') return;
          audio.current ??= new AudioContext();
          void audio.current.resume().then(() => setSound(true)).catch(() => {});
        }}>
          <Icon name={sound ? 'volume' : 'volumeOff'} />
        </button>
        <button type="button" className="live-ctl-btn" aria-label="Toggle full screen" onClick={() => {
          const root = document.getElementById('globeWrap');
          if (!root) return;
          if (!document.fullscreenElement) void root.requestFullscreen?.();
          else void document.exitFullscreen?.();
        }}>
          <Icon name="expand" />
        </button>
      </div>
    </div>
  );
}
