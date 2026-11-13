/* Results: what follow-up email earned, laid out like the UI kit's Results page.
   Real projects read their own sales, orders, clicks and campaigns; the demo store uses the kit's example numbers. */
import { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { Area, Card } from './DashboardV2';
import type { DayCount, Project } from './project';
import { RESULT_CAMPAIGNS, NOT_SENT, SAID_NO } from './storeData';

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-US');
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const DAY = 86_400_000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const noise = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };

type Series = { sales: number[]; orders: number[]; sent: number[]; clicked: number[]; written: number[] };

/** 60 days of demo numbers, shaped like the kit (weekday rhythm plus a mid-period lift). */
function demoSeries(): Series {
  const n = 60;
  const sent = Array.from({ length: n }, (_, i) => Math.round(760 + 260 * Math.sin(i * 0.9) + 220 * noise(i, 3) + (i > 40 ? 120 : 0)));
  const clicked = sent.map((s, i) => Math.round(s * (0.42 + 0.08 * noise(i, 4))));
  const orders = clicked.map((c, i) => Math.round(c * (0.42 + 0.2 * noise(i, 5))));
  const sales = orders.map((o, i) => Math.round(o * (38 + 8 * noise(i, 6))));
  const written = sent.map((s, i) => Math.round(s * (1.08 + 0.04 * noise(i, 7))));
  return { sales, orders, sent, clicked, written };
}
const DEMO = demoSeries();

function lastDays(rows: DayCount[] | undefined, n: number) {
  const map = new Map((rows ?? []).map((r) => [r.day.slice(0, 10), r.count]));
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return Array.from({ length: n }, (_, i) => map.get(new Date(today - (n - 1 - i) * DAY).toISOString().slice(0, 10)) ?? 0);
}

function series(project: Project, demo: boolean, n: number): { now: Series; prev: Series } {
  if (demo) {
    const cut = (from: number, to: number) => Object.fromEntries(Object.entries(DEMO).map(([k, v]) => [k, v.slice(from, to)])) as Series;
    return { now: cut(60 - n, 60), prev: cut(60 - 2 * n, 60 - n) };
  }
  const pick = (m: number, end: number) => {
    const at = (rows?: DayCount[]) => lastDays(rows, m).slice(0, end);
    const clicked = at(project.clicked);
    const opens = at(project.emailOpens);
    return { sales: at(project.sales), orders: at(project.orders), clicked, sent: opens, written: opens };
  };
  const both = pick(2 * n, 2 * n);
  const cut = (from: number, to: number) => Object.fromEntries(Object.entries(both).map(([k, v]) => [k, v.slice(from, to)])) as Series;
  return { now: cut(n, 2 * n), prev: cut(0, n) };
}

function Delta({ now, prev, range }: { now: number; prev: number; range: number }) {
  if (!prev && !now) return <span className="rs-sub">last {range}d</span>;
  const pct = prev ? Math.round(((now - prev) / prev) * 100) : 100;
  const up = pct >= 0;
  return <span className="rs-sub"><b className={up ? 'up' : 'down'}>{up ? '▲' : '▼'} {up ? '+' : ''}{pct}%</b> last {range}d</span>;
}

