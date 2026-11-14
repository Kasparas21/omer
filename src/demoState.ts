/* Campaigns and the demo store's people. The demo store keeps what you change while the app is open (nothing
   is saved). A real store's campaigns live on the server: loaded once per store, and every change is saved
   back (one campaign at a time, a moment after you stop typing). */
import { useSyncExternalStore } from 'react';
import { toast } from './ui/toast';
import { cleanTrigger, type CampaignTrigger } from '../server/trigger-library';
import { CAMPAIGNS, PAGE_STYLE, PEOPLE, REPLIES, type Campaign, type MailDoc, type PageStyle, type Person, type Reply, type Status } from './storeData';

export type CampaignSettings = { limit: string; who: string; freq: string; quiet: string; expires: string; from: string };
export type CampaignState = Campaign & {
  settings: CampaignSettings;
  page: PageStyle;
  /** The email everyone else sees: what was last published. */
  published: { doc: MailDoc; page: PageStyle } | null;
  dismissed?: boolean;
};
export type PersonState = Person & { status: Status; skipped?: boolean; snoozed?: string; page?: PageStyle };

export const DEFAULT_SETTINGS: CampaignSettings = {
  limit: '200 a day', who: 'Everyone with an email', freq: '1 email a week', quiet: '9 PM to 8 AM', expires: '48 hours', from: 'Marc from Pawsome',
};
/** Older saved settings: the first quiet-hours wording, and Goal (now always: stop when they buy). */
function cleanSettings(s: Partial<CampaignSettings> & { goal?: string } | undefined, from?: string): CampaignSettings {
  const { goal: _goal, ...rest } = s ?? {};
  const out = { ...DEFAULT_SETTINGS, ...(from ? { from } : {}), ...rest };
  if (out.quiet === 'Same as Settings: 9 PM to 8 AM') out.quiet = '9 PM to 8 AM';
  if (!['50 a day', '100 a day', '200 a day', '500 a day', '1,000 a day'].includes(out.limit)) out.limit = '200 a day';
  return out;
}

type State = { campaigns: CampaignState[]; personal: boolean; people: PersonState[]; replies: Reply[]; ready: boolean };
/** The demo store's space; every real store gets its own space keyed by project id. */
export const DEMO_SPACE = 'demo';
const spaces = new Map<string, State>([[DEMO_SPACE, {
  campaigns: CAMPAIGNS.map((c) => ({
    ...c, settings: { ...DEFAULT_SETTINGS, limit: '500 a day' }, page: { ...PAGE_STYLE },
    published: c.mail ? { doc: c.mail, page: { ...PAGE_STYLE } } : null,
  })),
  personal: true,
  people: PEOPLE.map((p) => ({ ...p })),
  replies: REPLIES.map((r) => ({ ...r })),
  ready: true,
}]]);
const saveKey = (space: string) => `omer.campaigns.${space}`;
const isProject = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const api = (id: string, rest = '') => `/api/projects/${id}/campaigns${rest}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** A real store starts with personal follow-ups on and its campaigns from the server. */
function space(id: string): State {
  let found = spaces.get(id);
  if (!found) {
    let personal = true;
    try { personal = JSON.parse(localStorage.getItem(saveKey(id)) ?? '{}')?.personal !== false; } catch { /* default on */ }
    found = { campaigns: [], personal, people: [], replies: [], ready: !isProject(id) };
    spaces.set(id, found);
    if (isProject(id)) void load(id);
  }
  return found;
}

async function load(id: string) {
  try {
    const res = await fetch(api(id), { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    let campaigns = ((await res.json()) as { campaigns?: CampaignState[] }).campaigns ?? [];
    // Campaigns from the first trigger library become steps.
    campaigns = campaigns.map((c) => ({ ...c, settings: cleanSettings(c.settings), ...(c.trigger ? { trigger: cleanTrigger(c.trigger) } : {}) }));
    // Campaigns made before they were saved on the server were kept in this browser: move them up once.
    if (!campaigns.length) {
      try {
        const old = JSON.parse(localStorage.getItem(saveKey(id)) ?? 'null') as { campaigns?: CampaignState[] } | null;
        if (old?.campaigns?.length) { campaigns = old.campaigns; campaigns.forEach((c) => queueSave(id, c)); }
      } catch { /* nothing to move */ }
    }
    let personal = space(id).personal;
    try {
      const p = await fetch(api(id, '/personal'), { cache: 'no-store' });
      if (p.ok) personal = ((await p.json()) as { on?: boolean }).on !== false;
    } catch { /* keep what we had */ }
    spaces.set(id, { ...space(id), campaigns, personal, ready: true });
  } catch {
    spaces.set(id, { ...space(id), ready: true });
    toast('Couldn’t load your campaigns. Reload to try again.', { kind: 'warn' });
  }
  emit();
}

const timers = new Map<string, number>();
function queueSave(storeId: string, c: CampaignState) {
  window.clearTimeout(timers.get(c.id));
  timers.set(c.id, window.setTimeout(() => {
    timers.delete(c.id);
    void fetch(api(storeId, `/${c.id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign: c }) })
      .then(async (res) => { if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Couldn’t save'); })
      .catch((e: Error) => toast(e.message || 'Couldn’t save the campaign', { kind: 'warn' }));
  }, 400));
}
function queueDelete(storeId: string, campaignId: string) {
  window.clearTimeout(timers.get(campaignId));
  timers.delete(campaignId);
  void fetch(api(storeId, `/${campaignId}`), { method: 'DELETE' }).catch(() => toast('Couldn’t delete the campaign', { kind: 'warn' }));
}

