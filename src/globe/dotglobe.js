// Dotted visitor globe, drawn with Canvas 2D (no three.js).
//
// A lattice of dots on the sphere: land dots get darker and larger as they face you, sea dots
// only show towards the edge where they thicken into a soft texture. The ball, its rim and the
// haze over the limb are painted once per size and reused every frame. Flag pins, label chips and
// one pulse are HTML, moved with translate3d. Drag with inertia, arrow keys, double-click to go
// home, and a small amount of wheel zoom. It only draws while something is moving.
//
// Usage:
//   import { createDotGlobe } from './globe/dotglobe.js';
//   const g = createDotGlobe(el, { people, face: (cc) => '<svg…>', onInteract });
//   // people: [{ cc, place: { name, lat, lng } }]  (one pin per place)
//   g.ping((person) => person.seed === 'live-9'); // move the pulse to where the newest visit came from
//   g.focus((person) => person.seed === 'live-3');
//   g.destroy();

import { geoEquirectangular, geoPath, feature } from './geo.js';

const LAND_URL = '/vendor/globe/land-50m.json';
const DEG = Math.PI / 180;
const HOME = { lambda: -10.8 * DEG, phi: 18 * DEG };
const PHI_MIN = -55 * DEG;
const PHI_MAX = 80 * DEG;
const FRICTION = 3.6; // inertia decay per second
const MAX_SPEED = 9; // rad/s
const DOT_STEP = 1.15; // degrees between neighbouring dots
const BUCKETS = 48; // depth steps for dot shade and size; fine enough that no dot visibly jumps as it turns

const INTRO_MS = 1500; // the reveal once the map is ready: ball, dots from the centre out, then flags

let landPromise = null;
const loadLand = () => (landPromise ||= fetch(LAND_URL).then((r) => r.json()));
// Fetch the map ahead of time (e.g. when the app opens) so the globe can start straight away.
export const preloadDotGlobe = () => loadLand().catch((error) => { landPromise = null; throw error; });

// A uniform dot lattice on the sphere, each dot flagged land or sea.
function buildLattice(topo) {
  const W = 1440;
  const H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const proj = geoEquirectangular().fitSize([W, H], { type: 'Sphere' });
  const landShape = feature(topo, topo.objects.land);
  ctx.beginPath();
  geoPath(proj, ctx)(landShape);
  ctx.fill();
  const data = ctx.getImageData(0, 0, W, H).data;
  // The same land drawn with a thick outline (about two degrees each side): sea dots inside it are
  // too close to a coast and are left out, so every coastline gets a clean white margin.
  const wide = document.createElement('canvas');
  wide.width = W;
  wide.height = H;
  const wctx = wide.getContext('2d', { willReadFrequently: true });
  wctx.lineWidth = 16;
  wctx.lineJoin = 'round';
  wctx.beginPath();
  geoPath(proj, wctx)(landShape);
  wctx.fill();
  wctx.stroke();
  const near = wctx.getImageData(0, 0, W, H).data;

  const xs = [];
  const ys = [];
  const zs = [];
  const ls = [];
  const cs = [];
  // A Fibonacci sphere: every dot the same distance from its neighbours everywhere, with no
  // rows that change length (rows of latitude slip out of line with each other, which shows
  // up as dots that skip a line near the edge).
  const step = DOT_STEP * DEG;
  const total = Math.round((4 * Math.PI) / (step * step * (Math.sqrt(3) / 2)));
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < total; i++) {
    const sl = 1 - (2 * (i + 0.5)) / total;
    const lat = Math.asin(sl) / DEG;
    if (lat < -84 || lat > 84) continue;
    const cl = Math.sqrt(1 - sl * sl);
    const a = i * golden;
    const lon = ((((a / DEG) % 360) + 540) % 360) - 180;
    const px = Math.min(W - 1, Math.floor(((lon + 180) / 360) * W));
    const py = Math.min(H - 1, Math.floor(((90 - lat) / 180) * H));
    xs.push(cl * Math.sin(lon * DEG));
    ys.push(sl);
    zs.push(cl * Math.cos(lon * DEG));
    const land = data[(py * W + px) * 4 + 3] > 110 ? 1 : 0;
    ls.push(land);
    cs.push(!land && near[(py * W + px) * 4 + 3] > 0 ? 1 : 0);
  }
  return { X: Float32Array.from(xs), Y: Float32Array.from(ys), Z: Float32Array.from(zs), L: Uint8Array.from(ls), C: Uint8Array.from(cs), N: xs.length };
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
};

