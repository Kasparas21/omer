import { useEffect, useState } from 'react';

export type LiveVisit = {
  id: string;
  seed: string;
  path: string;
  referrer: string;
  cc: string | null;
  city: string | null;
  place: string | null;
  lat: number | null;
  lng: number | null;
  seenAt: string;
  activeAt: string;
  email?: string | null;
  name?: string | null;
  revenue?: number;
};

export type LivePayload = {
  online: number;
  minutes: number[];
  sources: { name: string; count: number; orders?: number }[];
  visits: LiveVisit[];
};

export const emptyLive: LivePayload = { online: 0, minutes: Array(60).fill(0), sources: [], visits: [] };
export const ONLINE_MS = 45_000;
export const isOnline = (visit: LiveVisit, now = Date.now()) => {
  if (!visit.activeAt) return false;
  const at = Date.parse(visit.activeAt);
  return Number.isFinite(at) && now - at < ONLINE_MS;
};

export function useLive(projectId?: string) {
  const [snapshot, setSnapshot] = useState<{ id: string; data: LivePayload; failed: boolean }>();
  useEffect(() => {
    if (!projectId) return;
    const id = projectId;
    const controller = new AbortController();
    const endpoint = `/api/projects/${id}/live`;
    let stream: EventSource | undefined;
    let connected = false;
    let pending = false;
    let needsRefresh = false;
    let timer: number | undefined;

    async function refresh() {
      if (controller.signal.aborted || document.hidden) return;
      if (pending) { needsRefresh = true; return; }
      pending = true;
      try {
        const res = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (res.status === 401) window.dispatchEvent(new Event('session-expired'));
        if (!res.ok) throw new Error('Live unavailable');
        const data: LivePayload = await res.json();
        if (!controller.signal.aborted) setSnapshot({ id, data, failed: false });
      } catch {
        if (!controller.signal.aborted) setSnapshot((old) => ({ id, data: old?.id === id ? old.data : emptyLive, failed: true }));
      } finally {
        pending = false;
        if (needsRefresh) { needsRefresh = false; schedule(); }
      }
    }

    function schedule() {
      if (timer != null || controller.signal.aborted) return;
      timer = window.setTimeout(() => { timer = undefined; void refresh(); }, 160);
    }

    function syncVisibility() {
      if (document.hidden) {
        stream?.close(); stream = undefined; connected = false;
        return;
      }
      if (!stream && typeof EventSource !== 'undefined') {
        stream = new EventSource(`${endpoint}/stream`);
        stream.addEventListener('ready', () => { connected = true; schedule(); });
        stream.addEventListener('activity', schedule);
        stream.onerror = () => { connected = false; schedule(); };
      }
      schedule();
    }

    let ticks = 0;
    const fallback = window.setInterval(() => {
      // Also refresh on an idle stream so inactive visitors age out.
      if (!document.hidden && (!connected || ++ticks % 5 === 0)) schedule();
    }, 4000);
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    return () => {
      controller.abort();
      stream?.close();
      clearInterval(fallback);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [projectId]);
  const current = snapshot?.id === projectId ? snapshot : undefined;
  return { data: current?.data ?? emptyLive, loading: !current, failed: current?.failed ?? false };
}
