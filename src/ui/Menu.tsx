/* A button that opens a small menu (the kit's popover + menu). Closes on pick, outside click or Escape. */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem = { label: ReactNode; onPick: () => void; danger?: boolean } | 'sep';

export function Menu({ trigger, items, head, align = 'right' }: {
  trigger: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean }) => ReactNode;
  items: MenuItem[];
  head?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    root.current?.querySelector<HTMLElement>('.menu-item')?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="popover-anchor" ref={root}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      <div className={`popover${align === 'right' ? ' right' : ''}${open ? ' open' : ''}`} inert={!open || undefined}>
        <div className="menu" role="menu">
          {head ? <div className="menu-head">{head}</div> : null}
          {items.map((item, i) => item === 'sep'
            ? <div key={i} className="menu-sep" />
            : <button key={i} type="button" role="menuitem" className={`menu-item${item.danger ? ' danger' : ''}`} onClick={() => { setOpen(false); item.onPick(); }}>{item.label}</button>)}
        </div>
      </div>
    </div>
  );
}
