/* A visitor's profile, laid out like the UI kit: who they are and the numbers that matter, where they first
   came from on a small globe, email engagement, a visit heatmap, follow-ups, and the journey session by
   session (30-minute gap), with a reconstructed replay of each session. Real data from /visitors/:id. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { Orb } from './ui/Orb';
import { SourceMark, sourceKind, sourceLabel } from './ui/sources';
import { Replay, type ReplayStep } from './Replay';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const ADJ = ['Quiet', 'Bold', 'Swift', 'Calm', 'Bright', 'Gentle', 'Lucky', 'Clever', 'Brave', 'Sunny', 'Misty', 'Happy', 'Witty', 'Mellow', 'Rapid', 'Keen'];
const ANIMAL = ['Heron', 'Otter', 'Fox', 'Lynx', 'Robin', 'Panda', 'Koala', 'Falcon', 'Badger', 'Finch', 'Hare', 'Wren', 'Seal', 'Owl', 'Moth', 'Crane'];
const GAP = 30 * 60_000;
const ONLINE = 5 * 60_000;

export function handle(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const n = h >>> 0;
  return `${ADJ[n % ADJ.length]} ${ANIMAL[(n >>> 8) % ANIMAL.length]}`;
}

type View = { id: string; path: string; referrer: string; seenAt: string; activeAt?: string };
type Purchase = { id: string; amount: number; path: string | null; referrer: string | null; campaign: string | null; seenAt: string; isReturning: boolean; products?: { name?: string; quantity?: number; price?: number }[] | null };
type ProfileData = {
  seed: string;
  identity: { email: string; name: string | null } | null;
  place: { cc: string | null; city: string | null; place: string | null; lat?: number | null; lng?: number | null } | null;
  stats: { visits: number; revenue: number; orders: number; opens: number; clicks: number; attributed: number };
  journey: View[];
  purchases: Purchase[];
  emailEvents: { id: string; type: string; campaign: string | null; seenAt: string }[];
};
type Session = { views: View[]; buys: Purchase[]; start: number; end: number; referrer: string };

const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);
function ago(t: number) {
  const m = Math.floor(Math.max(0, Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}
function duration(sec: number) {
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s && m < 10 ? `${m}m ${s}s` : `${m}m`;
}
function dateLabel(t: number) {
  const d = new Date(t), now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return day.format(d);
}

/** Page views into sessions (a new one after 30 quiet minutes), with each purchase in the session it happened in. */
function sessionsOf(data: ProfileData): Session[] {
  const views = [...data.journey].sort((a, b) => ms(a.seenAt) - ms(b.seenAt));
  const out: Session[] = [];
  for (const v of views) {
    const t = ms(v.seenAt);
    const last = out[out.length - 1];
    const seen = Math.min(Date.now(), Math.max(t, ms(v.activeAt) || t));
    if (last && t - last.end <= GAP) { last.views.push(v); last.end = Math.max(last.end, seen); }
    else out.push({ views: [v], buys: [], start: t, end: seen, referrer: v.referrer });
  }
  for (const b of data.purchases) {
    const t = ms(b.seenAt);
    const s = out.find((x) => t >= x.start - 60_000 && t <= x.end + GAP) ?? out[out.length - 1];
    if (s) { s.buys.push(b); s.end = Math.max(s.end, t); }
  }
  return out.reverse();
}

/** Demo store only: plausible email numbers from the visitor's seed, like the kit's example profiles. */
function demoMail(seed: string) {
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  const sent = 1 + (n % 3);
  const opened = Math.max(1, Math.min(sent, 1 + (n % sent)));
  const clicked = n % 5 === 0 ? 0 : Math.min(opened, 1 + (n % 2));
  return { sent, opened, clicked, last: n % 7 + 1 };
}

