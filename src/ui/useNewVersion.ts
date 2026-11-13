/* A tab opened before a deploy keeps running the old build. When the tab comes back into view, and every
   few minutes, ask the server which build it serves now; if it changed, offer a reload. */
import { useEffect } from 'react';
import { toast } from './toast';

const BUILD = /\/assets\/index-[\w-]+\.js/;
const current = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src.match(BUILD)?.[0];

export function useNewVersion() {
  useEffect(() => {
    const mine = current();
    if (!mine) return; // dev server: no built bundle to compare
    let told = false;
    const check = async () => {
      if (told || document.visibilityState !== 'visible') return;
      try {
        const page = await fetch('/', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : ''));
        const live = page.match(BUILD)?.[0];
        if (live && live !== mine) {
          told = true;
          toast('A new version of Omer is ready', { kind: 'info', sticky: true, action: { label: 'Reload', run: () => window.location.reload() } });
        }
      } catch { /* offline: try again later */ }
    };
    const timer = window.setInterval(check, 5 * 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);
}
