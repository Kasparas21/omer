/* Settings for the demo store, as in the UI kit: the facts emails may use (shown in Brand knowledge's Store
   facts folder); website changes with real choices; sending; privacy. Everything is clickable and stays changed while the
   app is open. Real projects see the plain Settings (what the product really does today). */
import { useSyncExternalStore } from 'react';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';
import { STORE } from './storeData';
import { demo as people } from './demoState';
import type { Go } from './DashboardV2';

type Fact = { id: string; group: string; name: string; value: string; src: string; age: string; usedBy: string[]; review?: boolean; stale?: boolean; off?: boolean; own?: boolean; site?: string; blocked?: boolean };
type Change = { id: string; page: string; title: string; old: string; now: string; when: string; done?: string; see?: string; kind: 'ship' | 'returns' | 'stock' | 'tower' };
type Doc = { id: string; title: string; body: string; baseline: string; approved: boolean };

const VOICE = 'Warm and a little playful. Short sentences. Never pushy.\n\nDo: sound like Marc, offer one clear next step, thank them for their time.\nDon’t: stack discounts, guilt them, or invent policies.\n\nSign off as Marc from Pawsome.';
const PRODUCT = 'Pawsome sells thoughtful cat food and furniture.\n\nHero SKUs: Kitten Starter Pack ($49), Grain-free Kitten Pâté ($24), Salmon Kibble 4 kg ($42), Tall Tower ($119), Cozy Nook ($89), Sisal Scratching Post ($34).\n\nDifferentiators: honest sizes, working discount codes, 5-year guarantee on cat trees.';
const WHO: Record<string, string> = { alex: 'Alex Morgan', priya: 'Priya Nair', jamie: 'j.chen92@gmail.com', taylor: 'tbrooks@outlook.com', lukas: 'Lukas Petraitis' };

