import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Globe2, Link2, Mail, Radio } from 'lucide-react';
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

const dayMs = 86_400_000;
const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const countLabel = new Intl.NumberFormat();

export function DashboardV2({ project, onSetup, onGlobe, headingRef }: {
  project: Project;
  onSetup: () => void;
  onGlobe: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const [range, setRange] = useState(7);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const counts = new Map(project.pageViews?.map(({ day, count }) => [day, count]));
  const days = Array.from({ length: range }, (_, index) => {
    const date = new Date(today - (range - index - 1) * dayMs);
    return { day: date.toISOString().slice(0, 10), label: dayLabel.format(date), count: counts.get(date.toISOString().slice(0, 10)) ?? 0 };
  });
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const peak = Math.max(1, ...days.map(({ count }) => count));
  const points = days.map(({ count }, index) => ({
    x: range === 1 ? 500 : 20 + index * 960 / (range - 1),
    y: 236 - count / peak * 208,
  }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
  const area = `${points[0].x},236 ${line} ${points[points.length - 1].x},236`;
  const hostname = new URL(project.origin).host;

  return <>
    <section className="v2-hero" aria-label="Overview">
      <div className="v2-hero-rail">
        <h1 className="sr-only" tabIndex={-1} ref={headingRef}>Dashboard</h1>
        <nav className="v2-range" aria-label="Date range in UTC">
          {[1, 7, 30].map((value) => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>
            {value === 1 ? 'Today' : `${value} days`}
          </button>)}
        </nav>
        <div className="v2-metrics omer-metrics">
          <div className="v2-m"><span className="v2-m-k">Page views</span><span className="v2-m-v"><b>{countLabel.format(total)}</b></span></div>
          <div className="v2-m"><span className="v2-m-k">Visitors</span><span className="v2-m-v"><b aria-label="Unavailable">—</b></span></div>
          <div className="v2-m"><span className="v2-m-k">Orders</span><span className="v2-m-v"><b aria-label="Unavailable">—</b></span></div>
          <div className="v2-m"><span className="v2-m-k">Emails sent</span><span className="v2-m-v"><b aria-label="Unavailable">—</b></span></div>
          <div className="v2-m"><span className="v2-m-k">Email revenue</span><span className="v2-m-v"><b aria-label="Unavailable">—</b></span></div>
        </div>
      </div>
      <figure className="omer-activity">
        <figcaption className="sr-only">Daily page views in UTC</figcaption>
        <div className="omer-plot" aria-hidden="true">
          {total > 0 && <svg className="v2-lines" viewBox="0 0 1000 240" preserveAspectRatio="none">
            <polygon className="omer-chart-fill" points={area} />
            <polyline className="v2-ln" vectorEffect="non-scaling-stroke" points={line} />
            {points.map(({ x, y }, index) => days[index].count > 0 && <circle key={days[index].day} cx={x} cy={y} r={range === 1 ? 7 : 4} className="omer-chart-point"><title>{days[index].label}: {days[index].count} page views</title></circle>)}
          </svg>}
          {total === 0 && <p>No page views in this period.</p>}
        </div>
        <div className="omer-axis" aria-hidden="true"><span>{days[0].label}</span>{range > 1 && <span>{days[days.length - 1].label}</span>}</div>
        <ul className="sr-only">{days.map(({ day, label, count }) => <li key={day}>{label}: {count} page views</li>)}</ul>
      </figure>
    </section>
    <div className="v2-rest">
      <div className="v2-row v2-two">
        <section className="v2-card">
          <header><Globe2 size={16} aria-hidden="true" /><h3>Visitor globe</h3><button className="btn btn-ghost btn-sm omer-card-action" type="button" onClick={onGlobe} aria-label="Open visitor globe"><ArrowUpRight size={16} aria-hidden="true" /></button></header>
          <div className="v2-in omer-map-card"><DottedGlobe /><p>Visitor locations aren’t collected yet.</p></div>
        </section>
        <section className="v2-card">
          <header><Link2 size={16} aria-hidden="true" /><h3>Website</h3></header>
          <div className="v2-in omer-site-card">
            <span className="status-pill received"><Radio size={14} aria-hidden="true" /> Connected</span>
            <a href={project.origin} target="_blank" rel="noreferrer">{hostname}<ArrowUpRight size={15} aria-hidden="true" /></a>
            {project.firstEventAt && <p>First event received <time dateTime={project.firstEventAt}>{new Date(project.firstEventAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>.</p>}
            <button className="btn btn-secondary btn-sm" type="button" onClick={onSetup}>Open setup</button>
          </div>
        </section>
      </div>
      <div className="v2-row v2-two">
        <section className="v2-card"><header><Activity size={16} aria-hidden="true" /><h3>Traffic sources</h3></header><div className="v2-in"><p>Referrers aren’t collected yet.</p></div></section>
        <section className="v2-card"><header><Mail size={16} aria-hidden="true" /><h3>Email revenue</h3></header><div className="v2-in"><p>Revenue appears after email and sales tracking are connected.</p></div></section>
      </div>
    </div>
  </>;
}
