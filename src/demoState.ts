/* What you change on the demo store (campaigns switched on or off, approvals, published emails) stays while
   the app is open, across screens, like the kit. A tiny store with a hook; nothing is saved to the server. */
import { useSyncExternalStore } from 'react';
import { CAMPAIGNS, PAGE_STYLE, PEOPLE, PICKS, REPLIES, type Campaign, type MailDoc, type PageStyle, type Person, type Reply, type Status } from './storeData';

export type CampaignSettings = { limit: string; who: string; freq: string; quiet: string; expires: string; from: string; goal: string };
export type CampaignState = Campaign & {
  picks: Record<string, string>;
  settings: CampaignSettings;
  page: PageStyle;
  /** The email everyone else sees: what was last published. */
  published: { doc: MailDoc; page: PageStyle } | null;
  dismissed?: boolean;
};
export type PersonState = Person & { status: Status; skipped?: boolean; snoozed?: string; page?: PageStyle };

const DEFAULT_SETTINGS: CampaignSettings = {
  limit: '500 a day', who: 'Everyone with an email', freq: '1 email a week', quiet: 'Same as Settings: 9 PM to 8 AM', expires: '48 hours', from: 'Marc from Pawsome', goal: 'They buy',
};

type State = { campaigns: CampaignState[]; personal: boolean; people: PersonState[]; replies: Reply[] };
/** The demo store's space; every real store gets its own space keyed by project id. */
export const DEMO_SPACE = 'demo';
const spaces = new Map<string, State>([[DEMO_SPACE, {
  campaigns: CAMPAIGNS.map((c) => ({
    ...c, picks: {}, settings: { ...DEFAULT_SETTINGS }, page: { ...PAGE_STYLE },
    published: c.mail ? { doc: c.mail, page: { ...PAGE_STYLE } } : null,
  })),
  personal: true,
  people: PEOPLE.map((p) => ({ ...p })),
  replies: REPLIES.map((r) => ({ ...r })),
}]]);
const saveKey = (space: string) => `omer.campaigns.${space}`;
/** A real store starts empty with personal follow-ups on. Its campaigns are kept in this browser until
    campaigns are saved on the server. */
function space(id: string): State {
  let found = spaces.get(id);
  if (!found) {
    found = { campaigns: [], personal: true, people: [], replies: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(saveKey(id)) ?? 'null');
      if (saved && Array.isArray(saved.campaigns)) found = { ...found, campaigns: saved.campaigns, personal: saved.personal !== false };
    } catch { /* storage blocked: start fresh */ }
    spaces.set(id, found);
  }
  return found;
}
const listeners = new Set<() => void>();
function setIn(id: string, next: (s: State) => State) {
  spaces.set(id, next(space(id)));
  if (id !== DEMO_SPACE) {
    const { campaigns, personal } = space(id);
    try { localStorage.setItem(saveKey(id), JSON.stringify({ campaigns, personal })); } catch { /* not saved */ }
  }
  listeners.forEach((l) => l());
}
/** Campaign ids are unique across spaces, so edits find the space that holds them. */
function setFor(campaignId: string, next: (s: State) => State) {
  for (const [id, st] of spaces) if (st.campaigns.some((c) => c.id === campaignId)) return setIn(id, next);
}
const set = (next: (s: State) => State) => setIn(DEMO_SPACE, next);
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useDemo = (id: string = DEMO_SPACE) => useSyncExternalStore(subscribe, () => space(id));

export const pickValue = (c: CampaignState, key: string) => c.picks[key] ?? PICKS[key]?.def ?? '';

export const demo = {
  updateCampaign(id: string, patch: Partial<CampaignState>) {
    setFor(id, (s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  setPick(id: string, key: string, value: string) {
    setFor(id, (s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, picks: { ...c.picks, [key]: value } } : c)) }));
  },
  setSetting(id: string, key: keyof CampaignSettings, value: string) {
    setFor(id, (s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, settings: { ...c.settings, [key]: value } } : c)) }));
  },
  /** Turning a suggestion or draft on makes it a normal running campaign. */
  start(id: string) { demo.updateCampaign(id, { on: true, draft: false, suggested: false }); },
  remove(id: string) { setFor(id, (s) => ({ ...s, campaigns: s.campaigns.filter((c) => c.id !== id) })); },
  add(where: string = DEMO_SPACE, from?: string): string {
    const id = `new-${Date.now()}`;
    const settings = from ? { ...DEFAULT_SETTINGS, from } : { ...DEFAULT_SETTINGS };
    setIn(where, (s) => ({ ...s, campaigns: [...s.campaigns, { id, name: 'New campaign', flow: null, icon: 'megaphone', mode: 'review', on: false, draft: true, mail: null, picks: {}, settings, page: { ...PAGE_STYLE }, published: null }] }));
    return id;
  },
  /** A new campaign picks what starts it; it borrows the email of the campaign that starts the same way. */
  setFlow(id: string, flow: string) {
    const own = [...spaces.values()].find((st) => st.campaigns.some((c) => c.id === id));
    const template = CAMPAIGNS.find((c) => c.flow === flow && c.mail);
    const twin = own?.campaigns.find((c) => c.flow === flow && c.published)
      ?? (template ? { icon: template.icon, published: { doc: template.mail!, page: { ...PAGE_STYLE } } } : undefined);
    setFor(id, (s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, flow: flow as Campaign['flow'], icon: twin?.icon ?? c.icon, published: twin?.published ?? c.published } : c)) }));
  },
  setPersonal(on: boolean, where: string = DEMO_SPACE) { setIn(where, (s) => ({ ...s, personal: on })); },
  updateReply(id: string, patch: Partial<Reply>) {
    set((s) => ({ ...s, replies: s.replies.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  },
  updatePerson(id: string, patch: Partial<PersonState>) {
    set((s) => ({ ...s, people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
};