export function createDotGlobe(container, {
  people = [], face = () => '', onInteract, onExplore, shiftY = 0, maxZoom = 1.5,
  autoSpin = true, openOnFocus = true,
  // Profile / cropped use: larger ball, start zoomed, face a place, nudge the centre so the sphere clips.
  radiusScale = 1, startZoom = 1, lookAt = null, offsetX = 0, showFlags = true,
  // Skip the turn-in; just a short fade while already posed (profile cards).
  quietIntro = false,
} = {}) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startZoomClamped = clamp(startZoom, 1, Math.max(maxZoom, startZoom));
  const homeLambda = lookAt ? -lookAt.lng * DEG : HOME.lambda;
  const homePhi = lookAt ? clamp(lookAt.lat * DEG, PHI_MIN, PHI_MAX) : HOME.phi;
  const introMs = quietIntro ? 620 : INTRO_MS;

  let places = [], mk = [], markerEls = [];

  // --- DOM
  container.classList.add('dg');
  container.tabIndex = 0;
  container.setAttribute('role', onExplore ? 'group' : 'img');
  container.setAttribute('aria-label', onExplore
    ? 'Live globe. Drag or use the arrow keys to turn it. Select a city flag to explore its map.'
    : 'Globe of visitors right now. Drag or use the arrow keys to turn it, double-click to reset.');
  const canvas = el('canvas', 'dg-canvas');
  container.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });

  // One soft glow with ripples, sitting on the place the newest visit came from (see ping()).
  const pulseEl = el('div', 'dg-pulse', '<i class="dg-pulse-glow"></i><i class="dg-ring"></i><i class="dg-ring"></i>');
  container.append(pulseEl);
  let pulseK = -1; // the place the glow is on
  let pulseNext = -1; // where it goes once it has faded out
  let pulseA = 0; // 0..1 fade, eased towards pulseTo every frame
  let pulseTo = 0;
  const restartRings = () =>
    pulseEl.querySelectorAll('.dg-ring').forEach((ring) => {
      ring.style.animation = 'none';
      void ring.offsetWidth;
      ring.style.animation = '';
    });
  // Hover a flag (or tap it on touch, or Enter) to see the exact city; one shown at a time.
  // Profile crops can hide flags and keep only the surface pulse.
  const makeMarker = (m, k) => {
    const node = el('div', 'dg-pin');
    node.dataset.k = k;
    node.append(el('span', 'dg-dot'));
    if (!showFlags) {
      node.classList.add('is-pulse-only');
      container.append(node);
      return node;
    }
    const city = m.name.split(', ')[0];
    const pin = el('button', 'dg-flag', face(m.cc));
    pin.type = 'button';
    pin.setAttribute('aria-label', `${m.name}, ${m.count} ${m.count === 1 ? 'visitor' : 'visitors'}`);
    pin.setAttribute('aria-expanded', 'false');
    // Mouse: the city shows while the pointer is over the flag, and the globe holds still meanwhile.
    pin.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || dragging || exploring) return;
      hoverK = k;
      syncOpen();
    });
    pin.addEventListener('pointerleave', () => {
      if (dragging || hoverK !== k) return;
      hoverK = -1;
      syncOpen();
    });
    node.append(pin);
    const where = el('span', 'dg-chip dg-city');
    where.innerHTML = `${face(m.cc)}<b class="dg-city-name"></b><span class="dg-city-count"></span>`;
    where.querySelector('.dg-city-name').textContent = city;
    where.querySelector('.dg-city-count').textContent = `${m.count} ${m.count === 1 ? 'visitor' : 'visitors'}`;
    node.append(where);
    container.append(node);
    return node;
  };
  let openK = -1; // opened by a tap, Enter or focus(); stays until closed
  let hoverK = -1; // under the mouse right now; wins over openK while it lasts
  let shownK = -1; // the one whose city chip is on screen
  const syncOpen = () => {
    const k = hoverK >= 0 ? hoverK : openK;
    if (k === shownK) return;
    if (shownK >= 0) {
      markerEls[shownK].classList.remove('is-open');
      markerEls[shownK].querySelector('.dg-flag')?.setAttribute('aria-expanded', 'false');
    }
    shownK = k;
    container.classList.toggle('has-open', k >= 0);
    if (k >= 0) {
      markerEls[k].classList.add('is-open');
      markerEls[k].querySelector('.dg-flag')?.setAttribute('aria-expanded', 'true');
    }
    requestRender();
  };
  const openPlace = (k) => {
    touched();
    openK = k === openK ? -1 : k;
    syncOpen();
  };
  let exploring = false;
  const explorePlace = (k) => {
    if (!onExplore) {
      openPlace(k);
      return;
    }
    if (exploring) return;
    exploring = true;
    const place = places[k];
    const overview = { lambda, phi, zoom };
    const duration = reducedMotion ? 0 : 850;
    touched();
    hoverK = -1;
    openK = k;
    syncOpen();
    zoomTarget = Math.max(maxZoom, 2.15);
    animateTo(-place.lng * DEG, place.lat * DEG, duration);
    onExplore(place, duration, () => {
      exploring = false;
      openK = -1;
      syncOpen();
      touched();
      zoomTarget = overview.zoom;
      animateTo(overview.lambda, overview.phi, 650);
    }, places.filter((candidate) => candidate.cc === place.cc));
  };

  // --- Sizing and the cached lighting layers
  let w = 0;
  let h = 0;
  let dpr = 1;
  let baseR = 0;
  let R = 0;
  let cx = 0;
  let cy = 0;
  let zoom = startZoomClamped;
  let zoomTarget = startZoomClamped;
  const back = document.createElement('canvas');
  const front = document.createElement('canvas');

  const paintStatic = () => {
    for (const c of [back, front]) {
      c.width = canvas.width;
      c.height = canvas.height;
    }
    const b = back.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    // atmosphere: a white glow off the edge that fades into the page (no grey shadow, which
    // read as a dirty ring), then a much wider, fainter white haze
    const far = b.createRadialGradient(cx, cy, R, cx, cy, R * 1.6);
    far.addColorStop(0, 'rgba(255,255,255,0.55)');
    far.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    far.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = far;
    b.beginPath();
    b.arc(cx, cy, R * 1.6, 0, Math.PI * 2);
    b.fill();
    const air = b.createRadialGradient(cx, cy, R * 0.99, cx, cy, R * 1.16);
    air.addColorStop(0, 'rgba(255,255,255,1)');
    air.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    air.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = air;
    b.beginPath();
    b.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
    b.fill();
    // the ball, lit from the upper right
    const body = b.createRadialGradient(cx + R * 0.18, cy - R * 0.22, R * 0.05, cx, cy, R);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.62, '#ffffff');
    body.addColorStop(0.88, '#f6f6f5');
    body.addColorStop(1, '#e9e9e8');
    b.fillStyle = body;
    b.beginPath();
    b.arc(cx, cy, R, 0, Math.PI * 2);
    b.fill();

    const f = front.getContext('2d');
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    // haze over the limb softens the dots into the edge
    const haze = f.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.75, 'rgba(255,255,255,0.22)');
    haze.addColorStop(1, 'rgba(255,255,255,0.78)');
    f.fillStyle = haze;
    f.beginPath();
    f.arc(cx, cy, R, 0, Math.PI * 2);
    f.fill();
    // bright rim that rises smoothly into the edge and falls away outside it (a hard inner edge
    // showed as a faint dashed ring)
    const rim = f.createRadialGradient(cx, cy, R * 0.93, cx, cy, R * 1.06);
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(0.42, 'rgba(255,255,255,0.35)');
    rim.addColorStop(0.54, 'rgba(255,255,255,0.95)');
    rim.addColorStop(1, 'rgba(255,255,255,0)');
    f.fillStyle = rim;
    f.beginPath();
    f.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
    f.fill();
  };
  const setRadius = () => {
    R = baseR * zoom;
    container.style.setProperty('--globe-r', `${R}px`);
    paintStatic();
  };
  // The canvas always covers the whole container. Its left padding is the room a side panel takes;
  // the globe centres in what's left. Animate that padding in CSS and the globe glides with it
  // (the ResizeObserver sees every step, since the content box changes).
  const resize = () => {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pad = parseFloat(getComputedStyle(container).paddingLeft) || 0;
    w = r.width;
    h = r.height;
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const room = Math.max(1, w - pad);
    baseR = Math.min(room * 0.42, h * 0.388) * radiusScale;
    cx = pad + room * (0.5 + offsetX);
    cy = h * 0.5 - shiftY;
    setRadius();
    draw(); // straight away, so the globe moves in the same frame as the layout
  };

  // --- View state
  let lattice = null;
  // The reveal: nothing is drawn until the dots are ready, then everything comes in together.
  let introStart = 0;
  const introP = () => (!lattice ? 0 : reducedMotion || !introStart ? (lattice ? 1 : 0) : clamp((performance.now() - introStart) / introMs, 0, 1));
  let lambda = homeLambda;
  let phi = homePhi;
  let vl = 0;
  let vp = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let anim = null;

  // Auto-spin: once nobody has touched the globe for a few seconds it starts turning slowly
  // eastwards, easing in; grabbing it stops it dead. Paused while a city chip is open, and it
  // halts quickly while the mouse is on a flag (so the flag stays put) and eases back once it leaves.
  const SPIN_SPEED = 0.07; // rad/s, about a turn every 90 seconds
  const IDLE_MS = 3500;
  let spin = 0;
  let lastTouch = performance.now() - IDLE_MS + 1200; // first spin starts a moment after load
  let idleTimer = 0;
  const wakeAfterIdle = (ms) => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => requestRender(), ms + 30);
  };
  const touched = () => {
    lastTouch = performance.now();
    wakeAfterIdle(IDLE_MS);
  };

  const animateTo = (tl, tp, dur = 900, ease = easeInOut) => {
    let d = (tl - lambda) % (Math.PI * 2); // shortest way round
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    anim = { fl: lambda, fp: phi, tl: lambda + d, tp: clamp(tp, PHI_MIN, PHI_MAX), t0: performance.now(), dur: reducedMotion ? 1 : dur, ease };
    vl = vp = 0;
    requestRender();
  };

  // --- Render (on demand)
  let raf = 0;
  let prev = 0;
  let disposed = false;
  let SX;
  let SY;
  let B;
  let order;
  const counts = new Uint32Array(BUCKETS * 2);
  const starts = new Uint32Array(BUCKETS * 2 + 1);

  function requestRender() {
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
  }
  function frame(t) {
    raf = 0;
    const dt = prev ? Math.min((t - prev) / 1000, 0.05) : 1 / 60;
    prev = t;
    let keepGoing = false;

    if (Math.abs(zoomTarget - zoom) > 0.001) {
      zoom += (zoomTarget - zoom) * (reducedMotion ? 1 : 1 - Math.exp(-14 * dt));
      setRadius();
      keepGoing = true;
    }
    if (anim) {
      const k = clamp((t - anim.t0) / anim.dur, 0, 1);
      const e = (anim.ease || easeInOut)(k);
      lambda = anim.fl + (anim.tl - anim.fl) * e;
      phi = anim.fp + (anim.tp - anim.fp) * e;
      if (k >= 1) anim = null;
      else keepGoing = true;
    } else if (!dragging && (Math.abs(vl) > 0.004 || Math.abs(vp) > 0.004)) {
      lambda += vl * dt;
      phi += vp * dt;
      if (phi < PHI_MIN || phi > PHI_MAX) {
        phi = clamp(phi, PHI_MIN, PHI_MAX);
        vp = 0;
      }
      const decay = Math.exp(-FRICTION * dt);
      vl *= decay;
      vp *= decay;
      keepGoing = true;
    }

    if (lattice && introP() < 1) keepGoing = true;

    const wantSpin =
      autoSpin && !reducedMotion && lattice && !dragging && !anim && openK < 0 && hoverK < 0 &&
      Math.abs(vl) < 0.05 && Math.abs(vp) < 0.05 && t - lastTouch > IDLE_MS;
    spin += ((wantSpin ? SPIN_SPEED : 0) - spin) * (1 - Math.exp(-(hoverK >= 0 ? 12 : 0.9) * dt));
    if (spin > 0.0004) {
      lambda += spin * dt;
      keepGoing = true;
    } else spin = 0;

    // The glow never jumps: it fades and shrinks away, moves while invisible, then grows back.
    if (pulseNext >= 0) {
      pulseTo = 0;
      if (pulseA < 0.02) {
        pulseK = pulseNext;
        pulseNext = -1;
        pulseA = 0;
        pulseTo = 1;
        restartRings();
      }
    }
    if (Math.abs(pulseTo - pulseA) > 0.002) {
      pulseA += (pulseTo - pulseA) * (reducedMotion ? 1 : 1 - Math.exp(-(pulseTo ? 3.2 : 6) * dt));
      keepGoing = true;
    } else pulseA = pulseTo;

    draw();
    if (keepGoing) requestRender();
    else prev = 0;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Reveal: the ball and its air fade in while growing the last few percent into place.
    const ip = introP();
    const ballA = easeOut(clamp(ip / 0.45, 0, 1));
    if (ballA <= 0) {
      for (const node of markerEls) node.style.visibility = 'hidden';
      pulseEl.style.visibility = 'hidden';
      return;
    }
    const gs = 0.955 + 0.045 * ballA;
    const Rs = R * gs;
    const lift = (1 - gs) * dpr;
    ctx.globalAlpha = ballA;
    ctx.setTransform(gs, 0, 0, gs, cx * lift, cy * lift);
    ctx.drawImage(back, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cL = Math.cos(lambda);
    const sL = Math.sin(lambda);
    const cP = Math.cos(phi);
    const sP = Math.sin(phi);

    if (lattice) {
      const { X, Y, Z, L, C, N } = lattice;
      // project, then sort into depth buckets (counting sort, no allocations)
      counts.fill(0);
      for (let i = 0; i < N; i++) {
        const x0 = X[i];
        const z0 = Z[i];
        const y0 = Y[i];
        const x = x0 * cL + z0 * sL;
        const z1 = -x0 * sL + z0 * cL;
        const z = y0 * sP + z1 * cP;
        if (z <= 0.015) { B[i] = 255; continue; }
        const land = L[i];
        if (!land && (z > 0.94 || C[i])) { B[i] = 255; continue; } // sea dots right by a coast or facing you: skip
        const y = y0 * cP - z1 * sP;
        SX[i] = cx + x * Rs;
        SY[i] = cy - y * Rs;
        const b = (land ? BUCKETS : 0) + Math.min(BUCKETS - 1, (z * BUCKETS) | 0);
        B[i] = b;
        counts[b]++;
      }
      starts[0] = 0;
      for (let b = 0; b < BUCKETS * 2; b++) starts[b + 1] = starts[b] + counts[b];
      const fill = starts.slice(0, BUCKETS * 2);
      for (let i = 0; i < N; i++) {
        const b = B[i];
        if (b !== 255) order[fill[b]++] = i;
      }

      const base = Rs * 0.0042;
      for (let b = 0; b < BUCKETS * 2; b++) {
        const s = starts[b];
        const e = starts[b + 1];
        if (s === e) continue;
        const land = b >= BUCKETS;
        const z = ((b % BUCKETS) + 0.5) / BUCKETS;
        const sz = Math.sqrt(z);
        // Reveal: dots facing you arrive first and the rest follow out to the edge, each growing in.
        const rv = ip >= 1 ? 1 : smooth(clamp((ip - 0.12 - (1 - z) * 0.45) / 0.3, 0, 1));
        if (rv <= 0) continue;
        const grow = 0.35 + 0.65 * rv;
        ctx.beginPath();
        if (land) {
          const r = Math.max(0.45, base * (0.46 + 0.44 * sz)) * grow;
          ctx.fillStyle = `rgba(104,104,102,${((0.24 + 0.58 * sz) * rv).toFixed(3)})`;
          for (let j = s; j < e; j++) {
            const i = order[j];
            const x = SX[i];
            const y = SY[i];
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        } else {
          // Round like the land dots (squares smear unevenly between pixels). Strongest a little
          // in from the edge, then fading out where the grid is squeezed too tight to line up.
          const r = Math.max(0.5, base * 0.55) * grow;
          const edge = Math.min(1, Math.max(0, (z - 0.015) / 0.2));
          const alpha = (0.035 + 0.24 * (1 - z) * (1 - z)) * edge * edge * (3 - 2 * edge) * rv;
          if (alpha < 0.004) continue;
          ctx.fillStyle = `rgba(120,120,118,${alpha.toFixed(3)})`;
          for (let j = s; j < e; j++) {
            const i = order[j];
            const x = SX[i];
            const y = SY[i];
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
    }

    ctx.globalAlpha = ballA;
    ctx.setTransform(gs, 0, 0, gs, cx * lift, cy * lift);
    ctx.drawImage(front, 0, 0);
    ctx.globalAlpha = 1;

    // Pins: transform and opacity only, worked out from the same angles as the dots this frame.
    for (let k = 0; k < mk.length; k++) {
      const p = mk[k];
      const x = p.x * cL + p.z * sL;
      const z1 = -p.x * sL + p.z * cL;
      const z = p.y * sP + z1 * cP;
      const y = p.y * cP - z1 * sP;
      const sx = cx + x * Rs;
      const sy = cy - y * Rs;
      // Reveal: flags pop in one after another (biggest place first) once the dots are mostly in.
      const pop = ip >= 1 ? 1 : clamp((ip - 0.55 - k * 0.012) / 0.2, 0, 1);
      const vis = (lattice ? clamp((z - 0.06) / 0.18, 0, 1) : 0) * pop;
      const shown = vis > 0.001 ? 'visible' : 'hidden';
      const node = markerEls[k];
      node.style.transform = `translate3d(${sx.toFixed(2)}px,${sy.toFixed(2)}px,0) scale(${((0.82 + 0.18 * vis) * (0.55 + 0.45 * easeOutBack(pop))).toFixed(3)})`;
      node.style.opacity = vis.toFixed(3);
      node.style.visibility = shown;
      node.style.zIndex = String(1000 + Math.round(sy) + (k === shownK ? 100000 : 0));
      if (k === pulseK) {
        pulseEl.style.transform = `translate3d(${sx.toFixed(2)}px,${sy.toFixed(2)}px,0) scale(${(0.7 + 0.3 * pulseA).toFixed(3)})`;
        // The glow is wide, so it fades out well before the edge instead of spilling off the ball.
        const glow = (lattice ? clamp((z - 0.3) / 0.3, 0, 1) : 0) * pulseA * pop;
        pulseEl.style.opacity = glow.toFixed(3);
        pulseEl.style.visibility = glow > 0.001 ? 'visible' : 'hidden';
      }
    }
  }

  // --- Input
  let press = null; // where a press began, to tell a click from a drag
  const onDown = (e) => {
    if (e.button !== 0 || exploring) return;
    spin = 0;
    touched();
    const flagEl = e.target.closest('.dg-flag');
    press = { x: e.clientX, y: e.clientY, k: flagEl ? +flagEl.parentElement.dataset.k : -1, mouse: e.pointerType === 'mouse' };
    dragging = true;
    anim = null;
    vl = vp = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    try { container.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    container.dataset.dragging = 'true';
    onInteract?.();
  };
  const onMove = (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const dtm = Math.max(1, now - lastT);
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    const k = 1 / R; // a pixel of drag moves a pixel of surface at the centre: it feels held
    lambda += dx * k;
    phi = clamp(phi + dy * k, PHI_MIN, PHI_MAX);
    const a = 1 - Math.exp(-dtm / 40); // time-weighted velocity (rad/s)
    vl += ((dx * k * 1000) / dtm - vl) * a;
    vp += ((dy * k * 1000) / dtm - vp) * a;
    requestRender();
  };
  const onUp = (e) => {
    if (!dragging) return;
    touched();
    dragging = false;
    delete container.dataset.dragging;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    // A press that barely moved is a click. A tap on a flag opens that city (with a mouse, hover
    // already shows it); a click anywhere else closes an open one.
    if (e.type === 'pointerup' && press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) {
      if (press.k >= 0 && (onExplore || !press.mouse)) explorePlace(press.k);
      else if (press.k < 0 && openK >= 0) openPlace(openK);
    }
    // Hover was frozen during the drag; settle it on whatever flag the mouse ended up over.
    if (e.pointerType === 'mouse' && !exploring) {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.dg-flag');
      hoverK = over && container.contains(over) ? +over.parentElement.dataset.k : -1;
      syncOpen();
    }
    press = null;
    if (performance.now() - lastT > 70) vl = vp = 0; // held still before letting go: no fling
    vl = clamp(vl, -MAX_SPEED, MAX_SPEED);
    vp = clamp(vp, -MAX_SPEED, MAX_SPEED);
    prev = 0;
    requestRender();
  };
  const onDbl = () => {
    if (exploring) return;
    touched();
    zoomTarget = startZoomClamped;
    animateTo(homeLambda, homePhi);
  };
  const onKey = (e) => {
    if (exploring) return;
    touched();
    const flagEl = e.target.closest?.('.dg-flag');
    if (flagEl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      explorePlace(+flagEl.parentElement.dataset.k);
      return;
    }
    if (e.key === 'Escape' && openK >= 0) {
      openPlace(openK);
      return;
    }
    const step = 15 * DEG;
    const tl = anim ? anim.tl : lambda;
    const tp = anim ? anim.tp : phi;
    if (e.key === 'ArrowLeft') animateTo(tl + step, tp, 450);
    else if (e.key === 'ArrowRight') animateTo(tl - step, tp, 450);
    else if (e.key === 'ArrowUp') animateTo(tl, tp - step, 450);
    else if (e.key === 'ArrowDown') animateTo(tl, tp + step, 450);
    else if (e.key === 'Home' || e.key === '0') onDbl();
    else return;
    e.preventDefault();
  };
  // A little zoom only: from the whole globe up to `maxZoom` times bigger.
  const onWheel = (e) => {
    if (maxZoom <= 1) return;
    if (exploring) return;
    touched();
    e.preventDefault();
    zoomTarget = clamp(zoomTarget * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), 1, maxZoom);
    requestRender();
  };

  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  container.addEventListener('dblclick', onDbl);
  container.addEventListener('keydown', onKey);
  container.addEventListener('wheel', onWheel, { passive: false });

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const onVis = () => {
    if (!document.hidden) {
      prev = 0;
      requestRender();
    }
  };
  document.addEventListener('visibilitychange', onVis);

  wakeAfterIdle(1200);
  loadLand().then((topo) => {
    if (disposed) return;
    lattice = buildLattice(topo);
    SX = new Float32Array(lattice.N);
    SY = new Float32Array(lattice.N);
    B = new Uint8Array(lattice.N);
    order = new Uint32Array(lattice.N);
    container.classList.add('is-ready');
    // Start the reveal: the globe turns the last stretch into its resting place as it fades in,
    // and auto-spin waits until the reveal is over. quietIntro skips the turn (already posed).
    introStart = performance.now();
    if (!reducedMotion && !anim && !dragging && !quietIntro) {
      lambda = homeLambda + (lookAt ? 0.35 : 0.55);
      animateTo(homeLambda, homePhi, introMs * 1.1, easeOut);
    } else {
      lambda = homeLambda;
      phi = homePhi;
    }
    lastTouch = performance.now() - IDLE_MS + introMs + 600;
    wakeAfterIdle(introMs + 600);
    requestRender();
  });

  function setPeople(people) {
    const selected = places[shownK]?.name;
    const glowing = places[pulseK]?.name;
    const focused = container.contains(document.activeElement) && document.activeElement?.classList.contains('dg-flag');
    for (const node of markerEls) node.remove();
    openK = hoverK = shownK = -1;
    pulseNext = -1;
    // One pin per place.
    const byPlace = new Map();
    for (const p of people) {
      const key = p.place.name;
      if (!byPlace.has(key)) byPlace.set(key, { lat: p.place.lat, lng: p.place.lng, cc: p.cc, name: key, count: 0, people: [] });
      const place = byPlace.get(key);
      place.count++;
      place.people.push(p);
    }
    places = [...byPlace.values()];
    mk = places.map((m) => {
      const cl = Math.cos(m.lat * DEG);
      return { x: cl * Math.sin(m.lng * DEG), y: Math.sin(m.lat * DEG), z: cl * Math.cos(m.lng * DEG) };
    });

    markerEls = places.map(makeMarker);
    pulseK = places.findIndex((place) => place.name === glowing);
    if (pulseK < 0) pulseTo = 0;
    if (selected) openK = places.findIndex((place) => place.name === selected);
    container.classList.remove('has-open');
    syncOpen();
    if (focused) container.focus({ preventScroll: true });
    requestRender();
  }
  setPeople(people);

  return {
    setPeople,
    // Move the glow to the place of the first visitor that matches (fading out, then in).
    ping(match) {
      const k = places.findIndex((m) => m.people.some(match));
      if (k < 0) return;
      if (pulseK < 0) {
        pulseK = k;
        pulseTo = 1;
        restartRings();
      } else if (k !== pulseK || pulseNext >= 0) pulseNext = k === pulseK ? -1 : k;
      if (pulseNext < 0 && k === pulseK) pulseTo = 1;
      requestRender();
    },
    // Turn to the first visitor that matches.
    focus(match, { zoom: nextZoom } = {}) {
      if (exploring) return;
      touched();
      const k = places.findIndex((m) => m.people.some(match));
      if (k < 0) return;
      if (nextZoom != null) zoomTarget = clamp(nextZoom, 1, Math.max(maxZoom, nextZoom));
      animateTo(-places[k].lng * DEG, places[k].lat * DEG);
      if (openOnFocus && k !== openK) openPlace(k);
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('dblclick', onDbl);
      container.removeEventListener('keydown', onKey);
      container.removeEventListener('wheel', onWheel);
      container.replaceChildren();
      container.classList.remove('dg', 'is-ready');
    },
  };
}
