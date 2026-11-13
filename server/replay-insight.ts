import { getObject } from './object-store';

/** Bump when evidence/question shape changes so cached insights regenerate. */
export const INSIGHT_VERSION = 3;

export type PageDwell = { path: string; dwellMs: number };

export type ClickLabel = { label: string; tag: string; count: number };

/** Where attention lingered (scroll/viewport), not only clicks. */
export type AttentionSlice = {
  label: string;
  dwellMs: number;
  share: number;
};

export type ReplayEvidence = {
  durationMs: number;
  device: string;
  referrer: string;
  pages: PageDwell[];
  pageviews: number;
  clicks: number;
  inputs: number;
  scrolls: number;
  mouseMoves: number;
  shortBounce: boolean;
  multiPage: boolean;
  formInteraction: boolean;
  eventCount: number;
  chunkCount: number;
  pageTitle: string | null;
  clicked: ClickLabel[];
  /** Sections/copy they spent the most time viewing (scroll attention). */
  attended: AttentionSlice[];
  noticed: string[];
  ctas: string[];
  formHints: string[];
  hasEmail: boolean;
  hasName: boolean;
};

export type ReplayInsightResult = {
  summaryText: string;
  outcome: string;
  friction: number;
  worthWatching: boolean;
  primaryInterest: string;
  emailReady: boolean;
  emailReadyConfidence: number;
  stage: string;
  intent: number;
  highlights: string[];
  emailHooks: string[];
  decisionsJson: unknown;
  model: string;
  insightVersion: number;
};

export type VisitorInsightInput = {
  hasEmail: boolean;
  hasName: boolean;
  sessions: Array<{
    outcome: string | null;
    primaryInterest: string | null;
    summary: string | null;
    emailReady: boolean | null;
    emailReadyConfidence: number | null;
    stage: string | null;
    intent: number | null;
    highlights: string[] | null;
    emailHooks: string[] | null;
    durationMs: number;
  }>;
  totalDwellMs: number;
  pageviews: number;
  orders: number;
  revenue: number;
};

export type VisitorInsightResult = {
  summaryText: string;
  emailReady: boolean;
  emailReadyConfidence: number;
  interests: string[];
  emailHooks: string[];
  gaps: string[];
  decisionsJson: unknown;
  model: string;
  insightVersion: number;
  sourceSessionCount: number;
};

type RrwebNode = {
  id?: number;
  type?: number;
  tagName?: string;
  attributes?: Record<string, string>;
  childNodes?: RrwebNode[];
  textContent?: string;
};

type RrwebEvent = {
  type?: number;
  timestamp?: number;
  data?: Record<string, unknown>;
};

const MODEL = 'gpt-6-luna';
const SKIP_TAGS = /^(script|style|noscript|svg|path|meta|link|head)$/i;
const NOISE_TEXT = /[{:;]|--[a-z]|#lovable|@media|function\s*\(|<\/?[a-z]|https?:\/\/|\.css\b|\.js\b/i;

export function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function openaiKey() {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

function cleanText(value: unknown, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > 220) return '';
  if (NOISE_TEXT.test(text)) return '';
  return text.slice(0, max);
}

function nodeText(node: RrwebNode | undefined, max = 100): string {
  if (!node) return '';
  const parts: string[] = [];
  const walk = (n: RrwebNode | undefined) => {
    if (!n || parts.join(' ').length >= max) return;
    if (n.type === 3) {
      const t = cleanText(n.textContent, max);
      if (t) parts.push(t);
      return;
    }
    if (n.type === 2 && n.tagName && SKIP_TAGS.test(n.tagName)) return;
    for (const child of n.childNodes || []) walk(child);
  };
  walk(node);
  return parts.join(' ').slice(0, max);
}

function indexNode(
  map: Map<number, RrwebNode>,
  node: RrwebNode | undefined,
  parentMap?: Map<number, number>,
  parentId?: number,
) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.id === 'number') {
    map.set(node.id, node);
    if (parentMap && parentId != null) parentMap.set(node.id, parentId);
  }
  const selfId = typeof node.id === 'number' ? node.id : parentId;
  for (const child of node.childNodes || []) indexNode(map, child, parentMap, selfId);
}

type ContentAnchor = {
  id: number;
  label: string;
  weight: number;
};

function maybeCollectAnchor(node: RrwebNode | undefined, into: ContentAnchor[]) {
  if (!node || node.type !== 2 || into.length >= 24 || typeof node.id !== 'number') return;
  const tag = (node.tagName || '').toLowerCase();
  const attrs = node.attributes || {};
  const cls = `${attrs.class || ''} ${attrs.id || ''}`;
  const text = nodeText(node, 100);
  if (!text) return;
  const interestingSection = tag === 'section' || tag === 'article'
    || /review|ingredient|product|pricing|feature|testimonial|spec|step|match|preview|hero/i.test(cls);
  if (/^h[1-3]$/.test(tag)) {
    if (!into.some((row) => row.label.toLowerCase() === text.toLowerCase())) {
      into.push({ id: node.id, label: text, weight: Math.max(48, text.length) });
    }
    return;
  }
  if (interestingSection) {
    // Prefer a short title-like slice for section cards.
    const label = text.length > 72 ? `${text.slice(0, 69)}…` : text;
    if (!into.some((row) => row.label.toLowerCase() === label.toLowerCase())) {
      into.push({ id: node.id, label, weight: Math.max(80, Math.min(220, text.length)) });
    }
  }
}

