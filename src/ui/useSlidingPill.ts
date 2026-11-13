/* One white pill that slides to the chosen tab instead of jumping. Put the returned ref on a tab group whose
   chosen button has aria-pressed="true" (or aria-selected); pass what changes the choice as `active`. */
import { useEffect, useLayoutEffect, useRef } from 'react';

function place(box: HTMLElement, animate: boolean) {
  const on = box.querySelector<HTMLElement>(':scope > [aria-pressed="true"], :scope > [aria-selected="true"]');
  if (!on) { box.classList.remove('has-pill'); return; }
  if (!animate) box.classList.add('pill-still');
  // Measured against the group's own padding box, so it is right before and after the group is positioned.
  const outer = box.getBoundingClientRect();
  const inner = on.getBoundingClientRect();
  box.style.setProperty('--pill-x', `${inner.left - outer.left - box.clientLeft}px`);
  box.style.setProperty('--pill-y', `${inner.top - outer.top - box.clientTop}px`);
  box.style.setProperty('--pill-w', `${inner.width}px`);
  box.style.setProperty('--pill-h', `${inner.height}px`);
  box.style.setProperty('--pill-r', getComputedStyle(on).borderRadius || '99px');
  box.classList.add('has-pill');
  if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('pill-still')));
}

export function useSlidingPill<T extends HTMLElement>(active: unknown) {
  const ref = useRef<T>(null);
  const placed = useRef(false);
  // The choice changed: slide (the very first placement just appears).
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    place(box, placed.current);
    placed.current = true;
  }, [active]);
  // Counts and fonts change widths after the first paint; follow them without animating.
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    let first = true;
    const resize = new ResizeObserver(() => { if (first) { first = false; return; } place(box, false); });
    resize.observe(box);
    return () => resize.disconnect();
  }, [active === undefined]);
  return ref;
}
