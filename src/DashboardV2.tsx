/* Dashboard V2 — a port of the UI kit's Home (public/ui/screens.js v2Live / v2Chart / v2DayChart / mountV2)
   driven by real rollups: same geometry, axis, hover scrubber, wipe-in, count-up and card language. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './project';
import { Icon, type IconName } from './ui/Icon';
import { SourceMark, sourceKey, sourceLabel } from './ui/sources';

type Metric = 'people' | 'views' | 'dwell' | 'clicked' | 'sales';
const RANGES = [1, 7, 14, 30] as const;
const METRICS: { key: Metric; label: string; one: string; many: string }[] = [
  { key: 'people', label: 'Visitors', one: 'Visitor', many: 'Visitors' },
  { key: 'views', label: 'Pageviews', one: 'Pageview', many: 'Pageviews' },
  { key: 'dwell', label: 'Visit duration', one: 'Avg. visit', many: 'Avg. visit' },
  { key: 'clicked', label: 'Clicked', one: 'Click', many: 'Clicks' },
  { key: 'sales', label: 'Revenue', one: 'Revenue', many: 'Revenue' },
];
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
// Email clicks and store revenue are not connected yet: these stay honest zeros until they are.
const zeros = (n: number) => Array(n).fill(0) as number[];

const dayMs = 86_400_000;
const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const tipLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const countFmt = new Intl.NumberFormat();
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const hourLabel = (i: number) => `${String(i).padStart(2, '0')}:00`;

// Percent across the window; stops a little short on the right so “now” is easy to reach (kit hoX).
const hoX = (i: number, n: number) => (n < 2 ? 50 : 3 + (i / (n - 1)) * 94);

function smooth(vals: number[]) {
  return vals.map((x, i) => (vals[Math.max(0, i - 1)] + 2 * x + vals[Math.min(vals.length - 1, i + 1)]) / 4);
}

/** Kit hoLine: a smooth path from the left wall. Period charts dash the latest stretch; Today stops at “now”. */
function line(vals: number[], top: number, liveAt?: number) {
  const v = smooth(vals);
  const n = v.length;
  const Y = (x: number) => Math.min(100, 100 - (x / top) * 100);
  const pts: [number, number][] = [[0, Y(v[0] * 0.7)], ...v.map((x, i): [number, number] => [hoX(i, n) * 10, Y(x)])];
  const last = pts.length - 1;
  const segs: string[] = [];
  for (let i = 0; i < last; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(last, i + 2)];
    const c = (a: number, b: number, d: number) => Math.min(100, a + (b - d) / 6);
    segs.push(`C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${c(p1[1], p2[1], p0[1]).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${c(p2[1], p1[1], p3[1]).toFixed(2)} ${p2[0].toFixed(1)} ${p2[1].toFixed(2)}`);
  }
  const start = `M0 ${pts[0][1].toFixed(2)}`;
  const cut = liveAt == null ? Math.max(0, last - 2) : Math.max(0, Math.min(last - 1, liveAt));
  const head = pts[cut + 1];
  const done = `${start} ${segs.slice(0, cut + 1).join(' ')}`;
  const tailSegs = segs.slice(cut + 1);
  const tail = tailSegs.length ? `M${head[0].toFixed(1)} ${head[1].toFixed(2)} ${tailSegs.join(' ')}` : '';
  const area = liveAt == null
    ? `${start} ${segs.join(' ')} L${pts[last][0].toFixed(1)} 100 L0 100 Z`
    : `${done} L${head[0].toFixed(1)} 100 L0 100 Z`;
  return { done, tail, area, full: `${start} ${segs.join(' ')}` };
}

function plotY(vals: number[], top: number, i: number) {
  return Math.min(100, 100 - (smooth(vals)[i] / top) * 100);
}

function utcDay(ms = Date.now()) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function byDay(rows: { day: string; count?: number; avgMs?: number }[] | undefined, key: 'count' | 'avgMs') {
  const map = new Map<string, number>();
  for (const row of rows ?? []) map.set(row.day, Number((key === 'avgMs' ? row.avgMs : row.count) ?? 0));
  return map;
}

