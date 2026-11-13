/* The shelf's store switcher: favicon when the site has one, otherwise a clear letter mark.
   Never show a generic third-party "globe" placeholder. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { DEMO_ORIGIN } from '../demo';

const DOTS = ['#C8471F', '#6360F0', '#0d9488', '#d97706', '#db2777', '#2563eb'];

/** Each store keeps the same fallback colour wherever it shows. */
export function storeColor(id: string, origin?: string) {
  if (origin === DEMO_ORIGIN) return '#C8471F'; // the kit's Pawsome orange
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DOTS[h % DOTS.length];
}

const hostOf = (origin: string) => { try { return new URL(origin).host; } catch { return origin; } };

function initialOf(name: string, origin: string) {
  const fromName = name.trim().replace(/^[^A-Za-z0-9]+/, '').charAt(0);
  if (fromName) return fromName.toUpperCase();
  const host = hostOf(origin).replace(/^www\./, '');
  return (host.charAt(0) || '?').toUpperCase();
}

/** Prefer the store's own icon files. Skip Google — it often returns a generic globe. */
function iconCandidates(origin: string) {
  try {
    const base = new URL(origin);
    return [
      new URL('/apple-touch-icon.png', base).href,
      new URL('/apple-touch-icon-precomposed.png', base).href,
      new URL('/favicon-32x32.png', base).href,
      new URL('/favicon.png', base).href,
      new URL('/favicon.ico', base).href,
      new URL('/favicon.svg', base).href,
    ];
  } catch {
    return [];
  }
}

function LetterMark({ id, origin, name, size }: {
  id: string;
  origin: string;
  name: string;
  size: 'shelf' | 'menu';
}) {
  const color = storeColor(id, origin);
  return (
    <span
      className={size === 'shelf' ? 'app-shelf-mark' : 'app-site-mark'}
      aria-hidden="true"
      style={{ ['--c' as string]: color }}
    >
      {initialOf(name, origin)}
    </span>
  );
}

/** Site mark: real favicon when it loads cleanly, otherwise a letter mark that always looks intentional. */
function SiteMark({ id, origin, name, size = 'shelf' }: {
  id: string;
  origin: string;
  name: string;
  size?: 'shelf' | 'menu';
}) {
  const candidates = useMemo(() => iconCandidates(origin), [origin]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(candidates.length === 0);
  const src = !failed && candidates[index] ? candidates[index] : '';

  useEffect(() => {
    setIndex(0);
    setFailed(candidates.length === 0);
  }, [candidates]);

  const advance = () => {
    setIndex((current) => {
      if (current + 1 >= candidates.length) return current;
      return current + 1;
    });
    setFailed((was) => {
      // If we're already on the last candidate, give up after this failure.
      return was || index + 1 >= candidates.length;
    });
  };

  if (failed || !src) {
    return <LetterMark id={id} origin={origin} name={name} size={size} />;
  }

  return (
    <span className={size === 'shelf' ? 'app-shelf-favicon' : 'app-site-favicon'} aria-hidden="true">
      <img
        key={src}
        src={src}
        alt=""
        width={size === 'shelf' ? 16 : 18}
        height={size === 'shelf' ? 16 : 18}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={advance}
        onLoad={(event) => {
          const img = event.currentTarget;
          // Tiny / empty responses are almost always placeholders — keep trying or fall back.
          if (img.naturalWidth > 0 && img.naturalWidth < 12) advance();
        }}
      />
    </span>
  );
}

export function ProjectMenu({ projects, current, onPick, onAdd }: {
  projects: { id: string; name: string; origin: string }[];
  current?: string;
  onPick: (id: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const active = projects.find((p) => p.id === current) ?? projects[0];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);

  if (!active) return null;
  const choose = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <div className="popover-anchor app-shelf-site" ref={root}>
      <button ref={button} type="button" className="app-shelf-brand" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Current project: ${active.name}`} onClick={() => setOpen((v) => !v)}>
        <SiteMark id={active.id} origin={active.origin} name={active.name} size="shelf" />
        <span className="app-shelf-name">{active.name}</span>
        <Icon name="updown" className="app-shelf-chev" />
      </button>
      <div className={`popover${open ? ' open' : ''}`} role="menu" aria-label="Projects"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('.popover .menu-item') ?? [])];
          const at = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }}>
        <div className="menu">
          {projects.map((p) => (
            <button key={p.id} type="button" className="menu-item app-site-opt" role="menuitemradio" aria-checked={p.id === active.id}
              tabIndex={open ? 0 : -1} onClick={() => choose(() => onPick(p.id))}>
              <SiteMark id={p.id} origin={p.origin} name={p.name} size="menu" />
              <span><b>{p.name}</b><small>{hostOf(p.origin)}</small></span>
            </button>
          ))}
          <div className="menu-sep" />
          <button type="button" className="menu-item" role="menuitem" tabIndex={open ? 0 : -1} onClick={() => choose(onAdd)}>
            <Icon name="plus" />Add a store
          </button>
        </div>
      </div>
    </div>
  );
}