type S = {
  brand: { name: string; website: string; tagline: string; fromName: string; from: string; color: string; secondary: string; accent: string; fontHeading: string; fontBody: string; logo: boolean; mark: boolean; voice: string };
  facts: Fact[]; changes: Change[]; pages: { url: string; age: string; failed?: boolean }[]; docs: Doc[];
  shipAsked: boolean; sel: string; tile: string | null; doc: string | null; docEdit: boolean;
  importing: 'idle' | 'running' | 'done' | 'failed'; ticks: number; retrying: boolean; paused: boolean;
  sending: { by: string; from: string; limit: string; quiet: string }; privacy: { replay: boolean; ai: string; keep: string }; every: string;
};
let s: S = {
  brand: { name: 'Pawsome', website: 'pawsome.shop', tagline: 'Good food and trees for curious cats', fromName: 'Marc from Pawsome', from: STORE.from, color: STORE.color, secondary: '#F4D7BF', accent: '#8C7A68', fontHeading: 'Pawsome Display', fontBody: 'Pawsome Text', logo: true, mark: true, voice: 'Warm and a little playful. Short sentences. Never pushy.' },
  facts: [
    { id: 'logo', group: 'Visual', name: 'Logo', value: 'Paw mark on terracotta', src: 'Brand Kit', age: 'Now', usedBy: [] },
    { id: 'primary', group: 'Visual', name: 'Primary color', value: '#C8471F', src: 'Brand Kit', age: 'Now', usedBy: [] },
    { id: 'tower', group: 'Products', name: 'Tall Tower', value: '$119.00', src: '/products/tall-tower', age: '10m', usedBy: ['priya'] },
    { id: 'nook', group: 'Products', name: 'Cozy Nook', value: '$89.00', src: '/products/cozy-nook', age: '12m', usedBy: ['priya'] },
    { id: 'starter', group: 'Products', name: 'Kitten Starter Pack', value: '$49.00', src: '/products/kitten-starter-pack', age: '12m', usedBy: ['alex'] },
    { id: 'pate', group: 'Products', name: 'Grain-free Kitten Pâté', value: '$24.00, 12 cans', src: '/products/grain-free-kitten-pate', age: '12m', usedBy: ['jamie'] },
    { id: 'kibble', group: 'Products', name: 'Salmon Kibble 4 kg', value: '$42.00, out of stock', src: '/products/salmon-kibble-4kg', age: '26h', stale: true, review: true, usedBy: ['taylor'] },
    { id: 'post', group: 'Products', name: 'Sisal Scratching Post', value: '$34.00', src: '/products/sisal-post', age: '12m', usedBy: ['lukas'] },
    { id: 'kitten10', group: 'Offers', name: 'KITTEN10', value: '10% off, good for 48 hours', src: 'Your store', age: '2m', usedBy: ['alex'] },
    { id: 'hello', group: 'Offers', name: 'HELLOKITTEN', value: '10% off a first order', src: 'Your store', age: '8m', usedBy: ['jamie'] },
    { id: 'welcome', group: 'Offers', name: 'WELCOME10', value: 'Expired', src: 'Your store', age: '2m', off: true, usedBy: [] },
    { id: 'spring', group: 'Offers', name: 'SPRING15', value: 'Expired', src: 'Your store', age: '2m', off: true, usedBy: [] },
    { id: 'ship', group: 'Policies', name: 'Free shipping', value: 'Orders over $35', src: '/policies/shipping', age: '1h', review: true, usedBy: ['alex', 'taylor'] },
    { id: 'returns', group: 'Policies', name: 'Returns', value: '14 days', src: '/policies/returns', age: '40m', review: true, usedBy: ['alex'] },
    { id: 'guarantee', group: 'Policies', name: 'Cat tree guarantee', value: '5 years', src: '/pages/guarantee', age: '3d', usedBy: ['priya'] },
    { id: 'feeding', group: 'FAQs', name: 'How often to feed a kitten', value: '3 or 4 small meals a day', src: '/blog/how-much-should-a-kitten-eat', age: '2d', usedBy: ['jamie'] },
  ],
  changes: [
    { id: 'ship', page: '/pages/faq', title: 'Free shipping', old: 'Over $35', now: 'Over $50', when: '1h ago', kind: 'ship' },
    { id: 'returns', page: '/policies/returns', title: 'Returns', old: '30 days', now: '14 days', when: '40m ago', kind: 'returns' },
    { id: 'tower', page: '/products/tall-tower', title: 'Tall Tower price', old: '$129', now: '$119', when: '10m ago', kind: 'tower', done: 'The email to Priya Nair came back for review', see: 'priya' },
  ],
  pages: [
    { url: '/products', age: '12m ago' }, { url: '/products/salmon-kibble-4kg', age: '26h ago', failed: true }, { url: '/policies/shipping', age: '1h ago' },
    { url: '/policies/returns', age: '40m ago' }, { url: '/pages/faq', age: '1h ago' }, { url: '/pages/guarantee', age: '3d ago' }, { url: '/blog', age: '2d ago' },
  ],
  docs: [
    { id: 'voice', title: 'Brand Voice Guide', body: VOICE, baseline: VOICE, approved: true },
    { id: 'product', title: 'Product Information', body: PRODUCT, baseline: PRODUCT, approved: true },
  ],
  shipAsked: true, sel: 'tower', tile: null, doc: null, docEdit: false, importing: 'idle', ticks: 0, retrying: false, paused: false,
  sending: { by: 'Marc from Pawsome', from: STORE.from, limit: '2,000 per day', quiet: '9 PM to 8 AM' }, privacy: { replay: true, ai: 'Standard', keep: '90 days' }, every: 'Hour',
};
const subs = new Set<() => void>();
const set = (fn: (x: S) => S) => { s = fn(s); subs.forEach((l) => l()); };
const useS = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => s);
const fact = (id: string, patch: Partial<Fact>) => set((x) => ({ ...x, facts: x.facts.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
const change = (id: string, patch: Partial<Change>) => set((x) => ({ ...x, changes: x.changes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
/** A copy of everything, for Undo. */
const snap = () => { const was = s; return () => set(() => was); };

export const companyNeeds = (x: S = s) => x.facts.filter((f) => f.review && !f.off).length + (x.shipAsked ? 1 : 0) + x.docs.filter((d) => !d.approved).length;
export const changesOpen = (x: S = s) => x.changes.filter((c) => !c.done).length + (x.pages.some((p) => p.failed) ? 1 : 0);
export function useDemoSettingsCounts() { const x = useS(); return { company: companyNeeds(x), changes: changesOpen(x) }; }

/** The demo store's facts, shown in Brand knowledge's Store facts folder. */
export function useDemoFacts() { const x = useS(); return { facts: x.facts, ask: x.shipAsked }; }
export const demoFacts = {
  approve: (id: string) => fact(id, { review: false }),
  edit: (id: string, value: string) => fact(id, { value, review: true }),
  rename: (id: string, name: string) => fact(id, { name }),
  remove: (id: string) => set((x) => ({ ...x, facts: x.facts.filter((f) => f.id !== id) })),
  add: (name: string, value: string, group = 'FAQs') => set((x) => ({ ...x, facts: [...x.facts, { id: `f-${Date.now()}`, group, name, value, src: 'Added by you', age: 'Now', usedBy: [], own: true }] })),
  answer: (value: string) => set((x) => ({ ...x, shipAsked: false, facts: [...x.facts, { id: `f-${Date.now()}`, group: 'FAQs', name: 'Shipping to Australia', value, src: 'Added by you', age: 'Now', usedBy: [], own: true }] })),
};

function Row({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`set-row${wide ? ' wide' : ''}`}><div className="set-k"><b>{title}</b></div><div className="set-v">{children}</div></div>;
}
function Select({ value, options, label, onChange }: { value: string; options: string[]; label: string; onChange: (v: string) => void }) {
  return <span className="cpe-select-wrap"><select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevronDown" /></span>;
}
const saved = () => toast('Saved');


export function DemoChanges({ onGo }: { onGo?: (go: Go) => void }) {
  const x = useS();
  const failed = x.pages.find((p) => p.failed);
  const open = x.changes.filter((c) => !c.done);
  const done = x.changes.filter((c) => c.done);
  const resolve = (id: string, text: string, see?: string) => { const undo = snap(); change(id, { done: text, see }); toast(text, { undo }); };
  const link = (id: string) => <button type="button" className="kn-link" onClick={() => onGo?.({ to: 'inbox', id })}>{WHO[id]}</button>;

  const row = (c: Change) => (
    <article key={c.id} className={`ch-row${c.done ? ' done' : ''}`}>
      <header><b>{c.title}</b><span className="ch-vals"><s>{c.old}</s><Icon name="arrowRight" /><span>{c.now}</span></span><small>{c.page} · {c.when}</small></header>
      {c.done ? <p className="ch-done"><Icon name="check" />{c.done}{c.see ? <button type="button" className="kn-link" onClick={() => onGo?.({ to: 'inbox', id: c.see })}>See the email</button> : null}</p>
        : c.kind === 'ship' ? <>
          <p className="ch-why">Your shipping page still says over $35</p>
          <div className="ch-act">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { fact('ship', { value: 'Orders over $35', review: false }); resolve('ship', 'Emails keep saying free shipping over $35'); }}>Keep over $35</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { fact('ship', { value: 'Orders over $50', review: false, site: 'Orders over $35' }); resolve('ship', 'Emails now say free shipping over $50'); }}>Use over $50</button>
          </div>
        </> : c.kind === 'returns' ? <>
          <p className="ch-why">The email to {link('alex')} still says 30 days</p>
          <div className="ch-act">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { fact('returns', { value: '14 days', review: false }); resolve('returns', 'Facts and the email now say 14-day returns', 'alex'); }}>Update the email</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { people.updatePerson('alex', { status: 'hold' }); resolve('returns', 'The email to Alex Morgan is on hold', 'alex'); }}>Hold it</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { people.updatePerson('alex', { skipped: true }); resolve('returns', 'The email to Alex Morgan was cancelled'); }}>Cancel it</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve('returns', 'Ignored')}>Ignore</button>
          </div>
        </> : c.kind === 'stock' ? <>
          <p className="ch-why">The email to {link('taylor')} is on hold</p>
          <div className="ch-act">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { people.updatePerson('taylor', { status: 'review', warn: false, evidenceGone: false, note: 'In stock, checked just now', offer: 'Sending: it’s back in stock', sendAt: 'today 7:00 PM' }); resolve('stock', 'The email to tbrooks@outlook.com is ready for review', 'taylor'); }}>Move their email to review</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve('stock', 'Ignored. Their email stays on hold')}>Ignore</button>
          </div>
        </> : null}
    </article>
  );

  return <>
    <div className="set-main solo">
      {open.length || failed ? <><h3 className="kn-group-h">To review</h3><div className="ch-rows">
        {failed ? (
          <article className="ch-row">
            <header><b>Salmon Kibble 4 kg</b><span className="ch-flag"><i />Couldn’t check</span><small>{failed.url} · {failed.age}</small></header>
            <div className="ch-act">
              <button type="button" className={`btn btn-secondary btn-sm${x.retrying ? ' loading' : ''}`} disabled={x.retrying} onClick={() => {
                set((y) => ({ ...y, retrying: true }));
                window.setTimeout(() => {
                  set((y) => ({ ...y, retrying: false, pages: y.pages.map((p) => (p.failed ? { ...p, failed: false, age: 'just now' } : p)), changes: [{ id: 'stock', page: '/products/salmon-kibble-4kg', title: 'Salmon Kibble 4 kg', old: 'Out of stock', now: 'In stock', when: 'just now', kind: 'stock' }, ...y.changes], facts: y.facts.map((f) => (f.id === 'kibble' ? { ...f, value: '$42.00, in stock', stale: false, age: 'Now' } : f)) }));
                  toast('Checked. Salmon Kibble is back in stock');
                }, 1200);
              }}>{x.retrying ? 'Checking…' : 'Check again'}</button>
            </div>
          </article>
        ) : null}
        {open.map(row)}
      </div></> : <p className="ch-none">Nothing to review</p>}
      {done.length ? <><h3 className="kn-group-h">Handled</h3><div className="ch-rows">{done.map(row)}</div></> : null}
    </div>
  </>;
}

