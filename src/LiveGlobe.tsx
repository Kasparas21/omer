import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import { SourceMark, sourceKey, sourceLabel } from './ui/sources';

import { isOnline, type LiveVisit, type LivePayload } from './live';
import { drawCountry, type MapPlace } from './globe/countryMap';

type GlobePerson = { seed?: string; cc: string; page?: string; place: { name: string; lat: number; lng: number } };
type ExplorePlace = { name: string; cc: string; lat: number; lng: number; count: number; people: GlobePerson[] };
type Region = { cc: string; country: string; count: number; cities: number; pages: [string, number][]; places: MapPlace[]; restore: () => void };
const SOUND_KEY = 'omer.live-sound';
const soundSaved = () => { try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; } };

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
    page: visit.path,
    place: { name: visit.place!, lat: visit.lat!, lng: visit.lng! },
  }));
}

/** Demo store only: the kit's example keeps moving, so visits land every few seconds and the last bar grows. */
function useDemoDrift(data: LivePayload, on: boolean, now: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(timer);
  }, [on]);
  return useMemo(() => {
    if (!on || data.visits.length === 0) return data;
    const pool = data.visits;
    // Newest first: one "landed" visit per tick, earlier ones spaced 7–40s apart.
    const visits = Array.from({ length: Math.min(24, pool.length) }, (_, i) => {
      const v = pool[(tick + pool.length - i) % pool.length];
      const at = new Date(now - (i === 0 ? (now % 4000) : 4000 + i * (7000 + ((i * 7919) % 6000)))).toISOString();
      return { ...v, id: `${v.id}-${tick - i}`, seenAt: at, activeAt: new Date(now).toISOString() };
    });
    const minutes = data.minutes.map((m, i, all) => {
      const base = 6 + Math.round(10 * (0.5 + 0.5 * Math.sin(i * 0.7)) + 6 * ((i * 37) % 5) / 5);
      return i === all.length - 1 ? Math.min(base + tick, 30) : Math.max(m, base);
    });
    return { ...data, visits, minutes };
  }, [data, on, tick, Math.floor(now / 4000)]);
}

