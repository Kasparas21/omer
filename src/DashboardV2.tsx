import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Clock3, DollarSign, FileText, Ghost, Globe2,
  Inbox, Megaphone, Radio, Send, Sparkles, Star,
} from 'lucide-react';
import type { Project } from './project';

export function DottedGlobe() {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const stage = host.current;
    if (!stage) return;
    let disposed = false;
    let globe: { destroy(): void } | undefined;
    const moduleUrl = '/globe/dotglobe.js';
    void import(/* @vite-ignore */ moduleUrl).then(async ({ createDotGlobe, preloadDotGlobe }) => {
      await preloadDotGlobe();
      if (disposed) return;
      globe = createDotGlobe(stage, { autoSpin: false, quietIntro: true, maxZoom: 1.3, radiusScale: 1.15 });
      stage.setAttribute('aria-label', 'Dotted world globe. Drag or use arrow keys to rotate it.');
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; globe?.destroy(); };
  }, []);

  return failed ? <p className="v2-map-fallback">The globe couldn’t load.</p> : <div className="v2-map-stage" ref={host} />;
}

type Metric = 'people' | 'views' | 'dwell' | 'clicked' | 'sales';
const RANGES = [1, 7, 30] as const;
const METRICS: { key: Metric; label: string; chartable: boolean }[] = [
  { key: 'people', label: 'Visitors', chartable: true },
  { key: 'views', label: 'Pageviews', chartable: true },
  { key: 'dwell', label: 'Visit duration', chartable: true },
  { key: 'clicked', label: 'Clicked', chartable: false },
  { key: 'sales', label: 'Revenue', chartable: false },
];

const dayMs = 86_400_000;
const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const tipLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const countFmt = new Intl.NumberFormat();
const moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function utcDay(ms = Date.now()) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function seriesMap(rows: { day: string; count?: number; avgMs?: number }[] | undefined, key: 'count' | 'avgMs') {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const value = key === 'avgMs' ? row.avgMs : row.count;
    map.set(row.day, Number(value ?? 0));
  }
  return map;
}

function buildSeries(range: number, end: number, map: Map<string, number>) {
  return Array.from({ length: range }, (_, index) => {
    const date = new Date(end - (range - index - 1) * dayMs);
    const day = date.toISOString().slice(0, 10);
    return { day, label: dayLabel.format(date), tip: tipLabel.format(date), value: map.get(day) ?? 0 };
  });
}

function pctChange(now: number, prev: number) {
  if (!prev) return null;
  return Math.round(((now - prev) / prev) * 100);
}

function chip(now: number, prev: number) {
  const pct = pctChange(now, prev);
  if (pct == null) return <span className="v2-chip">New</span>;
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
  return <span className={`v2-chip ${dir}`}>{pct > 0 ? '+' : ''}{pct}%</span>;
}

