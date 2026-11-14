/* Leaving a screen that has unsaved changes: the screen registers a guard, and every way out of it
   (back, another screen, another store) goes through leave(), which lets the guard ask first. */
type Guard = (proceed: () => void) => boolean;
let guard: Guard | null = null;

/** The email editor sets this while it has unsaved changes; returns a function that removes it. */
export function setLeaveGuard(next: Guard) {
  guard = next;
  return () => { if (guard === next) guard = null; };
}

/** Run `proceed` now, or after the guard has asked (it calls `proceed` itself if they choose to leave). */
export function leave(proceed: () => void) {
  if (guard && guard(proceed)) return;
  proceed();
}