export function Profile({ projectId, seed, host, demo = false, onBack, onLive, onName }: {
  /** The store's hostname, shown in the replay's address bar. */
  host: string;
  projectId: string;
  seed: string;
  demo?: boolean;
  onBack: () => void;
  onLive: () => void;
  /** The shelf shows the person's name next to "← People". */
  onName?: (name: string) => void;
}) {
  const [data, setData] = useState<ProfileData>();
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'purchases'>('all');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [replay, setReplay] = useState<number>();
  const regions = useMemo(() => new Intl.DisplayNames(['en'], { type: 'region' }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/visitors/${encodeURIComponent(seed)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('profile');
        const payload: ProfileData = await response.json();
        if (!cancelled) { setData(payload); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, seed]);

  const name = data?.identity?.name || data?.identity?.email || handle(seed);
  useEffect(() => { if (data) onName?.(name); }, [data, name]);
  const sessions = useMemo(() => (data ? sessionsOf(data) : []), [data]);

  if (failed) return <div className="profile people-page"><p className="omer-empty-note" role="status">Unable to load this visitor.</p><button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>Back to People</button></div>;
  if (!data) return <div className="profile people-page"><p className="omer-empty-note" role="status">Loading profile…</p></div>;

  const newest = sessions[0];
  const oldest = sessions[sessions.length - 1];
  const live = newest ? Date.now() - newest.end < ONLINE : false;
  const firstView = oldest?.views[0];
  const email = data.identity?.email ?? null;
  const identity = !email ? 'Anonymous visitor' : data.identity?.name ? 'Known visitor' : 'Email only';
  const idIcon: IconName = !email ? 'eye' : data.identity?.name ? 'user' : 'mail';
  const cc = data.place?.cc?.toLowerCase() ?? null;
  const country = cc ? (regions.of(cc.toUpperCase()) ?? cc.toUpperCase()) : null;
  const city = data.place?.city && data.place.city !== country ? data.place.city : (country ?? 'Unknown');
  const onSite = sessions.reduce((a, s) => a + Math.max(30, (s.end - s.start) / 1000), 0);
  const firstRef = oldest?.referrer ?? '(direct)';
  const mail = demo
    ? demoMail(seed)
    : { sent: 0, opened: data.stats.opens, clicked: data.stats.clicks, last: 0 };
  const lastOpen = data.emailEvents.find((e) => e.type === 'email_open');
  const pct = (n: number) => (mail.sent ? `${Math.round((n / mail.sent) * 100)}%` : String(n));

  if (replay != null && sessions[replay]) {
    const s = sessions[replay];
    const steps: ReplayStep[] = [
      { kind: 'arrive', label: s.referrer && s.referrer !== '(direct)' ? `Arrived from ${sourceLabel(s.referrer)}` : 'Came straight to the site', note: clock.format(s.start) },
      ...s.views.map((v, i) => ({ kind: 'view' as const, label: v.path, path: v.path, note: duration(((ms(s.views[i + 1]?.seenAt) || s.end) - ms(v.seenAt)) / 1000) })),
      ...s.buys.map((b) => ({ kind: 'buy' as const, label: 'Purchase', note: money.format(b.amount) })),
      ...(live && replay === 0 ? [] : [{ kind: 'gone' as const, label: 'Left the site', note: 'They closed the page here' }]),
    ];
    return (
      <Replay who={name} session={sessions.length - replay} date={dateLabel(s.start)} meta={`${clock.format(s.start)} · ${duration((s.end - s.start) / 1000)}`}
        steps={steps} host={host} onBack={() => setReplay(undefined)} />
    );
  }

  let shownDate = '';
  return (
    <div className="profile people-page">
      <section className="profile-sheet v2-card" aria-labelledby="profileSheetTitle">
        <header><h3 id="profileSheetTitle">Visitor profile</h3></header>
        <div className="v2-in profile-sheet-head">
          <div className="profile-top">
            <div className="profile-top-who">
              <Orb seed={seed} size={56} />
              <div className="profile-top-copy">
                <div className="profile-title-row">
                  <h1 className="profile-name" tabIndex={-1}>{name}</h1>
                  {live ? <span className="profile-live">Online now</span> : newest ? <span className="profile-seen">Last seen {ago(newest.end)}</span> : null}
                </div>
                <div className="profile-byline">
                  <span className="profile-tag"><Icon name={idIcon} />{identity}</span>
                  <span className="profile-dot" aria-hidden="true">·</span>
                  {email ? <span className="profile-email">{email}</span> : <span className="profile-email is-missing">No email on file</span>}
                </div>
                <div className="profile-meta-row" aria-label="Visit context">
                  <span className="profile-meta-item"><span className="profile-src" aria-hidden="true"><SourceMark referrer={firstRef} /></span>{sourceLabel(firstRef)}</span>
                  <span className="profile-dot" aria-hidden="true">·</span>
                  <span className="profile-meta-item">{data.journey.length} pageview{data.journey.length === 1 ? '' : 's'}</span>
                  <button type="button" className="profile-live-link" onClick={onLive}><Icon name="globe" />Open on Live</button>
                </div>
              </div>
            </div>
            <dl className="profile-top-stats">
              <div><dt>First seen</dt><dd>{oldest ? day.format(oldest.start) : '—'}</dd></div>
              <div><dt>Visits</dt><dd className="num">{sessions.length}</dd></div>
              <div><dt>Time on site</dt><dd className="num">{duration(onSite)}</dd></div>
              <div><dt>Revenue</dt><dd className={`num${data.stats.revenue ? ' pos' : ''}`}>{money.format(data.stats.revenue).replace('.00', '')}</dd></div>
            </dl>
          </div>
          <p className="profile-story">
            {firstView
              ? <>Came from <b>{sourceLabel(firstRef)}</b> ({sourceKind(firstRef)}), landed on <b>{firstView.path}</b>. {live ? 'They’re on the site right now.' : `Last seen ${ago(newest.end)}.`}</>
              : 'No visits recorded yet.'}
          </p>
        </div>
        <div className="profile-bento">
          <section className="profile-place" aria-label="First location">
            <div className="profile-place-copy">
              <span className="profile-place-kicker">First click from</span>
              <b className="profile-place-city">{city}</b>
              {country ? <span className="profile-place-country"><span className="flag"><img src={`/assets/flags/${cc}.svg`} alt="" /></span>{country}</span> : null}
            </div>
            {data.place?.lat != null && data.place?.lng != null
              ? <MiniGlobe seed={seed} cc={cc ?? 'us'} lat={data.place.lat} lng={data.place.lng} label={`${city}${country ? `, ${country}` : ''}`} />
              : <div className="profile-mini-globe is-fallback" aria-hidden="true" />}
          </section>
          <div className="profile-mail" aria-label="Email engagement">
            <div className="profile-mail-rows">
              {mail.sent ? <div className="profile-mail-row"><span>Sent</span><b className="num">{mail.sent}</b></div> : null}
              <div className="profile-mail-row"><span>Opened</span><b className="num">{pct(mail.opened)}</b></div>
              <div className={`profile-mail-row${mail.clicked ? '' : ' is-muted'}`}><span>Clicked</span><b className="num">{pct(mail.clicked)}</b></div>
              {!mail.sent ? <div className={`profile-mail-row${data.stats.attributed ? '' : ' is-muted'}`}><span>Bought from email</span><b className="num">{data.stats.attributed}</b></div> : null}
            </div>
            <p className="profile-mail-foot">
              {demo ? <>Last opened <b>{mail.last === 1 ? '1 day ago' : `${mail.last} days ago`}</b> · {day.format(Date.now() - mail.last * 86_400_000)}</>
                : lastOpen ? <>Last opened <b>{ago(ms(lastOpen.seenAt))}</b> · {day.format(ms(lastOpen.seenAt))}</>
                : 'No email activity yet'}
            </p>
          </div>
        </div>
      </section>

      <div className="profile-columns">
        <div className="profile-left v2-card">
          <header><h3>Activity</h3></header>
          <div className="v2-in profile-activity-in">
            <Heatmap starts={sessions.map((s) => s.start)} />
          </div>
          <details className="profile-followup" open>
            <summary><h3>Follow-ups</h3><Icon name="chevronDown" className="profile-followup-chev" /></summary>
            <div className="v2-in profile-followup-body">
              <div className={`profile-fu-status is-${email ? 'ok' : 'unverified'}`}>
                <span className="profile-fu-dot" aria-hidden="true" />
                <div><b>{email ? (data.identity?.name ? 'Eligible to email' : 'Email known, name uncertain') : 'Email unavailable'}</b>
                  <span>{email ? (data.identity?.name ? email : 'Only an email address is linked to this profile.') : 'A recipient address is required to send a follow-up.'}</span></div>
              </div>
              {data.stats.attributed ? <p className="profile-attributed"><Icon name="checkCircle" /><strong>{money.format(data.purchases.filter((p) => p.campaign).reduce((a, p) => a + p.amount, 0))}</strong> from a follow-up email</p> : null}
              {[...new Set(data.purchases.flatMap((p) => (p.campaign ? [p.campaign] : [])))].map((c) => (
                <div key={c} className="profile-fu-item"><div><b>{c}</b><small>Campaign enrollment</small></div></div>
              ))}
              {!data.purchases.some((p) => p.campaign) ? <p className="profile-empty">No messages or campaign enrollments yet.</p> : null}
            </div>
          </details>
        </div>

        <section className="profile-journey v2-card" aria-labelledby="profileJourneyTitle">
          <header><h3 id="profileJourneyTitle">Visitor journey</h3></header>
          <div className="v2-in profile-journey-in">
            {data.purchases.length ? (
              <div className="profile-filters" role="group" aria-label="Filter visitor journey">
                <button type="button" className="ib-tab" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All sessions</button>
                <button type="button" className="ib-tab" aria-pressed={filter === 'purchases'} onClick={() => setFilter('purchases')}>Purchases</button>
              </div>
            ) : null}
            <div className="profile-timeline">
              {sessions.map((s, i) => {
                if (filter === 'purchases' && !s.buys.length) return null;
                const label = dateLabel(s.start);
                const heading = label !== shownDate ? label : '';
                shownDate = label;
                const isLive = live && i === 0;
                const expanded = open[i] ?? true;
                return (
                  <div key={s.start}>
                    {heading ? <h4 className="profile-date">{heading}</h4> : null}
                    <article className="profile-session" aria-label={isLive ? 'Active session' : `Session ${sessions.length - i}`}>
                      <header className="profile-session-head">
                        <button type="button" className="profile-session-toggle" aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [i]: !expanded }))}>
                          {isLive ? <span className="profile-active">Active session</span> : <span>Session lasted for <strong>{duration((s.end - s.start) / 1000)}</strong></span>}
                          <Icon name="chevronDown" className="profile-session-chev" />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm profile-play" onClick={() => { setReplay(i); window.scrollTo({ top: 0 }); }}><Icon name="play" />Watch replay</button>
                      </header>
                      {expanded ? (
                        <ol className="session-rows">
                          {s.views.map((v, k) => (
                            <li key={v.id} className="event"><Icon name="eye" /><span className="profile-event-label">{v.path}</span>
                              <span className="meta">{duration(((ms(s.views[k + 1]?.seenAt) || s.end) - ms(v.seenAt)) / 1000)}</span></li>
                          ))}
                          {s.buys.map((b) => (
                            <li key={b.id} className="event is-buy"><Icon name="dollar" /><span className="profile-event-label">Purchase{b.campaign ? ` · from ${b.campaign}` : ''}</span><span className="amt">{money.format(b.amount)}</span></li>
                          ))}
                        </ol>
                      ) : null}
                      <footer className="profile-session-footer">
                        <span className="profile-src-line"><span className="profile-src" aria-hidden="true"><SourceMark referrer={s.referrer} /></span>{s.referrer && s.referrer !== '(direct)' ? s.referrer.replace(/^www\./, '') : 'Direct'}</span>
                        <span>{clock.format(s.start)}</span>
                      </footer>
                    </article>
                  </div>
                );
              })}
              {filter === 'all' && oldest ? <p className="profile-milestone"><Icon name="pin" /><span>This is where their journey begins · {day.format(oldest.start)}</span></p> : null}
              {filter === 'purchases' && !sessions.some((s) => s.buys.length) ? <p className="profile-empty">No purchases in this journey yet.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** A small dotted globe turned to where they are, cropped by the card like the kit's. */
function MiniGlobe({ seed, cc, lat, lng, label }: { seed: string; cc: string; lat: number; lng: number; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let globe: { destroy(): void; ping(m: (p: { seed?: string }) => boolean): void } | undefined;
    void import('./globe/dotglobe.js').then(async ({ createDotGlobe, preloadDotGlobe }) => {
      try { await preloadDotGlobe(); } catch { /* the plain card still reads fine */ }
      if (gone || !host.current) return;
      globe = createDotGlobe(host.current, {
        people: [{ seed, cc, place: { name: label, lat, lng } }],
        face: () => '', autoSpin: false, maxZoom: 1.7, startZoom: 1.06, radiusScale: 1.05, offsetX: 0.14,
        lookAt: { lat, lng }, shiftY: 0, openOnFocus: false, showFlags: false, quietIntro: true,
      });
      globe.ping((p) => p.seed === seed);
    });
    return () => { gone = true; globe?.destroy(); };
  }, [seed, lat, lng]);
  return <div className="profile-mini-globe" ref={host} role="img" aria-label={`Globe focused on ${label}`} />;
}