function formatMetric(kind: Metric, value: number) {
  if (kind === 'dwell') {
    if (value < 60_000) return `${Math.max(0, Math.round(value / 1000))}s`;
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.round((value % 60_000) / 1000);
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  if (kind === 'sales') return moneyFmt.format(value);
  if (kind === 'clicked') return `${Math.round(value)}%`;
  return countFmt.format(Math.round(value));
}

function metricSub(kind: Metric, people: number, views: number) {
  if (kind === 'people') return 'Unique people';
  if (kind === 'views') return people ? `${(views / people).toFixed(1)} per visitor` : 'No sessions yet';
  if (kind === 'dwell') return 'Avg. active time';
  if (kind === 'clicked') return 'Email not connected';
  return 'From 0 customers';
}

function smooth(values: number[]) {
  if (values.length < 3) return values.slice();
  return values.map((value, index) => {
    if (index === 0 || index === values.length - 1) return value;
    return (values[index - 1] + value * 2 + values[index + 1]) / 4;
  });
}

function pathCoords(values: number[], top: number) {
  const n = Math.max(values.length, 1);
  return values.map((value, index) => {
    const x = n === 1 ? 500 : 30 + (index / (n - 1)) * 940;
    const y = 100 - Math.min(100, (value / top) * 100);
    return { x, y };
  });
}

function curve(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function areaPath(line: string) {
  if (!line) return '';
  return `${line} L970 100 L30 100 Z`;
}

function sparkArea(values: number[], color: string) {
  const safe = values.length ? values : [0, 0];
  const top = Math.max(...safe, 1) * 1.08;
  const low = Math.min(...safe) * 0.55;
  const n = safe.length;
  const pts = safe.map((v, i) => [(i / Math.max(n - 1, 1)) * 300, 68 - ((v - low) / (top - low || 1)) * 56] as const);
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const id = `spark-${color.replace('#', '')}`;
  return (
    <svg className="v2-area" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true" style={{ ['--c' as string]: color }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="v2-fill" d={`${d} L300 80 L0 80 Z`} fill={`url(#${id})`} />
      <path className="v2-line" d={d} />
    </svg>
  );
}

function sourceLabel(name: string) {
  if (name === '(direct)') return 'Direct';
  if (name.includes('google')) return 'Google';
  if (name.includes('instagram') || name.includes('ig.')) return 'Instagram';
  if (name.includes('tiktok')) return 'TikTok';
  if (name.includes('pinterest')) return 'Pinterest';
  if (name.includes('facebook') || name === 'fb.com' || name.includes('meta')) return 'Facebook';
  return name;
}

function Card({ icon, title, children, extra, className = '' }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`v2-card ${className}`}>
      <header>{icon}<h3>{title}</h3>{extra}</header>
      <div className="v2-in">{children}</div>
    </section>
  );
}