export function LiveGlobe({ data: live, loading, failed: connectionFailed, focusSeed, demo = false }: { data: LivePayload; loading: boolean; failed: boolean; focusSeed?: string; demo?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const regionBack = useRef<HTMLButtonElement>(null);
  const globe = useRef<GlobeApi | null>(null);
  const [now, setNow] = useState(Date.now());
  const data = useDemoDrift(live, demo, now);
  const [sound, setSound] = useState(soundSaved);
  const audio = useRef<AudioContext | null>(null);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<string>();
  const [full, setFull] = useState(false);
  const [region, setRegion] = useState<Region>();
  const [regionOpen, setRegionOpen] = useState(false);
  const [hasMap, setHasMap] = useState(false);
  const recent = data.minutes.slice(-30);
  const peak = Math.max(1, ...recent);
  const sourceTotal = data.sources.reduce((sum, row) => sum + row.count, 0) || 1;
  const bestOrders = Math.max(0, ...data.sources.map((row) => (demo ? Math.round(row.count * 0.03) : (row.orders ?? 0))));
  const [showVisits, setShowVisits] = useState(false);
  const [ready, setReady] = useState(false);
  const [seenLive, setSeenLive] = useState<string>();
  const people = useMemo(() => peopleFromVisits(data.visits, now), [data.visits, now]);
  const peopleKey = JSON.stringify(people);
  const newest = data.visits[0];
  const explore = useRef<(place: ExplorePlace, duration: number, restore: () => void, places: ExplorePlace[]) => void>(() => {});

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(tick); if (audio.current) void audio.current.close().catch(() => {}); };
  }, []);

  // Clicking a group on the globe: fly in, then show the country flat with its top pages.
  explore.current = (place, duration, restore, places) => {
    const all = places.flatMap((p) => p.people);
    const pages = new Map<string, number>();
    for (const person of all) if (person.page) pages.set(person.page, (pages.get(person.page) ?? 0) + 1);
    const country = place.name.split(', ').at(-1) ?? place.name;
    const next: Region = {
      cc: place.cc, country, count: all.length, cities: places.length,
      pages: [...pages].sort((a, b) => b[1] - a[1]).slice(0, 3),
      places: places.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, count: p.count })),
      restore,
    };
    setRegion(next);
    window.setTimeout(() => {
      setRegionOpen(true);
      regionBack.current?.focus({ preventScroll: true });
      const canvas = mapCanvas.current;
      if (canvas) void drawCountry(canvas, next.cc, country, next.places).then((ok) => setHasMap(ok));
    }, duration);
  };

  function closeRegion() {
    if (!region) return;
    setRegionOpen(false);
    setHasMap(false);
    region.restore();
    setRegion(undefined);
    stage.current?.focus({ preventScroll: true });
  }

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
        shiftY: 24,
        maxZoom: 1.5,
        onExplore: (place: ExplorePlace, duration: number, restore: () => void, places: ExplorePlace[]) => explore.current(place, duration, restore, places),
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
      if (seenLive && sound) beep();
      if (!seenLive && !focusSeed && !demo && Date.now() - Date.parse(newest.seenAt) < 20000) globe.current?.focus((person) => person.seed === newest.seed);
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

  // Full screen: the panel slides away and the globe fills the space; real browser full screen when allowed.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement && wrap.current?.dataset.fsReal) { delete wrap.current.dataset.fsReal; setFull(false); } };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (regionOpen) { closeRegion(); return; }
      if (full && !document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('keydown', onKey); };
  }, [full, regionOpen, region]);
  useEffect(() => () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); }, []);

  function toggleFull() {
    const root = wrap.current;
    if (!root) return;
    if (full) {
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => {});
      delete root.dataset.fsReal;
      setFull(false);
      return;
    }
    setFull(true);
    root.requestFullscreen?.().then(() => { root.dataset.fsReal = '1'; }).catch(() => {});
  }

  function beep() {
    const context = audio.current;
    if (!context || context.state !== 'running') return;
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

  function toggleSound() {
    const on = !sound;
    setSound(on);
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* per-browser convenience only */ }
    if (on && typeof AudioContext !== 'undefined') {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => {});
    }
  }

  function focusVisit(visit: LiveVisit) {
    setFocus(visit.seed);
    globe.current?.focus((person) => person.seed === visit.seed);
    globe.current?.ping((person) => person.seed === visit.seed);
  }

  return (
    <div className={`globe-wrap has-panel${full ? ' is-fs' : ''}${hasMap ? ' has-country-map' : ''}`} data-style="dots" id="globeWrap" ref={wrap}>
      <aside className={`live-panel${showVisits ? ' visits-open' : ''}`} id="livePanel" aria-label="Live numbers" inert={full || undefined}>
        <section className="v2-card lvp-now">
          <header><h3>Right now</h3></header>
          <div className="v2-in">
            <div className="lvp-big">
              <b className="num">{data.online}</b>
              <span><i className="lvp-dot" aria-hidden="true" />{data.online === 1 ? 'Current visitor' : 'Current visitors'}</span>
            </div>
            <div className="lvp-bars" aria-hidden="true">
              {recent.map((count, index) => (
                <i key={index} className={index === recent.length - 1 ? 'now' : undefined} style={{ ['--h' as string]: `${Math.max(8, (count / peak) * 100)}%` }} />
              ))}
            </div>
            <div className="lvp-foot"><span>Last 30 min</span><span><b className="num">{recent.reduce((a, b) => a + b, 0).toLocaleString('en-US')}</b> views</span></div>
          </div>
        </section>

        <button className="btn btn-sm lvp-visits-toggle" type="button" aria-expanded={showVisits} aria-controls="liveVisits" onClick={() => setShowVisits(!showVisits)}>Recent visits</button>
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
                  <thead><tr><th scope="col">Source</th><th scope="col" title="Page views from this source">Views</th><th scope="col" title="Purchases from this source">Orders</th><th scope="col" title="Share of all views">Share</th></tr></thead>
                  <tbody>
                    {data.sources.map((row) => {
                      const orders = demo ? Math.round(row.count * 0.03) : (row.orders ?? 0);
                      return (
                        <tr key={row.name}>
                          <th scope="row"><span className="lvp-name"><span className={`lvp-src ${sourceKey(row.name)}`} aria-hidden="true"><SourceMark referrer={row.name} /></span><span>{sourceLabel(row.name)}</span></span></th>
                          <td className="num">{row.count}</td>
                          <td className={`num${orders > 0 && orders === bestOrders ? ' is-best' : ''}`}>{orders}</td>
                          <td className="num">{Math.round((row.count / sourceTotal) * 100)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </aside>

      <div className="globe-stage" id="globeStage" ref={stage} tabIndex={-1} inert={regionOpen || undefined}>
        {failed && <p className="globe-fallback">The globe couldn’t load.</p>}
      </div>
      <canvas className="live-country-map" ref={mapCanvas} role="img" />
      <section className={`live-region${regionOpen ? ' is-open' : ''}`} aria-label="Live location details" inert={!regionOpen || undefined}>
        <header className="live-region-bar">
          <div className="live-region-place">
            <span>{region ? <span className="flag" style={{ width: 22, height: 22 }}><img src={`/assets/flags/${region.cc.toLowerCase()}.svg`} alt="" draggable={false} /></span> : null}</span>
            <div><h3>{region?.country}</h3><small>{region ? `${region.count} ${region.count === 1 ? 'visitor' : 'visitors'} · ${region.cities} ${region.cities === 1 ? 'city' : 'cities'}` : ''}</small></div>
          </div>
          <button type="button" className="btn btn-sm" ref={regionBack} onClick={closeRegion}><Icon name="arrowLeft" /> Globe</button>
        </header>
        <div className="live-region-pages"><h4>Top pages</h4>
          <ul>{region?.pages.map(([page, n]) => <li key={page}><span title={page}>{page}</span><b className="num" aria-label={`${n} ${n === 1 ? 'visitor' : 'visitors'}`}>{n}</b></li>)}</ul>
        </div>
      </section>

      <div className="live-ctl">
        <button type="button" className="live-ctl-btn" aria-pressed={sound} aria-label="Sound" title={sound ? 'Sound on' : 'Sound off'} onClick={toggleSound}>
          <Icon name={sound ? 'volume' : 'volumeOff'} />
        </button>
        <button type="button" className="live-ctl-btn" aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}>
          <Icon name={full ? 'shrink' : 'expand'} />
        </button>
      </div>
    </div>
  );
}
