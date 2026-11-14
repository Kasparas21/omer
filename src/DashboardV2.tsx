/* Dashboard V2 — a port of the product's Home (dashboard screen modules v2Live / v2Chart / v2DayChart / mountV2)
   driven by real rollups: same geometry, axis, hover scrubber, wipe-in, count-up and card language. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './project';
import { Icon, type IconName } from './ui/Icon';
import { SourceMark, sourceKey, sourceLabel } from './ui/sources';
import { Orb } from './ui/Orb';
import { CAMPAIGN_COLORS, DEMO_CAMPAIGNS, DEMO_NEEDS, DEMO_PRODUCTS, DEMO_SCHEDULE, RETURNING, demoSeries, isDemo, type NeedRow } from './demo';
import { useDemo } from './demoState';
import { moneyFormatter } from './money';

/** Where a Dashboard row takes you, as in the product UI. */
export type Go =
  | { to: 'inbox'; tab?: 'review' | 'hold' | 'approved' | 'replies'; id?: string }
  | { to: 'campaigns'; id?: string }
  | { to: 'results' }
  | { to: 'settings'; tab?: 'brand' | 'company' | 'changes' | 'monitoring' | 'sending' | 'integrations' | 'privacy' }
  | { to: 'visitors'; source?: string; country?: string };

type Metric = 'people' | 'views' | 'dwell' | 'clicked' | 'sales';
const RANGES = [1, 7, 14, 30] as const;
const METRICS: { key: Metric; label: string; one: string; many: string }[] = [
  { key: 'people', label: 'Visitors', one: 'Visitor', many: 'Visitors' },
  { key: 'views', label: 'Pageviews', one: 'Pageview', many: 'Pageviews' },
  { key: 'dwell', label: 'Visit duration', one: 'Avg. visit', many: 'Avg. visit' },
  { key: 'clicked', label: 'Clicked', one: 'Click', many: 'Clicks' },
  { key: 'sales', label: 'Revenue', one: 'Revenue', many: 'Revenue' },
];
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