function setIn(id: string, next: (s: State) => State) {
  const before = space(id);
  const after = next(before);
  spaces.set(id, after);
  if (isProject(id)) {
    for (const c of after.campaigns) if (!before.campaigns.includes(c)) queueSave(id, c);
    for (const c of before.campaigns) if (!after.campaigns.some((x) => x.id === c.id)) queueDelete(id, c.id);
    try { localStorage.setItem(saveKey(id), JSON.stringify({ personal: after.personal })); } catch { /* not saved */ }
  }
  emit();
}
/** Campaign ids are unique across spaces, so edits find the space that holds them. */
function setFor(campaignId: string, next: (s: State) => State) {
  for (const [id, st] of spaces) if (st.campaigns.some((c) => c.id === campaignId)) return setIn(id, next);
}
const set = (next: (s: State) => State) => setIn(DEMO_SPACE, next);
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useDemo = (id: string = DEMO_SPACE) => useSyncExternalStore(subscribe, () => space(id));

export const demo = {
  updateCampaign(id: string, patch: Partial<CampaignState>) {
    setFor(id, (s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  setSetting(id: string, key: keyof CampaignSettings, value: string) {
    setFor(id, (s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, settings: { ...c.settings, [key]: value } } : c)) }));
  },
  /** Turning a suggestion or draft on makes it a normal running campaign. */
  start(id: string) { demo.updateCampaign(id, { on: true, draft: false, suggested: false }); },
  remove(id: string) { setFor(id, (s) => ({ ...s, campaigns: s.campaigns.filter((c) => c.id !== id) })); },
  add(where: string = DEMO_SPACE, from?: string, name = 'New campaign'): string {
    const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const settings = from ? { ...DEFAULT_SETTINGS, from } : { ...DEFAULT_SETTINGS };
    setIn(where, (s) => ({ ...s, campaigns: [...s.campaigns, { id, name, icon: 'megaphone', mode: 'review', on: false, draft: true, mail: null, settings, page: { ...PAGE_STYLE }, published: null, trigger: null }] }));
    return id;
  },
  setTrigger(id: string, trigger: CampaignTrigger, patch: Partial<CampaignState> = {}) {
    demo.updateCampaign(id, { ...patch, trigger });
  },
  /** Personal follow-ups on or off: saved on the server for real stores (it stops new ones being made). */
  setPersonal(on: boolean, where: string = DEMO_SPACE) {
    setIn(where, (s) => ({ ...s, personal: on }));
    if (isProject(where)) {
      void fetch(api(where, '/personal'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) })
        .then((r) => { if (!r.ok) throw new Error(); })
        .catch(() => { setIn(where, (s) => ({ ...s, personal: !on })); toast('Couldn’t save that. Try again.', { kind: 'warn' }); });
    }
  },
  updateReply(id: string, patch: Partial<Reply>) {
    set((s) => ({ ...s, replies: s.replies.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  },
  updatePerson(id: string, patch: Partial<PersonState>) {
    set((s) => ({ ...s, people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
};
