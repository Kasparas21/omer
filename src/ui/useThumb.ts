/* The kit's sliding highlight (kit.js placeDockThumb): one pill glides to whichever child is current.
   The thumb is rendered by React (pass `thumb` to a <span>); this hook only measures and moves it. */
import { useLayoutEffect, useRef } from 'react';

export function useThumb<T extends HTMLElement>(selector: string, key: unknown, xOnly = false) {
  const host = useRef<T>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const bar = host.current;
    const t = thumb.current;
    if (!bar || !t) return;
    const place = (move: boolean) => {
      const on = bar.querySelector<HTMLElement>(selector);
      if (!on || !on.offsetWidth) { t.style.opacity = '0'; t.dataset.off = '1'; return; }
      if (t.dataset.off) { move = false; delete t.dataset.off; }
      if (!move) t.classList.add('no-anim');
      t.classList.toggle('live', on.classList.contains('live'));
      t.style.opacity = '1';
      t.style.width = `${on.offsetWidth}px`;
      // .seg-thumb is pinned top/bottom in CSS and only slides sideways (kit placeThumb).
      if (xOnly) t.style.transform = `translateX(${on.offsetLeft}px)`;
      else {
        t.style.height = `${on.offsetHeight}px`;
        t.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      }
      if (!move) { void t.offsetWidth; t.classList.remove('no-anim'); }
      else { t.classList.remove('is-moving'); void t.offsetWidth; t.classList.add('is-moving'); }
    };
    place(placed.current);
    placed.current = true;
    // ResizeObserver reports once as soon as it starts watching; placing again then would cancel the slide
    // that just began. Later reports are real size changes (a count appearing), so follow those smoothly.
    let first = true;
    const observer = new ResizeObserver(() => { if (first) { first = false; return; } place(true); });
    observer.observe(bar);
    return () => observer.disconnect();
  }, [key, selector, xOnly]);

  return { host, thumb };
}
