/* People: the kit's visitor directory from the last day of visits.
   Sessions use a 30-minute gap. Email and revenue come from identify/purchase events (demo fills pawsome). */
import { useEffect, useMemo, useState } from 'react';
import { isOnline, type LivePayload, type LiveVisit } from './live';
import { Icon } from './ui/Icon';
import { Orb } from './ui/Orb';
import { Dropdown } from './ui/Dropdown';
import { SourceMark, sourceKey, sourceKind, sourceLabel } from './ui/sources';
import { demoCustomer } from './demo';
import { moneyFormatter } from './money';
import { useSlidingPill } from './ui/useSlidingPill';

const ADJ = ['Quiet', 'Bold', 'Swift', 'Calm', 'Bright', 'Gentle', 'Lucky', 'Clever', 'Brave', 'Sunny', 'Misty', 'Happy', 'Witty', 'Mellow', 'Rapid', 'Keen'];
const ANIMAL = ['Heron', 'Otter', 'Fox', 'Lynx', 'Robin', 'Panda', 'Koala', 'Falcon', 'Badger', 'Finch', 'Hare', 'Wren', 'Seal', 'Owl', 'Moth', 'Crane'];
const SESSION_GAP = 30 * 60_000;

type Tab = 'all' | 'live' | 'email' | 'customers';
type Sort = 'recent' | 'revenue' | 'sessions';
type Person = { seed: string; latest: LiveVisit; first: LiveVisit; sessions: number; online: boolean; email: string | null; revenue: number };

// Anonymous visitors get a stable, friendly handle: the same browser always reads the same.
function handle(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const n = h >>> 0;
  return `${ADJ[n % ADJ.length]} ${ANIMAL[(n >>> 8) % ANIMAL.length]}`;
}

