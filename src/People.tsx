import { useEffect, useState } from 'react';
import type { LiveVisit } from './LiveGlobe';

function ago(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function People({ projectId }: { projectId: string }) {
  const [visits, setVisits] = useState<LiveVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/live`, { cache: 'no-store' });
        if (!response.ok) return;
        const data: { visits: LiveVisit[] } = await response.json();
        if (!cancelled) {
          const unique = new Map<string, LiveVisit>();
          for (const visit of data.visits) {
            if (!unique.has(visit.seed)) unique.set(visit.seed, visit);
          }
          setVisits([...unique.values()]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [projectId]);

  return (
    <div className="v2-empty-screen omer-people">
      <h1>People</h1>
      <section className="v2-card">
        <header><h3>Recent visitors</h3></header>
        <div className="v2-in">
          {loading ? <p className="omer-empty-note">Loading visitors…</p> : null}
          {!loading && visits.length === 0 ? <p className="omer-empty-note">No visitors in the last day yet.</p> : null}
          {visits.length > 0 && (
            <table className="v2-stat-table">
              <thead>
                <tr>
                  <th scope="col">Place</th>
                  <th scope="col">Last page</th>
                  <th scope="col">Seen</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.seed}>
                    <th scope="row">
                      <span className="v2-stat-src">
                        {visit.cc ? <img className="flag" src={`/assets/flags/${visit.cc}.svg`} alt="" width={16} height={16} draggable={false} /> : null}
                        <span>{visit.place || visit.city || 'Unknown'}</span>
                      </span>
                    </th>
                    <td className="num">{visit.path}</td>
                    <td className="num"><time dateTime={visit.seenAt}>{ago(visit.seenAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
