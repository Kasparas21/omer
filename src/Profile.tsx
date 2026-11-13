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

function dayLabel(iso: string) {
  const day = new Date(iso);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function pct(part: number, whole: number) {
  return whole ? `${Math.round((Math.min(part, whole) / whole) * 100)}%` : '0%';
}

type JourneySession = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  device: string;
  referrer: string;
  live: boolean;
  events: { id: string; path: string; seenAt: string; durationMs?: number }[];
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

export function Profile({ projectId, seed, onLive, onName }: {
  projectId: string;
  seed: string;
  onBack?: () => void;
  onLive?: () => void;
  onName?: (name: string) => void;
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
    // Refresh quickly while someone looks live so Online/Recording clears without a manual reload.
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

  const title = data?.identity?.name || handle(seed);
  useEffect(() => { if (data) onName?.(title); }, [data, onName, title]);

  if (replayId) {
    return <ReplayPlayer projectId={projectId} replayId={replayId} onBack={() => setReplayId(undefined)} />;
  }
  const email = data?.identity?.email;
  const identity = !email ? 'Anonymous visitor' : data?.identity?.name ? 'Known visitor' : 'Email only';
  const country = data?.place?.cc ? (regions.of(data.place.cc.toUpperCase()) ?? data.place.cc.toUpperCase()) : null;
  const city = data?.place?.city || data?.place?.place || country || 'Unknown';
  const sessions = (data?.journey ?? []).filter((s) => filter === 'all' || s.purchases.length > 0);
  const hasPurchases = (data?.journey ?? []).some((s) => s.purchases.length > 0);
  // Campaign tags only count as follow-up sales once we have actually emailed this person.
  const followUpOrders = data?.mail.sent ? data.mail.attributed : 0;
  const elig = !email
    ? { k: 'unverified', title: 'Email unavailable', detail: 'A recipient address is required to send a follow-up.' }
    : !data?.identity?.name
      ? { k: 'weak', title: 'Email known, name uncertain', detail: 'Only an email address is linked to this profile.' }
      : data.live
        ? { k: 'wait', title: 'Waiting for the session to end', detail: 'Follow-up is paused while they’re browsing.' }
        : { k: 'ok', title: data.mail.sent ? 'Has been emailed' : 'Eligible to email', detail: email };

  return (
    <div className="profile people-page">
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
                        ? onLive
                          ? <button type="button" className="profile-live" onClick={onLive} title="See them on Live">Online now</button>
                          : <span className="profile-live">Online now</span>
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
                  <div className={`profile-mail-row${data.mail.sent ? '' : ' is-muted'}`}><span className="profile-mail-label">Opened</span><b className="profile-mail-value num">{pct(data.mail.opened, data.mail.sent)}</b></div>
                  <div className={`profile-mail-row${data.mail.clicked ? '' : ' is-muted'}`}><span className="profile-mail-label">Clicked</span><b className="profile-mail-value num">{pct(data.mail.clicked, data.mail.sent)}</b></div>
                </div>
                <p className={`profile-mail-foot${followUpOrders ? ' pos' : ''}`}>
                  {followUpOrders
                    ? <><b>{followUpOrders} order{followUpOrders === 1 ? '' : 's'}</b> attributed from a follow-up</>
                    : data.mail.lastOpenedAt
                      ? <>Last opened <b>{ago(data.mail.lastOpenedAt)}</b> · {fmtDay(data.mail.lastOpenedAt)}</>
                      : data.mail.sent ? <>Not opened yet</> : <>No emails sent to them yet</>}
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
                        <div className={`profile-fu-status profile-elig-${elig.k}`}>
                          <span className="profile-fu-dot" aria-hidden="true" />
                          <div className="profile-fu-status-copy">
                            <b>{elig.title}</b>
                            <span>{elig.detail}</span>
                          </div>
                        </div>
                        <p className="profile-empty">No messages or campaign enrollments yet.</p>
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
                    const day = dayLabel(session.startedAt);
                    const showDate = !index || day !== dayLabel(sessions[index - 1].startedAt);
                    return (
                      <JourneyCard
                        key={session.sessionId}
                        session={session}
                        date={showDate ? day : null}
                        replayEnabled={data.replayEnabled}
                        onReplay={setReplayId}
                      />
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

function JourneyCard({ session, date, replayEnabled, onReplay }: {
  session: JourneySession;
  date: string | null;
  replayEnabled: boolean;
  onReplay: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [openBuy, setOpenBuy] = useState<string | null>(session.purchases[0]?.id ?? null);
  const title = session.live ? 'Active session' : `Session lasted for ${fmtDur(session.durationMs)}`;
  const rowsId = `profile-events-${session.sessionId}`;
  const replay = session.replay;
  return (
    <>
      {date && <h3 className="profile-date">{date}</h3>}
      <article className="profile-session" aria-label={title}>
        <div className="profile-session-body">
          <header className="profile-session-head">
            <button type="button" className="profile-session-toggle" aria-expanded={open} aria-controls={rowsId} onClick={() => setOpen((v) => !v)}>
              <span>{session.live ? <span className="people-live">Active session</span> : <>Session lasted for <strong>{fmtDur(session.durationMs)}</strong></>}</span>
              <Icon name="chevronDown" className="profile-session-chevron" />
            </button>
            {replay?.status === 'expired' ? (
              <span className="profile-replay-gone">Replay expired</span>
            ) : replay?.hasFullSnapshot && replayEnabled ? (
              <button type="button" className="btn btn-ghost btn-sm profile-play" aria-label={`Watch replay for ${title.toLowerCase()}`} onClick={() => onReplay(replay.id)}>
                <Icon name="play" />Watch replay
              </button>
            ) : !replayEnabled ? (
              <span className="profile-replay-gone">Replay off</span>
            ) : session.live ? (
              <span className="profile-replay-gone">Recording…</span>
            ) : (
              <span className="profile-replay-gone">{replay ? 'Replay incomplete' : 'No replay'}</span>
            )}
          </header>
          <ol className="session-rows" id={rowsId}>
            {[...session.events].reverse().map((event) => (
              <li key={event.id} className="event">
                <Icon name="eye" />
                <span className="profile-event-label">{event.path}</span>
                {event.durationMs ? <span className="meta">{fmtDur(event.durationMs)}</span> : null}
              </li>
            ))}
            {session.purchases.map((buy) => {
              const expanded = openBuy === buy.id;
              const items = buy.products ?? [];
              return (
                <li key={buy.id} className="event-group profile-purchase">
                  <button type="button" className="event" aria-expanded={expanded} aria-controls={`purchase-${buy.id}`} onClick={() => setOpenBuy(expanded ? null : buy.id)}>
                    <Icon name="dollar" />
                    <span className="profile-event-label">Purchase</span>
                    <span className="amt">{money.format(buy.amount)}</span>
                    <Icon name="chevronDown" className="chev" />
                  </button>
                  <div className="event-detail" id={`purchase-${buy.id}`}>
                    <div>
                      <div className="event-detail-body">
                        {items.map((item, i) => (
                          <div key={i} className="line">
                            <span>{item.name}</span>
                            <span className="qty">{item.qty ?? 1}</span>
                            <b className="num">{item.price != null ? money.format(item.price) : ''}</b>
                          </div>
                        ))}
                        <div>Paid at {new Date(buy.seenAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{buy.path ? ` on ${buy.path}` : ''}.</div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <footer className="profile-session-footer">
            <span className="people-source"><span className="people-source-mark"><SourceMark referrer={session.referrer} /></span>{sourceLabel(session.referrer)}</span>
            <span className="profile-device">
              <Icon name={session.device === 'phone' ? 'phone' : 'monitor'} />
              <span className="sr-only">{session.device === 'phone' ? 'Mobile' : 'Desktop'}</span>
              {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </span>
          </footer>
        </div>
      </article>
    </>
  );
}
