/* Orb avatars, same as the UI kit (public/ui/kit.js): rendered by the vendored
   @outpacelabs/avatars engine in the brand gradient, with a CSS stand-in until it loads. */
import { useEffect, useState } from 'react';

type Engine = typeof import('../vendor/outpace-avatars/engine.js');

const GRADIENT = ['#6360F0', '#FF9A5C', '#4F4BE0', '#3D39C8']; // iris, electric peach, deep iris, indigo
const cache = new Map<string, string>();
let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;

export function loadOrbEngine() {
  loading ??= import('../vendor/outpace-avatars/engine.js')
    .then((module) => (engine = module))
    .catch(() => null);
  return loading;
}

function hash(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// The engine rotates the palette by (seed % length); pre-rotate so every orb gets this exact gradient.
function colors(seed: string) {
  const off = engine ? engine.toSeed(seed) % GRADIENT.length : 0;
  return GRADIENT.map((_, j) => GRADIENT[(j - off + GRADIENT.length) % GRADIENT.length]);
}

function standIn(seed: string) {
  const r = hash(seed || 'orb');
  const blobs = GRADIENT.map((c) => {
    const x = Math.round(10 + r() * 80);
    const y = Math.round(10 + r() * 80);
    const size = Math.round(35 + r() * 30);
    return `radial-gradient(circle at ${x}% ${y}%, ${c} 0%, transparent ${size}%)`;
  });
  return `${blobs.join(',')}, ${GRADIENT[0]}`;
}

function render(seed: string, size: number) {
  const key = `${seed}|${size}`;
  if (!cache.has(key) && engine) {
    cache.set(key, engine.gradientToDataURL(seed, { size: Math.round(size * 2), displaySize: size, colors: colors(seed), p3: true }));
  }
  return cache.get(key);
}

/** Same orb as <Orb>, as an image URL (after loadOrbEngine) or a CSS background before it. */
export function orbFace(seed: string, size: number) {
  const src = engine ? render(seed, size) : undefined;
  return src ? `<img src="${src}" alt="" draggable="false">` : `<i style="background:${standIn(seed)}"></i>`;
}

export function Orb({ seed, size = 32, className = '' }: { seed: string; size?: number; className?: string }) {
  const [, setReady] = useState(Boolean(engine));
  useEffect(() => {
    if (engine) return;
    let live = true;
    void loadOrbEngine().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  const src = engine ? render(seed, size) : undefined;
  return (
    <span className={`orb ${className}`.trim()} style={{ ['--s' as string]: `${size}px` }} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <i style={{ background: standIn(seed) }} />}
    </span>
  );
}
