/* The kit's own dropdown (public/ui/kit.js enhanceSelect) as a React listbox: no native select menu.
   The open list is drawn at the top of the app, next to its button, so no card or dialog can clip it. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export type Option = { value: string; label: string };

export function Dropdown({ value, options, onChange, label, className = '', align = 'start', previewFont = false }: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  label: string;
  className?: string;
  /** 'end' opens the list from the right edge (kit: `.vl-refine .dd:has(#vlCountry, #vlSort) .dd-list`). */
  align?: 'start' | 'end';
  /** Show each option (and the closed value) in that font family — for brand font pickers. */
  previewFont?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  const selected = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => { setHost(root.current?.closest<HTMLElement>('.app') ?? document.body); }, []);

  /** Sit the list under (or over) the button, inside the window. */
  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    const el = list.current;
    if (!rect || !el) return;
    const h = el.offsetHeight;
    const w = Math.max(el.offsetWidth, rect.width);
    const goUp = innerHeight - rect.bottom < h + 12 && rect.top > h + 12;
    setUp(goUp);
    const left = Math.min(Math.max(12, align === 'end' ? rect.right - w : rect.left), innerWidth - w - 12);
    setPos({ position: 'fixed', left, minWidth: rect.width, ...(goUp ? { top: 'auto', bottom: innerHeight - rect.top + 6 } : { top: rect.bottom + 6, bottom: 'auto' }) });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const t = event.target as Node;
      if (!root.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const move = (event: Event) => { if (!list.current?.contains(event.target as Node)) place(); };
    document.addEventListener('pointerdown', close);
    addEventListener('scroll', move, true);
    addEventListener('resize', move);
    list.current?.querySelectorAll<HTMLButtonElement>('.dd-opt')[selected]?.focus({ preventScroll: true });
    return () => { document.removeEventListener('pointerdown', close); removeEventListener('scroll', move, true); removeEventListener('resize', move); };
  }, [open]);

  function pick(index: number) {
    const next = options[index];
    if (next && next.value !== value) onChange(next.value);
    setOpen(false);
    button.current?.focus();
  }

  function onListKey(event: KeyboardEvent<HTMLSpanElement>) {
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('.dd-opt') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (index: number) => { event.preventDefault(); items[(index + items.length) % items.length]?.focus(); };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); }
    else if (event.key === 'Tab') setOpen(false);
  }

  return (
    <span ref={root} className={`dd${open ? ' open' : ''}${up ? ' up' : ''}${align === 'end' ? ' dd-end' : ''} ${className}`.trim()}>
      <button
        ref={button}
        type="button"
        className="dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${options[selected]?.label ?? ''}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); }
        }}
      >
        <span className="dd-value" style={previewFont && options[selected]?.value ? { fontFamily: `"${options[selected].value}", system-ui` } : undefined}>{options[selected]?.label}</span>
        <Icon name="chevronDown" />
      </button>
      {host ? createPortal(
      <span ref={list} className={`dd-list menu dd-float${open ? ' open' : ''}${up ? ' up' : ''} ${className.split(/\s+/).filter(Boolean).map((c) => `${c}-list`).join(' ')}`.trim()}
        style={pos} role="listbox" id={id} tabIndex={-1} aria-label={label} onKeyDown={onListKey}>
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            className="menu-item dd-opt"
            role="option"
            tabIndex={-1}
            aria-selected={index === selected}
            onClick={() => pick(index)}
          >
            <span className="dd-text"><span style={previewFont && option.value ? { fontFamily: `"${option.value}", system-ui` } : undefined}>{option.label}</span></span>
          </button>
        ))}
      </span>, host) : null}
    </span>
  );
}
