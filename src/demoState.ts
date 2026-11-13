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
let state: State = {
  campaigns: CAMPAIGNS.map((c) => ({
    ...c, picks: {}, settings: { ...DEFAULT_SETTINGS }, page: { ...PAGE_STYLE },
    published: c.mail ? { doc: c.mail, page: { ...PAGE_STYLE } } : null,
  })),
  personal: true,
  people: PEOPLE.map((p) => ({ ...p })),
  replies: REPLIES.map((r) => ({ ...r })),
};
const listeners = new Set<() => void>();
function set(next: (s: State) => State) {
  state = next(state);
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useDemo = () => useSyncExternalStore(subscribe, () => state);

export const pickValue = (c: CampaignState, key: string) => c.picks[key] ?? PICKS[key]?.def ?? '';

export const demo = {
  updateCampaign(id: string, patch: Partial<CampaignState>) {
    set((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  setPick(id: string, key: string, value: string) {
    set((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, picks: { ...c.picks, [key]: value } } : c)) }));
  },
  setSetting(id: string, key: keyof CampaignSettings, value: string) {
    set((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, settings: { ...c.settings, [key]: value } } : c)) }));
  },
  /** Turning a suggestion or draft on makes it a normal running campaign. */
  start(id: string) { demo.updateCampaign(id, { on: true, draft: false, suggested: false }); },
  remove(id: string) { set((s) => ({ ...s, campaigns: s.campaigns.filter((c) => c.id !== id) })); },
  add(): string {
    const id = `new-${Date.now()}`;
    set((s) => ({ ...s, campaigns: [...s.campaigns, { id, name: 'New campaign', flow: null, icon: 'megaphone', mode: 'review', on: false, draft: true, mail: null, picks: {}, settings: { ...DEFAULT_SETTINGS }, page: { ...PAGE_STYLE }, published: null }] }));
    return id;
  },
  /** A new campaign picks what starts it; it borrows the email of the campaign that starts the same way. */
  setFlow(id: string, flow: string) {
    const twin = state.campaigns.find((c) => c.flow === flow && c.published);
    set((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, flow: flow as Campaign['flow'], icon: twin?.icon ?? c.icon, published: twin?.published ?? c.published } : c)) }));
  },
  setPersonal(on: boolean) { set((s) => ({ ...s, personal: on })); },
  updateReply(id: string, patch: Partial<Reply>) {
    set((s) => ({ ...s, replies: s.replies.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  },
  updatePerson(id: string, patch: Partial<PersonState>) {
    set((s) => ({ ...s, people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
};