function attentionLabelForNode(
  map: Map<number, RrwebNode>,
  parentMap: Map<number, number>,
  id: number | undefined,
) {
  if (id == null) return null;
  let cursor: number | undefined = id;
  for (let depth = 0; depth < 8 && cursor != null; depth += 1) {
    const node = map.get(cursor);
    if (!node) break;
    const tag = (node.tagName || '').toLowerCase();
    const text = nodeText(node, 90);
    if ((/^h[1-3]$/.test(tag) || tag === 'section' || tag === 'article' || tag === 'button') && text) {
      return text.length > 72 ? `${text.slice(0, 69)}…` : text;
    }
    cursor = parentMap.get(cursor);
  }
  return labelForNode(map, id)?.label || null;
}

/** Map scroll timeline + DOM order onto section dwell (no real layout boxes in rrweb). */
function computeScrollAttention(input: {
  anchors: ContentAnchor[];
  scrolls: { ts: number; y: number }[];
  mouse: { ts: number; id?: number }[];
  nodeMap: Map<number, RrwebNode>;
  parentMap: Map<number, number>;
  viewportH: number;
  minTs: number;
  maxTs: number;
}): AttentionSlice[] {
  const dwell = new Map<string, number>();
  const add = (label: string, ms: number) => {
    const cleaned = cleanText(label, 100);
    if (!cleaned || ms < 80) return;
    dwell.set(cleaned, (dwell.get(cleaned) || 0) + ms);
  };

  const viewportH = Math.max(320, input.viewportH || 700);
  const maxScroll = input.scrolls.reduce((max, row) => Math.max(max, row.y), 0);
  const docH = Math.max(viewportH * 1.15, maxScroll + viewportH);

  const anchors = input.anchors
    .filter((row) => row.label && Number.isFinite(row.id))
    .slice(0, 20);
  if (anchors.length) {
    const totalWeight = anchors.reduce((sum, row) => sum + row.weight, 0) || 1;
    let cursorY = 0;
    const bands = anchors.map((row) => {
      const height = Math.max(72, (row.weight / totalWeight) * docH);
      const top = cursorY;
      const bottom = cursorY + height;
      cursorY = bottom;
      return { label: row.label, top, bottom };
    });

    const samples = [...input.scrolls].sort((a, b) => a.ts - b.ts);
    if (!samples.length && Number.isFinite(input.minTs) && Number.isFinite(input.maxTs)) {
      samples.push({ ts: input.minTs, y: 0 });
    }
    if (samples.length && samples[0].ts > input.minTs) {
      samples.unshift({ ts: input.minTs, y: samples[0].y });
    }
    if (samples.length && input.maxTs > samples[samples.length - 1].ts) {
      samples.push({ ts: input.maxTs, y: samples[samples.length - 1].y });
    }

    for (let i = 0; i < samples.length - 1; i += 1) {
      const duration = Math.min(45_000, Math.max(0, samples[i + 1].ts - samples[i].ts));
      if (duration < 80) continue;
      const y = Math.max(0, samples[i].y);
      const viewTop = y;
      const viewBottom = y + viewportH;
      // Reading zone: slightly above geometric center.
      const focus = y + viewportH * 0.38;
      let best: { label: string; score: number } | null = null;
      for (const band of bands) {
        const overlap = Math.max(0, Math.min(viewBottom, band.bottom) - Math.max(viewTop, band.top));
        if (overlap <= 0) continue;
        const centerHit = focus >= band.top && focus < band.bottom ? viewportH : 0;
        const score = overlap + centerHit;
        if (!best || score > best.score) best = { label: band.label, score };
      }
      if (best) add(best.label, duration);
    }
  }

  // Pointer dwell on concrete nodes (desktop) — boosts attention beyond scroll alone.
  const mouse = [...input.mouse].sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < mouse.length - 1; i += 1) {
    const duration = Math.min(8_000, Math.max(0, mouse[i + 1].ts - mouse[i].ts));
    const label = attentionLabelForNode(input.nodeMap, input.parentMap, mouse[i].id);
    if (label) add(label, duration);
  }

  const total = [...dwell.values()].reduce((sum, ms) => sum + ms, 0) || 1;
  return [...dwell.entries()]
    .map(([label, dwellMs]) => ({
      label,
      dwellMs: Math.round(dwellMs),
      share: Math.round((dwellMs / total) * 1000) / 1000,
    }))
    .sort((a, b) => b.dwellMs - a.dwellMs)
    .slice(0, 8);
}

function labelForNode(map: Map<number, RrwebNode>, id: number | undefined) {
  if (id == null) return null;
  const node = map.get(id);
  if (!node) return null;
  const tag = (node.tagName || '').toLowerCase();
  const attrs = node.attributes || {};
  const text = cleanText(
    attrs['aria-label'] || attrs.title || attrs.alt || attrs.placeholder || nodeText(node, 100),
    100,
  );
  if (!text && !attrs.href) return null;
  return {
    tag: tag || 'node',
    label: text || cleanText(attrs.href, 80) || tag,
    href: attrs.href || null,
  };
}

function pushUnique(list: string[], value: string, max: number) {
  const cleaned = cleanText(value, 140);
  if (!cleaned) return;
  const key = cleaned.toLowerCase();
  if (list.some((item) => item.toLowerCase() === key)) return;
  if (list.length >= max) return;
  list.push(cleaned);
}

function bumpClick(map: Map<string, ClickLabel>, label: string, tag: string) {
  const key = `${tag}::${label.toLowerCase()}`;
  const prev = map.get(key);
  if (prev) prev.count += 1;
  else map.set(key, { label, tag, count: 1 });
}

