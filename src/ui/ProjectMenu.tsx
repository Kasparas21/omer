/* The shelf's store switcher, like the kit's: a pill (dot, name, ⇕) that opens a menu of stores
   with their domains, a check on the current one, and "Add a store" at the bottom. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const DOTS = ['#C8471F', '#6360F0', '#0d9488', '#d97706', '#db2777', '#2563eb'];

/** Each store keeps the same dot colour wherever it shows. */
export function storeColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DOTS[h % DOTS.length];
}

const host = (origin: string) => { try { return new URL(origin).host; } catch { return origin; } };

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
        <span className="app-shelf-dot" aria-hidden="true" style={{ ['--c' as string]: storeColor(active.id) }} />
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
              <span className="app-site-dot" style={{ ['--c' as string]: storeColor(p.id) }} />
              <span><b>{p.name}</b><small>{host(p.origin)}</small></span>
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