export function DemoSending() {
  const x = useS();
  const put = (k: keyof S['sending'], v: string) => set((y) => ({ ...y, sending: { ...y.sending, [k]: v } }));
  const sent = 700;
  return <>
    <div className="set-main">
      <Row title="From name"><input className="input" value={x.sending.by} onChange={(e) => put('by', e.target.value)} onBlur={saved} /></Row>
      <Row title="From email"><input className="input" value={x.sending.from} onChange={(e) => put('from', e.target.value)} onBlur={saved} /></Row>
      <Row title="Daily limit"><Select label="Daily limit" value={x.sending.limit} options={['2,000 per day', '5,000 per day', '10,000 per day']} onChange={(v) => { put('limit', v); saved(); }} /></Row>
      <Row title="Quiet hours"><Select label="Quiet hours" value={x.sending.quiet} options={['9 PM to 8 AM', '10 PM to 7 AM', 'No quiet hours']} onChange={(v) => { put('quiet', v); saved(); }} /></Row>
      <Row title="Pause sending">
        {x.paused
          ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { set((y) => ({ ...y, paused: false })); toast('Sending is back on'); }}><Icon name="play" />Resume</button>
          : <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => { set((y) => ({ ...y, paused: true })); toast('All sending paused', { undo: () => set((y) => ({ ...y, paused: false })) }); }}><Icon name="pause" />Pause all</button>}
      </Row>
    </div>
    <aside className="set-side"><div className="set-side-in">
      <div className="set-side-k">Today</div>
      <div className="set-stat"><b>{sent.toLocaleString('en-US')}</b><span>of {x.sending.limit.replace(' per day', '')} sent</span></div>
      <div className="progress"><span style={{ ['--v' as string]: `${(sent / Number(x.sending.limit.replace(/\D/g, ''))) * 100}%` }} /></div>
      {x.paused ? <p className="set-paused"><Icon name="pause" />Paused</p> : null}
      <div className="set-side-k gap">mail.pawsome.shop</div>
      <ul className="set-dns">
        <li><Icon name="check" /><div><b>DKIM</b></div></li>
        <li><Icon name="check" /><div><b>SPF</b></div></li>
        <li className="warn"><Icon name="alert" /><div><b>DMARC</b><small>Could be stricter</small></div></li>
      </ul>
    </div></aside>
  </>;
}

export function DemoPrivacy() {
  const x = useS();
  const put = (k: keyof S['privacy'], v: string | boolean) => { set((y) => ({ ...y, privacy: { ...y.privacy, [k]: v } })); saved(); };
  return <>
    <div className="set-main solo">
      <Row title="AI">
        <div className="seg" role="group" aria-label="AI mode">{['Standard', 'Strict', 'Off'].map((m) => <button key={m} type="button" aria-pressed={x.privacy.ai === m} onClick={() => put('ai', m)}>{m}</button>)}</div>
      </Row>
      <Row title="Keep data for"><Select label="Keep data for" value={x.privacy.keep} options={['90 days', '30 days', '1 year']} onChange={(v) => put('keep', v)} /></Row>
    </div>
  </>;
}
