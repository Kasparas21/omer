import { getObject } from './object-store';

export type ReplayEvidence = {
  durationMs: number;
  device: string;
  referrer: string;
  paths: string[];
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
};

export type ReplayInsightResult = {
  summaryText: string;
  outcome: string;
  friction: number;
  worthWatching: boolean;
  primaryInterest: string;
  decisionsJson: unknown;
  model: string;
};

type RrwebEvent = {
  type?: number;
  timestamp?: number;
  data?: { source?: number; type?: number | string };
};

const MODEL = 'gpt-6-luna';

export function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function openaiKey() {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

/** Count coarse signals from rrweb events without keeping DOM or typed text. */
export function summarizeEvents(events: RrwebEvent[]): Pick<
  ReplayEvidence,
  'clicks' | 'inputs' | 'scrolls' | 'mouseMoves' | 'formInteraction' | 'eventCount' | 'durationMs'
> {
  let clicks = 0;
  let inputs = 0;
  let scrolls = 0;
  let mouseMoves = 0;
  let formInteraction = false;
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = 0;
  for (const event of events) {
    const ts = Number(event.timestamp) || 0;
    if (ts) {
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
    }
    if (event.type !== 3) continue;
    const source = Number(event.data?.source);
    // IncrementalSource: MouseMove=1, MouseInteraction=2, Scroll=3, Input=5, TouchMove=6
    if (source === 1 || source === 6) mouseMoves += 1;
    else if (source === 2) clicks += 1;
    else if (source === 3) scrolls += 1;
    else if (source === 5) {
      inputs += 1;
      formInteraction = true;
    }
  }
  const durationMs = Number.isFinite(minTs) && maxTs >= minTs ? Math.max(0, maxTs - minTs) : 0;
  return { clicks, inputs, scrolls, mouseMoves, formInteraction, eventCount: events.length, durationMs };
}

export async function loadChunkEvents(objectKeys: string[]): Promise<RrwebEvent[]> {
  const events: RrwebEvent[] = [];
  // Cap how many chunks we inspect so insight stays cheap.
  for (const key of objectKeys.slice(0, 40)) {
    try {
      const raw = await getObject(key);
      const parsed = JSON.parse(raw.toString('utf8'));
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const event = item as RrwebEvent;
        // Drop bulky snapshot payloads — keep type/timestamp/source only.
        if (event.type === 2) {
          events.push({ type: 2, timestamp: event.timestamp });
          continue;
        }
        if (event.type === 3) {
          events.push({
            type: 3,
            timestamp: event.timestamp,
            data: { source: Number((event.data as { source?: number } | undefined)?.source) },
          });
          continue;
        }
        events.push({ type: event.type, timestamp: event.timestamp });
      }
    } catch {
      // Skip unreadable chunks; evidence can still be built from visits.
    }
  }
  return events;
}

export function buildEvidence(input: {
  device?: string | null;
  referrer?: string | null;
  paths: string[];
  dwellMs?: number;
  chunkCount: number;
  events: RrwebEvent[];
}): ReplayEvidence {
  const paths = [...new Set(input.paths.map((p) => (p || '/').slice(0, 120)))].slice(0, 20);
  const stats = summarizeEvents(input.events);
  const durationMs = Math.max(stats.durationMs, Number(input.dwellMs) || 0);
  return {
    durationMs,
    device: input.device === 'phone' ? 'phone' : 'monitor',
    referrer: (input.referrer || '(direct)').slice(0, 120),
    paths,
    pageviews: Math.max(paths.length, input.paths.length),
    clicks: stats.clicks,
    inputs: stats.inputs,
    scrolls: stats.scrolls,
    mouseMoves: stats.mouseMoves,
    shortBounce: durationMs > 0 && durationMs < 10_000,
    multiPage: paths.length > 1,
    formInteraction: stats.formInteraction,
    eventCount: stats.eventCount,
    chunkCount: input.chunkCount,
  };
}

function answerByName(answers: unknown, name: string): Record<string, unknown> | null {
  if (!Array.isArray(answers)) return null;
  const row = answers.find((item) => item && typeof item === 'object' && (item as { name?: string }).name === name);
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
}

async function runDecisions(evidence: ReplayEvidence) {
  const pathChoices = [...evidence.paths.slice(0, 8), 'other'];
  const uniqueChoices = [...new Set(pathChoices.map((p) => p.slice(0, 80)))];
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
            text: 'Classify this website session for a shop analytics product. Use only the JSON evidence.',
          },
          { type: 'input_json', data: evidence },
        ],
      }],
      questions: [
        {
          name: 'outcome',
          type: 'choice',
          instructions: 'Overall visitor outcome for this session.',
          choices: ['bounce', 'browse', 'engaged', 'intent', 'frustrated'],
        },
        {
          name: 'friction',
          type: 'score',
          instructions: 'How much friction or struggle appears in the session.',
          levels: [
            { label: 'none' },
            { label: 'low' },
            { label: 'medium' },
            { label: 'high' },
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
          instructions: 'Best label for what they seemed interested in, from paths or other.',
          choices: uniqueChoices,
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
  const frictionRaw = Number(answerByName(answers, 'friction')?.score);
  const friction = Number.isFinite(frictionRaw) ? Math.max(0, Math.min(3, frictionRaw)) : 0;
  const worthProb = Number(answerByName(answers, 'worth_watching')?.probability);
  const worthWatching = Number.isFinite(worthProb) ? worthProb >= 0.5 : false;
  const primaryInterest = String(answerByName(answers, 'primary_interest')?.choice || evidence.paths[0] || '/');
  return { answers, outcome, friction, worthWatching, primaryInterest };
}

async function runNarrative(evidence: ReplayEvidence, decisions: {
  outcome: string;
  friction: number;
  worthWatching: boolean;
  primaryInterest: string;
}) {
  const prompt = [
    'Write 1-2 short sentences summarizing this website visit for a merchant.',
    'Ground only in the evidence and labels. Do not invent personal details, emails, or quotes.',
    'No markdown. Plain prose.',
    `Labels: outcome=${decisions.outcome}; friction=${decisions.friction.toFixed(2)}; worth_watching=${decisions.worthWatching}; interest=${decisions.primaryInterest}`,
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
      max_output_tokens: 120,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Responses API ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }

  // Responses API shapes vary; collect any output_text.
  const direct = (body as { output_text?: string }).output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim().slice(0, 500);

  const output = (body as { output?: unknown[] }).output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as { content?: unknown[] }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part && typeof part === 'object' && typeof (part as { text?: string }).text === 'string') {
          parts.push((part as { text: string }).text);
        }
      }
    }
    const joined = parts.join(' ').trim();
    if (joined) return joined.slice(0, 500);
  }

  return `${decisions.outcome} session on ${evidence.paths[0] || '/'} (${Math.round(evidence.durationMs / 1000)}s).`;
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
    decisionsJson: decisions.answers,
    model: MODEL,
  };
}

export function publicInsight(row: {
  status: string;
  summaryText: string | null;
  outcome: string | null;
  friction: number | null;
  worthWatching: boolean | null;
  primaryInterest: string | null;
  generatedAt?: string | Date | null;
  error?: string | null;
}) {
  return {
    status: row.status,
    summary: row.summaryText,
    outcome: row.outcome,
    friction: row.friction,
    worthWatching: row.worthWatching,
    primaryInterest: row.primaryInterest,
    generatedAt: row.generatedAt ? new Date(row.generatedAt).toISOString() : null,
    error: row.status === 'failed' ? (row.error || 'Unable to generate summary') : null,
  };
}