/** Parse replay chunks into merchant-useful evidence (labels/copy, not typed secrets). */
export async function extractReplayEvidence(input: {
  objectKeys: string[];
  device?: string | null;
  referrer?: string | null;
  pages: PageDwell[];
  hasEmail?: boolean;
  hasName?: boolean;
}): Promise<ReplayEvidence> {
  const nodeMap = new Map<number, RrwebNode>();
  const parentMap = new Map<number, number>();
  const clickMap = new Map<string, ClickLabel>();
  const anchors: ContentAnchor[] = [];
  const scrollSamples: { ts: number; y: number }[] = [];
  const mouseSamples: { ts: number; id?: number }[] = [];
  const noticed: string[] = [];
  const ctas: string[] = [];
  const formHints: string[] = [];
  let pageTitle: string | null = null;
  let clicks = 0;
  let inputs = 0;
  let scrolls = 0;
  let mouseMoves = 0;
  let formInteraction = false;
  let eventCount = 0;
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = 0;
  let viewportH = 700;

  const harvestVisible = (node: RrwebNode | undefined) => {
    if (!node) return;
    maybeCollectAnchor(node, anchors);
    if (node.type === 2) {
      const tag = (node.tagName || '').toLowerCase();
      const attrs = node.attributes || {};
      if (tag === 'title') {
        const title = nodeText(node, 120);
        if (title) pageTitle = title;
      }
      if (/^h[1-3]$/.test(tag)) pushUnique(noticed, nodeText(node, 120), 16);
      if (tag === 'button' || attrs.role === 'button') pushUnique(ctas, nodeText(node, 80) || attrs['aria-label'] || '', 16);
      if (tag === 'a' && (attrs.href || nodeText(node, 60))) {
        pushUnique(ctas, nodeText(node, 80) || attrs['aria-label'] || attrs.href || '', 16);
      }
      if (tag === 'img' && attrs.alt) pushUnique(noticed, attrs.alt, 16);
      if ((tag === 'input' || tag === 'textarea') && attrs.placeholder) {
        pushUnique(formHints, attrs.placeholder, 10);
      }
      // Product-card style short copy on paragraphs/spans near buttons.
      if ((tag === 'p' || tag === 'span' || tag === 'li') && !SKIP_TAGS.test(tag)) {
        const text = nodeText(node, 140);
        if (text.length >= 24 && text.length <= 140) pushUnique(noticed, text, 16);
      }
    }
    for (const child of node.childNodes || []) harvestVisible(child);
  };

  for (const key of input.objectKeys.slice(0, 50)) {
    try {
      const raw = await getObject(key);
      const parsed = JSON.parse(raw.toString('utf8'));
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const event = item as RrwebEvent;
        eventCount += 1;
        const ts = Number(event.timestamp) || 0;
        if (ts) {
          if (ts < minTs) minTs = ts;
          if (ts > maxTs) maxTs = ts;
        }

        if (event.type === 2) {
          const node = event.data?.node as RrwebNode | undefined;
          indexNode(nodeMap, node, parentMap);
          harvestVisible(node);
          continue;
        }

        if (event.type === 4) {
          const href = cleanText(event.data?.href, 160);
          const title = cleanText(event.data?.title, 120);
          const height = Number(event.data?.height);
          if (Number.isFinite(height) && height > 200) viewportH = height;
          if (title) pageTitle = title;
          if (href) {
            try {
              const path = new URL(href).pathname;
              if (path) pushUnique(noticed, `Page ${path}`, 16);
            } catch { /* ignore */ }
          }
          continue;
        }

        if (event.type !== 3) continue;
        const source = Number(event.data?.source);
        if (source === 0) {
          const adds = event.data?.adds;
          if (Array.isArray(adds)) {
            for (const add of adds) {
              const node = add && typeof add === 'object' ? (add as { node?: RrwebNode }).node : undefined;
              indexNode(nodeMap, node, parentMap, Number((add as { parentId?: number }).parentId) || undefined);
              harvestVisible(node);
            }
          }
          const texts = event.data?.texts;
          if (Array.isArray(texts)) {
            for (const row of texts) {
              if (!row || typeof row !== 'object') continue;
              const id = Number((row as { id?: number }).id);
              const value = cleanText((row as { value?: string }).value, 140);
              if (id && value && nodeMap.has(id)) {
                const existing = nodeMap.get(id)!;
                existing.textContent = value;
              }
            }
          }
          continue;
        }

        // MouseMove=1, MouseInteraction=2, Scroll=3, ViewportResize=4, Input=5, TouchMove=6
        if (source === 4) {
          const height = Number(event.data?.height);
          if (Number.isFinite(height) && height > 200) viewportH = height;
          continue;
        }
        if (source === 1 || source === 6) {
          mouseMoves += 1;
          if (ts) {
            const positions = event.data?.positions;
            if (Array.isArray(positions) && positions.length) {
              const last = positions[positions.length - 1] as { id?: number };
              mouseSamples.push({ ts, id: Number(last?.id) || undefined });
            } else if (event.data?.id != null) {
              mouseSamples.push({ ts, id: Number(event.data.id) || undefined });
            }
          }
        } else if (source === 3) {
          scrolls += 1;
          const y = Number(event.data?.y);
          if (ts && Number.isFinite(y)) scrollSamples.push({ ts, y: Math.max(0, y) });
        } else if (source === 5) {
          inputs += 1;
          formInteraction = true;
          const id = Number(event.data?.id);
          const labeled = labelForNode(nodeMap, id);
          if (labeled?.label) pushUnique(formHints, labeled.label, 10);
        } else if (source === 2) {
          const kind = Number(event.data?.type);
          // MouseInteractions: MouseUp=1, Click=2, … Prefer Click only.
          if (kind !== 2) continue;
          clicks += 1;
          const id = Number(event.data?.id);
          const labeled = labelForNode(nodeMap, id);
          if (labeled?.label) {
            const interactive = labeled.tag === 'button' || labeled.tag === 'a' || labeled.tag === 'input' || labeled.tag === 'label';
            // Prefer short CTA-like labels in click stats; long copy goes to "noticed".
            if (interactive || labeled.label.length <= 48) {
              bumpClick(clickMap, labeled.label, labeled.tag || 'node');
            } else {
              pushUnique(noticed, labeled.label, 16);
            }
            if (labeled.tag === 'button' || labeled.tag === 'a') pushUnique(ctas, labeled.label, 16);
            else if (labeled.label.length >= 12) pushUnique(noticed, labeled.label, 16);
          }
        }
      }
    } catch {
      // Skip unreadable chunks; visit dwell still informs the summary.
    }
  }

  const pages = input.pages
    .map((page) => ({ path: (page.path || '/').slice(0, 120), dwellMs: Math.max(0, Number(page.dwellMs) || 0) }))
    .slice(0, 20);
  const durationFromEvents = Number.isFinite(minTs) && maxTs >= minTs ? Math.max(0, maxTs - minTs) : 0;
  const durationMs = Math.max(durationFromEvents, pages.reduce((sum, page) => sum + page.dwellMs, 0));
  const clicked = [...clickMap.values()].sort((a, b) => b.count - a.count).slice(0, 16);
  const attended = computeScrollAttention({
    anchors,
    scrolls: scrollSamples,
    mouse: mouseSamples,
    nodeMap,
    parentMap,
    viewportH,
    minTs: Number.isFinite(minTs) ? minTs : 0,
    maxTs: Number.isFinite(maxTs) ? maxTs : 0,
  });
  for (const row of attended.slice(0, 6)) pushUnique(noticed, row.label, 16);

  return {
    durationMs,
    device: input.device === 'phone' ? 'phone' : 'monitor',
    referrer: (input.referrer || '(direct)').slice(0, 120),
    pages: pages.length ? pages : [{ path: '/', dwellMs: durationMs }],
    pageviews: Math.max(pages.length, 1),
    clicks,
    inputs,
    scrolls,
    mouseMoves,
    shortBounce: durationMs > 0 && durationMs < 10_000,
    multiPage: pages.length > 1,
    formInteraction,
    eventCount,
    chunkCount: input.objectKeys.length,
    pageTitle,
    clicked,
    attended,
    noticed: noticed.slice(0, 16),
    ctas: ctas.slice(0, 16),
    formHints: formHints.slice(0, 10),
    hasEmail: Boolean(input.hasEmail),
    hasName: Boolean(input.hasName),
  };
}