/** Visits over the last 22 weeks, one dot per day (GitHub-style), darker for more visits. */
function Heatmap({ starts }: { starts: number[] }) {
  const weeks = 22;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));
  const first = new Date(end); first.setDate(first.getDate() - weeks * 7 + 1);
  const counts = new Map<number, number>();
  for (const t of starts) { const d = new Date(t); d.setHours(0, 0, 0, 0); counts.set(d.getTime(), (counts.get(d.getTime()) ?? 0) + 1); }
  const inRange = starts.filter((t) => t >= first.getTime()).length;
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => { const x = new Date(first); x.setDate(x.getDate() + w * 7 + d); return x; }));
  const months = cols.map((c, w) => (c[0].getDate() <= 7 || w === 0 ? c[0].toLocaleDateString('en-US', { month: 'short' }) : ''));
  const level = (n: number) => (n === 0 ? 0 : n === 1 ? 2 : n === 2 ? 3 : 4);
  return (
    <section className="hm">
      <header className="hm-head">
        <div><b className="hm-value num">{inRange}</b><p>{inRange === 1 ? 'visit' : 'visits'} · last {weeks} weeks</p></div>
        <span className="hm-legend" aria-hidden="true">Less<i data-l="0" /><i data-l="1" /><i data-l="2" /><i data-l="3" /><i data-l="4" />More</span>
      </header>
      <div className="hm-grid" role="img" aria-label={`${inRange} visits in the last ${weeks} weeks`}>
        <div className="hm-days" aria-hidden="true"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
        <div className="act-cols">
          <div className="hm-months" aria-hidden="true">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
          <div className="hm-cells">
            {cols.map((c, w) => (
              <div key={w} className="hm-col">
                {c.map((d) => <i key={d.getTime()} data-l={d > today ? undefined : level(counts.get(d.getTime()) ?? 0)} className={d > today ? 'future' : undefined} title={`${d.toDateString()}: ${counts.get(d.getTime()) ?? 0}`} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
