import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { isOnline, type LivePayload, type LiveVisit } from './live';

function ago(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export function People({ data, loading, failed }: { data: LivePayload; loading: boolean; failed: boolean }) {
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [source, setSource] = useState('');
  const [country, setCountry] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const unique = new Map<string, LiveVisit>();
  for (const visit of data.visits) if (!unique.has(visit.seed)) unique.set(visit.seed, visit);
  const visits = [...unique.values()];
  const sources = [...new Set(visits.map((v) => v.referrer))].sort();
  const countries = [...new Set(visits.flatMap((v) => v.cc ? [v.cc] : []))].sort();
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const results = visits.filter((v) => (!onlineOnly || isOnline(v, now)) && (!source || v.referrer === source) && (!country || v.cc === country)
    && [v.path, v.referrer, v.place].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="v2-empty-screen omer-people">
      <h1>People</h1>
      <p>See recent visitors, what they viewed, and where they came from.</p>
      <section className="v2-card">
        <div className="omer-people-controls">
          <div className="omer-people-switch" role="group" aria-label="Visitor activity">
            <button type="button" aria-pressed={!onlineOnly} onClick={() => setOnlineOnly(false)}>Everyone <span>{visits.length}</span></button>
            <button type="button" aria-pressed={onlineOnly} onClick={() => setOnlineOnly(true)}>Online now <span>{visits.filter((v) => isOnline(v, now)).length}</span></button>
          </div>
          <label className="omer-people-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search by page, source, or location" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label><span className="sr-only">Source</span><select value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{sources.map((value) => <option key={value} value={value}>{value === '(direct)' ? 'Direct' : value}</option>)}</select></label>
          <label><span className="sr-only">Country</span><select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">All countries</option>{countries.map((value) => <option key={value} value={value}>{names.of(value.toUpperCase())}</option>)}</select></label>
        </div>
        <div className="v2-in">
          {failed && <p className="omer-empty-note" role="status">Live connection interrupted. Reconnecting…</p>}
          {loading ? <p className="omer-empty-note">Loading visitors…</p> : null}
          {!failed && !loading && results.length === 0 ? <p className="omer-empty-note">{visits.length ? 'No visitors match your filters.' : 'No visitors in the last day yet.'}</p> : null}
          {results.length > 0 && (
            <table className="v2-stat-table">
              <thead><tr><th scope="col">Person</th><th scope="col">Latest page</th><th scope="col">Source</th><th scope="col">Last seen</th></tr></thead>
              <tbody>
                {results.map((visit) => (
                  <tr key={visit.seed}>
                    <th scope="row">
                      <span className="v2-stat-src">
                        <span className="omer-person-avatar" aria-hidden="true">{visit.cc && <img className="flag" src={`/assets/flags/${visit.cc}.svg`} alt="" width={16} height={16} />}</span>
                        <span>Anonymous visitor<small>{visit.place || 'Location unavailable'}</small></span>
                      </span>
                    </th>
                    <td>{visit.path}</td><td>{visit.referrer === '(direct)' ? 'Direct' : visit.referrer}</td>
                    <td>{isOnline(visit, now) ? <span className="omer-person-online">Online</span> : <time dateTime={visit.seenAt}>{ago(visit.seenAt, now)}</time>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
