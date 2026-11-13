/* Quiet screen swaps via the View Transitions API. Falls back to an instant update. */
import { flushSync } from 'react-dom';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type TransitionStart = {
  (update: () => void): { finished: Promise<void> };
  (opts: { update: () => void; types?: string[] }): { finished: Promise<void> };
};

function starter(): TransitionStart | undefined {
  return (document as Document & { startViewTransition?: TransitionStart }).startViewTransition;
}

/** Run a React state update inside a view transition when the browser allows it. */
export function runViewTransition(update: () => void, types: string[] = ['page']) {
  if (still()) {
    update();
    return;
  }
  const start = starter();
  if (!start) {
    update();
    return;
  }
  const apply = () => {
    flushSync(update);
  };
  try {
    start({ update: apply, types });
  } catch {
    start(apply);
  }
}
