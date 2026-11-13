/* Upload dropzone: a white card that takes files dropped on it (or picked). When files land, the card turns
   into a list of rows that fill up and tick off, then hands the files over and resets. Files over the limit
   are refused with a shake and a reason instead of being added. */
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Icon } from './Icon';

type Row = { key: string; name: string; size: number; ext: string; progress: number; state: 'loading' | 'done' | 'refused' };

const fmtSize = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const extOf = (name: string) => (name.split('.').pop() ?? '').slice(0, 4).toUpperCase() || 'FILE';
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Uploader({ accept, multiple = false, maxMb = 10, title, hint, onFiles, compact = false, tone = 'light', className = '' }: {
  accept: string;
  multiple?: boolean;
  maxMb?: number;
  title: string;
  /** An optional second line under the title. */
  hint?: string | false;
  onFiles: (files: File[]) => void;
  /** A slim one-line strip instead of the full card. */
  compact?: boolean;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [shake, setShake] = useState(false);
  const frame = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); timers.current.forEach(clearTimeout); }, []);

  function take(list: File[]) {
    const files = multiple ? list : list.slice(0, 1);
    if (!files.length) return;
    const ok = files.filter((f) => f.size <= maxMb * 1_048_576);
    const next: Row[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}`, name: f.name, size: f.size, ext: extOf(f.name), progress: 0,
      state: f.size > maxMb * 1_048_576 ? 'refused' : 'loading',
    }));
    setRows(next);
    if (ok.length < files.length) { setShake(true); timers.current.push(window.setTimeout(() => setShake(false), 450)); }
    // Files stay on this device until server storage lands, so "uploading" is quick; the bar still shows it.
    const start = performance.now();
    const length = still() ? 0 : 650 + Math.min(600, ok.reduce((n, f) => n + f.size, 0) / 40_000);
    const tick = (now: number) => {
      const t = length ? Math.min(1, (now - start) / length) : 1;
      const eased = 1 - (1 - t) ** 3;
      setRows((current) => current.map((r) => (r.state === 'refused' ? r : { ...r, progress: Math.round(eased * 100), state: t >= 1 ? 'done' : 'loading' })));
      if (t < 1) { frame.current = requestAnimationFrame(tick); return; }
      if (ok.length) onFiles(ok);
      timers.current.push(window.setTimeout(() => setRows([]), ok.length === files.length ? 900 : 2600));
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  }

  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); take([...e.dataTransfer.files]); };
  const busy = rows.length > 0;

  return (
    <div
      className={`upz${compact ? ' upz-compact' : ''}${tone === 'dark' ? ' upz-dark' : ''}${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}${shake ? ' is-shake' : ''} ${className}`.trim()}
      onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={drop}
    >
      {busy ? (
        <ul className="upz-rows" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key} className={`upz-row is-${r.state}`}>
              <span className="upz-file" aria-hidden="true"><Icon name="file" /><i data-ext={r.ext}>{r.ext}</i></span>
              <span className="upz-meta">
                <b>{r.name}</b>
                <small>{r.state === 'refused' ? `Too big · up to ${maxMb} MB` : `${fmtSize(r.size)} · ${r.state === 'done' ? 'Added' : `${r.progress}%`}`}</small>
                {r.state !== 'refused' ? <span className="upz-bar"><span style={{ width: `${r.progress}%` }} /></span> : null}
              </span>
              <span className={`upz-state is-${r.state}`} aria-hidden="true"><Icon name={r.state === 'refused' ? 'x' : 'check'} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <button type="button" className="upz-idle" onClick={() => input.current?.click()}>
          <span className="upz-ic"><Icon name="upload" /></span>
          <span className="upz-copy"><b>{title}</b>{hint ? <small>{hint}</small> : null}</span>
        </button>
      )}
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; take(files); }} />
    </div>
  );
}
