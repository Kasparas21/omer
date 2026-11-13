/* Toasts, as in the kit: a pill above the dock, newest in front, gone after 4s (paused while hovered). */
import { useSyncExternalStore } from 'react';
import { Icon } from './Icon';

type Toast = { id: number; msg: string; kind: 'ok' | 'info' | 'warn'; undo?: () => void; out?: boolean };
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let hovering = false;

export function toast(msg: string, opts: { undo?: () => void; kind?: Toast['kind'] } = {}) {
  const t: Toast = { id: Date.now() + Math.random(), msg, kind: opts.kind ?? 'ok', undo: opts.undo };
  toasts = [...toasts, t].slice(-6);
  emit();
  const close = () => {
    if (hovering) { window.setTimeout(close, 800); return; }
    dismiss(t.id);
  };
  window.setTimeout(close, 4000);
}
function dismiss(id: number) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, out: true } : t));
  emit();
  window.setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 220);
}

export function Toasts() {
  const list = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => toasts);
  const live = list.filter((t) => !t.out);
  return (
    <div className="toasts" role="status" aria-live="polite" onPointerEnter={() => { hovering = true; }} onPointerLeave={() => { hovering = false; }}>
      {list.map((t) => {
        const i = live.length - 1 - live.indexOf(t);
        return (
          <div key={t.id} className={`toast${t.out ? ' out' : ''}`} data-i={t.out ? undefined : i} style={{ ['--i' as string]: i }}>
            <Icon name={t.kind === 'info' ? 'info' : t.kind === 'warn' ? 'alert' : 'check'} className={t.kind === 'ok' ? undefined : t.kind} />
            <span>{t.msg}</span>
            {t.undo ? <button className="toast-undo" type="button" onClick={() => { t.undo?.(); dismiss(t.id); }}>Undo</button> : null}
          </div>
        );
      })}
    </div>
  );
}
