/* Orb globe: a light 3D globe with people pinned on it, matching the UI kit's "3D" Live globe.
   Written for this app on three.js: a shaded sphere with flat land, a soft rim, contoured heat under
   busy places, and HTML orb pins that cluster by screen distance and fade as they turn away. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { feature, geoEquirectangular, geoPath } from './geo.js';

export type GlobePerson = { seed: string; cc?: string; place: { name: string; lat: number; lng: number } };
type Match = (person: GlobePerson) => boolean;

// The shader writes colours straight to the screen, so keep them as plain sRGB numbers
// (THREE.Color would convert hex to linear light and everything would come out darker).
const rgb = (hex: string) => new THREE.Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

const LOOK = {
  ocean: '#f1f1f1',
  land: '#d9d9d9',
  rim: rgb('#cfcfcf'),
  heat: ['#0090ff', '#3dd68c', '#ffe629', '#e5484d'].map(rgb),
  heatBands: 5,
  heatSizeDeg: 3,
  heatOverSea: 0.35,
  avatar: 36,
  clusterPx: 44,
  distance: 4.4,
  tiltDeg: 18,
  startLng: -20,
  spin: 0.6,
};
const MAX_HEAT = 32;
const DEG = Math.PI / 180;

// Same convention as SphereGeometry's UVs, so the equirectangular land texture lines up.
function surface(lat: number, lng: number, r = 1) {
  const polar = (90 - lat) * DEG;
  const az = (lng + 180) * DEG;
  return new THREE.Vector3(-r * Math.sin(polar) * Math.cos(az), r * Math.cos(polar), r * Math.sin(polar) * Math.sin(az));
}

let landTexture: Promise<HTMLCanvasElement> | null = null;
function drawLand() {
  landTexture ??= fetch('/vendor/globe/land-50m.json').then((r) => r.json()).then((topo) => {
    const W = 4096, H = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = LOOK.ocean;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = LOOK.land;
    ctx.beginPath();
    geoPath(geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]), ctx)(feature(topo, topo.objects.land));
    ctx.fill('evenodd');
    return canvas;
  });
  return landTexture;
}
export const preloadOrbGlobe = () => drawLand();

const vertex = /* glsl */`
  varying vec2 vUv;
  varying vec3 vDir;
  varying vec3 vViewNormal;
  void main() {
    vUv = uv;
    vDir = normalize(position);
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const fragment = /* glsl */`
  uniform sampler2D land;
  uniform vec3 rim;
  uniform vec4 heat[${MAX_HEAT}];
  uniform int heatCount;
  uniform float heatSigma;
  uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;
  varying vec2 vUv;
  varying vec3 vDir;
  varying vec3 vViewNormal;
  vec3 ramp(float t) {
    if (t < 0.34) return mix(c0, c1, t / 0.34);
    if (t < 0.67) return mix(c1, c2, (t - 0.34) / 0.33);
    return mix(c2, c3, (t - 0.67) / 0.33);
  }
  void main() {
    vec3 base = texture2D(land, vUv).rgb;
    float isLand = 1.0 - smoothstep(0.87, 0.93, base.r);
    float h = 0.0;
    for (int i = 0; i < ${MAX_HEAT}; i++) {
      if (i >= heatCount) break;
      float d = acos(clamp(dot(vDir, heat[i].xyz), -1.0, 1.0));
      h += heat[i].w * exp(-(d * d) / (2.0 * heatSigma * heatSigma));
    }
    h = clamp(h, 0.0, 1.0);
    float band = ceil(h * ${LOOK.heatBands}.0) / ${LOOK.heatBands}.0;
    float show = step(0.12, h) * mix(${LOOK.heatOverSea.toFixed(2)}, 1.0, isLand);
    vec3 color = mix(base, ramp(band), show);
    float edge = pow(1.0 - max(dot(vViewNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.2);
    gl_FragColor = vec4(mix(color, rim, edge * 0.55), 1.0);
  }`;

export function createOrbGlobe(host: HTMLElement, options: { face: (person: GlobePerson) => string; onPick?: (person: GlobePerson) => void }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.append(renderer.domElement);
  renderer.domElement.className = 'og-canvas';
  const pins = document.createElement('div');
  pins.className = 'og-pins';
  host.append(pins);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.copy(surface(LOOK.tiltDeg, LOOK.startLng, LOOK.distance));

  const uniforms = {
    land: { value: null as THREE.Texture | null },
    rim: { value: LOOK.rim },
    heat: { value: Array.from({ length: MAX_HEAT }, () => new THREE.Vector4()) },
    heatCount: { value: 0 },
    heatSigma: { value: LOOK.heatSizeDeg * DEG },
    c0: { value: LOOK.heat[0] }, c1: { value: LOOK.heat[1] }, c2: { value: LOOK.heat[2] }, c3: { value: LOOK.heat[3] },
  };
  const geometry = new THREE.SphereGeometry(1, 128, 96);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment });
  scene.add(new THREE.Mesh(geometry, material));
  let texture: THREE.CanvasTexture | null = null;
  void drawLand().then((canvas) => {
    if (disposed) return;
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace; // sample the canvas as-is (see rgb above)
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    uniforms.land.value = texture;
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.minDistance = 2.4;
  controls.maxDistance = 6;
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = LOOK.spin;
  let resumeSpin = 0;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeSpin); });
  controls.addEventListener('end', () => {
    resumeSpin = window.setTimeout(() => { controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; }, 3000);
  });

  let people: GlobePerson[] = [];
  let clusters: { key: string; members: GlobePerson[]; at: THREE.Vector3 }[] = [];
  const nodes = new Map<string, HTMLElement>();
  let lastCluster = 0;
  let flight: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null;
  let disposed = false;
  let frame = 0;
  const size = { w: 1, h: 1 };

  function resize() {
    size.w = Math.max(1, host.clientWidth);
    size.h = Math.max(1, host.clientHeight);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  function updateHeat() {
    const spots: { v: THREE.Vector3; n: number }[] = [];
    for (const p of people) {
      const v = surface(p.place.lat, p.place.lng);
      const near = spots.find((s) => s.v.angleTo(v) < LOOK.heatSizeDeg * DEG);
      if (near) near.n += 1; else spots.push({ v, n: 1 });
    }
    spots.sort((a, b) => b.n - a.n).slice(0, MAX_HEAT).forEach((s, i) => uniforms.heat.value[i].set(s.v.x, s.v.y, s.v.z, Math.min(1, 0.55 + s.n * 0.12)));
    uniforms.heatCount.value = Math.min(spots.length, MAX_HEAT);
  }

  const toScreen = (v: THREE.Vector3) => {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * size.w, y: (-p.y * 0.5 + 0.5) * size.h };
  };
  const facing = (v: THREE.Vector3) => v.clone().normalize().dot(camera.position.clone().sub(v).normalize());

  // Group people whose pins would overlap on screen; the group sits where its first member is.
  function recluster() {
    const next: typeof clusters = [];
    for (const person of people) {
      const at = surface(person.place.lat, person.place.lng);
      if (facing(at) <= 0) { next.push({ key: person.seed, members: [person], at }); continue; }
      const s = toScreen(at);
      const hit = next.find((c) => facing(c.at) > 0 && Math.hypot(toScreen(c.at).x - s.x, toScreen(c.at).y - s.y) < LOOK.clusterPx);
      if (hit) hit.members.push(person); else next.push({ key: person.seed, members: [person], at });
    }
    for (const c of next) c.key = c.members.map((m) => m.seed).sort().join('|');
    clusters = next;
    const keep = new Set(clusters.map((c) => c.key));
    for (const [key, node] of nodes) if (!keep.has(key)) { node.remove(); nodes.delete(key); }
    for (const c of clusters) {
      if (nodes.has(c.key)) continue;
      const node = document.createElement('div');
      node.className = 'og-pin';
      const lead = c.members[0];
      const where = lead.place.name.split(',')[0];
      node.innerHTML = `<span class="og-stem" aria-hidden="true"></span><button type="button" class="og-head" aria-label="${c.members.length > 1 ? `${c.members.length} people near ${where}` : `Someone in ${where}`}"><span class="og-faces">${c.members.slice(0, 3).map((m) => `<span class="og-face">${options.face(m)}</span>`).join('')}</span>${c.members.length > 1 ? `<span class="og-count">${c.members.length}</span>` : ''}<span class="og-tag"><b>${where}</b>${c.members.length > 1 ? ` · ${c.members.length}` : ''}</span></button>`;
      node.querySelector('button')!.addEventListener('click', () => { fly(c.at); options.onPick?.(lead); });
      pins.append(node);
      nodes.set(c.key, node);
    }
  }

  function placePins() {
    for (const c of clusters) {
      const node = nodes.get(c.key);
      if (!node) continue;
      const face = facing(c.at);
      const alpha = Math.max(0, Math.min(1, (face - 0.08) / 0.25));
      if (!alpha) { node.style.visibility = 'hidden'; continue; }
      const s = toScreen(c.at);
      node.style.visibility = 'visible';
      node.style.opacity = String(alpha);
      node.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      node.style.zIndex = String(Math.round(face * 1000));
    }
  }

  // Turn the camera (not the globe) so a place comes round to the front.
  function fly(target: THREE.Vector3) {
    const distance = camera.position.length();
    const lat = Math.asin(target.y) / DEG;
    const lift = Math.max(-60, Math.min(60, lat + 8));
    const lng = Math.atan2(target.z, -target.x) / DEG - 180;
    flight = { from: camera.position.clone(), to: surface(lift, lng, distance), start: performance.now() };
    controls.autoRotate = false;
    clearTimeout(resumeSpin);
    resumeSpin = window.setTimeout(() => { controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; }, 6000);
  }

  function tick(now: number) {
    if (disposed) return;
    if (flight) {
      const t = Math.min(1, (now - flight.start) / 900);
      const e = 1 - (1 - t) ** 3;
      const r = flight.from.length() + (flight.to.length() - flight.from.length()) * e;
      camera.position.copy(flight.from.clone().normalize().lerp(flight.to.clone().normalize(), e).normalize().multiplyScalar(r));
      if (t === 1) flight = null;
    }
    controls.update();
    renderer.render(scene, camera);
    if (now - lastCluster > 250) { recluster(); lastCluster = now; }
    placePins();
    if (!host.classList.contains('is-ready') && uniforms.land.value) host.classList.add('is-ready');
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  const find = (match: Match) => clusters.find((c) => c.members.some(match));

  return {
    setPeople(next: GlobePerson[]) {
      people = next.filter((p) => Number.isFinite(p.place.lat) && Number.isFinite(p.place.lng));
      updateHeat();
      recluster();
    },
    focus(match: Match) {
      const person = people.find(match);
      if (person) fly(surface(person.place.lat, person.place.lng));
    },
    ping(match: Match) {
      const node = find(match) && nodes.get(find(match)!.key);
      if (!node) return;
      node.classList.remove('is-ping');
      void node.offsetWidth;
      node.classList.add('is-ping');
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(resumeSpin);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      texture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      pins.remove();
      host.classList.remove('is-ready');
    },
  };
}
