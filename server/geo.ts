/** Coarse place from Cloudflare edge headers — never stores IP. */

type Place = { cc: string; city: string; place: string; lat: number; lng: number };

const COUNTRY: Record<string, { name: string; lat: number; lng: number }> = {
  us: { name: 'United States', lat: 39.8, lng: -98.5 },
  gb: { name: 'United Kingdom', lat: 54.0, lng: -2.0 },
  de: { name: 'Germany', lat: 51.2, lng: 10.4 },
  fr: { name: 'France', lat: 46.2, lng: 2.2 },
  nl: { name: 'Netherlands', lat: 52.1, lng: 5.3 },
  be: { name: 'Belgium', lat: 50.5, lng: 4.5 },
  es: { name: 'Spain', lat: 40.5, lng: -3.7 },
  it: { name: 'Italy', lat: 41.9, lng: 12.6 },
  pt: { name: 'Portugal', lat: 39.4, lng: -8.2 },
  ie: { name: 'Ireland', lat: 53.1, lng: -8.0 },
  se: { name: 'Sweden', lat: 60.1, lng: 18.6 },
  no: { name: 'Norway', lat: 60.5, lng: 8.5 },
  dk: { name: 'Denmark', lat: 56.3, lng: 9.5 },
  fi: { name: 'Finland', lat: 61.9, lng: 25.7 },
  pl: { name: 'Poland', lat: 52.1, lng: 19.4 },
  cz: { name: 'Czechia', lat: 49.8, lng: 15.5 },
  at: { name: 'Austria', lat: 47.5, lng: 14.6 },
  ch: { name: 'Switzerland', lat: 46.8, lng: 8.2 },
  ca: { name: 'Canada', lat: 56.1, lng: -106.3 },
  mx: { name: 'Mexico', lat: 23.6, lng: -102.5 },
  br: { name: 'Brazil', lat: -14.2, lng: -51.9 },
  ar: { name: 'Argentina', lat: -38.4, lng: -63.6 },
  au: { name: 'Australia', lat: -25.3, lng: 133.8 },
  nz: { name: 'New Zealand', lat: -40.9, lng: 174.9 },
  jp: { name: 'Japan', lat: 36.2, lng: 138.3 },
  kr: { name: 'South Korea', lat: 35.9, lng: 127.8 },
  cn: { name: 'China', lat: 35.9, lng: 104.2 },
  in: { name: 'India', lat: 20.6, lng: 79.0 },
  sg: { name: 'Singapore', lat: 1.35, lng: 103.8 },
  hk: { name: 'Hong Kong', lat: 22.3, lng: 114.2 },
  tw: { name: 'Taiwan', lat: 23.7, lng: 121.0 },
  ae: { name: 'United Arab Emirates', lat: 23.4, lng: 53.8 },
  il: { name: 'Israel', lat: 31.0, lng: 35.0 },
  za: { name: 'South Africa', lat: -30.6, lng: 22.9 },
  ng: { name: 'Nigeria', lat: 9.1, lng: 8.7 },
  eg: { name: 'Egypt', lat: 26.8, lng: 30.8 },
  tr: { name: 'Türkiye', lat: 39.0, lng: 35.2 },
  ua: { name: 'Ukraine', lat: 48.4, lng: 31.2 },
  lt: { name: 'Lithuania', lat: 55.2, lng: 23.9 },
  lv: { name: 'Latvia', lat: 56.9, lng: 24.1 },
  ee: { name: 'Estonia', lat: 58.6, lng: 25.0 },
  ro: { name: 'Romania', lat: 45.9, lng: 24.9 },
  hu: { name: 'Hungary', lat: 47.2, lng: 19.5 },
  gr: { name: 'Greece', lat: 39.1, lng: 21.8 },
  ph: { name: 'Philippines', lat: 12.9, lng: 121.8 },
  th: { name: 'Thailand', lat: 15.9, lng: 100.9 },
  vn: { name: 'Vietnam', lat: 14.1, lng: 108.3 },
  id: { name: 'Indonesia', lat: -2.5, lng: 118.0 },
  my: { name: 'Malaysia', lat: 4.2, lng: 101.9 },
};

function cleanCity(value: string | null) {
  if (!value) return '';
  const city = value.trim().slice(0, 80);
  if (!city || city === 'Unknown' || city === 'null') return '';
  return city;
}

function parseCoord(value: string | null) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function placeFromRequest(request: Request): Place | null {
  const rawCc = (request.headers.get('CF-IPCountry') || request.headers.get('cf-ipcountry') || '').trim().toLowerCase();
  if (!rawCc || rawCc === 'xx' || rawCc === 't1' || rawCc.length !== 2) return null;
  const country = COUNTRY[rawCc] ?? { name: rawCc.toUpperCase(), lat: 20, lng: 0 };
  const city = cleanCity(request.headers.get('CF-IPCity') || request.headers.get('cf-ipcity'));
  const lat = parseCoord(request.headers.get('CF-IPLatitude') || request.headers.get('cf-iplatitude')) ?? country.lat;
  const lng = parseCoord(request.headers.get('CF-IPLongitude') || request.headers.get('cf-iplongitude')) ?? country.lng;
  const place = city ? `${city}, ${country.name}` : country.name;
  return { cc: rawCc, city: city || country.name, place, lat, lng };
}

/** Local/dev only: deterministic coarse place so Live can be exercised without Cloudflare. */
export function localDemoPlace(visitorId: string): Place {
  const keys = Object.keys(COUNTRY);
  let hash = 0;
  for (let i = 0; i < visitorId.length; i++) hash = (hash * 31 + visitorId.charCodeAt(i)) >>> 0;
  const cc = keys[hash % keys.length];
  const country = COUNTRY[cc];
  return { cc, city: country.name, place: country.name, lat: country.lat, lng: country.lng };
}