export function DashboardV2({ project, onSetup, onGlobe, headingRef }: {
  project: Project;
  onSetup: () => void;
  onGlobe: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const [range, setRange] = useState<number>(7);
  const [metric, setMetric] = useState<Metric>('people');
  const [hover, setHover] = useState<number | null>(null);
  const hostname = useMemo(() => {
    try { return new URL(project.origin).host; } catch { return project.origin; }
  }, [project.origin]);

  const end = utcDay();
  const viewsMap = useMemo(() => seriesMap(project.pageViews, 'count'), [project.pageViews]);
  const peopleMap = useMemo(() => seriesMap(project.visitors, 'count'), [project.visitors]);
  const dwellMap = useMemo(() => seriesMap(project.dwell, 'avgMs'), [project.dwell]);

  const current = useMemo(() => ({
    views: buildSeries(range, end, viewsMap),
    people: buildSeries(range, end, peopleMap),
    dwell: buildSeries(range, end, dwellMap),
  }), [range, end, viewsMap, peopleMap, dwellMap]);

  const previous = useMemo(() => {
    const prevEnd = end - range * dayMs;
    return {
      views: buildSeries(range, prevEnd, viewsMap),
      people: buildSeries(range, prevEnd, peopleMap),
      dwell: buildSeries(range, prevEnd, dwellMap),
    };
  }, [range, end, viewsMap, peopleMap, dwellMap]);

  const totals = {
    people: current.people.reduce((sum, day) => sum + day.value, 0),
    views: current.views.reduce((sum, day) => sum + day.value, 0),
    dwell: (() => {
      const samples = current.dwell.filter((day) => day.value > 0);
      if (!samples.length) return 0;
      return samples.reduce((sum, day) => sum + day.value, 0) / samples.length;
    })(),
    clicked: 0,
    sales: 0,
  };
  const prevTotals = {
    people: previous.people.reduce((sum, day) => sum + day.value, 0),
    views: previous.views.reduce((sum, day) => sum + day.value, 0),
    dwell: (() => {
      const samples = previous.dwell.filter((day) => day.value > 0);
      if (!samples.length) return 0;
      return samples.reduce((sum, day) => sum + day.value, 0) / samples.length;
    })(),
    clicked: 0,
    sales: 0,
  };

  const chartMetric: Metric = METRICS.find((item) => item.key === metric)?.chartable ? metric : 'people';
  const nowSeries = current[chartMetric === 'dwell' ? 'dwell' : chartMetric === 'views' ? 'views' : 'people'];
  const backSeries = previous[chartMetric === 'dwell' ? 'dwell' : chartMetric === 'views' ? 'views' : 'people'];
  const nowValues = smooth(nowSeries.map((day) => day.value));
  const backValues = smooth(backSeries.map((day) => day.value));
  const top = Math.max(...nowValues, ...backValues, 1) / 0.9;
  const nowPath = curve(pathCoords(nowValues, top));
  const backPath = curve(pathCoords(backValues, top));
  const fillPath = areaPath(nowPath);
  const at = hover ?? nowSeries.length - 1;
  const sourceTotal = (project.sources ?? []).reduce((sum, row) => sum + row.count, 0) || 1;
  const pageTotal = (project.pages ?? []).reduce((sum, row) => sum + row.count, 0) || 1;
  const brandWord = project.name.trim().split(/\s+/)[0] || 'Brand';

  return <>
    <section className="v2-hero" aria-label="Overview">
      <div className="v2-hero-rail">
        <h1 className="sr-only" tabIndex={-1} ref={headingRef}>Dashboard</h1>
        <nav className="v2-range" aria-label="Date range in UTC">
          {RANGES.map((value) => (
            <button key={value} type="button" aria-pressed={range === value} onClick={() => { setRange(value); setHover(null); }}>
              {value === 1 ? 'Today' : `${value} days`}
            </button>
          ))}
        </nav>
        <div className="v2-ctrl">
          <div className="v2-head">
            <nav className="v2-metrics" aria-label="Metrics">
              {METRICS.map(({ key, label, chartable }) => (
                <button
                  key={key}
                  type="button"
                  className="v2-m"
                  data-homet={key}
                  aria-pressed={metric === key}
                  aria-label={chartable ? `Show ${label} on the graph` : `${label}`}
                  onClick={() => setMetric(key)}
                >
                  <span className="v2-m-k">{label}</span>
                  <span className="v2-m-v">
                    <b>{formatMetric(key, totals[key])}</b>
                    {chip(totals[key], prevTotals[key])}
                  </span>
                  <span className="v2-m-s">{metricSub(key, totals.people, totals.views)}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div
        className={`v2-live${range === 1 ? ' v2-day' : ''}`}
        id="v2Chart"
        tabIndex={0}
        role="img"
        aria-label={`${METRICS.find((item) => item.key === chartMetric)?.label} over ${range === 1 ? 'today' : `${range} days`}.`}
        data-metric={chartMetric}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          setHover((value) => {
            const currentIndex = value ?? nowSeries.length - 1;
            return Math.max(0, Math.min(nowSeries.length - 1, currentIndex + (event.key === 'ArrowRight' ? 1 : -1)));
          });
        }}
        onBlur={() => setHover(null)}
      >
        <div
          className="v2-plot"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
            setHover(Math.round(ratio * (nowSeries.length - 1)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <svg className="v2-lines v2-fills" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="v2Fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--v2-chart)" stopOpacity="0.18" />
                <stop offset="1" stopColor="var(--v2-chart)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="m-line" data-p="area" d={fillPath} fill="url(#v2Fill)" />
          </svg>
          <svg className="v2-lines" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="v2-ln-back m-line" data-p="back" d={backPath} />
            <path className="v2-ln m-line" data-p="done" d={nowPath} />
          </svg>
          {hover != null && (() => {
            const x = (pathCoords(nowValues, top)[at]?.x ?? 500) / 10;
            const flip = x > 60;
            return (
              <>
                <span className="v2-cross" style={{ left: `${x}%` }}>
                  <i className="v2-cross-dot was" style={{ ['--y' as string]: `${pathCoords(backValues, top)[at]?.y ?? 50}%` }} />
                  <i className="v2-cross-dot" style={{ ['--y' as string]: `${pathCoords(nowValues, top)[at]?.y ?? 50}%` }} />
                </span>
                <div className="v2-live-tip" style={{ left: `${x}%`, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
                  <div className="ho-tip-t">{nowSeries[at]?.tip}</div>
                  <div className="v2-tip-r">
                    <i style={{ ['--c' as string]: 'var(--v2-chart)' }} />
                    <span>This period</span>
                    <b>{formatMetric(chartMetric, nowSeries[at]?.value ?? 0)}</b>
                  </div>
                  <div className="v2-tip-r was">
                    <i style={{ ['--c' as string]: 'color-mix(in srgb, var(--ink) 28%, transparent)' }} />
                    <span>Earlier</span>
                    <b>{formatMetric(chartMetric, backSeries[at]?.value ?? 0)}</b>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
        <div className="v2-axis" aria-hidden="true">
          <span className="v2-ax-start" style={{ left: '3%' }}>{nowSeries[0]?.label}</span>
          {range > 1 && <span className="v2-ax-mid" style={{ left: '50%' }}>{nowSeries[Math.floor(nowSeries.length / 2)]?.label}</span>}
          <span className="now" style={{ left: '97%' }}>{nowSeries[nowSeries.length - 1]?.label}</span>
        </div>
      </div>
    </section>

    <div className="v2-rest">
      <div className="v2-row v2-two">
        <Card icon={<Ghost size={16} aria-hidden="true" />} title="Brand read" extra={<button type="button" className="ho-link" onClick={onSetup}>Setup <ArrowRight size={14} aria-hidden="true" /></button>}>
          <div className="v2-brand-read">
            <b className="v2-brand-word">{brandWord}</b>
            <p>Tracking is live on {hostname}.</p>
            <p className="v2-brand-ind">Store pulse · <em>{totals.people ? 'Receiving visitors' : 'Waiting for traffic'}</em></p>
          </div>
        </Card>
        <Card icon={<DollarSign size={16} aria-hidden="true" />} title="Email revenue">
          <div className="v2-head">
            <b className="v2-val v2-big">{moneyFmt.format(0)}</b>
            <span className="v2-chip">—</span>
          </div>
          <p className="v2-m-s v2-card-sub">From 0 customers</p>
          {sparkArea([0, 0, 0, 0, 0, 0, 0], '#12b886')}
          <p className="omer-empty-note">Connect email + sales attribution to fill this in.</p>
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon={<Clock3 size={16} aria-hidden="true" />} title="Schedule" extra={<button type="button" className="ho-link" onClick={onSetup}>Opportunities <ArrowRight size={14} aria-hidden="true" /></button>}>
          <div className="v2-sched">
            <b className="v2-val">0 <span>sends lined up</span></b>
            <ul><li><span><b>No sends yet</b><small>Campaigns land here once drafting starts.</small></span></li></ul>
          </div>
        </Card>
        <Card icon={<Send size={16} aria-hidden="true" />} title="Emails">
          <div className="v2-head">
            <b className="v2-val">0</b>
            <span className="v2-chip">—</span>
          </div>
          <p className="v2-m-s v2-card-sub">0% clicked · 0 people</p>
          {sparkArea([0, 0, 0, 0, 0, 0, 0], '#4F4BE0')}
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon={<Megaphone size={16} aria-hidden="true" />} title="Sales by campaign" className="v2-gauge-card">
          <div className="v2-gauge-wrap">
            <svg className="v2-gauge" viewBox="0 0 300 160" aria-hidden="true">
              <path d="M38 148 A112 112 0 0 1 262 148" pathLength="100" style={{ ['--c' as string]: '#d0d0db', ['--d' as string]: '0s', ['--t' as string]: '0.4s' }} />
            </svg>
            <div className="v2-gauge-mid"><span>Total from email</span><b>{moneyFmt.format(0)}</b></div>
          </div>
          <div className="v2-legend">
            <button type="button" disabled><i style={{ ['--c' as string]: '#d0d0db' }} /><span>No campaigns yet</span><small>100%</small><b>{moneyFmt.format(0)}</b></button>
          </div>
        </Card>
        <Card icon={<Star size={16} aria-hidden="true" />} title="Top products">
          <div className="v2-products">
            <div className="omer-empty-block">
              <Sparkles size={16} aria-hidden="true" />
              <p>Product attribution appears after Shopify orders sync.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="v2-row">
        <Card icon={<Activity size={16} aria-hidden="true" />} title="Sales mix" className="v2-wide" extra={<span className="v2-side">Bought before <b>{moneyFmt.format(0)}</b></span>}>
          <div className="v2-head">
            <b className="v2-val v2-big">{moneyFmt.format(0)}</b>
            <p className="v2-d"><b>—</b><span>last {range === 1 ? '24h' : `${range}d`}</span></p>
          </div>
          <div className="v2-bars-wrap">
            <div className="v2-key" aria-hidden="true">
              <span><i style={{ ['--c' as string]: '#6360F0' }} />New customers</span>
              <span><i style={{ ['--c' as string]: '#4F4BE0' }} />Bought before</span>
            </div>
            <div className="v2-bars omer-empty-bars" aria-hidden="true">
              {Array.from({ length: Math.min(range, 14) }, (_, index) => (
                <span key={index} className="v2-col" style={{ ['--i' as string]: index }}>
                  <i className="v2-new" style={{ ['--h' as string]: '8%' }} />
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon={<ArrowRight size={16} aria-hidden="true" />} title="Sources">
          {(project.sources?.length ?? 0) === 0 ? (
            <p className="omer-empty-note">Referrers show up after the first consented page views.</p>
          ) : (
            <table className="v2-stat-table">
              <thead><tr><th scope="col">Source</th><th scope="col">Visitors</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {project.sources!.map((row) => (
                  <tr key={row.name}>
                    <th scope="row"><span className="v2-stat-src"><span className="lvp-src direct" aria-hidden="true" /><span>{sourceLabel(row.name)}</span></span></th>
                    <td className="num">{countFmt.format(row.count)}</td>
                    <td className="num">{Math.round((row.count / sourceTotal) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card icon={<FileText size={16} aria-hidden="true" />} title="Pages" extra={<button type="button" className="ho-link" onClick={onGlobe}>Live <ArrowRight size={14} aria-hidden="true" /></button>}>
          {(project.pages?.length ?? 0) === 0 ? (
            <p className="omer-empty-note">Top paths appear once people start browsing.</p>
          ) : (
            <table className="v2-stat-table">
              <thead><tr><th scope="col">Page</th><th scope="col">Views</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {project.pages!.map((row) => (
                  <tr key={row.path}>
                    <th scope="row"><span className="v2-stat-src">{row.path}</span></th>
                    <td className="num">{countFmt.format(row.count)}</td>
                    <td className="num">{Math.round((row.count / pageTotal) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="v2-row v2-two">
        <Card icon={<Radio size={16} aria-hidden="true" />} title="Website">
          <div className="omer-site-card">
            <span className={`status-pill ${project.firstEventAt ? 'received' : ''}`}>
              <Radio size={14} aria-hidden="true" /> {project.firstEventAt ? 'Receiving events' : 'Waiting for install'}
            </span>
            <a href={project.origin} target="_blank" rel="noreferrer">{hostname}<ArrowUpRight size={15} aria-hidden="true" /></a>
            {project.firstEventAt
              ? <p>First event <time dateTime={project.firstEventAt}>{new Date(project.firstEventAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>.</p>
              : <p>Install the tracker and grant analytics consent to start the pulse.</p>}
            <button className="btn btn-secondary btn-sm" type="button" onClick={onSetup}>Open setup</button>
          </div>
        </Card>
        <Card icon={<Inbox size={16} aria-hidden="true" />} title="Needs you" className="v2-wide">
          <div className="omer-needs">
            <p>{project.firstEventAt
              ? 'Traffic is flowing. Email, campaigns, and geo live still need wiring — those cards stay empty until then.'
              : 'Finish install so visitors, sources, pages, and visit duration can fill in.'}</p>
            <div className="omer-needs-actions">
              <button className="btn btn-primary btn-sm" type="button" onClick={onSetup}>Open setup</button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={onGlobe}>Open live globe</button>
            </div>
          </div>
        </Card>
      </div>

      <div className="v2-row">
        <Card icon={<Globe2 size={16} aria-hidden="true" />} title="Visitor globe" extra={<button type="button" className="ho-link" onClick={onGlobe}>Open <ArrowRight size={14} aria-hidden="true" /></button>}>
          <div className="omer-map-card">
            <DottedGlobe />
            <p>Locations aren’t collected yet — globe is ready for live pins later.</p>
          </div>
        </Card>
      </div>
    </div>
  </>;
}