export function Results({ project, demo }: { project: Project; demo: boolean }) {
  const [range, setRange] = useState<Range>(14);
  const [inView, setIn] = useState(false);
  useEffect(() => { setIn(false); const t = requestAnimationFrame(() => requestAnimationFrame(() => setIn(true))); return () => cancelAnimationFrame(t); }, [range]);

  const { now, prev } = series(project, demo, range);
  const t = { sales: sum(now.sales), orders: sum(now.orders), sent: sum(now.sent), clicked: sum(now.clicked), written: sum(now.written) };
  const p = { sales: sum(prev.sales), orders: sum(prev.orders), sent: sum(prev.sent) };
  const minutes = (sent: number[]) => sent.map((s) => s * 3.3 / 60);
  const hours = Math.round(sum(minutes(now.sent)));
  const clickRate = t.sent ? Math.round((t.clicked / t.sent) * 100) : 0;
  const buyRate = t.clicked ? Math.round((t.orders / t.clicked) * 100) : 0;
  const perEmail = t.orders ? Math.max(1, Math.round(t.sent / t.orders)) : 0;
  const topOrders = Math.max(...now.orders, 1);
  const topSales = Math.max(...now.sales, 1);
  const today = Date.now();
  const axis = [0, Math.floor((range - 1) / 2), range - 1].map((i) => (i === range - 1 ? 'Today' : dayFmt.format(new Date(today - (range - 1 - i) * DAY))));

  const campaigns = demo
    ? RESULT_CAMPAIGNS.map((c) => { const sent = Math.round(t.sent * c.sent); const bought = Math.round(sent * c.bought); return { name: c.name, why: c.why, sent, bought, sales: Math.round(t.sales * c.sent) }; })
    : (project.campaigns ?? []).map((c) => ({ name: c.name, why: '', sent: 0, bought: c.count, sales: c.revenue }));
  const funnel = [
    { k: 'Written', v: t.written },
    { k: 'Sent', v: t.sent, rate: t.written ? Math.round((t.sent / t.written) * 100) : 0 },
    { k: 'Clicked', v: t.clicked, rate: clickRate },
    { k: 'Bought', v: t.orders, rate: buyRate },
  ];
  const topFunnel = Math.max(t.written, 1);

  return (
    <div className={`rs-screen v2${inView ? ' is-in' : ''}`}>
      <header className="rs-top">
        <h1 className="v2-title">Results</h1>
        <div className="seg rs-seg" role="group" aria-label="Date range">
          {RANGES.map((r) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>Last {r} days</button>)}
        </div>
      </header>

      <div className="rs-grid">
        <Card icon="dollar" title="Sales from email" className="rs-stat">
          <b className="rs-big">{money.format(t.sales)}</b>
          <span className="rs-line"><Delta now={t.sales} prev={p.sales} range={range} /><span className="rs-sub"> · {t.sales - p.sales >= 0 ? '+' : '−'}{money.format(Math.abs(t.sales - p.sales))}</span></span>
          <div className="rs-chart"><Area values={now.sales} color="var(--accent)" /></div>
        </Card>
        <Card icon="cart" title="Orders" className="rs-stat">
          <b className="rs-big">{num.format(t.orders)}</b>
          <span className="rs-line"><Delta now={t.orders} prev={p.orders} range={range} />{perEmail ? <span className="rs-sub"> · 1 in {perEmail} emails</span> : null}</span>
          <div className="rs-chart rs-spikes" aria-hidden="true">{now.orders.map((o, i) => <i key={i} style={{ ['--h' as string]: `${(o / topOrders) * 100}%`, ['--i' as string]: i }} />)}</div>
        </Card>
        <Card icon="send" title="Emails sent" className="rs-stat">
          <b className="rs-big">{num.format(t.sent)}</b>
          <span className="rs-line"><Delta now={t.sent} prev={p.sent} range={range} /><span className="rs-sub"> · {clickRate}% clicked</span></span>
          <div className="rs-chart"><Area values={now.sent} color="var(--accent)" /></div>
        </Card>
        <Card icon="clock" title="Time saved" className="rs-stat">
          <b className="rs-big">{num.format(hours)}h</b>
          <span className="rs-line"><Delta now={t.sent} prev={p.sent} range={range} /><span className="rs-sub"> · vs by hand</span></span>
          <div className="rs-chart"><Area values={minutes(now.sent)} color="#10b981" /></div>
        </Card>
      </div>
      <p className="rs-note"><Icon name="info" />Counts anyone who bought within 7 days of clicking an email. Some of them might have bought anyway.</p>

      <div className="rs-pair">
        <Card icon="chart" title="Sales per day" className="rs-days">
          <div className="rs-bars" aria-label={`Sales per day, last ${range} days`} role="img">
            {now.sales.map((s, i) => <i key={i} title={money.format(s)} style={{ ['--h' as string]: `${(s / topSales) * 100}%`, ['--i' as string]: i }} />)}
          </div>
          <div className="rs-axis">{axis.map((a) => <span key={a}>{a}</span>)}</div>
        </Card>
        <Card icon="pulse" title="From written to bought" className="rs-funnel">
          {funnel.map((f) => (
            <div key={f.k} className="rs-f">
              <div className="rs-f-h"><span>{f.k}{f.rate !== undefined ? <small>{f.rate}%</small> : null}</span><b>{num.format(f.v)}</b></div>
              <span className="rs-f-bar" style={{ ['--w' as string]: `${Math.max(3, (f.v / topFunnel) * 100)}%` }} />
            </div>
          ))}
        </Card>
      </div>

      <Card icon="megaphone" title="Which emails made money" className="rs-table-card">
        {campaigns.length ? (
          <div className="rs-table" role="table" aria-label="Sales by campaign">
            <div className="rs-tr rs-th" role="row"><span role="columnheader">Campaign</span><span role="columnheader">Sent</span><span role="columnheader">Bought</span><span role="columnheader">Sales</span></div>
            {campaigns.map((c) => (
              <div key={c.name} className="rs-tr" role="row">
                <span role="cell"><b>{c.name}</b>{c.why ? <small>{c.why}</small> : null}</span>
                <span role="cell">{c.sent ? num.format(c.sent) : '—'}</span>
                <span role="cell">{num.format(c.bought)}</span>
                <span role="cell" className="rs-money">{money.format(c.sales)}</span>
              </div>
            ))}
          </div>
        ) : <p className="ho-empty">No campaign sales yet. Sales from follow-up emails show up here.</p>}
      </Card>

      {demo && (
        <div className="rs-pair even">
          <Card icon="pause" title="Why emails didn’t go out" className="rs-list">
            {NOT_SENT.map(([k, share]) => <div key={k} className="rs-li"><span>{k}</span><b>{num.format(Math.round(t.written * share))}</b></div>)}
          </Card>
          <Card icon="x" title="People who said no" className="rs-list">
            {SAID_NO.map(([k, share]) => <div key={k} className="rs-li"><span>{k}</span><b>{num.format(Math.round(t.sent * share))}</b></div>)}
          </Card>
        </div>
      )}
    </div>
  );
}