/** @deprecated Use extractReplayEvidence — kept for older call sites during transition. */
export async function loadChunkEvents(objectKeys: string[]) {
  await extractReplayEvidence({ objectKeys, pages: [] });
  return [] as RrwebEvent[];
}

/** @deprecated Use extractReplayEvidence. */
export function buildEvidence(input: {
  device?: string | null;
  referrer?: string | null;
  paths: string[];
  dwellMs?: number;
  chunkCount: number;
  events: RrwebEvent[];
}): ReplayEvidence {
  return {
    durationMs: Number(input.dwellMs) || 0,
    device: input.device === 'phone' ? 'phone' : 'monitor',
    referrer: (input.referrer || '(direct)').slice(0, 120),
    pages: (input.paths.length ? input.paths : ['/']).map((path) => ({ path, dwellMs: 0 })),
    pageviews: Math.max(input.paths.length, 1),
    clicks: 0,
    inputs: 0,
    scrolls: 0,
    mouseMoves: 0,
    shortBounce: false,
    multiPage: input.paths.length > 1,
    formInteraction: false,
    eventCount: input.events.length,
    chunkCount: input.chunkCount,
    pageTitle: null,
    clicked: [],
    attended: [],
    noticed: [],
    ctas: [],
    formHints: [],
    hasEmail: false,
    hasName: false,
  };
}

function answerByName(answers: unknown, name: string): Record<string, unknown> | null {
  if (!Array.isArray(answers)) return null;
  const row = answers.find((item) => item && typeof item === 'object' && (item as { name?: string }).name === name);
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
}

function choiceOptions(values: string[], fallback: string[], otherLabel: string) {
  const merged = [...values, ...fallback, 'other']
    .map((value) => cleanText(value, 80))
    .filter(Boolean);
  const unique = [...new Set(merged.map((value) => value.toLowerCase()))]
    .map((key) => merged.find((value) => value.toLowerCase() === key)!)
    .slice(0, 12);
  if (!unique.includes('other')) unique.push('other');
  return unique.map((value) => ({
    value,
    description: value === 'other' ? otherLabel : `Signal: ${value}`,
  }));
}

function frictionBand(score: number) {
  if (score < 0.75) return 'none';
  if (score < 1.5) return 'low';
  if (score < 2.25) return 'medium';
  return 'high';
}

