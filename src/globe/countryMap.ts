/* Live → click a group on the globe: the globe flies in, then this draws that country flat with a dot per city.
   Boundaries come from world-atlas on the jsDelivr CDN, loaded once on first use. */
import { feature, geoPath, geoProjection } from './geo.js';

const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
// Our country names → the atlas's, where they differ.
const ATLAS_NAME: Record<string, string> = { us: 'United States of America', cz: 'Czechia', kr: 'South Korea', ru: 'Russia' };

export type MapPlace = { name: string; lat: number; lng: number; count: number };
type Ring = [number, number][];
type Shape = { type: 'Feature'; properties: { name: string }; geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] } };

/** Keep only the parts of a country near its visitors, so overseas territories don't shrink the mainland. */
function nearParts(shape: Shape, lng: number, lat: number): Shape {
  if (shape.geometry.type !== 'MultiPolygon') return shape;
  const near = shape.geometry.coordinates.filter((poly) => poly[0].some(([x, y]) => Math.abs(((x - lng + 540) % 360) - 180) < 22 && Math.abs(y - lat) < 18));
  return near.length ? { ...shape, geometry: { type: 'MultiPolygon', coordinates: near } } : shape;
}

let countries: Promise<{ features: Shape[] }> | null = null;
function loadCountries() {
  countries ??= fetch(ATLAS)
    .then((r) => { if (!r.ok) throw new Error('Country shapes unavailable'); return r.json(); })
    .then((topology) => feature(topology, topology.objects.countries))
    .catch((error) => { countries = null; throw error; });
  return countries;
}

const cssVar = (el: Element, name: string, fallback: string) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;

/** Orthographic view centered on the country, so it matches the globe it came from. */
function projectionAt(lng: number, lat: number) {
  return geoProjection((lambda: number, phi: number) => [Math.cos(phi) * Math.sin(lambda), Math.sin(phi)])
    .rotate([-lng, -lat]).clipAngle(90).precision(0.35);
}

/** Draws the country into the canvas. Resolves false when the shape can't be found or loaded. */
export async function drawCountry(canvas: HTMLCanvasElement, cc: string, countryName: string, places: MapPlace[], inset = 0): Promise<boolean> {
  let shapes;
  try { shapes = await loadCountries(); } catch { return false; }
  const name = ATLAS_NAME[cc] ?? countryName;
  const found = shapes.features.find((s) => s.properties.name === name);
  if (!found) return false;

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const lng = places.reduce((a, p) => a + p.lng, 0) / Math.max(1, places.length);
  const lat = places.reduce((a, p) => a + p.lat, 0) / Math.max(1, places.length);
  const shape = nearParts(found, lng, lat);
  const pad = 56;
  const projection = projectionAt(lng, lat).fitExtent([[inset + pad, pad + 40], [rect.width - pad, rect.height - pad - 70]], shape);
  const path = geoPath(projection, ctx);

  ctx.beginPath(); path(shape);
  ctx.fillStyle = cssVar(canvas, '--v2-shell', '#efeff3'); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = cssVar(canvas, '--v2-line', '#d6d6e0'); ctx.stroke();

  const accent = cssVar(canvas, '--accent', '#6360F0');
  const ink = cssVar(canvas, '--ink-2', '#4a4a55');
  ctx.font = '500 12px Inter, system-ui, sans-serif';
  for (const place of places) {
    const xy = projection([place.lng, place.lat]);
    if (!xy) continue;
    const [x, y] = xy;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.globalAlpha = 0.16; ctx.fillStyle = accent; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText(`${place.name.split(',')[0]} · ${place.count}`, x + 14, y + 4);
  }
  canvas.setAttribute('aria-label', places.map((p) => `${p.name}: ${p.count} ${p.count === 1 ? 'visitor' : 'visitors'}`).join('. '));
  return true;
}
