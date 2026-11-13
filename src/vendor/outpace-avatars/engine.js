// @outpacelabs/avatars 0.6.0 (MIT, Outpace Studios) — https://avatars.outpacestudios.com
// Vendored engine only: the React imports are stubbed so this runs as a plain ES module.
// The <GradientAvatar> component is not usable here; in the real React app install the package
// and use <GradientAvatar seed={id} colors={BRAND_ORB_COLORS} /> instead.
const useRef = () => ({}), useMemo = (f) => f(), useEffect = () => {};
const jsx = () => null;

// src/index.tsx

// src/engine.ts
var HARMONY_TYPES = [
  "analogous",
  "triadic",
  "splitComplementary",
  "tetradic",
  "complementary"
];
var GOLDEN_RATIO_CONJUGATE = 0.618033988749895;
var DEFAULT_BLUR_FRACTION = 0.06;
function seededRandom(seed) {
  let s = seed;
  return () => {
    s += 1831565813;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hslToHex(h, s, l) {
  h = (h % 360 + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (n) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
function harmonyHues(baseHue, harmony) {
  switch (harmony) {
    case "analogous":
      return [baseHue, baseHue + 30, baseHue + 60, baseHue - 30];
    case "triadic":
      return [baseHue, baseHue + 120, baseHue + 240];
    case "splitComplementary":
      return [baseHue, baseHue + 150, baseHue + 210];
    case "tetradic":
      return [baseHue, baseHue + 90, baseHue + 180, baseHue + 270];
    case "complementary":
      return [baseHue, baseHue + 180, baseHue + 20, baseHue + 200];
  }
}
function seedFromString(input) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2146121005) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2221713035) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
function toSeed(seed) {
  if (typeof seed === "number") return seed;
  return seedFromString(seed);
}
function normalizeHex(color) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return `#${h.toUpperCase()}`;
}
function normalizeColors(colors) {
  if (!colors?.length) return null;
  const out = [];
  for (const c of colors) {
    const h = normalizeHex(c);
    if (h) out.push(h);
  }
  return out.length ? out : null;
}
function generatePalette(seed, options = {}) {
  const s = toSeed(seed);
  const custom = normalizeColors(options.colors);
  if (custom) {
    const offset = s % custom.length;
    const colors2 = custom.map((_, i) => custom[(i + offset) % custom.length]);
    return { seed: s, colors: colors2, harmony: "custom" };
  }
  const random = seededRandom(s);
  const baseHue = s * GOLDEN_RATIO_CONJUGATE % 1 * 360;
  const harmonyIndex = Math.floor(random() * HARMONY_TYPES.length);
  const harmony = HARMONY_TYPES[harmonyIndex];
  const hues = harmonyHues(baseHue, harmony);
  const colors = hues.map((hue) => {
    const saturation = 75 + random() * 25;
    const lightness = 50 + random() * 20;
    return hslToHex(hue, saturation, lightness);
  });
  return { seed: s, colors, harmony };
}
function hexToRgb01(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function fill(hex, alpha, p3) {
  if (p3) {
    const [r, g, b] = hexToRgb01(hex);
    const a2 = alpha >= 1 ? "" : ` / ${alpha}`;
    return `color(display-p3 ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}${a2})`;
  }
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
  return `${hex}${a}`;
}
var SPOT_ALPHAS = [1, 221 / 255, 136 / 255, 0];
var DETAIL_MIN_SIZE = 16;
var DETAIL_FULL_SIZE = 160;
var MIN_COLORS = 2;
var MIN_SPOTS = 4;
var CENTER_PULL = 0.15;
var RADIUS_BOOST = 0.2;
var MIN_CELL_PX = 3;
var MIN_DITHER_CELLS = 8;
var MAX_DITHER_CELLS = 64;
function detailFor(displaySize) {
  if (!(displaySize > 0)) return 1;
  const t = Math.log2(displaySize / DETAIL_MIN_SIZE) / Math.log2(DETAIL_FULL_SIZE / DETAIL_MIN_SIZE);
  return Math.max(0, Math.min(1, t));
}
function paletteForDetail(colors, detail) {
  if (colors.length <= MIN_COLORS) return colors;
  const n = Math.round(MIN_COLORS + detail * (colors.length - MIN_COLORS));
  return colors.slice(0, Math.max(MIN_COLORS, Math.min(colors.length, n)));
}
function ditherCells(displaySize) {
  const byPixels = Math.floor(displaySize / MIN_CELL_PX);
  return Math.max(MIN_DITHER_CELLS, Math.min(MAX_DITHER_CELLS, byPixels));
}
function drawMeshGradient(ctx, seed, size, options = {}) {
  const s = toSeed(seed);
  const { colors } = generatePalette(s, options);
  const p3 = options.p3 ?? false;
  const detail = detailFor(options.displaySize ?? size);
  const palette = paletteForDetail(colors, detail);
  const random = seededRandom(s * 12345);
  ctx.fillStyle = fill(palette[0], 1, p3);
  ctx.fillRect(0, 0, size, size);
  const numSpots = 8 + Math.floor(random() * 5);
  const spots = [];
  for (let i = 0; i < numSpots; i++) {
    const angle = random() * Math.PI * 2;
    const distance = random() * size * 0.4;
    const centerX = size / 2 + Math.cos(angle) * distance;
    const centerY = size / 2 + Math.sin(angle) * distance;
    spots.push({
      x: centerX + (random() - 0.5) * size * 0.3,
      y: centerY + (random() - 0.5) * size * 0.3,
      radius: size * (0.3 + random() * 0.4),
      color: palette[i % palette.length]
    });
  }
  spots.sort((a, b) => b.radius - a.radius);
  const keep = Math.max(
    MIN_SPOTS,
    Math.round(MIN_SPOTS + detail * (numSpots - MIN_SPOTS))
  );
  const spread = 1 - (1 - detail) * CENTER_PULL;
  const grow = 1 + (1 - detail) * RADIUS_BOOST;
  const mid = size / 2;
  ctx.globalCompositeOperation = "source-over";
  for (const raw of spots.slice(0, keep)) {
    const spot = {
      x: mid + (raw.x - mid) * spread,
      y: mid + (raw.y - mid) * spread,
      radius: raw.radius * grow,
      color: raw.color
    };
    const g = ctx.createRadialGradient(
      spot.x,
      spot.y,
      0,
      spot.x,
      spot.y,
      spot.radius
    );
    g.addColorStop(0, fill(spot.color, SPOT_ALPHAS[0], p3));
    g.addColorStop(0.3, fill(spot.color, SPOT_ALPHAS[1], p3));
    g.addColorStop(0.6, fill(spot.color, SPOT_ALPHAS[2], p3));
    g.addColorStop(1, fill(spot.color, SPOT_ALPHAS[3], p3));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const hx = size * 0.3 + random() * size * 0.2;
  const hy = size * 0.3 + random() * size * 0.2;
  const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, size * 0.3);
  hg.addColorStop(0, "rgba(255,255,255,0.15)");
  hg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, size, size);
}
var DITHER_ANGLE = Math.PI / 4;
function makeBayer(n) {
  let m = [[0]];
  for (let k = 0; k < n; k++) {
    const s = m.length;
    const next = Array.from({ length: s * 2 }, () => []);
    for (let y = 0; y < s * 2; y++) {
      for (let x = 0; x < s * 2; x++) {
        const base = m[y % s][x % s] * 4;
        const add = x < s ? y < s ? 0 : 3 : y < s ? 2 : 1;
        next[y][x] = base + add;
      }
    }
    m = next;
  }
  const max = m.length * m.length;
  return m.map((row) => row.map((v) => (v + 0.5) / max));
}
var BAYER = makeBayer(3);
function drawDither(ctx, seed, size, options = {}) {
  const s = toSeed(seed);
  const { colors } = generatePalette(s, options);
  const p3 = options.p3 ?? false;
  const display = options.displaySize ?? size;
  const detail = detailFor(display);
  const palette = paletteForDetail(colors, detail);
  const n = ditherCells(display);
  const dx = Math.cos(DITHER_ANGLE);
  const dy = Math.sin(DITHER_ANGLE);
  const min = Math.min(0, dx) + Math.min(0, dy);
  const span = Math.abs(dx) + Math.abs(dy) || 1;
  for (let gy = 0; gy < n; gy++) {
    const y0 = Math.round(gy * size / n);
    const y1 = Math.round((gy + 1) * size / n);
    for (let gx = 0; gx < n; gx++) {
      const x0 = Math.round(gx * size / n);
      const x1 = Math.round((gx + 1) * size / n);
      const px = (gx + 0.5) / n;
      const py = (gy + 0.5) / n;
      const v = (px * dx + py * dy - min) / span;
      const scaled = v * (palette.length - 1);
      const idx = Math.floor(scaled);
      const frac = scaled - idx;
      const t = BAYER[gy % 8][gx % 8];
      const ci = frac > t ? Math.min(idx + 1, palette.length - 1) : idx;
      ctx.fillStyle = fill(palette[ci], 1, p3);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}
function get2d(canvas, p3) {
  return canvas.getContext("2d", {
    colorSpace: p3 ? "display-p3" : "srgb"
  });
}
function blurFor(size, blur) {
  if (blur === 0) return 0;
  return blur ?? Math.round(size * DEFAULT_BLUR_FRACTION);
}
function renderGradient(canvas, seed, options = {}) {
  const size = canvas.width;
  const blur = blurFor(size, options.blur);
  const ctx = get2d(canvas, options.p3);
  if (!ctx) return;
  if (options.pattern === "dither") {
    ctx.clearRect(0, 0, size, size);
    drawDither(ctx, seed, size, options);
    return;
  }
  if (blur <= 0) {
    ctx.clearRect(0, 0, size, size);
    drawMeshGradient(ctx, seed, size, options);
    return;
  }
  const scratch = createCanvas(size, size);
  const sctx = get2d(scratch, options.p3);
  if (!sctx) return;
  drawMeshGradient(sctx, seed, size, options);
  const scaleUp = 1 + blur / size * 4;
  const dw = size * scaleUp;
  const offset = (dw - size) / 2;
  ctx.clearRect(0, 0, size, size);
  if (supportsCanvasFilter()) {
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(scratch, -offset, -offset, dw, dw);
    ctx.filter = "none";
    return;
  }
  const factor = Math.max(2, Math.min(16, blur / 2));
  const sw = Math.max(1, Math.round(size / factor));
  const small = createCanvas(sw, sw);
  const smallCtx = get2d(small, options.p3);
  if (!smallCtx) {
    ctx.drawImage(scratch, -offset, -offset, dw, dw);
    return;
  }
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = "high";
  smallCtx.drawImage(scratch, 0, 0, sw, sw);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, -offset, -offset, dw, dw);
}
var canvasFilterSupport = null;
function supportsCanvasFilter() {
  if (canvasFilterSupport !== null) return canvasFilterSupport;
  const probe = createCanvas(1, 1).getContext(
    "2d"
  );
  if (!probe) {
    canvasFilterSupport = false;
    return canvasFilterSupport;
  }
  probe.filter = "blur(1px)";
  canvasFilterSupport = probe.filter === "blur(1px)";
  return canvasFilterSupport;
}
function createCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function gradientToDataURL(seed, options = {}) {
  const { size = 512, type = "image/png", quality = 0.92 } = options;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  renderGradient(canvas, seed, options);
  return canvas.toDataURL(type, quality);
}
function gradientToBlob(seed, options = {}) {
  const { size = 512, type = "image/png", quality = 0.92 } = options;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  renderGradient(canvas, seed, options);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
var RENDER_SIZE = 256;
var BLUR_FRACTION = 0.06;
function GradientAvatar({
  seed,
  size = 32,
  pattern = "mesh",
  radius = "9999px",
  colors,
  p3 = false,
  className,
  style
}) {
  const canvasRef = useRef(null);
  const colorsKey = colors?.join(",");
  const palette = useMemo(
    () => colorsKey ? colorsKey.split(",") : void 0,
    [colorsKey]
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", {
      colorSpace: p3 ? "display-p3" : "srgb"
    });
    if (!ctx) return;
    ctx.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);
    const opts = { colors: palette, p3, displaySize: size };
    if (pattern === "dither") drawDither(ctx, seed, RENDER_SIZE, opts);
    else drawMeshGradient(ctx, seed, RENDER_SIZE, opts);
  }, [seed, pattern, p3, palette, size]);
  const blurPx = pattern === "dither" ? 0 : Math.max(1, Math.round(size * BLUR_FRACTION));
  return /* @__PURE__ */ jsx(
    "span",
    {
      className,
      style: {
        display: "inline-block",
        overflow: "hidden",
        borderRadius: radius,
        width: size,
        height: size,
        ...style
      },
      children: /* @__PURE__ */ jsx(
        "canvas",
        {
          ref: canvasRef,
          width: RENDER_SIZE,
          height: RENDER_SIZE,
          style: {
            width: "100%",
            height: "100%",
            display: "block",
            filter: blurPx > 0 ? `blur(${blurPx}px)` : void 0
          }
        }
      )
    }
  );
}

export { GradientAvatar, drawDither, drawMeshGradient, generatePalette, gradientToBlob, gradientToDataURL, renderGradient, seedFromString, toSeed };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map