function days(range: number, end: number, map: Map<string, number>) {
  return Array.from({ length: range }, (_, index) => {
    const date = new Date(end - (range - index - 1) * dayMs);
    return { day: date.toISOString().slice(0, 10), date, value: map.get(date.toISOString().slice(0, 10)) ?? 0 };
  });
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const avg = (values: number[]) => { const xs = values.filter((v) => v > 0); return xs.length ? sum(xs) / xs.length : 0; };

function show(kind: Metric, value: number) {
  if (kind === 'sales') return money.format(Math.round(value));
  if (kind === 'dwell') {
    const total = Math.max(0, Math.round(value / 1000));
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
  }
  return countFmt.format(Math.round(value));
}

function Chip({ now, prev }: { now: number; prev: number }) {
  if (!prev) return now > 0 ? <span className="v2-chip">New</span> : null;
  const pct = Math.round(((now - prev) / prev) * 100);
  return <span className={`v2-chip ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}`}>{pct > 0 ? '+' : ''}{pct}%</span>;
}

/** Kit hoCountUp: numbers run up from zero with the graph, width held so nothing beside them moves. */
function CountUp({ value, kind, run }: { value: number; kind: Metric | 'count'; run: number }) {
  const el = useRef<HTMLElement>(null);
  const text = kind === 'count' ? countFmt.format(Math.round(value)) : show(kind, value);
  const target = useRef({ value, text, kind });
  target.current = { value, text, kind };
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !run || reduced() || !value) return;
    node.style.minWidth = `${node.offsetWidth}px`;
    let frame = 0;
    let start: number | null = null;
    const fmt = (x: number) => (kind === 'count' ? countFmt.format(Math.round(x)) : show(kind, x));
    node.textContent = fmt(0);
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / 1100);
      const e = 1 - (1 - t) ** 4;
      node.textContent = t < 1 ? fmt(target.current.value * e) : target.current.text;
      if (t < 1) frame = requestAnimationFrame(tick);
      else node.style.minWidth = '';
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); node.style.minWidth = ''; node.textContent = target.current.text; };
  }, [run]);
  return <b ref={el}>{text}</b>;
}

/** A soft line with a fill to the card's bottom edge (kit v2Area); all zeros draws a calm baseline. */
function Area({ values, color }: { values: number[]; color: string }) {
  const n = Math.max(values.length, 2);
  const top = Math.max(...values, 0);
  const low = top ? Math.min(...values) * 0.55 : 0;
  const pts = (values.length ? values : [0, 0]).map((v, i): [number, number] => [(i / (n - 1)) * 300, top ? 68 - ((v - low) / (top * 1.08 - low)) * 56 : 66]);
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const id = `v2g${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg className="v2-area" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true" style={{ ['--c' as string]: color }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".18" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path className="v2-fill" d={`${d} L300 80 L0 80 Z`} fill={`url(#${id})`} />
      <path className="v2-line" d={d} />
    </svg>
  );
}