function fmtDur(ms: number) {
  const sec = Math.round(Math.max(0, ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

async function runDecisions(evidence: ReplayEvidence) {
  const interestChoices = choiceOptions(
    [
      ...evidence.attended.map((row) => row.label),
      ...evidence.clicked.map((row) => row.label),
      ...evidence.noticed.slice(0, 8),
      evidence.pageTitle || '',
      ...evidence.pages.map((page) => page.path),
    ],
    ['homepage', 'product details', 'pricing', 'upload flow', 'style preferences'],
    'None of the listed interests fit well.',
  );
  const hookChoices = choiceOptions(
    evidence.attended.map((row) => row.label)
      .concat(evidence.clicked.map((row) => row.label))
      .concat(evidence.noticed.slice(0, 6)),
    ['finish what they started', 'remind them of a style they liked', 'help with upload', 'answer a product question'],
    'A different angle fits better.',
  );
  const attentionChoices = choiceOptions(
    evidence.attended.map((row) => row.label),
    evidence.noticed.slice(0, 6).concat(['above the fold', 'unknown']),
    'Attention was spread or unclear.',
  );

  const res = await fetch('https://api.openai.com/v1/decisions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Classify this website session for a merchant analytics product.',
              'Use only the JSON evidence. Prefer concrete UI labels from attended/clicked/noticed/ctas.',
              'attended[] is scroll/viewport dwell — time spent viewing a section even without clicks. Weight it heavily for interest.',
              'email_ready means: enough behavioral detail to write a useful personalized email later (drafts come later; score readiness only).',
            ].join(' '),
          },
          { type: 'input_json', data: evidence },
        ],
      }],
      questions: [
        {
          name: 'outcome',
          type: 'choice',
          instructions: 'Overall visitor outcome for this session.',
          choices: [
            { value: 'bounce', description: 'Left almost immediately with little engagement.' },
            { value: 'browse', description: 'Looked around lightly without strong intent.' },
            { value: 'engaged', description: 'Actively explored content or options.' },
            { value: 'intent', description: 'Showed purchase, signup, or configuration intent.' },
            { value: 'frustrated', description: 'Showed struggle, rage clicks, or repeated friction.' },
          ],
        },
        {
          name: 'stage',
          type: 'choice',
          instructions: 'Where they are in the journey this session.',
          choices: [
            { value: 'land', description: 'Just arrived / scanning the first screen.' },
            { value: 'explore', description: 'Reading and browsing options.' },
            { value: 'configure', description: 'Setting preferences, filters, or upload steps.' },
            { value: 'compare', description: 'Comparing products, styles, or plans.' },
            { value: 'convert', description: 'Near signup, checkout, or primary CTA.' },
            { value: 'abandon', description: 'Started something meaningful then backed out.' },
          ],
        },
        {
          name: 'friction',
          type: 'score',
          instructions: 'How much friction or struggle appears in the session.',
          levels: [
            { label: 'none', description: 'Smooth session with no struggle signals.' },
            { label: 'low', description: 'Minor hesitation or one awkward moment.' },
            { label: 'medium', description: 'Clear struggle or confusion at points.' },
            { label: 'high', description: 'Repeated struggle or abandonment from friction.' },
          ],
        },
        {
          name: 'intent',
          type: 'score',
          instructions: 'Strength of purchase or conversion intent.',
          levels: [
            { label: 'none', description: 'No intent signals.' },
            { label: 'low', description: 'Mild curiosity.' },
            { label: 'medium', description: 'Clear interest in a specific option.' },
            { label: 'high', description: 'Strong conversion intent.' },
          ],
        },
        {
          name: 'worth_watching',
          type: 'predicate',
          instructions: 'A human merchant should watch this replay.',
        },
        {
          name: 'primary_interest',
          type: 'choice',
          instructions: 'Best concrete interest label from the evidence.',
          choices: interestChoices,
        },
        {
          name: 'secondary_interest',
          type: 'choice',
          instructions: 'Second-best interest label, or other.',
          choices: interestChoices,
        },
        {
          name: 'most_attended',
          type: 'choice',
          instructions: 'Section or copy they spent the most time viewing (from attended dwell, not only clicks).',
          choices: attentionChoices,
        },
        {
          name: 'reading_depth',
          type: 'score',
          instructions: 'How carefully they read content (lingering on sections) vs skimming.',
          levels: [
            { label: 'skim', description: 'Mostly scrolled past without lingering.' },
            { label: 'light', description: 'Brief pauses on a couple of blocks.' },
            { label: 'focused', description: 'Clear dwell on one or two sections.' },
            { label: 'deep', description: 'Long reading time on specific content.' },
          ],
        },
        {
          name: 'compared_options',
          type: 'predicate',
          instructions: 'They compared multiple options, styles, or products.',
        },
        {
          name: 'used_form',
          type: 'predicate',
          instructions: 'They typed into a form or described what they want.',
        },
        {
          name: 'hesitated',
          type: 'predicate',
          instructions: 'They hesitated, re-clicked, or second-guessed a choice.',
        },
        {
          name: 'knows_specific_hook',
          type: 'predicate',
          instructions: 'We know a concrete hook (product, style, CTA, or goal) for a later email.',
        },
        {
          name: 'email_ready',
          type: 'predicate',
          instructions: 'Behavioral evidence is strong enough to personalize an email later (identity optional).',
        },
        {
          name: 'needs_identity',
          type: 'predicate',
          instructions: 'Personalization would improve a lot if we had their email or name.',
        },
        {
          name: 'best_email_angle',
          type: 'choice',
          instructions: 'Best angle for a future personalized email (do not write the email).',
          choices: hookChoices,
        },
        {
          name: 'merchant_watch_reason',
          type: 'choice',
          instructions: 'If worth watching, why; else pick other.',
          choices: [
            { value: 'high intent', description: 'Close to converting.' },
            { value: 'rich preferences', description: 'Revealed clear tastes or constraints.' },
            { value: 'friction', description: 'Stuck or confused somewhere important.' },
            { value: 'drop-off', description: 'Abandoned after meaningful progress.' },
            { value: 'other', description: 'Another reason or not especially watchable.' },
          ],
        },
      ],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Decisions API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const answers = (body as { answers?: unknown }).answers;
  const outcome = String(answerByName(answers, 'outcome')?.choice || 'browse');
  const stage = String(answerByName(answers, 'stage')?.choice || 'explore');
  const frictionRaw = Number(answerByName(answers, 'friction')?.score);
  const friction = Number.isFinite(frictionRaw) ? Math.max(0, Math.min(3, frictionRaw)) : 0;
  const intentRaw = Number(answerByName(answers, 'intent')?.score);
  const intent = Number.isFinite(intentRaw) ? Math.max(0, Math.min(3, intentRaw)) : 0;
  const worthProb = Number(answerByName(answers, 'worth_watching')?.probability);
  const worthWatching = Number.isFinite(worthProb) ? worthProb >= 0.5 : false;
  const mostAttended = String(
    answerByName(answers, 'most_attended')?.choice
    || evidence.attended[0]?.label
    || '',
  );
  const primaryInterest = String(
    answerByName(answers, 'primary_interest')?.choice
    || mostAttended
    || evidence.clicked[0]?.label
    || evidence.pages[0]?.path
    || '/',
  );
  const emailProb = Number(answerByName(answers, 'email_ready')?.probability);
  const emailReadyConfidence = Number.isFinite(emailProb) ? Math.max(0, Math.min(1, emailProb)) : 0;
  const emailReady = emailReadyConfidence >= 0.55;
  const bestAngle = String(answerByName(answers, 'best_email_angle')?.choice || '');
  const secondary = String(answerByName(answers, 'secondary_interest')?.choice || '');
  const readingRaw = Number(answerByName(answers, 'reading_depth')?.score);
  const readingDepth = Number.isFinite(readingRaw) ? Math.max(0, Math.min(3, readingRaw)) : 0;
  return {
    answers,
    outcome,
    stage,
    friction,
    intent,
    worthWatching,
    primaryInterest,
    emailReady,
    emailReadyConfidence,
    bestAngle,
    secondary,
    mostAttended,
    readingDepth,
  };
}

