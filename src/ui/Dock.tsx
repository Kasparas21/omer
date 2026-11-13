/* The kit's bottom dock (index.html #appDockHost + library.js dock hiding): a sliding highlight, and on
   scroll the whole dock squeezes on a critically damped spring into a pill with the page's icon and name. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { useThumb } from './useThumb';

export type DockItem<T extends string> = { id: T; label: string; icon: IconName; live?: boolean; count?: number };

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Dock<T extends string>({ items, current, onPick, collapsed, onReveal, onLeave }: {
  items: DockItem<T>[];
  current: T;
  onPick: (id: T) => void;
  collapsed: boolean;
  onReveal: () => void;
  onLeave?: () => void;
}) {
  const leaveTimer = useRef(0);
  const host = useRef<HTMLDivElement>(null);
  const spring = useRef({ position: 0, velocity: 0, target: 0, frame: 0 });
  // The pill moves first and the screen follows a couple of frames later: a heavy screen (the globe) can
  // block the page while it starts, and the slide should already be running on its own by then.
  const [shown, setShown] = useState(current);
  const handoff = useRef(0);
  useEffect(() => { setShown(current); }, [current]);
  useEffect(() => () => clearTimeout(handoff.current), []);
  const pick = (id: T) => {
    if (id === shown && id === current) { onPick(id); return; }
    setShown(id);
    clearTimeout(handoff.current);
    if (still()) { onPick(id); return; }
    // Live globe can stall the main thread on mount — let the dock thumb finish first.
    if (items.find((item) => item.id === id)?.live) { handoff.current = window.setTimeout(() => onPick(id), 220); return; }
    // Other screens: brief head start so the pill is already moving into the view transition.
    handoff.current = window.setTimeout(() => onPick(id), 90);
  };
  const bar = useThumb<HTMLDivElement>('.dock-item[aria-current]', shown);
  const [revealed, setRevealed] = useState(!collapsed);
  const active = items.find((item) => item.id === shown) ?? items[0];

  function move(target: number) {
    const el = host.current;
    const s = spring.current;
    if (!el) return;
    s.target = target;
    const paint = () => el.style.setProperty('--dock-collapse-progress', String(Math.max(0, Math.min(1, s.position))));
    if (still()) {
      cancelAnimationFrame(s.frame);
      Object.assign(s, { position: target, velocity: 0, frame: 0 });
      paint();
      return;
    }
    paint();
    if (s.frame || (s.position === target && s.velocity === 0)) return;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, (now - previous) / 1000);
      previous = now;
      const rate = 27;
      const distance = s.position - s.target;
      const slope = s.velocity + rate * distance;
      const decay = Math.exp(-rate * dt);
      s.position = s.target + (distance + slope * dt) * decay;
      s.velocity = (s.velocity - rate * slope * dt) * decay;
      if (Math.abs(s.position - s.target) < 0.001 && Math.abs(s.velocity) < 0.03) {
        Object.assign(s, { position: s.target, velocity: 0, frame: 0 });
      } else {
        s.frame = requestAnimationFrame(tick);
      }
      paint();
    };
    s.frame = requestAnimationFrame(tick);
  }

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    if (collapsed) {
      const dock = el.querySelector<HTMLElement>('.dock');
      const stick = el.querySelector<HTMLElement>('.dock-stick');
      if (dock && stick) {
        const { width: W, height: H } = dock.getBoundingClientRect();
        const { width: w, height: h } = stick.getBoundingClientRect();
        el.style.setProperty('--ct', `${Math.max(0, H - h)}px`);
        el.style.setProperty('--cx', `${Math.max(0, (W - w) / 2)}px`);
      }
      setRevealed(false);
      move(1);
    } else {
      setRevealed(true);
      move(0);
    }
  }, [collapsed, current]);

  useEffect(() => () => cancelAnimationFrame(spring.current.frame), []);

  return (
    <div ref={host} className={`app-dock dock-host autohide${revealed ? ' revealed' : ''}`} data-minimize="page" data-hide="scroll"
      onPointerEnter={(event) => { clearTimeout(leaveTimer.current); if (event.pointerType === 'mouse' && collapsed) onReveal(); }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse' || !onLeave) return;
        leaveTimer.current = window.setTimeout(onLeave, 450);
      }}
      onBlur={(event) => { if (onLeave && !event.currentTarget.contains(event.relatedTarget as Node)) leaveTimer.current = window.setTimeout(onLeave, 200); }}
      onFocus={(event) => { if ((event.target as HTMLElement).matches(':focus-visible') && collapsed) onReveal(); }}>
      <button className="dock-stick" type="button" aria-label={`Show navigation (${active.label})`} tabIndex={revealed ? -1 : 0} onClick={onReveal}>
        <span className="stick-ico"><Icon name={active.icon} /></span>
        <span className="stick-label">{active.label}</span>
      </button>
      <div className="dock-frame">
        <nav className="dock" aria-label="Main navigation">
          <div className="dock-bar has-thumb" ref={bar.host}>
            <span className="dock-thumb" ref={bar.thumb} aria-hidden="true" />
            {items.map(({ id, label, icon, live, count }) => (
              <button
                key={id}
                type="button"
                className={`dock-item${live ? ' live' : ''}`}
                title={label}
                aria-label={live ? `${label}, ${count ?? 0} online` : label}
                aria-current={shown === id ? 'page' : undefined}
                tabIndex={revealed ? undefined : -1}
                onClick={() => pick(id)}
              >
                <Icon name={icon} />
                {live ? <span className="count">{count ?? 0}</span> : null}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
