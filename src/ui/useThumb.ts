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
    };
    place(placed.current);
    placed.current = true;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [key, selector, xOnly]);

  return { host, thumb };
}
