import { useEffect, useMemo, useRef, useState } from 'react';
import { createDotGlobe, preloadDotGlobe } from './globe/dotglobe.js';
import { Icon } from './ui/Icon';
import { Orb } from './ui/Orb';
import { SourceMark, sourceKind, sourceLabel } from './ui/sources';
import { ActivityHeatmap } from './ui/Activity';
import { ReplayPlayer } from './ReplayPlayer';

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const ADJ = ['Quiet', 'Bold', 'Swift', 'Calm', 'Bright', 'Gentle', 'Lucky', 'Clever', 'Brave', 'Sunny', 'Misty', 'Happy', 'Witty', 'Mellow', 'Rapid', 'Keen'];
const ANIMAL = ['Heron', 'Otter', 'Fox', 'Lynx', 'Robin', 'Panda', 'Koala', 'Falcon', 'Badger', 'Finch', 'Hare', 'Wren', 'Seal', 'Owl', 'Moth', 'Crane'];

function handle(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const n = h >>> 0;
  return `${ADJ[n % ADJ.length]} ${ANIMAL[(n >>> 8) % ANIMAL.length]}`;
}

function fmtDur(ms: number) {
  const sec = Math.round(Math.max(0, ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function ago(iso: string | null) {
  if (!iso) return '—';
  const minutes = Math.floor(Math.max(0, Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtDay(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type JourneySession = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  device: string;
  referrer: string;
  live: boolean;
  events: { id: string; path: string; seenAt: string }[];
  purchases: { id: string; amount: number; path: string | null; products: { name: string; price?: number; qty?: number }[] | null; seenAt: string }[];
  replay: { id: string; status: string; hasFullSnapshot: boolean } | null;
};

type ProfileData = {
  seed: string;
  identity: { email: string; name: string | null } | null;
  place: { cc: string | null; city: string | null; place: string | null; lat: number | null; lng: number | null } | null;
  firstReferrer: string;
  firstPath: string;
  live: boolean;
  lastSeenAt: string | null;
  device: string;
  stats: {
    firstSeen: string | null; sessions: number; pageviews: number; dwellMs: number;
    revenue: number; orders: number; sent: number; opens: number; clicks: number; attributed: number;
  };
  mail: { sent: number; opened: number; clicked: number; lastOpenedAt: string | null; attributed: number };
  activity: Record<string, number>;
  journey: JourneySession[];
  replayEnabled: boolean;
};

export function Profile({ projectId, seed, onBack, onLive }: {
  projectId: string;
  seed: string;
  onBack: () => void;
  onLive: () => void;
}) {
  const [data, setData] = useState<ProfileData>();
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'purchases'>('all');
  const [replayId, setReplayId] = useState<string>();
  const globeRef = useRef<HTMLDivElement>(null);
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
    // Poll faster while someone looks live so Online/Recording flips off without a manual refresh.
    const timer = window.setInterval(() => void load(), 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [projectId, seed]);

  useEffect(() => {
    const stage = globeRef.current;
    if (!stage || !data?.place?.cc) return;
    let gone = false;
    let instance: { destroy(): void; ping(fn: (p: { seed?: string }) => boolean): void } | null = null;
    const lat = data.place.lat ?? 54.9;
    const lng = data.place.lng ?? 23.9;
    const label = data.place.place || data.place.city || data.place.cc.toUpperCase();
    void preloadDotGlobe().catch(() => undefined).then(() => {
      if (gone || !stage.isConnected) return;
      try {
        instance = createDotGlobe(stage, {
          people: [{ seed, cc: data.place!.cc!, place: { name: label, lat, lng } }],
          face: () => '',
          autoSpin: false,
          quietIntro: true,
          openOnFocus: false,
          maxZoom: 1.7,
          radiusScale: 1.05,
          startZoom: 1.06,
          offsetX: 0.14,
          lookAt: { lat, lng },
          showFlags: false,
        });
        stage.classList.add('is-ready');
        instance.ping((person) => person.seed === seed);
      } catch {
        stage.classList.add('is-fallback');
        stage.innerHTML = `<img class="profile-globe-fallback flag" src="/assets/flags/${data.place!.cc}.svg" alt="" width="44" height="44" />`;
      }
    });
    return () => { gone = true; instance?.destroy(); };
  }, [data?.place, seed]);

  if (replayId) {
    return <ReplayPlayer projectId={projectId} replayId={replayId} onBack={() => setReplayId(undefined)} />;
  }

  const title = data?.identity?.name || handle(seed);
  const email = data?.identity?.email;
  const identity = !email ? 'Anonymous visitor' : data?.identity?.name ? 'Known visitor' : 'Email only';
  const country = data?.place?.cc ? (regions.of(data.place.cc.toUpperCase()) ?? data.place.cc.toUpperCase()) : null;
  const city = data?.place?.city || data?.place?.place || country || 'Unknown';
  const sessions = (data?.journey ?? []).filter((s) => filter === 'all' || s.purchases.length > 0);
  const hasPurchases = (data?.journey ?? []).some((s) => s.purchases.length > 0);

  return (
    <div className="profile people-page">
      <button type="button" className="profile-back" onClick={onBack}><Icon name="arrowLeft" /> People</button>
      {!data && !failed && <p className="omer-empty-note" role="status">Loading profile…</p>}
      {failed && <p className="omer-empty-note" role="status">Unable to load this visitor.</p>}
      {data && (
        <>
          <section className="profile-sheet" aria-labelledby="profileSheetTitle">
            <header className="profile-sheet-label"><h3 id="profileSheetTitle">Visitor profile</h3></header>
            <div className="v2-in profile-sheet-head">
              <div className="profile-top">
                <div className="profile-top-who">
                  <Orb seed={seed} size={56} />
                  <div className="profile-top-copy">
                    <div className="profile-title-row">
                      <h1 className="profile-name" tabIndex={-1}>{title}</h1>
                      {data.live
                        ? <span className="profile-live">Online now</span>
                        : <span className="profile-seen">Last seen {ago(data.lastSeenAt)}</span>}
                    </div>
                    <div className="profile-byline">
                      <span className="profile-tag"><Icon name={identity === 'Anonymous visitor' ? 'eye' : email && data.identity?.name ? 'user' : 'mail'} />{identity}</span>
                      <span className="profile-dot" aria-hidden="true">·</span>
                      {email
                        ? <span className="profile-email">{email}</span>
                        : <span className="profile-email profile-email-missing">No email on file</span>}
                    </div>
                    <div className="profile-meta-row" aria-label="Visit context">
                      <span className="profile-meta-item"><span className="people-source"><span className="people-source-mark"><SourceMark referrer={data.firstReferrer} /></span>{sourceLabel(data.firstReferrer)}</span></span>
                      <span className="profile-dot" aria-hidden="true">·</span>
                      <span className="profile-meta-item"><Icon name={data.device === 'phone' ? 'phone' : 'monitor'} />{data.device === 'phone' ? 'Mobile' : 'Desktop'}</span>
                      <span className="profile-dot" aria-hidden="true">·</span>
                      <span className="profile-meta-item">{data.stats.pageviews} pageview{data.stats.pageviews === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </div>
                <dl className="profile-top-stats">
                  <div><dt>First seen</dt><dd>{fmtDay(data.stats.firstSeen)}</dd></div>
                  <div><dt>Visits</dt><dd className="num">{data.stats.sessions}</dd></div>
                  <div><dt>Time on site</dt><dd className="num">{fmtDur(data.stats.dwellMs)}</dd></div>
                  <div><dt>Revenue</dt><dd className={`num${data.stats.revenue ? ' pos' : ''}`}>{money.format(data.stats.revenue)}</dd></div>
                </dl>
              </div>
              <p className="profile-story">
                Came from <b>{sourceLabel(data.firstReferrer)}</b> ({sourceKind(data.firstReferrer)}), landed on <b>{data.firstPath}</b>.{' '}
                {data.live ? 'They’re on the site right now.' : `Last seen ${ago(data.lastSeenAt)}.`}
              </p>
              <div className="profile-top-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={onLive}>Open on Live</button>
              </div>
            </div>
            <div className="profile-bento">
              <section className="profile-place" aria-label="First location">
                <div className="profile-place-copy">
                  <span className="profile-place-kicker">First click from</span>
                  <b className="profile-place-city">{city}</b>
                  <span className="profile-place-country">
                    {data.place?.cc && <span className="profile-place-flag flag"><img src={`/assets/flags/${data.place.cc}.svg`} alt="" /></span>}
                    {country || 'Unknown'}
                  </span>
                </div>
                <div className="profile-mini-globe" id="profileGlobe" ref={globeRef} role="img" aria-label={`Globe focused on ${city}`} />
              </section>
              <div className="profile-mail" aria-label="Email engagement">
                <div className="profile-mail-rows">
                  <div className="profile-mail-row"><span className="profile-mail-label">Sent</span><b className="profile-mail-value num">{data.mail.sent}</b></div>
                  <div className="profile-mail-row"><span className="profile-mail-label">Opened</span><b className="profile-mail-value num">{data.mail.opened}</b></div>
                  <div className={`profile-mail-row${data.mail.clicked ? '' : ' is-muted'}`}><span className="profile-mail-label">Clicked</span><b className="profile-mail-value num">{data.mail.clicked}</b></div>
                </div>
                <p className={`profile-mail-foot${data.mail.attributed ? ' pos' : ''}`}>
                  {data.mail.attributed
                    ? <><b>{data.mail.attributed}</b> attributed from a follow-up</>
                    : <>Last opened <b>{data.mail.lastOpenedAt ? ago(data.mail.lastOpenedAt) : 'never'}</b> · emails not sent from Unfair Weekend yet</>}
                </p>
              </div>
            </div>
          </section>

          <div className="profile-columns">
            <div className="profile-left">
              <div className="profile-l v2-card profile-summary-card">
                <header className="profile-summary-head"><h3>Activity</h3></header>
                <div className="v2-in profile-activity-in">
                  <section className="profile-section profile-activity">
                    <header className="act-head">
                      <div className="act-head-copy">
                        <b className="act-head-value num">{data.stats.sessions}</b>
                        <p className="act-head-caption">{data.stats.sessions === 1 ? 'visit' : 'visits'} · last 22 weeks</p>
                      </div>
                      <span className="act-legend" aria-hidden="true">Less<i data-l="0" /><i data-l="1" /><i data-l="2" /><i data-l="3" /><i data-l="4" />More</span>
                    </header>
                    <ActivityHeatmap events={data.activity} weeks={22} />
                  </section>
                </div>
                <details className="profile-followup" open>
                  <summary className="profile-followup-head">
                    <h3>Follow-ups</h3>
                    <Icon name="chevronDown" className="profile-followup-chev" />
                  </summary>
                  <div className="profile-followup-expand"><div className="profile-followup-expand-in">
                    <div className="v2-in profile-followup-body">
                      <div className="profile-fu">
                        <div className="profile-fu-status profile-elig-wait">
                          <span className="profile-fu-dot" />
                          <div className="profile-fu-status-copy">
                            <b>No follow-ups yet</b>
                            <span>Email drafting and sending ship next. Profiles already collect the visit evidence.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div></div>
                </details>
              </div>
            </div>

            <section className="profile-r v2-card profile-journey-card" aria-labelledby="profileJourneyTitle">
              <header className="profile-journey-head"><h3 id="profileJourneyTitle">Visitor journey</h3></header>
              <div className="v2-in profile-journey-in">
                {hasPurchases && (
                  <div className="profile-filters v2-seg" role="group" aria-label="Filter visitor journey">
                    <button type="button" className="ib-tab" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All sessions</button>
                    <button type="button" className="ib-tab" aria-pressed={filter === 'purchases'} onClick={() => setFilter('purchases')}>Purchases</button>
                  </div>
                )}
                <div className="profile-timeline">
                  {sessions.length === 0 ? (
                    <p className="profile-journey-empty">{filter === 'purchases' ? 'No purchases in this journey yet.' : 'No sessions yet.'}</p>
                  ) : sessions.map((session, index) => {
                    const day = new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                    const prevDay = index ? new Date(sessions[index - 1].startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
                    const showDate = day !== prevDay;
                    const titleLabel = session.live ? 'Active session' : `Session lasted for ${fmtDur(session.durationMs)}`;
                    return (
                      <div key={session.sessionId}>
                        {showDate && <h3 className="profile-date">{day}</h3>}
                        <article className="profile-session" aria-label={titleLabel}>
                          <div className="profile-session-body">
                            <header className="profile-session-head">
                              <span>{session.live ? <span className="people-live">Active session</span> : <>Session lasted for <strong>{fmtDur(session.durationMs)}</strong></>}</span>
                              {session.replay?.status === 'expired' ? (
                                <span className="profile-replay-gone">Replay expired</span>
                              ) : session.replay?.hasFullSnapshot && data.replayEnabled ? (
                                <button type="button" className="btn btn-ghost btn-sm profile-play" onClick={() => setReplayId(session.replay!.id)}>
                                  <Icon name="play" />Watch replay
                                </button>
                              ) : !data.replayEnabled ? (
                                <span className="profile-replay-gone">Replay off</span>
                              ) : session.live ? (
                                <span className="profile-replay-gone">Recording…</span>
                              ) : session.replay ? (
                                <span className="profile-replay-gone">Replay incomplete</span>
                              ) : (
                                <span className="profile-replay-gone">No replay</span>
                              )}
                            </header>
                            <ol className="session-rows">
                              {[...session.events].reverse().map((event) => (
                                <li key={event.id} className="event">
                                  <Icon name="eye" />
                                  <span className="profile-event-label">{event.path}</span>
                                  <span className="meta">{ago(event.seenAt)}</span>
                                </li>
                              ))}
                              {session.purchases.map((buy) => (
                                <li key={buy.id} className="event">
                                  <Icon name="dollar" />
                                  <span className="profile-event-label">Purchase</span>
                                  <span className="amt">{money.format(buy.amount)}</span>
                                </li>
                              ))}
                            </ol>
                            <footer className="profile-session-footer">
                              <span className="people-source"><span className="people-source-mark"><SourceMark referrer={session.referrer} /></span>{sourceLabel(session.referrer)}</span>
                              <span className="profile-device"><Icon name={session.device === 'phone' ? 'phone' : 'monitor'} />{new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                            </footer>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                  {filter === 'all' && data.stats.firstSeen && (
                    <p className="profile-milestone profile-journey-origin">
                      <Icon name="pin" />
                      <span>This is where their journey begins <span className="profile-journey-origin-when">· {fmtDay(data.stats.firstSeen)}</span></span>
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
