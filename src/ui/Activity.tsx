import { useMemo } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ActivityHeatmap({
  weeks = 22,
  events = {},
  unit = 'visit',
  units = 'visits',
}: {
  weeks?: number;
  events?: Record<string, number>;
  unit?: string;
  units?: string;
}) {
  const { counts, total, months } = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const dow = (end.getDay() + 6) % 7;
    const start = new Date(end);
    start.setDate(end.getDate() - dow - (weeks - 1) * 7);
    const list: { d: Date; c: number; ago: number; n: number }[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ago = Math.round((end.getTime() - d.getTime()) / 864e5);
      list.push({ d, c: ago < 0 ? -1 : (events[String(ago)] ?? 0), ago, n: i });
    }
    const max = Math.max(1, ...list.map((x) => x.c));
    let monthsHtml: { col: number; label: string }[] = [];
    let lastCol = -9;
    for (let w = 0; w < weeks; w++) {
      const first = list[w * 7].d;
      const prev = w ? list[(w - 1) * 7].d : null;
      if ((!prev || first.getMonth() !== prev.getMonth()) && w - lastCol > 2 && w < weeks - 1) {
        monthsHtml.push({ col: w + 1, label: MONTHS[first.getMonth()] });
        lastCol = w;
      }
    }
    return {
      counts: list.map((x) => ({
        ...x,
        level: x.c <= 0 ? 0 : x.c >= 4 ? 4 : x.c >= 3 ? 3 : x.c >= 2 ? 2 : x.c >= 1 ? 1 : 0,
        tip: x.c > 0
          ? `${x.c} ${x.c === 1 ? unit : units} on ${x.d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
          : `No ${units} on ${x.d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`,
        max,
      })),
      total: list.reduce((s, x) => s + Math.max(0, x.c), 0),
      months: monthsHtml,
    };
  }, [events, unit, units, weeks]);

  return (
    <div className="activity" style={{ ['--weeks' as string]: weeks }} role="img" aria-label={`${total} ${total === 1 ? unit : units} in the last ${weeks} weeks`}>
      <div className="act-months" aria-hidden="true">
        {months.map((m) => <span key={m.col} style={{ gridColumn: `${m.col} / span 3` }}>{m.label}</span>)}
      </div>
      <div className="act-days" aria-hidden="true"><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span /></div>
      <div className="act-grid">
        {counts.map((x) => (x.c < 0
          ? <i key={x.n} className="fut" />
          : <i key={x.n} data-l={x.level} className={x.ago === 0 ? 'today' : undefined} style={{ ['--n' as string]: x.n }} title={x.tip} data-tip={x.tip} />
        ))}
      </div>
      <div className="act-foot" hidden>
        <span className="act-legend" aria-hidden="true">Less<i data-l="0" /><i data-l="1" /><i data-l="2" /><i data-l="3" /><i data-l="4" />More</span>
      </div>
    </div>
  );
}
