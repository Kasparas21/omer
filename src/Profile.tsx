import { useEffect, useMemo, useState } from 'react';
import { Icon } from './ui/Icon';
import { Orb } from './ui/Orb';
import { SourceMark, sourceLabel } from './ui/sources';

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const ADJ = ['Quiet', 'Bold', 'Swift', 'Calm', 'Bright', 'Gentle', 'Lucky', 'Clever', 'Brave', 'Sunny', 'Misty', 'Happy', 'Witty', 'Mellow', 'Rapid', 'Keen'];
const ANIMAL = ['Heron', 'Otter', 'Fox', 'Lynx', 'Robin', 'Panda', 'Koala', 'Falcon', 'Badger', 'Finch', 'Hare', 'Wren', 'Seal', 'Owl', 'Moth', 'Crane'];

function handle(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const n = h >>> 0;
  return `${ADJ[n % ADJ.length]} ${ANIMAL[(n >>> 8) % ANIMAL.length]}`;
}

type ProfileData = {
  seed: string;
  identity: { email: string; name: string | null } | null;
  place: { cc: string | null; city: string | null; place: string | null } | null;
  stats: { visits: number; revenue: number; orders: number; opens: number; clicks: number; attributed: number };
  journey: { id: string; path: string; referrer: string; seenAt: string }[];
  purchases: { id: string; amount: number; path: string | null; referrer: string | null; campaign: string | null; seenAt: string; isReturning: boolean }[];
  emailEvents: { id: string; type: string; campaign: string | null; seenAt: string }[];
  replay: null;
};

function ago(iso: string) {
  const minutes = Math.floor(Math.max(0, Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Profile({ projectId, seed, onBack, onLive }: {
  projectId: string;
  seed: string;
  onBack: () => void;
  onLive: () => void;
}) {
  const [data, setData] = useState<ProfileData>();
  const [failed, setFailed] = useState(false);
  const regions = useMemo(() => new Intl.DisplayNames(undefined, { type: 'region' }), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/visitors/${encodeURIComponent(seed)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('profile');
        const payload: ProfileData = await response.json();
        if (!cancelled) { setData(payload); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId, seed]);

  const title = data?.identity?.name || handle(seed);
  const email = data?.identity?.email;
  const country = data?.place?.cc ? (regions.of(data.place.cc.toUpperCase()) ?? data.place.cc.toUpperCase()) : null;

  return (
    <div className="profile-page">
      <button type="button" className="profile-back" onClick={onBack}><Icon name="arrowLeft" /> People</button>
      {!data && !failed && <p className="omer-empty-note" role="status">Loading profile…</p>}
      {failed && <p className="omer-empty-note" role="status">Unable to load this visitor.</p>}
      {data && (
        <>
          <section className="v2-card profile-hero">
            <div className="v2-in profile-hero-in">
              <div className="profile-id">
                <Orb seed={seed} size={56} />
                <div>
                  <h1>{title}</h1>
                  <p>{email ?? 'Anonymous visitor'}{data.place?.place ? ` · ${data.place.place}` : ''}</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onLive}>Open on Live</button>
              </div>
              <div className="profile-stats" aria-label="Visitor stats">
                <div><b>{money.format(data.stats.revenue)}</b><span>Revenue</span></div>
                <div><b>{data.stats.orders}</b><span>Orders</span></div>
                <div><b>{data.stats.visits}</b><span>Page views</span></div>
                <div><b>{data.stats.clicks}</b><span>Email clicks</span></div>
              </div>
              <p className="profile-story">
                {data.journey[0]
                  ? <>Arrived via <SourceMark referrer={data.journey[data.journey.length - 1]?.referrer ?? '(direct)'} /> <b>{sourceLabel(data.journey[data.journey.length - 1]?.referrer ?? '(direct)')}</b>, last on <b>{data.journey[0].path}</b> {ago(data.journey[0].seenAt)}.</>
                  : 'No journey recorded yet.'}
              </p>
            </div>
          </section>

          <div className="profile-grid">
            <section className="v2-card">
              <header><Icon name="globe" /><h3>Place</h3></header>
              <div className="v2-in">
                {country ? (
                  <p className="profile-place">
                    {data.place?.cc && <img className="flag" src={`/assets/flags/${data.place.cc}.svg`} alt="" width={20} height={20} draggable={false} />}
                    <span>{data.place?.place || country}</span>
                  </p>
                ) : <p className="ho-empty">Location unknown for this visitor.</p>}
              </div>
            </section>
            <section className="v2-card">
              <header><Icon name="mail" /><h3>Email engagement</h3></header>
              <div className="v2-in profile-mail">
                <div><b>{data.stats.opens}</b><span>Opened</span></div>
                <div><b>{data.stats.clicks}</b><span>Clicked</span></div>
                <div><b>{data.stats.attributed}</b><span>Attributed</span></div>
              </div>
            </section>
          </div>

          <div className="profile-grid profile-grid-wide">
            <section className="v2-card">
              <header><Icon name="eye" /><h3>Activity</h3></header>
              <div className="v2-in">
                {data.journey.length === 0 ? <p className="ho-empty">No page views yet.</p> : (
                  <ol className="profile-journey">
                    {data.journey.slice(0, 20).map((step) => (
                      <li key={step.id}>
                        <b>{step.path}</b>
                        <small>{sourceLabel(step.referrer)} · {ago(step.seenAt)}</small>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
            <section className="v2-card">
              <header><Icon name="dollar" /><h3>Purchases</h3></header>
              <div className="v2-in">
                {data.purchases.length === 0 ? <p className="ho-empty">No purchases yet.</p> : (
                  <ul className="profile-purchases">
                    {data.purchases.map((row) => (
                      <li key={row.id}>
                        <b>{money.format(row.amount)}</b>
                        <span>{row.campaign || row.path || 'Order'}{row.isReturning ? ' · returning' : ' · new'}</span>
                        <small>{ago(row.seenAt)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <section className="v2-card">
            <header><Icon name="play" /><h3>Session replay</h3></header>
            <div className="v2-in">
              <p className="ho-empty">Replay is off for now. Visit history above is the journey until recordings ship.</p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