/** Half ring for sales by campaign; with no campaigns it is one quiet track. */
function EmptyGauge() {
  const P = (a: number) => [150 + 112 * Math.cos((a * Math.PI) / 180), 148 - 112 * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = P(180), [x1, y1] = P(0);
  return (
    <svg className="v2-gauge" viewBox="0 0 300 160" aria-hidden="true">
      <path d={`M${x0} ${y0} A112 112 0 0 1 ${x1} ${y1}`} pathLength={100}
        style={{ ['--c' as string]: 'color-mix(in srgb, var(--ink) 8%, transparent)', ['--d' as string]: '0s', ['--t' as string]: '0.9s' }} />
    </svg>
  );
}

function Card({ icon, title, children, extra, className = '' }: {
  icon: IconName; title: string; children: React.ReactNode; extra?: React.ReactNode; className?: string;
}) {
  return (
    <section className={`v2-card ${className}`.trim()}>
      <header><Icon name={icon} /><h3>{title}</h3>{extra}</header>
      <div className="v2-in">{children}</div>
    </section>
  );
}

function Link({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="ho-link" onClick={onClick}>{label}<Icon name="chevronRight" /></button>;
}


export function DashboardV2({ project, onSetup, onGlobe, onPeople, onInbox, headingRef }: {
  project: Project;
  onSetup: () => void;
  onGlobe: () => void;
  onPeople: () => void;
  onInbox: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const [range, setRange] = useState<number>(7);
  const [metric, setMetric] = useState<Metric>('people');
  const [hover, setHover] = useState<number | null>(null);
  const [run, setRun] = useState(1);
  const [wipe, setWipe] = useState(!reduced());
  // Kit first-load: numbers wait behind a skeleton (~700ms), then swap in, count up, and graphs grow.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), reduced() ? 0 : 700);
    return () => clearTimeout(timer);
  }, [run]);
  const [clock, setClock] = useState(Date.now());
  const hero = useRef<HTMLElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const hostname = useMemo(() => {
    try { return new URL(project.origin).host; } catch { return project.origin; }
  }, [project.origin]);

  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Kit v2Reveal: the page gets .is-in after mount, so card graphs grow in; a new range replays it.
  useEffect(() => {
    const page = hero.current?.closest('.v2');
    if (!page) return;
    page.classList.remove('is-in');
    if (loading) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('is-in')));
    return () => cancelAnimationFrame(frame);
  }, [run, loading]);

  const end = utcDay(clock);
  const maps = useMemo(() => ({
    views: byDay(project.pageViews, 'count'),
    people: byDay(project.visitors, 'count'),
    dwell: byDay(project.dwell, 'avgMs'),
  }), [project.pageViews, project.visitors, project.dwell]);

  const today = new Date(end).toISOString().slice(0, 10);
  const yesterday = new Date(end - dayMs).toISOString().slice(0, 10);
  const nowHour = new Date(clock).getUTCHours();

  // One shape for both modes: n points now, n points before, labels, totals and the comparison.
  const data = useMemo(() => {
    if (range === 1) {
      const hourly = { views: Array(24).fill(0), people: Array(24).fill(0) };
      const back = { views: Array(24).fill(0), people: Array(24).fill(0) };
      for (const row of project.hours ?? []) {
        const [day, h] = row.hour.split('T');
        const target = day === today ? hourly : day === yesterday ? back : null;
        if (!target) continue;
        target.views[Number(h)] = row.views;
        target.people[Number(h)] = row.people;
      }
      const dwellToday = maps.dwell.get(today) ?? 0;
      const dwellBack = maps.dwell.get(yesterday) ?? 0;
      const series = { ...hourly, dwell: Array(24).fill(dwellToday), clicked: zeros(24), sales: zeros(24) };
      const backSeries = { ...back, dwell: Array(24).fill(dwellBack), clicked: zeros(24), sales: zeros(24) };
      // Compare against yesterday up to the same hour.
      const backViewsSoFar = sum(back.views.slice(0, nowHour + 1));
      const backViewsAll = sum(back.views) || 1;
      const peopleYesterday = maps.people.get(yesterday) ?? 0;
      const totals = { people: maps.people.get(today) ?? 0, views: maps.views.get(today) ?? sum(hourly.views), dwell: dwellToday, clicked: 0, sales: 0 };
      const prev = { people: Math.round(peopleYesterday * (backViewsSoFar / backViewsAll)), views: backViewsSoFar, dwell: dwellBack, clicked: 0, sales: 0 };
      return {
        n: 24, series, back: backSeries, totals, prev, liveAt: nowHour,
        tip: (i: number) => (i === nowHour ? `Today, ${hourLabel(i)} so far` : `Today, ${hourLabel(i)}`),
        at: hourLabel, earlier: 'Yesterday', last: hourLabel(nowHour),
      };
    }
    const now = { views: days(range, end, maps.views), people: days(range, end, maps.people), dwell: days(range, end, maps.dwell) };
    const before = { views: days(range, end - range * dayMs, maps.views), people: days(range, end - range * dayMs, maps.people), dwell: days(range, end - range * dayMs, maps.dwell) };
    const values = (rows: { value: number }[]) => rows.map((row) => row.value);
    const dates = now.people.map((row) => row.date);
    return {
      n: range,
      series: { views: values(now.views), people: values(now.people), dwell: values(now.dwell), clicked: zeros(range), sales: zeros(range) },
      back: { views: values(before.views), people: values(before.people), dwell: values(before.dwell), clicked: zeros(range), sales: zeros(range) },
      totals: { people: sum(values(now.people)), views: sum(values(now.views)), dwell: avg(values(now.dwell)), clicked: 0, sales: 0 },
      prev: { people: sum(values(before.people)), views: sum(values(before.views)), dwell: avg(values(before.dwell)), clicked: 0, sales: 0 },
      liveAt: undefined as number | undefined,
      tip: (i: number) => (i === range - 1 ? 'Today, so far' : tipLabel.format(dates[i])),
      at: (i: number) => dayLabel.format(dates[i]),
      earlier: `${range} days earlier`, last: 'Today',
    };
  }, [range, end, maps, project.hours, today, yesterday, nowHour]);

  const { n } = data;
  const day = range === 1;
  const nowVals = data.series[metric];
  const backVals = data.back[metric];
  const top = Math.max(...smooth(nowVals).slice(0, day ? nowHour + 1 : n), ...smooth(backVals), 1) / 0.9;
  const g = { now: line(nowVals, top, data.liveAt), back: line(backVals, top) };
  const nowCap = day ? nowHour : n - 1;
  const at = hover == null ? null : Math.min(hover, nowCap);
  const ticks: { i: number; future?: boolean }[] = [];
  if (day) {
    for (let i = 2; i < n - 1; i += 2) if (i !== nowHour) ticks.push({ i, future: i > nowHour });
  } else {
    const step = Math.max(1, Math.round((n - 1) / 12));
    const mid = Math.round((n - 1) / 2);
    for (let i = step; i < n - 1; i += step) if (i !== mid) ticks.push({ i });
  }
  const mid = Math.round((n - 1) / 2);

  function pick(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const pct = ((event.clientX - box.left) / box.width) * 100;
    setHover(Math.max(0, Math.min(nowCap, Math.round(((pct - 3) / 94) * (n - 1)))));
  }

  const tip = (() => {
    if (at == null || (day && at === nowHour)) return null;
    const x = hoX(at, n);
    const px = ((plot.current?.clientWidth ?? 1000) * x) / 100;
    const flip = day ? x >= hoX(nowHour, n) - 8 || x > 58 : x > 60;
    const gap = day && x >= hoX(nowHour, n) - 12 ? 28 : 20;
    const m = METRICS.find((item) => item.key === metric)!;
    return { x, px, flip, gap, label: Math.round(nowVals[at]) === 1 ? m.one : m.many };
  })();

  const sources = project.sources ?? [];
  const pages = project.pages ?? [];
  const sourceTotal = sum(sources.map((row) => row.count)) || 1;
  const pageTotal = sum(pages.map((row) => row.count)) || 1;

  const changeRange = (value: number) => {
    if (value === range) return;
    setRange(value);
    setHover(null);
    setRun((x) => x + 1);
    setWipe(!reduced());
  };

  return <>
    <section className="v2-hero" aria-label="Overview" ref={hero}>
      <div className="v2-hero-rail">
        <h1 className="sr-only" tabIndex={-1} ref={headingRef}>Dashboard</h1>
        <nav className="v2-range" aria-label="Date range in UTC">
          {RANGES.map((value) => (
            <button key={value} type="button" aria-pressed={range === value} onClick={() => changeRange(value)}>
              {value === 1 ? 'Today' : `${value} days`}
            </button>
          ))}
        </nav>
        <div className="v2-ctrl">
          <div className={`v2-head${loading ? ' is-loading' : ''}`} aria-busy={loading}>
            <nav className="v2-metrics" aria-label="Metrics">
              {METRICS.map(({ key, label }) => (
                <button key={key} type="button" className="v2-m" data-homet={key} aria-pressed={metric === key}
                  aria-label={`Show ${label} on the graph`} onClick={() => setMetric(key)}>
                  <span className="v2-m-k">{label}</span>
                  <span className="v2-m-v">
                    <CountUp value={data.totals[key]} kind={key} run={loading ? 0 : run} />
                    <Chip now={data.totals[key]} prev={data.prev[key]} />
                  </span>
                  <span className="v2-m-s">
                    {key === 'people' && 'Unique people'}
                    {key === 'views' && (data.totals.people ? `${(data.totals.views / data.totals.people).toFixed(1)} per session` : 'No sessions yet')}
                    {key === 'dwell' && 'Avg. active time'}
                    {key === 'clicked' && 'No emails sent yet'}
                    {key === 'sales' && 'From 0 customers'}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div
        className={`v2-live${day ? ' v2-day' : ''}`}
        id="v2Chart"
        tabIndex={0}
        role="img"
        aria-label={day
          ? `Live activity today through ${hourLabel(nowHour)} UTC. Use the arrow keys to read each hour.`
          : `Graph over the last ${range} days. Use the arrow keys to read each point.`}
        data-metric={metric}
        data-mode={day ? 'day' : undefined}
        onKeyDown={(event) => {
          const d = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          event.preventDefault();
          setHover((value) => Math.max(0, Math.min(nowCap, (value ?? nowCap) + d)));
        }}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) setHover((value) => value ?? nowCap); }}
        onBlur={() => setHover(null)}
      >
        <div className="v2-plot" ref={plot} onPointerMove={pick} onPointerLeave={() => setHover(null)}
          style={day ? { ['--now-x' as string]: `${hoX(nowHour, n)}%` } : undefined}>
          <svg className="v2-lines v2-fills" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="v2Fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--v2-chart)" stopOpacity={day ? 0.16 : 0.18} />
                <stop offset="1" stopColor="var(--v2-chart)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="m-line" data-p="area" d={g.now.area} fill="url(#v2Fill)" />
          </svg>
          <svg className="v2-lines" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="v2-ln-back m-line" data-p="back" d={g.back.full} />
            <path className="v2-ln m-line" data-p="done" d={g.now.done} />
            {!day && g.now.tail && <path className="v2-ln v2-ln-tail m-line" data-p="tail" d={g.now.tail} />}
          </svg>
          {day && <span className="v2-day-now" style={{ left: `${hoX(nowHour, n)}%` }} aria-hidden="true"><span className="v2-live-head"><Icon name="zap" /></span></span>}
          {wipe && <span className="v2-wipe"><i onAnimationEnd={() => setWipe(false)} /></span>}
          {tip && at != null && <>
            <span className="v2-cross" style={{ left: `${tip.px}px` }}>
              <i className="v2-cross-dot was" style={{ ['--y' as string]: `${plotY(backVals, top, at)}%` }} />
              <i className="v2-cross-dot" style={{ ['--y' as string]: `${plotY(nowVals, top, at)}%` }} />
            </span>
            <div className="v2-live-tip" style={{ transform: tip.flip ? `translateX(calc(${tip.px - tip.gap}px - 100%))` : `translateX(${tip.px + tip.gap}px)` }}>
              <div className="ho-tip-t">{data.tip(at)}</div>
              <div className="v2-tip-r"><i style={{ ['--c' as string]: 'var(--v2-chart)' }} /><span>{tip.label}</span><b>{show(metric, nowVals[at])}</b></div>
              <div className="v2-tip-r was"><i style={{ ['--c' as string]: 'color-mix(in srgb, var(--ink) 28%, transparent)' }} /><span>{data.earlier}</span><b>{show(metric, backVals[at])}</b></div>
            </div>
          </>}
        </div>
        <div className={`v2-axis${day ? ' v2-day-axis' : ''}${tip ? ' is-scrubbing' : ''}`} aria-hidden="true">
          <span className="v2-ax-start" style={{ left: `${hoX(0, n)}%` }}>{data.at(0)}</span>
          {ticks.map(({ i, future }) => <i key={i} className={`v2-tick${future ? ' is-future' : ''}`} style={{ left: `${hoX(i, n)}%` }} />)}
          {!day && <span className="v2-ax-mid" style={{ left: `${hoX(mid, n)}%` }}>{data.at(mid)}</span>}
          <span className={`v2-ax-hover${tip ? ' is-on' : ''}`} style={{ left: `${hoX(at ?? nowCap, n)}%` }}>{at != null ? data.at(at) : ''}</span>
          <span className="now" style={{ left: `${hoX(nowCap, n)}%` }}>{data.last}</span>
          {day && <span className="v2-day-end is-future" style={{ left: `${hoX(n - 1, n)}%` }}>23:00</span>}
        </div>
      </div>
    </section>

    <div className="v2-rest">
      <div className="v2-row v2-two">
        <Card icon="ghost" title="Brand read" extra={<Link label="Brand DNA" onClick={onSetup} />}>
          <div className="v2-brand-read">
            <b className="v2-brand-word">Not read yet</b>
            <p>Import {project.name}’s Brand DNA to see how emails match it.</p>
            <p className="v2-brand-ind">Conversion vs store average · <em>Waiting for sales</em></p>
          </div>
        </Card>
        <Card icon="dollar" title="Email revenue">
          <div className="v2-head"><b className="v2-val v2-big">{money.format(0)}</b></div>
          <p className="v2-m-s v2-card-sub">From 0 customers</p>
          <Area values={zeros(n)} color="#12b886" />
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon="clock" title="Schedule" extra={<Link label="Opportunities" onClick={onInbox} />}>
          <div className="v2-sched">
            <b className="v2-val">0 <span>sends lined up</span></b>
            <p className="ho-empty">Follow-ups you approve are scheduled here, in each person’s own time zone.</p>
          </div>
        </Card>
        <Card icon="send" title="Emails">
          <div className="v2-head"><b className="v2-val">0</b></div>
          <p className="v2-m-s v2-card-sub">0% clicked · 0 people</p>
          <Area values={zeros(n)} color="#4F4BE0" />
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon="megaphone" title="Sales by campaign" className="v2-gauge-card">
          <div className="v2-gauge-wrap">
            <EmptyGauge />
            <div className="v2-gauge-mid"><span>Total from email</span><b>{money.format(0)}</b></div>
          </div>
          <p className="ho-empty omer-center">No campaigns yet.</p>
        </Card>
        <Card icon="star" title="Top products">
          <p className="ho-empty">Products show up here after the first sale from an email.</p>
        </Card>
      </div>

      <div className="v2-row">
        <Card icon="chart" title="Sales mix" className="v2-wide"
          extra={<span className="v2-side">Bought before <b>{money.format(0)}</b></span>}>
          <div className="v2-head"><b className="v2-val v2-big">{money.format(0)}</b></div>
          <div className="v2-bars-wrap">
            <div className="v2-key" aria-hidden="true"><span><i style={{ ['--c' as string]: '#6360F0' }} />New customers</span><span><i style={{ ['--c' as string]: '#4F4BE0' }} />Bought before</span></div>
            <div className="v2-bars omer-bars-empty" aria-hidden="true">
              {zeros(n).map((_, i) => (
                <span key={i} className="v2-col" style={{ ['--i' as string]: i }}>
                  <i className="v2-new" style={{ ['--h' as string]: '0%' }} /><i className="v2-ret" style={{ ['--h' as string]: '0%' }} />
                </span>
              ))}
            </div>
            <p className="omer-bars-note">Sales from your emails will stack here once your store is connected.</p>
          </div>
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon="arrowRight" title="Sources">
          {sources.length === 0 ? <p className="ho-empty">Referrers show up after the first consented page views.</p> : (
            <table className="v2-stat-table">
              <thead><tr><th scope="col">Source</th><th scope="col">Views</th><th scope="col">Revenue</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.name}>
                    <th scope="row"><button type="button" className="v2-stat-src" onClick={onGlobe}><span className={`lvp-src ${sourceKey(row.name)}`} aria-hidden="true"><SourceMark referrer={row.name} /></span>{sourceLabel(row.name)}</button></th>
                    <td className="num">{countFmt.format(row.count)}</td>
                    <td className="num">{money.format(0)}</td>
                    <td className="num">{Math.round((row.count / sourceTotal) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card icon="file" title="Pages" extra={<Link label="People" onClick={onPeople} />}>
          {pages.length === 0 ? <p className="ho-empty">Top paths appear once people start browsing.</p> : (
            <table className="v2-stat-table">
              <thead><tr><th scope="col">Page</th><th scope="col">Views</th><th scope="col">Revenue</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {pages.map((row) => (
                  <tr key={row.path}>
                    <th scope="row"><button type="button" className="v2-stat-src" onClick={onPeople}>{row.path}</button></th>
                    <td className="num">{countFmt.format(row.count)}</td>
                    <td className="num">{money.format(0)}</td>
                    <td className="num">{Math.round((row.count / pageTotal) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="v2-row">
        <Card icon="inbox" title="Needs you" className="v2-wide">
          {project.firstEventAt ? (
            <section className="ho-needs" aria-label="What needs you"><p className="ho-empty">Nothing needs you right now.</p></section>
          ) : (
            <section className="ho-needs" aria-label="What needs you">
              <header className="ho-needs-h">
                <nav className="ib-tabs" aria-label="What needs you">
                  <button type="button" className="ib-tab omer-problem" aria-pressed="true">Problems<span>1</span></button>
                </nav>
                <Link label="Setup" onClick={onSetup} />
              </header>
              <div className="ho-need-rows">
                <button type="button" className="ho-need" onClick={onSetup}>
                  <span className="ho-need-ic bad"><Icon name="alert" /></span><b>Tracker not installed</b><span>No events from {hostname} yet</span><time />
                </button>
              </div>
            </section>
          )}
        </Card>
      </div>
    </div>
  </>;
}