function show(kind: Metric, value: number, currency = 'usd') {
  if (kind === 'sales') return moneyFormatter(currency).format(Math.round(value));
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
function CountUp({ value, kind, run, currency = 'usd' }: { value: number; kind: Metric | 'count'; run: number; currency?: string }) {
  const el = useRef<HTMLElement>(null);
  const text = kind === 'count' ? countFmt.format(Math.round(value)) : show(kind, value, currency);
  const target = useRef({ value, text, kind, currency });
  target.current = { value, text, kind, currency };
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !run || reduced() || !value) return;
    node.style.minWidth = `${node.offsetWidth}px`;
    let frame = 0;
    let start: number | null = null;
    const fmt = (x: number) => (kind === 'count' ? countFmt.format(Math.round(x)) : show(kind, x, currency));
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

type Series = Record<Metric, number[]>;
type Totals = Record<Metric, number>;
type MailPulse = {
  sent: number[];
  sentPrev: number;
  customers: number;
  returning?: number[];
  campaigns?: { name: string; share: number; revenue: number }[];
  products?: { name: string; count: number; revenue: number; price?: number; tint?: string }[];
  sourceRevenue?: Map<string, number>;
  pageRevenue?: Map<string, number>;
};
/** Demo fills email/sales from the visitor curve; real projects use collected purchase/email events. */
function withDemo<T extends {
  series: Series; back: Series; totals: Totals; prev: Totals; liveAt?: number;
  returning?: number[]; opens?: number[];
}>(demo: boolean, d: T, real?: {
  ordersTotal: number;
  campaigns: { name: string; revenue: number; count: number }[];
  products: { name: string; count: number; revenue: number }[];
  sourceRevenue: { name: string; revenue: number }[];
  pageRevenue: { path: string; revenue: number }[];
}) {
  if (demo) {
    const now = demoSeries(d.series.people, 1);
    const was = demoSeries(d.back.people, 7);
    const cut = d.liveAt == null ? now.sales.length : d.liveAt + 1;
    const upTo = (xs: number[]) => xs.map((x, i) => (i < cut ? x : 0));
    const series = { ...d.series, clicked: upTo(now.clicked), sales: upTo(now.sales) };
    const back = { ...d.back, clicked: was.clicked, sales: was.sales };
    const before = (xs: number[]) => sum(xs.slice(0, cut));
    const mail: MailPulse = {
      sent: upTo(now.sent),
      sentPrev: before(was.sent),
      customers: Math.round(sum(upTo(now.orders)) * 0.9),
    };
    return {
      ...d, series, back,
      totals: { ...d.totals, clicked: sum(series.clicked), sales: sum(series.sales) },
      prev: { ...d.prev, clicked: before(was.clicked), sales: before(was.sales) },
      mail,
    };
  }
  const hasCommerce = d.totals.sales > 0 || d.totals.clicked > 0 || (real?.ordersTotal ?? 0) > 0;
  if (!hasCommerce) return { ...d, mail: null as MailPulse | null };
  const campaignRevenue = sum((real?.campaigns ?? []).map((c) => c.revenue)) || d.totals.sales || 1;
  const mail: MailPulse = {
    sent: d.opens ?? zeros(d.series.people.length),
    sentPrev: 0,
    customers: real?.ordersTotal ?? 0,
    returning: d.returning,
    campaigns: (real?.campaigns ?? []).map((c) => ({
      name: c.name,
      share: c.revenue / campaignRevenue,
      revenue: c.revenue,
    })),
    products: real?.products ?? [],
    sourceRevenue: new Map((real?.sourceRevenue ?? []).map((row) => [row.name, row.revenue])),
    pageRevenue: new Map((real?.pageRevenue ?? []).map((row) => [row.path, row.revenue])),
  };
  return { ...d, mail };
}

/** Half ring split by campaign share; each arc draws in after the one before. */
function Gauge({ parts }: { parts: { share: number; color: string }[] }) {
  const P = (a: number) => [150 + 112 * Math.cos((a * Math.PI) / 180), 148 - 112 * Math.sin((a * Math.PI) / 180)];
  let angle = 180;
  let delay = 0;
  return (
    <svg className="v2-gauge" viewBox="0 0 300 160" aria-hidden="true">
      {parts.map((part, i) => {
        const span = 180 * part.share;
        const a0 = angle - (i ? 0.55 : 0);
        const a1 = angle - span + (i < parts.length - 1 ? 0.55 : 0);
        angle -= span;
        const [x0, y0] = P(a0), [x1, y1] = P(a1);
        const style = { ['--c' as string]: part.color, ['--d' as string]: `${delay.toFixed(2)}s`, ['--t' as string]: `${(0.25 + part.share * 0.9).toFixed(2)}s` };
        delay += 0.2 + part.share * 0.9;
        return <path key={i} d={`M${x0.toFixed(2)} ${y0.toFixed(2)} A112 112 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`} pathLength={100} style={style} />;
      })}
    </svg>
  );
}

/** A soft line with a fill to the card's bottom edge (kit v2Area); all zeros draws a calm baseline. */
export function Area({ values, color }: { values: number[]; color: string }) {
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

export function Card({ icon, title, children, extra, className = '' }: {
  icon: IconName; title: string; children: React.ReactNode; extra?: React.ReactNode; className?: string;
}) {
  return (
    <section className={`v2-card ${className}`.trim()}>
      <header><Icon name={icon} /><h3>{title}</h3>{extra}</header>
      <div className="v2-in">{children}</div>
    </section>
  );
}

/** What a card says before it has data: a soft icon, what goes here, and when it fills in. */
export function CardEmpty({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="v2-card-empty">
      <span className="v2-card-empty-ic" aria-hidden="true"><Icon name={icon} /></span>
      <b>{title}</b>
      <p>{text}</p>
      {children}
    </div>
  );
}

const CAMPAIGN_IDS: Record<string, string | undefined> = { 'Interest match': 'interest', 'Expired code rescue': 'expired', 'Free shipping nudge': 'shipping' };

function Link({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="ho-link" onClick={onClick}>{label}<Icon name="chevronRight" /></button>;
}


export function DashboardV2({ project, onSetup, onGlobe, onPeople, onInbox, onGo, headingRef }: {
  onGo: (go: Go) => void;
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
  const currency = project.currency || 'usd';
  const money = useMemo(() => moneyFormatter(currency), [currency]);

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
    sales: byDay(project.sales, 'count'),
    orders: byDay(project.orders, 'count'),
    returning: byDay(project.returningSales, 'count'),
    clicked: byDay(project.clicked, 'count'),
    opens: byDay(project.emailOpens, 'count'),
  }), [project.pageViews, project.visitors, project.dwell, project.sales, project.orders, project.returningSales, project.clicked, project.emailOpens]);

  const today = new Date(end).toISOString().slice(0, 10);
  const yesterday = new Date(end - dayMs).toISOString().slice(0, 10);
  const nowHour = new Date(clock).getUTCHours();

  // One shape for both modes: n points now, n points before, labels, totals and the comparison.
  const demo = isDemo(project);
  const [need, setNeed] = useState(DEMO_NEEDS[0].id);
  const demoState = useDemo();
  const who = (p: { name: string | null; email: string | null }) => p.name || p.email || 'Unknown visitor';
  const needs: { id: string; label: string; go: string; rows: NeedRow[] }[] = [
    { id: 'review', label: 'To approve', go: 'Opportunities', rows: demoState.people.filter((p) => !p.skipped && p.status === 'review').map((p) => ({ seed: p.id, who: who(p), what: p.offer, when: p.time })) },
    { id: 'hold', label: 'On hold', go: 'Opportunities', rows: demoState.people.filter((p) => !p.skipped && p.status === 'hold').map((p) => ({ seed: p.id, who: who(p), what: p.offer, when: p.time })) },
    { id: 'replies', label: 'Replies', go: 'Replies', rows: demoState.replies.filter((r) => r.state === 'open').map((r) => ({ seed: r.id, who: who(r), what: `“${r.text[0]}”`, when: r.time, icon: 'reply' as const })) },
    ...DEMO_NEEDS.filter((t) => t.id === 'facts' || t.id === 'changes').map((t) => ({ ...t, go: t.id === 'facts' ? 'Company' : 'Website changes' })),
  ];
  const needGo = (id: string, seed?: string): Go => (id === 'facts' ? { to: 'settings', tab: 'brand' }
    : id === 'changes' ? { to: 'settings', tab: 'changes' }
    : { to: 'inbox', tab: id === 'replies' ? 'replies' : id === 'hold' ? 'hold' : 'review', id: seed });
  const data = useMemo(() => withDemo(demo, (() => {
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
      const salesToday = maps.sales.get(today) ?? 0;
      const salesBack = maps.sales.get(yesterday) ?? 0;
      const clickedToday = maps.clicked.get(today) ?? 0;
      const clickedBack = maps.clicked.get(yesterday) ?? 0;
      // Spread day totals across hours for the strip until we store hourly commerce.
      const spread = (total: number, n: number, cut: number) => {
        const out = Array(n).fill(0);
        if (!total || cut < 0) return out;
        const each = total / (cut + 1);
        for (let i = 0; i <= cut; i++) out[i] = each;
        return out;
      };
      const series = {
        ...hourly,
        dwell: Array(24).fill(dwellToday),
        clicked: spread(clickedToday, 24, nowHour),
        sales: spread(salesToday, 24, nowHour),
      };
      const backSeries = {
        ...back,
        dwell: Array(24).fill(dwellBack),
        clicked: spread(clickedBack, 24, 23),
        sales: spread(salesBack, 24, 23),
      };
      // Compare against yesterday up to the same hour.
      const backViewsSoFar = sum(back.views.slice(0, nowHour + 1));
      const backViewsAll = sum(back.views) || 1;
      const peopleYesterday = maps.people.get(yesterday) ?? 0;
      const totals = {
        people: maps.people.get(today) ?? 0,
        views: maps.views.get(today) ?? sum(hourly.views),
        dwell: dwellToday,
        clicked: clickedToday,
        sales: salesToday,
      };
      const prev = {
        people: Math.round(peopleYesterday * (backViewsSoFar / backViewsAll)),
        views: backViewsSoFar,
        dwell: dwellBack,
        clicked: Math.round(clickedBack * ((nowHour + 1) / 24)),
        sales: Math.round(salesBack * ((nowHour + 1) / 24)),
      };
      return {
        n: 24, series, back: backSeries, totals, prev, liveAt: nowHour,
        tip: (i: number) => (i === nowHour ? `Today, ${hourLabel(i)} so far` : `Today, ${hourLabel(i)}`),
        at: hourLabel, earlier: 'Yesterday', last: hourLabel(nowHour),
        returning: spread(maps.returning.get(today) ?? 0, 24, nowHour),
        opens: spread(maps.opens.get(today) ?? 0, 24, nowHour),
      };
    }
    const now = {
      views: days(range, end, maps.views),
      people: days(range, end, maps.people),
      dwell: days(range, end, maps.dwell),
      sales: days(range, end, maps.sales),
      clicked: days(range, end, maps.clicked),
      returning: days(range, end, maps.returning),
      opens: days(range, end, maps.opens),
    };
    const before = {
      views: days(range, end - range * dayMs, maps.views),
      people: days(range, end - range * dayMs, maps.people),
      dwell: days(range, end - range * dayMs, maps.dwell),
      sales: days(range, end - range * dayMs, maps.sales),
      clicked: days(range, end - range * dayMs, maps.clicked),
    };
    const values = (rows: { value: number }[]) => rows.map((row) => row.value);
    const dates = now.people.map((row) => row.date);
    return {
      n: range,
      series: {
        views: values(now.views),
        people: values(now.people),
        dwell: values(now.dwell),
        clicked: values(now.clicked),
        sales: values(now.sales),
      },
      back: {
        views: values(before.views),
        people: values(before.people),
        dwell: values(before.dwell),
        clicked: values(before.clicked),
        sales: values(before.sales),
      },
      totals: {
        people: sum(values(now.people)),
        views: sum(values(now.views)),
        dwell: avg(values(now.dwell)),
        clicked: sum(values(now.clicked)),
        sales: sum(values(now.sales)),
      },
      prev: {
        people: sum(values(before.people)),
        views: sum(values(before.views)),
        dwell: avg(values(before.dwell)),
        clicked: sum(values(before.clicked)),
        sales: sum(values(before.sales)),
      },
      liveAt: undefined as number | undefined,
      tip: (i: number) => (i === range - 1 ? 'Today, so far' : tipLabel.format(dates[i])),
      at: (i: number) => dayLabel.format(dates[i]),
      earlier: `${range} days earlier`, last: 'Today',
      returning: values(now.returning),
      opens: values(now.opens),
    };
  })(), {
    ordersTotal: sum((project.orders ?? []).map((row) => row.count)),
    campaigns: project.campaigns ?? [],
    products: project.products ?? [],
    sourceRevenue: project.sourceRevenue ?? [],
    pageRevenue: project.pageRevenue ?? [],
  }), [range, end, maps, project.hours, project.orders, project.campaigns, project.products, project.sourceRevenue, project.pageRevenue, today, yesterday, nowHour, demo]);

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

  // Connected but nobody has come yet — quiet blank, same language as Live / Profile.
  const loaded = Array.isArray(project.visitors) && Array.isArray(project.pageViews);
  const nobodyYet = !demo && loaded && sum((project.pageViews ?? []).map((row) => row.count)) === 0
    && sum((project.sales ?? []).map((row) => row.count)) === 0;
  if (nobodyYet) {
    return (
      <div className="omer-blank">
        <h1 className="sr-only" tabIndex={-1} ref={headingRef}>Dashboard</h1>
        <span className="omer-blank-ic" aria-hidden="true"><Icon name="ghost" /></span>
        <h2>Watching {hostname}</h2>
        <p>Your store is connected. Visitors, sales, and the emails behind them show up here as soon as people arrive.</p>
        <button type="button" className="btn btn-secondary omer-blank-cta" onClick={onGlobe}>See who’s on the site<Icon name="arrowUpRight" /></button>
      </div>
    );
  }

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
                    <CountUp value={data.totals[key]} kind={key} run={loading ? 0 : run} currency={currency} />
                    <Chip now={data.totals[key]} prev={data.prev[key]} />
                  </span>
                  <span className="v2-m-s">
                    {key === 'people' && 'Unique people'}
                    {key === 'views' && (data.totals.people ? `${(data.totals.views / data.totals.people).toFixed(1)} per session` : 'No sessions yet')}
                    {key === 'dwell' && 'Avg. active time'}
                    {key === 'clicked' && (data.mail ? `${Math.round((data.totals.clicked / Math.max(1, sum(data.mail.sent))) * 100)}% of emails` : 'No emails sent yet')}
                    {key === 'sales' && `From ${countFmt.format(data.mail?.customers ?? 0)} customers`}
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
              <div className="v2-tip-r"><i style={{ ['--c' as string]: 'var(--v2-chart)' }} /><span>{tip.label}</span><b>{show(metric, nowVals[at], currency)}</b></div>
              <div className="v2-tip-r was"><i style={{ ['--c' as string]: 'color-mix(in srgb, var(--ink) 28%, transparent)' }} /><span>{data.earlier}</span><b>{show(metric, backVals[at], currency)}</b></div>
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
        <Card icon="ghost" title="Brand read" extra={<Link label="Brand knowledge" onClick={() => onGo({ to: 'settings', tab: 'brand' })} />}>
          {demo && data.mail ? (
            <div className="v2-brand-read">
              <b className="v2-brand-word">Credible</b>
              <p>Emails match {project.name}’s Brand DNA.</p>
              <p className="v2-brand-ind">Conversion vs pet-store average · <em>Decent</em></p>
            </div>
          ) : (
            <div className="v2-brand-read">
              <b className="v2-brand-word">Not read yet</b>
              <p>Import {project.name}’s Brand DNA to see how emails match it.</p>
              <p className="v2-brand-ind">Conversion vs store average · <em>Waiting for sales</em></p>
            </div>
          )}
        </Card>
        <Card icon="dollar" title="Revenue">
          <div className="v2-head"><b className="v2-val v2-big">{money.format(data.totals.sales)}</b><Chip now={data.totals.sales} prev={data.prev.sales} /></div>
          <p className="v2-m-s v2-card-sub">From {countFmt.format(data.mail?.customers ?? 0)} customers</p>
          <Area values={day ? data.series.sales.slice(0, nowHour + 1) : data.series.sales} color="#12b886" />
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon="clock" title="Schedule" extra={<Link label="Opportunities" onClick={() => onGo({ to: 'inbox', tab: 'review' })} />}>
          <div className="v2-sched">
            {demo && data.mail ? <b className="v2-val">{DEMO_SCHEDULE.length} <span>sends lined up</span></b> : null}
            {demo && data.mail ? (
              <ul>{DEMO_SCHEDULE.map((row) => (
                <li key={row.seed}><button type="button" onClick={() => onGo({ to: 'inbox', tab: 'review', id: row.seed })}><Orb seed={row.seed} size={22} /><span><b>{row.name}</b><small>{row.when}</small></span></button></li>
              ))}</ul>
            ) : <CardEmpty icon="clock" title="Nothing scheduled" text="Follow-ups you approve get a send time and wait here." />}
          </div>
        </Card>
        <Card icon="send" title="Emails">
          <div className="v2-head"><b className="v2-val">{countFmt.format(data.mail ? sum(data.mail.sent) : 0)}</b>{data.mail && <Chip now={sum(data.mail.sent)} prev={data.mail.sentPrev} />}</div>
          <p className="v2-m-s v2-card-sub">{data.mail && sum(data.mail.sent) ? Math.round((data.totals.clicked / Math.max(1, sum(data.mail.sent))) * 100) : 0}% clicked · {countFmt.format(data.totals.clicked)} people</p>
          <Area values={data.mail ? (day ? data.mail.sent.slice(0, nowHour + 1) : data.mail.sent) : zeros(n)} color="#4F4BE0" />
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon="megaphone" title="Sales by campaign" className="v2-gauge-card">
          {(() => {
            const camps = demo && data.mail
              ? DEMO_CAMPAIGNS.map((c, i) => ({ name: c.name, share: c.share, revenue: Math.round(data.totals.sales * c.share), color: CAMPAIGN_COLORS[i] }))
              : (data.mail?.campaigns ?? []).map((c, i) => ({ ...c, color: CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length] }));
            const parts = camps.length ? camps : [];
            return <>
              <div className="v2-gauge-wrap">
                {parts.length ? <Gauge parts={parts.map((c) => ({ share: Math.max(0.01, c.share), color: c.color }))} /> : <EmptyGauge />}
                <div className="v2-gauge-mid"><span>Total attributed</span><b>{money.format(data.totals.sales)}</b></div>
              </div>
              {parts.length ? (
                <div className="v2-legend">{parts.map((c) => (
                  <button key={c.name} type="button" onClick={() => onGo({ to: 'campaigns', id: CAMPAIGN_IDS[c.name] })}><i style={{ ['--c' as string]: c.color }} /><span>{c.name}</span><small>{Math.round(c.share * 100)}%</small><b>{money.format(Math.round(c.revenue))}</b></button>
                ))}</div>
              ) : <p className="ho-empty omer-center">Each campaign’s share shows up after its first sale.</p>}
            </>;
          })()}
        </Card>
        <Card icon="star" title="Top products">
          {(() => {
            const products = demo && data.mail
              ? DEMO_PRODUCTS.map((item) => {
                const amount = Math.round(data.totals.sales * item.share);
                return { name: item.name, revenue: amount, count: Math.max(1, Math.round(amount / item.price)), tint: item.tint };
              })
              : (data.mail?.products ?? []).map((item, i) => ({
                name: item.name,
                revenue: item.revenue,
                count: item.count,
                tint: ['#f6d6c4', '#e2dcf7', '#d7ecf2', '#fbe3cf', '#e9e3d6'][i % 5],
              }));
            return products.length ? (
              <div className="v2-products">{products.map((item) => (
                <button key={item.name} type="button" className="v2-prod" onClick={() => onGo({ to: 'results' })}>
                  <span className="omer-thumb" style={{ background: item.tint }} aria-hidden="true"><Icon name="tag" /></span>
                  <span className="v2-prod-t"><b>{item.name}</b><small>{countFmt.format(Math.max(1, Math.round(item.count)))} orders</small></span>
                  <b className="v2-prod-v">{money.format(Math.round(item.revenue))}</b>
                </button>
              ))}</div>
            ) : <CardEmpty icon="tag" title="No products yet" text="Your best sellers show up here after the first orders." />;
          })()}
        </Card>
      </div>

      <div className="v2-row">
        {(() => {
          const sales = day ? data.series.sales.slice(0, nowHour + 1) : data.series.sales;
          const returningSeries = data.mail?.returning ?? (demo ? sales.map((v, i) => v * RETURNING(i)) : sales.map(() => 0));
          const back = sum(day ? returningSeries.slice(0, nowHour + 1) : returningSeries);
          const backWas = data.prev.sales * (demo ? 0.36 : 0.3);
          const delta = backWas ? Math.round(((back - backWas) / backWas) * 100) : 0;
          const tallest = Math.max(...sales, 1);
          return (
            <Card icon="chart" title="Sales mix" className="v2-wide" extra={!(data.mail && data.totals.sales > 0) ? undefined :
              <span className="v2-side">Bought before <b>{money.format(Math.round(back))}</b>
                {data.mail && data.totals.sales > 0 && <b className={`v2-up-s ${delta >= 0 ? 'up' : 'down'}`}><svg viewBox="0 0 10 8" aria-hidden="true"><path d={delta >= 0 ? 'M5 0 10 8H0z' : 'M5 8 0 0h10z'} /></svg>{delta > 0 ? '+' : ''}{delta}%</b>}
              </span>}>
              {data.mail && data.totals.sales > 0 ? <>
              <div className="v2-head"><b className="v2-val v2-big">{money.format(data.totals.sales)}</b><Chip now={data.totals.sales} prev={data.prev.sales} /></div>
              <div className="v2-bars-wrap">
                <div className="v2-key" aria-hidden="true"><span><i style={{ ['--c' as string]: '#6360F0' }} />New customers</span><span><i style={{ ['--c' as string]: '#4F4BE0' }} />Bought before</span></div>
                <div className={`v2-bars${data.mail && data.totals.sales > 0 ? '' : ' omer-bars-empty'}`} aria-hidden="true">
                  {(data.mail && data.totals.sales > 0 ? sales : zeros(n)).map((v, i) => {
                    const ret = Math.min(v, returningSeries[i] ?? 0);
                    return (
                      <span key={i} className="v2-col" style={{ ['--i' as string]: i }} title={data.mail ? `${data.tip(i)}: ${money.format(v)}` : undefined}>
                        <i className="v2-new" style={{ ['--h' as string]: `${(((v - ret) / tallest) * 100).toFixed(2)}%` }} />
                        <i className="v2-ret" style={{ ['--h' as string]: `${((ret / tallest) * 100).toFixed(2)}%` }} />
                      </span>
                    );
                  })}
                </div>
              </div>
              </> : (
                <div className="v2-mix-empty">
                  <div className="v2-mix-ghost" aria-hidden="true">
                    {[34, 52, 40, 66, 48, 72, 58, 44, 62, 80, 54, 68, 46, 76].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
                  </div>
                  <CardEmpty icon="chart" title="No sales yet" text="Sales from new and returning customers stack up here, day by day." />
                </div>
              )}
            </Card>
          );
        })()}
      </div>

      <div className="v2-row v2-two">
        <Card icon="arrowRight" title="Sources">
          {sources.length === 0 ? <CardEmpty icon="arrowRight" title="No sources yet" text="Where your visitors come from shows up after the first visits." /> : (
            <table className="v2-stat-table">
              <thead><tr><th scope="col">Source</th><th scope="col">Views</th><th scope="col">Revenue</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.name}>
                    <th scope="row"><button type="button" className="v2-stat-src" onClick={() => onGo({ to: 'visitors', source: sourceKey(row.name) })}><span className={`lvp-src ${sourceKey(row.name)}`} aria-hidden="true"><SourceMark referrer={row.name} /></span>{sourceLabel(row.name)}</button></th>
                    <td className="num">{countFmt.format(row.count)}</td>
                    <td className="num">{money.format(Math.round(demo
                      ? data.totals.sales * (row.count / sourceTotal) * (sourceKey(row.name) === 'direct' ? 0.7 : 1.05)
                      : (data.mail?.sourceRevenue?.get(row.name) ?? 0)))}</td>
                    <td className="num">{Math.round((row.count / sourceTotal) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card icon="file" title="Pages" extra={<Link label="People" onClick={onPeople} />}>
          {pages.length === 0 ? <CardEmpty icon="file" title="No pages yet" text="The pages people look at most show up here." /> : (
            <table className="v2-stat-table">
              <thead><tr><th scope="col">Page</th><th scope="col">Views</th><th scope="col">Revenue</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {pages.map((row) => (
                  <tr key={row.path}>
                    <th scope="row"><button type="button" className="v2-stat-src" onClick={onPeople}>{row.path}</button></th>
                    <td className="num">{countFmt.format(row.count)}</td>
                    <td className="num">{money.format(Math.round(demo
                      ? data.totals.sales * (row.count / pageTotal) * (row.path.includes('checkout') ? 1.4 : row.path.includes('blog') ? 0.45 : 1)
                      : (data.mail?.pageRevenue?.get(row.path) ?? 0)))}</td>
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
          {demo && data.mail ? (() => {
            const tabs = needs;
            const tab = tabs.find((t) => t.id === need) ?? tabs[0];
            return (
              <section className="ho-needs" aria-label="What needs you">
                <header className="ho-needs-h">
                  <nav className="ib-tabs" aria-label="What needs you">
                    {tabs.map((t) => <button key={t.id} type="button" className="ib-tab" aria-pressed={t.id === tab.id} onClick={() => setNeed(t.id)}>{t.label}<span>{t.rows.length}</span></button>)}
                  </nav>
                  <Link label={tab.go} onClick={() => onGo(needGo(tab.id))} />
                </header>
                <div className="ho-need-rows">
                  {tab.rows.slice(0, 3).map((row) => (
                    <button key={row.who} type="button" className="ho-need" onClick={() => onGo(needGo(tab.id, row.seed))}>
                      {row.seed ? <Orb seed={row.seed} size={26} /> : <span className="ho-need-ic"><Icon name={row.icon ?? 'alert'} /></span>}
                      <b>{row.who}</b><span>{row.what}</span><time>{row.when ?? ''}</time>
                    </button>
                  ))}
                </div>
              </section>
            );
          })() : project.firstEventAt ? (
            <section className="ho-needs" aria-label="What needs you"><CardEmpty icon="check" title="Nothing needs you right now" text="Emails to approve, replies and anything that needs a decision show up here." /></section>
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