function extractResponseText(body: unknown) {
  const direct = (body as { output_text?: string }).output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const output = (body as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return '';
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    if ((item as { type?: string }).type && (item as { type?: string }).type !== 'message') continue;
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === 'object' && typeof (part as { text?: string }).text === 'string') {
        parts.push((part as { text: string }).text);
      }
    }
  }
  return parts.join(' ').trim();
}

async function runNarrative(evidence: ReplayEvidence, decisions: {
  outcome: string;
  stage: string;
  friction: number;
  intent: number;
  worthWatching: boolean;
  primaryInterest: string;
  emailReady: boolean;
  emailReadyConfidence: number;
  bestAngle: string;
  secondary: string;
  mostAttended: string;
  readingDepth: number;
}) {
  const pageLine = evidence.pages
    .map((page) => `${page.path} (${fmtDur(page.dwellMs)})`)
    .join(', ');
  const clickLine = evidence.clicked
    .slice(0, 8)
    .map((row) => `${row.label}${row.count > 1 ? `×${row.count}` : ''}`)
    .join(', ');
  const attendLine = evidence.attended
    .slice(0, 5)
    .map((row) => `“${row.label}” ${fmtDur(row.dwellMs)} (${Math.round(row.share * 100)}%)`)
    .join(', ');

  const prompt = [
    'Write 2-4 short sentences for a merchant about this website visit.',
    'Must mention approximate time spent and, when available, where they lingered longest (attended sections) even if they did not click.',
    'Also mention specific UI labels they clicked when relevant.',
    'Ground only in evidence and labels. Do not invent personal details, emails, quotes, or prices.',
    'Do not write an email. Plain prose, no markdown.',
    `Labels: outcome=${decisions.outcome}; stage=${decisions.stage}; friction=${frictionBand(decisions.friction)}; intent=${decisions.intent.toFixed(2)}; interest=${decisions.primaryInterest}; secondary=${decisions.secondary}; most_attended=${decisions.mostAttended}; reading=${decisions.readingDepth.toFixed(2)}; email_ready=${decisions.emailReady} (${decisions.emailReadyConfidence.toFixed(2)}); watch=${decisions.worthWatching}; angle=${decisions.bestAngle}`,
    `Time by page: ${pageLine || 'unknown'}`,
    `Longest attention: ${attendLine || 'unknown'}`,
    `Clicked: ${clickLine || 'none labeled'}`,
    `Evidence JSON: ${JSON.stringify(evidence)}`,
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      max_output_tokens: 320,
      reasoning: { effort: 'low' },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Responses API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const text = extractResponseText(body);
  if (text) return text.slice(0, 700);

  const topAttend = evidence.attended[0]?.label || decisions.mostAttended;
  const topClick = evidence.clicked[0]?.label;
  return [
    `${decisions.outcome} ${fmtDur(evidence.durationMs)} session`,
    topAttend ? `lingered on “${topAttend}”` : (topClick ? `focused on “${topClick}”` : `on ${evidence.pages[0]?.path || '/'}`),
    decisions.emailReady ? 'enough detail to personalize later.' : 'needs more signal before a strong email.',
  ].join(' — ');
}

function buildHighlights(evidence: ReplayEvidence, decisions: {
  primaryInterest: string;
  secondary: string;
  stage: string;
  bestAngle: string;
  mostAttended: string;
}) {
  const highlights: string[] = [];
  for (const page of evidence.pages.slice(0, 5)) {
    highlights.push(`${page.path} · ${fmtDur(page.dwellMs)}`);
  }
  for (const row of evidence.attended.slice(0, 4)) {
    highlights.push(`Read “${row.label}” · ${fmtDur(row.dwellMs)}`);
  }
  for (const click of evidence.clicked.slice(0, 5)) {
    highlights.push(`Clicked “${click.label}”${click.count > 1 ? ` ×${click.count}` : ''}`);
  }
  if (evidence.formInteraction) {
    const hint = evidence.formHints[0];
    highlights.push(hint ? `Typed in form (${hint.slice(0, 60)})` : 'Interacted with a form');
  }
  if (evidence.pageTitle) highlights.push(`Page: ${evidence.pageTitle}`);
  if (decisions.mostAttended && decisions.mostAttended !== 'other') {
    pushUnique(highlights, `Most attention: ${decisions.mostAttended}`, 20);
  }
  if (decisions.primaryInterest && decisions.primaryInterest !== 'other') {
    pushUnique(highlights, `Interest: ${decisions.primaryInterest}`, 20);
  }
  if (decisions.secondary && decisions.secondary !== 'other' && decisions.secondary !== decisions.primaryInterest) {
    pushUnique(highlights, `Also: ${decisions.secondary}`, 20);
  }
  pushUnique(highlights, `Stage: ${decisions.stage}`, 20);
  return highlights.slice(0, 12);
}

function buildEmailHooks(evidence: ReplayEvidence, decisions: {
  primaryInterest: string;
  bestAngle: string;
  emailReady: boolean;
  mostAttended: string;
}) {
  const hooks: string[] = [];
  if (decisions.bestAngle && decisions.bestAngle !== 'other') pushUnique(hooks, decisions.bestAngle, 8);
  if (decisions.mostAttended && decisions.mostAttended !== 'other') {
    pushUnique(hooks, `Reference what they spent time reading: ${decisions.mostAttended}`, 8);
  }
  if (decisions.primaryInterest && decisions.primaryInterest !== 'other') {
    pushUnique(hooks, `Reference their interest in ${decisions.primaryInterest}`, 8);
  }
  for (const row of evidence.attended.slice(0, 3)) {
    pushUnique(hooks, `Mention they lingered on “${row.label}”`, 8);
  }
  for (const click of evidence.clicked.slice(0, 4)) {
    pushUnique(hooks, `Mention they explored “${click.label}”`, 8);
  }
  if (!evidence.hasEmail) pushUnique(hooks, 'Capture email before sending', 8);
  if (!decisions.emailReady) pushUnique(hooks, 'Gather one clearer preference next visit', 8);
  return hooks.slice(0, 6);
}

export async function generateReplayInsight(evidence: ReplayEvidence): Promise<ReplayInsightResult> {
  if (!openaiConfigured()) throw new Error('OPENAI_API_KEY is not configured');
  const decisions = await runDecisions(evidence);
  const summaryText = await runNarrative(evidence, decisions);
  return {
    summaryText,
    outcome: decisions.outcome,
    friction: decisions.friction,
    worthWatching: decisions.worthWatching,
    primaryInterest: decisions.primaryInterest,
    emailReady: decisions.emailReady,
    emailReadyConfidence: decisions.emailReadyConfidence,
    stage: decisions.stage,
    intent: decisions.intent,
    highlights: buildHighlights(evidence, decisions),
    emailHooks: buildEmailHooks(evidence, decisions),
    decisionsJson: decisions.answers,
    model: MODEL,
    insightVersion: INSIGHT_VERSION,
  };
}

async function runVisitorDecisions(input: VisitorInsightInput) {
  const res = await fetch('https://api.openai.com/v1/decisions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Roll up this visitor across sessions for a merchant. Score email readiness for a future personalized email (do not write it). Use only the JSON.',
          },
          { type: 'input_json', data: input },
        ],
      }],
      questions: [
        {
          name: 'dominant_interest',
          type: 'choice',
          instructions: 'Their clearest interest across sessions.',
          choices: choiceOptions(
            input.sessions.flatMap((session) => [session.primaryInterest || '', ...(session.highlights || []).slice(0, 3)]),
            ['product', 'pricing', 'support', 'unknown'],
            'Unclear overall interest.',
          ),
        },
        {
          name: 'relationship',
          type: 'choice',
          instructions: 'Overall relationship stage.',
          choices: [
            { value: 'new', description: 'First meaningful visits.' },
            { value: 'warming', description: 'Returning with growing interest.' },
            { value: 'ready', description: 'Ready for a personalized email soon.' },
            { value: 'customer', description: 'Already purchased.' },
            { value: 'cooling', description: 'Interest fading.' },
          ],
        },
        {
          name: 'email_ready',
          type: 'predicate',
          instructions: 'We have enough visitor context to personalize an email later.',
        },
        {
          name: 'needs_identity',
          type: 'predicate',
          instructions: 'Missing email/name is the main blocker.',
        },
        {
          name: 'best_hook',
          type: 'choice',
          instructions: 'Best personalization hook across sessions.',
          choices: choiceOptions(
            input.sessions.flatMap((session) => session.emailHooks || []),
            ['remind unfinished flow', 'reference liked option', 'help with a stuck step'],
            'Another hook fits better.',
          ),
        },
      ],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Visitor Decisions API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const answers = (body as { answers?: unknown }).answers;
  const emailProb = Number(answerByName(answers, 'email_ready')?.probability);
  const emailReadyConfidence = Number.isFinite(emailProb) ? Math.max(0, Math.min(1, emailProb)) : 0;
  return {
    answers,
    dominantInterest: String(answerByName(answers, 'dominant_interest')?.choice || 'unknown'),
    relationship: String(answerByName(answers, 'relationship')?.choice || 'new'),
    emailReady: emailReadyConfidence >= 0.55,
    emailReadyConfidence,
    needsIdentity: Number(answerByName(answers, 'needs_identity')?.probability) >= 0.5,
    bestHook: String(answerByName(answers, 'best_hook')?.choice || ''),
  };
}

