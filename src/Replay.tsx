/* Session replay: until real recordings ship, the session is rebuilt from what they did — each page drawn as a
   simple store page with their cursor on top, a timeline you can scrub, and the steps alongside. Laid out like
   the UI kit's replay. Says plainly that it's reconstructed. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon';
import { PHOTOS, photo, type PhotoKey } from './storeData';

export type ReplayStep = { kind: 'arrive' | 'view' | 'buy' | 'gone'; label: string; path?: string; note?: string };

const PRODUCT: [RegExp, PhotoKey, string][] = [
  [/starter/i, 'starter', 'Kitten Starter Pack'], [/pate|pâté/i, 'pate', 'Grain-free Kitten Pâté'], [/tall|tower/i, 'tower', 'Tall Tower'],
  [/nook/i, 'nook', 'Cozy Nook'], [/kibble/i, 'kibble', 'Salmon Kibble 4 kg'], [/post/i, 'post', 'Sisal Scratching Post'],
];
const title = (path: string) => {
  const last = path.split('/').filter(Boolean).pop() ?? '';
  return last ? last.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Home';
};

function Page({ step, host }: { step: ReplayStep; host: string }) {
  const path = step.path ?? '/';
  const product = PRODUCT.find(([re]) => re.test(path));
  const head = <div className="rs-head"><span className="rs-logo">{host.replace(/^www\./, '').split('.')[0]}</span><span className="rs-nav"><i /><i /><i /></span><Icon name="cart" /></div>;
  if (step.kind === 'gone') return <div className="rs-gone"><Icon name="exit" /><b>{step.label}</b><small>{step.note}</small></div>;
  let body;
  if (step.kind === 'buy') body = <div className="rs-hero"><h3>Thank you for your order</h3><p>It’s on its way.</p><span className="rs-tick" data-cur><Icon name="check" /></span></div>;
  else if (step.kind === 'arrive' || path === '/') body = <div className="rs-hero"><h3>Welcome to {host.replace(/^www\./, '')}</h3><p>Everything in one place.</p><span className="rs-btn" data-cur>Shop now</span></div>;
  else if (/\/(products?|p)\//.test(path) || product) {
    body = <div className="rs-product">{product ? <img src={photo(PHOTOS[product[1]], 500)} alt="" /> : <span className="rs-art" />}<div><h3>{product?.[2] ?? title(path)}</h3><p className="rs-price" /><p>Free returns for 30 days.</p><span className="rs-btn" data-cur>Add to cart</span></div></div>;
  } else if (/\/cart/.test(path)) body = <><h3 className="rs-title">Your cart</h3><div className="rs-sum"><span className="rs-art" /><b>1 item</b></div><span className="rs-btn" data-cur>Check out</span></>;
  else if (/\/checkout/.test(path)) body = <><h3 className="rs-title">Checkout</h3><div className="rs-sum"><span className="rs-art" /><b>Your order</b></div><div className="rs-code"><span className="rs-input">Discount code</span><span className="rs-btn small" data-cur>Apply</span></div></>;
  else if (/\/(blog|articles?|news)/.test(path)) body = <div className="rs-article"><h3>{title(path)}</h3><span className="rs-line" data-cur /><span className="rs-line" /><span className="rs-line short" /><span className="rs-line" /><span className="rs-line short" /></div>;
  else if (/\/collections?/.test(path)) body = <><h3 className="rs-title">{title(path)}</h3><div className="rs-grid">{(['tower', 'nook', 'post'] as PhotoKey[]).map((k, i) => <span key={k} className="rs-tile" data-cur={i === 0 ? '' : undefined}><img src={photo(PHOTOS[k], 300)} alt="" /><i /></span>)}</div></>;
  else body = <div className="rs-article"><h3>{title(path)}</h3><span className="rs-line" data-cur /><span className="rs-line" /><span className="rs-line short" /></div>;
  return <div className="rs">{head}<div className="rs-body">{body}</div></div>;
}

export function Replay({ who, session, date, meta, steps, host, onBack }: {
  who: string; session: number; date: string; meta: string; steps: ReplayStep[]; host: string; onBack: () => void;
}) {
  const per = 2.4; // seconds of replay per step
  const total = steps.length * per;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const screen = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ x: 40, y: 40 });
  const i = Math.min(steps.length - 1, Math.floor(t / per));
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), raf = 0;
    const tick = (now: number) => {
      setT((x) => { const n = x + ((now - last) / 1000) * speed; if (n >= total) { setPlaying(false); return total - 0.001; } return n; });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total]);

  // The cursor drifts to the thing they'd click on each page.
  useEffect(() => {
    const target = screen.current?.querySelector<HTMLElement>('[data-cur]');
    const box = screen.current?.getBoundingClientRect();
    if (!target || !box) return;
    const r = target.getBoundingClientRect();
    setCursor({ x: r.left - box.left + r.width * 0.6, y: r.top - box.top + r.height * 0.6 });
  }, [i]);

  const seek = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    setT(Math.max(0, Math.min(total - 0.001, ((clientX - r.left) / r.width) * total)));
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="rp">
      <div className="rp-main">
        <header className="rp-top">
          <button type="button" className="profile-back" onClick={onBack}><Icon name="arrowLeft" />Back to profile</button>
          <span className="rp-meta">{date} · {meta}</span>
        </header>
        <div className="rp-title"><h1 tabIndex={-1}>Session replay</h1><p>{who} · Session {session}</p></div>
        <div className="rp-stage">
          <div className="rp-screen" ref={screen}>
            <div className="rp-bar"><i /><i /><i /><span>{host}{steps[i].path && steps[i].path !== '/' ? steps[i].path : ''}</span></div>
            <div className="rp-view" key={i}><Page step={steps[i]} host={host} /></div>
            <span className="rp-cursor" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }} aria-hidden="true">
              <svg viewBox="0 0 20 24"><path d="M3 2v17l4.6-4 2.9 6.5 3-1.3-2.9-6.4H17z" fill="#191B22" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            </span>
          </div>
        </div>
        <div className="rp-controls">
          <button type="button" className="rp-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (!playing && t >= total - 0.01) setT(0); setPlaying(!playing); }}><Icon name={playing ? 'pause' : 'play'} /></button>
          <span className="rp-time"><b>{fmt(t)}</b> / {fmt(total)}</span>
          <div className="rp-track" ref={track} role="slider" tabIndex={0} aria-label="Replay position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((t / total) * 100)}
            onPointerDown={(e) => { seek(e.clientX); const move = (m: PointerEvent) => seek(m.clientX); const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }}
            onKeyDown={(e) => { if (e.key === 'ArrowRight') setT((x) => Math.min(total - 0.001, x + per)); if (e.key === 'ArrowLeft') setT((x) => Math.max(0, x - per)); }}>
            <span className="rp-fill" style={{ width: `${(t / total) * 100}%` }} />
            {steps.map((s, k) => <i key={k} className={s.kind === 'buy' ? 'ok' : s.kind === 'gone' ? 'bad' : undefined} style={{ left: `${(k / steps.length) * 100}%` }} />)}
          </div>
          <div className="seg rp-speed" role="group" aria-label="Speed">
            {[1, 2].map((x) => <button key={x} type="button" aria-pressed={speed === x} onClick={() => setSpeed(x)}>{x}x</button>)}
          </div>
        </div>
      </div>
      <aside className="rp-side">
        <span className="date-pill">{date}</span>
        <ol className="rp-steps">
          {steps.map((s, k) => (
            <li key={k} className={k === i ? 'is-now' : k < i ? 'is-done' : undefined}>
              <button type="button" onClick={() => setT(k * per + 0.01)}><b>{s.label}</b>{s.note ? <small>{s.note}</small> : null}</button>
            </li>
          ))}
        </ol>
        <p className="rp-note"><Icon name="flask" />Rebuilt from the pages they visited. Recordings come later.</p>
      </aside>
    </div>
  );
}