function ago(iso: string, now: number) {
  const minutes = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export function People({ data, loading, failed, onLive, onOpen, demo = false, start, currency = 'usd' }: {
  demo?: boolean;
  currency?: string;
  /** Opened from a Dashboard row: start filtered to that source or country. */
  start?: { source?: string; country?: string };
  data: LivePayload;
  loading: boolean;
  failed: boolean;
  onLive: () => void;
  onOpen: (seed: string) => void;
}) {
  const money = useMemo(() => moneyFormatter(currency), [currency]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const tabPill = useSlidingPill<HTMLElement>(tab);
  const [source, setSource] = useState(start?.source ?? 'all');
  const [country, setCountry] = useState(start?.country ?? 'all');
  const [sort, setSort] = useState<Sort>('recent');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  const regions = useMemo(() => new Intl.DisplayNames(undefined, { type: 'region' }), []);

  const people = useMemo(() => {
    const byVisitor = new Map<string, LiveVisit[]>();
    for (const visit of data.visits) byVisitor.set(visit.seed, [...(byVisitor.get(visit.seed) ?? []), visit]);
    return [...byVisitor.entries()].map(([seed, visits]): Person => {
      const times = visits.map((v) => Date.parse(v.seenAt)).sort((a, b) => a - b);
      const sessions = times.reduce((count, t, i) => count + (i === 0 || t - times[i - 1] > SESSION_GAP ? 1 : 0), 0);
      const realEmail = visits.find((v) => v.email)?.email ?? null;
      const realRevenue = Math.max(0, ...visits.map((v) => v.revenue ?? 0));
      const known = demo && !realEmail && !realRevenue
        ? demoCustomer(seed, handle(seed))
        : { email: realEmail, revenue: realRevenue };
      return { seed, latest: visits[0], first: visits[visits.length - 1], sessions, online: visits.some((v) => isOnline(v, now)), ...known };
    });
  }, [data.visits, now, demo]);

  const term = query.trim().toLowerCase();
  const picked = people.filter((p) => (source === 'all' || sourceKey(p.first.referrer) === source)
    && (country === 'all' || p.latest.cc === country)
    && (!term || [handle(p.seed), p.email, p.latest.path, p.latest.place, sourceLabel(p.first.referrer)].some((v) => v?.toLowerCase().includes(term))));
  const inTab = (p: Person, t: Tab) => (t === 'live' ? p.online : t === 'email' ? Boolean(p.email) : t === 'customers' ? p.revenue > 0 : true);
  const rows = picked.filter((p) => inTab(p, tab)).sort((a, b) => (sort === 'sessions'
    ? b.sessions - a.sessions
    : sort === 'revenue' ? b.revenue - a.revenue
    : Date.parse(b.latest.seenAt) - Date.parse(a.latest.seenAt)));

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'Everyone' }, { id: 'live', label: 'Online now' }, { id: 'email', label: 'With email' }, { id: 'customers', label: 'Customers' },
  ];
  const sourceOptions = [{ value: 'all', label: 'All sources' }, ...[...new Map(people.map((p) => [sourceKey(p.first.referrer), sourceLabel(p.first.referrer)])).entries()]
    .map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))];
  const countryOptions = [{ value: 'all', label: 'All countries' }, ...[...new Set(people.flatMap((p) => (p.latest.cc ? [p.latest.cc] : [])))]
    .map((cc) => ({ value: cc, label: regions.of(cc.toUpperCase()) ?? cc.toUpperCase() })).sort((a, b) => a.label.localeCompare(b.label))];
  const reset = () => { setQuery(''); setSource('all'); setCountry('all'); setTab('all'); };

  return (
    <div className="people-page">
      <header className="people-intro">
        <div>
          <h1 className="v2-title" tabIndex={-1}>People</h1>
          <p>See who visited, what they did, and what brought them back.</p>
        </div>
        <button type="button" className="btn btn-secondary people-cta" onClick={onLive}>Watch them live<Icon name="arrowUpRight" /></button>
      </header>

      <section className="people-dir" aria-label="Visitor directory">
        <div className="people-bar">
          <nav className="pill-tabs" aria-label="Filter by visitor type" ref={tabPill}>
            {tabs.map((t) => (
              <button key={t.id} type="button" className="ib-tab" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}<span>{picked.filter((p) => inTab(p, t.id)).length}</span>
              </button>
            ))}
          </nav>
          <label className="people-search">
            <Icon name="search" />
            <input type="search" placeholder="Search people" aria-label="Search people by page, source, or place" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="people-refine">
          <div className="people-tools">
            <Dropdown label="Filter by source" value={source} options={sourceOptions} onChange={setSource} />
            <Dropdown label="Filter by country" value={country} options={countryOptions} onChange={setCountry} align="end" />
          </div>
          <div className="people-tools">
            <span role="status">{rows.length} {rows.length === 1 ? 'person' : 'people'}</span>
            <Dropdown label="Sort people" align="end" value={sort} onChange={(v) => setSort(v as Sort)}
              options={[{ value: 'recent', label: 'Last seen' }, { value: 'revenue', label: 'Highest revenue' }, { value: 'sessions', label: 'Most sessions' }]} />
          </div>
        </div>

        <div className="people-table" role="table" aria-label="People">
          <div className="people-row people-head" role="row">
            <span role="columnheader">Person</span><span role="columnheader">Latest activity</span><span role="columnheader">First source</span>
            <span role="columnheader" className="r people-sessions">Sessions</span><span role="columnheader" className="r">Revenue</span>
            <span role="columnheader" className="r">Last seen</span><span aria-hidden="true" />
          </div>
          <div className="people-rows omer-rows-in" role="rowgroup" key={tab}>
            {(failed || loading || rows.length === 0) && (
              <div role="row"><div role="cell" className="people-empty">
                {failed ? <p role="status">Live connection interrupted. Reconnecting…</p>
                  : loading ? <p role="status">Loading people…</p>
                  : <>
                    <Icon name="search" />
                    <b>{people.length ? 'No matching people' : 'Nobody yet today'}</b>
                    <p>{people.length ? 'No visitors match your filters. Try another page, source, or place.' : 'Visitors from the last day show up here once they arrive.'}</p>
                    {people.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>Clear filters</button>}
                  </>}
              </div></div>
            )}
            {!failed && !loading && rows.map((p) => (
              <div key={p.seed} className="people-row" role="row" tabIndex={0}
                aria-label={`${handle(p.seed)}, open profile`}
                onClick={() => onOpen(p.seed)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.seed); } }}>
                <span className="people-who" role="rowheader">
                  <span className="people-avatar">
                    <Orb seed={p.seed} size={42} />
                    {p.latest.cc && <span className="flag people-flag" title={regions.of(p.latest.cc.toUpperCase())}><img src={`/assets/flags/${p.latest.cc}.svg`} alt="" draggable={false} /></span>}
                  </span>
                  <span className="people-names"><b>{handle(p.seed)}</b><small>{p.email ?? p.latest.place ?? 'Anonymous'}</small></span>
                </span>
                <span className="people-did" role="cell">{p.online ? <>On your site now, viewing <b>{p.latest.path}</b></> : <>Last viewed <b>{p.latest.path}</b></>}</span>
                <span className="people-from" role="cell">
                  <span className="people-source"><span className="people-mark" aria-hidden="true"><SourceMark referrer={p.first.referrer} /></span><span>{sourceLabel(p.first.referrer)}</span></span>
                  <small>{sourceKind(p.first.referrer)}</small>
                </span>
                <span className="people-n people-sessions" role="cell">{p.sessions}<span className="sr-only"> sessions</span></span>
                <span className={`people-n${p.revenue ? ' people-pos' : ' people-none'}`} role="cell"><span className="sr-only">Revenue </span>{money.format(p.revenue)}</span>
                <span className="people-seen" role="cell">{p.online ? <span className="people-live">Online</span> : <><span className="sr-only">Last seen </span>{ago(p.latest.seenAt, now)}</>}</span>
                <Icon name="chevronRight" className="people-arrow" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