export async function generateVisitorInsight(input: VisitorInsightInput): Promise<VisitorInsightResult> {
  if (!openaiConfigured()) throw new Error('OPENAI_API_KEY is not configured');
  const decisions = await runVisitorDecisions(input);
  const prompt = [
    'Write 2-3 short sentences summarizing this visitor across sessions for a merchant.',
    'Mention recurring interests and whether we are ready to personalize email later (do not write an email).',
    'Ground only in the JSON. No markdown.',
    `Labels: interest=${decisions.dominantInterest}; relationship=${decisions.relationship}; email_ready=${decisions.emailReady} (${decisions.emailReadyConfidence.toFixed(2)}); hook=${decisions.bestHook}`,
    `Visitor JSON: ${JSON.stringify(input)}`,
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      max_output_tokens: 280,
      reasoning: { effort: 'low' },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Visitor Responses API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const summaryText = extractResponseText(body).slice(0, 700)
    || `${decisions.relationship} visitor interested in ${decisions.dominantInterest}.`;

  const interests = [...new Set(
    [decisions.dominantInterest, ...input.sessions.map((session) => session.primaryInterest || '')]
      .map((value) => cleanText(value, 80))
      .filter((value) => value && value !== 'other' && value !== 'unknown'),
  )].slice(0, 8);

  const emailHooks = [...new Set(
    [decisions.bestHook, ...input.sessions.flatMap((session) => session.emailHooks || [])]
      .map((value) => cleanText(value, 120))
      .filter(Boolean),
  )].slice(0, 6);

  const gaps: string[] = [];
  if (!input.hasEmail) gaps.push('No email on file yet');
  if (!input.hasName) gaps.push('No name on file yet');
  if (!decisions.emailReady) gaps.push('Need a clearer preference signal');
  if (decisions.needsIdentity) gaps.push('Identity would unlock stronger personalization');
  if (input.sessions.length < 2) gaps.push('Only one analyzed session so far');

  return {
    summaryText,
    emailReady: decisions.emailReady,
    emailReadyConfidence: decisions.emailReadyConfidence,
    interests,
    emailHooks,
    gaps: gaps.slice(0, 6),
    decisionsJson: decisions.answers,
    model: MODEL,
    insightVersion: INSIGHT_VERSION,
    sourceSessionCount: input.sessions.length,
  };
}

export function publicInsight(row: {
  status: string;
  summaryText: string | null;
  outcome: string | null;
  friction: number | null;
  worthWatching: boolean | null;
  primaryInterest: string | null;
  emailReady?: boolean | null;
  emailReadyConfidence?: number | null;
  stage?: string | null;
  intent?: number | null;
  highlightsJson?: unknown;
  emailHooksJson?: unknown;
  insightVersion?: number | null;
  generatedAt?: string | Date | null;
  error?: string | null;
}) {
  const highlights = Array.isArray(row.highlightsJson)
    ? row.highlightsJson.filter((item): item is string => typeof item === 'string').slice(0, 12)
    : [];
  const emailHooks = Array.isArray(row.emailHooksJson)
    ? row.emailHooksJson.filter((item): item is string => typeof item === 'string').slice(0, 6)
    : [];
  return {
    status: row.status,
    summary: row.summaryText,
    outcome: row.outcome,
    friction: row.friction,
    worthWatching: row.worthWatching,
    primaryInterest: row.primaryInterest,
    emailReady: row.emailReady ?? null,
    emailReadyConfidence: row.emailReadyConfidence ?? null,
    stage: row.stage ?? null,
    intent: row.intent ?? null,
    highlights,
    emailHooks,
    insightVersion: row.insightVersion ?? 1,
    generatedAt: row.generatedAt ? new Date(row.generatedAt).toISOString() : null,
    error: row.status === 'failed' ? (row.error || 'Unable to generate summary') : null,
  };
}

export function publicVisitorInsight(row: {
  status: string;
  summaryText: string | null;
  emailReady: boolean | null;
  emailReadyConfidence: number | null;
  interestsJson?: unknown;
  emailHooksJson?: unknown;
  gapsJson?: unknown;
  insightVersion?: number | null;
  sourceSessionCount?: number | null;
  generatedAt?: string | Date | null;
  error?: string | null;
}) {
  const asStrings = (value: unknown) => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  );
  return {
    status: row.status,
    summary: row.summaryText,
    emailReady: row.emailReady,
    emailReadyConfidence: row.emailReadyConfidence,
    interests: asStrings(row.interestsJson).slice(0, 8),
    emailHooks: asStrings(row.emailHooksJson).slice(0, 6),
    gaps: asStrings(row.gapsJson).slice(0, 6),
    insightVersion: row.insightVersion ?? 1,
    sourceSessionCount: row.sourceSessionCount ?? 0,
    generatedAt: row.generatedAt ? new Date(row.generatedAt).toISOString() : null,
    error: row.status === 'failed' ? (row.error || 'Unable to generate visitor insight') : null,
  };
}
