/* Settings for the demo store, as in the UI kit: the brand kit, company documents and the facts emails may
   use; website changes with real choices; sending; privacy. Everything is clickable and stays changed while the
   app is open. Real projects see the plain Settings (what the product really does today). */
import { useState, useSyncExternalStore } from 'react';
import { Icon } from './ui/Icon';
import { toast } from './ui/toast';
import { MailBody, Paw, pageVars } from './Mail';
import { PAGE_STYLE, STORE, type MailDoc } from './storeData';
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
const docSet = (id: string, patch: Partial<Doc>) => set((x) => ({ ...x, docs: x.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
/** A copy of everything, for Undo. */
const snap = () => { const was = s; return () => set(() => was); };

export const companyNeeds = (x: S = s) => x.facts.filter((f) => f.review && !f.off).length + (x.shipAsked ? 1 : 0) + x.docs.filter((d) => !d.approved).length;
export const changesOpen = (x: S = s) => x.changes.filter((c) => !c.done).length + (x.pages.some((p) => p.failed) ? 1 : 0);
export function useDemoSettingsCounts() { const x = useS(); return { company: companyNeeds(x), changes: changesOpen(x) }; }

function Row({ title, hint, children, wide }: { title: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={`set-row${wide ? ' wide' : ''}`}><div className="set-k"><b>{title}</b>{hint ? <small>{hint}</small> : null}</div><div className="set-v">{children}</div></div>;
}
function Select({ value, options, label, onChange }: { value: string; options: string[]; label: string; onChange: (v: string) => void }) {
  return <span className="cpe-select-wrap"><select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select><Icon name="chevronDown" /></span>;
}
const saved = () => toast('Saved');

const IMPORT_STEPS = ['Reading pawsome.shop', 'Logo and colours', 'Fonts', 'Voice from your About page', 'Products and prices', 'Policies'];
const PREVIEW: MailDoc = { kind: 'brand', subject: '', headline: 'Your 10% is here', body: ['Hi Alex,', 'Sorry about those old codes, they’ve expired. This one works, and your cart is saved, so it’s one click.'], cta: 'Finish my order', order: ['headline', 'body.0', 'body.1', 'cta', 'sig'], blocks: {} };
const SWATCHES = ['#C8471F', '#191B22', '#2F5FD0', '#1F7A5C', '#B23A6B', '#7A3FC8'];
const FONTS = ['Pawsome Display', 'Pawsome Text', 'Inter', 'Georgia', 'Helvetica'];

export function DemoCompany({ onGo }: { onGo?: (go: Go) => void }) {
  const x = useS();
  const b = x.brand;
  const groups = [...new Set(x.facts.map((f) => f.group))];
  const sel = x.facts.find((f) => f.id === x.sel) ?? x.facts[0];
  const needs = companyNeeds(x);
  const doc = x.docs.find((d) => d.id === x.doc);
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState('');

  function runImport(fail: boolean) {
    set((y) => ({ ...y, importing: 'running', ticks: 0 }));
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      if (n < IMPORT_STEPS.length) { set((y) => ({ ...y, ticks: n })); return; }
      window.clearInterval(timer);
      if (fail) { set((y) => ({ ...y, importing: 'failed' })); toast('Couldn’t reach pawsome.shop', { kind: 'warn' }); return; }
      set((y) => ({ ...y, importing: 'done', ticks: n, brand: { ...y.brand, logo: true, mark: true, color: STORE.color } }));
      toast('Imported from pawsome.shop');
    }, 450);
  }

  if (doc) {
    return <>
      <div className="set-main co-main">
        <div className="co-drawer">
          <header className="co-drawer-head">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set((y) => ({ ...y, doc: null, docEdit: false }))}><Icon name="arrowLeft" />Back</button>
            <div className="co-drawer-title"><h2>{doc.title}</h2><span className={`kn-chip ${doc.approved ? 'is-ok' : 'is-draft'}`}>{doc.approved ? 'Approved for email' : 'Draft'}</span></div>
            <div className="co-drawer-act">
              {!x.docEdit ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDraft(doc.body); set((y) => ({ ...y, docEdit: true })); }}>Edit</button> : null}
              {!doc.approved ? <button type="button" className="btn btn-primary btn-sm" onClick={() => { docSet(doc.id, { approved: true }); toast('Approved for email'); }}>Approve</button> : null}
              {doc.body !== doc.baseline ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { docSet(doc.id, { body: doc.baseline, approved: false }); toast('Reset to the import'); }}>Reset to import</button> : null}
            </div>
          </header>
          {x.docEdit ? (
            <div className="co-doc-edit">
              <textarea className="textarea" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={doc.title} />
              <div className="co-doc-act">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set((y) => ({ ...y, docEdit: false }))}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { if (draft !== doc.body) docSet(doc.id, { body: draft, approved: false }); set((y) => ({ ...y, docEdit: false })); saved(); }}>Save as draft</button>
              </div>
            </div>
          ) : <div className="co-doc">{doc.body.split('\n\n').map((p) => <p key={p}>{p}</p>)}</div>}
        </div>
      </div>
      <aside className="set-side"><div className="set-side-in">
        <div className="set-side-k">How emails use this</div>
        <p className="su-side-p">{doc.id === 'voice' ? 'Every email is written in this voice once it’s approved.' : 'Products, prices and policies in emails come from here once it’s approved.'}</p>
        <p className="kn-hint">When the site changes, this goes back to Draft so you can check it.</p>
      </div></aside>
    </>;
  }

  const tile = (id: string, t: string, sub: string) => (
    <button key={id} type="button" className={`co-tile${x.tile === id ? ' on' : ''}`} aria-pressed={x.tile === id} onClick={() => set((y) => ({ ...y, tile: y.tile === id ? null : id }))}><b>{t}</b><small>{sub}</small></button>
  );
  const brandSet = (k: keyof S['brand'], v: string | boolean) => set((y) => ({ ...y, brand: { ...y.brand, [k]: v } }));
  const swatches = (k: 'color' | 'secondary' | 'accent', label: string) => (
    <div className="set-swatches" role="group" aria-label={label}>
      {SWATCHES.map((c) => <button key={c} type="button" className="set-swatch" style={{ ['--c' as string]: c }} aria-label={c} aria-pressed={b[k] === c} onClick={() => { brandSet(k, c); saved(); }} />)}
      <label className="set-swatch custom" aria-label={`Custom ${label}`} style={SWATCHES.includes(b[k]) ? undefined : { ['--c' as string]: b[k] }}><input type="color" value={b[k]} onChange={(e) => brandSet(k, e.target.value)} /></label>
    </div>
  );

  return <>
    <div className="set-main co-main">
      <header className="set-head"><h2>Company</h2></header>
      <div className="co-hero">
        <span className="co-hero-mark" style={{ background: b.color }}>{b.logo ? <Paw color="#fff" /> : '?'}</span>
        <div className="co-hero-copy"><b>{b.name}</b><small>{b.website}{b.tagline ? ` · ${b.tagline}` : ''}</small>
          {needs ? <div className="co-chips"><span className="kn-chip is-draft">{needs} {needs === 1 ? 'fact needs' : 'facts need'} you</span></div> : null}
        </div>
      </div>
      <div className="co-import">
        {x.importing === 'running' ? (
          <ul className="co-ticks">{IMPORT_STEPS.map((t, i) => <li key={t} className={i < x.ticks ? 'done' : i === x.ticks ? 'run' : ''}><Icon name={i < x.ticks ? 'check' : 'clock'} />{t}</li>)}</ul>
        ) : <>
          <div className="co-import-act">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => runImport(false)}>{x.importing === 'done' ? 'Import again' : 'Import from website'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => runImport(true)}>Try a failed import</button>
          </div>
          <p className="kn-hint">{x.importing === 'failed' ? 'pawsome.shop didn’t answer. Nothing changed; try again in a minute.' : x.importing === 'done' ? 'Imported from pawsome.shop just now · demo.' : 'Reads logo, colors, voice, products and policies. Labeled as demo — no real scrape.'}</p>
        </>}
      </div>
      <div className="co-tiles" role="group" aria-label="Brand kit">
        {tile('assets', 'Brand assets', b.logo ? 'Logo on' : 'Add logo')}
        {tile('colors', 'Colors', b.color)}
        {tile('fonts', 'Fonts', b.fontHeading)}
        {tile('profile', 'Profile', b.name)}
      </div>
      {x.tile ? (
        <div className="co-tile-panel">
          {x.tile === 'assets' && <>
            <Row title="Logo" hint="Primary mark at the top of emails"><div className="set-logo"><span className="co-hero-mark sm" style={{ background: b.color }}>{b.logo ? <Paw color="#fff" /> : '?'}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { brandSet('logo', true); toast('Pick an image from your computer', { kind: 'info' }); }}>{b.logo ? 'Replace' : 'Add logo'}</button>
              {b.logo ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { brandSet('logo', false); saved(); }}>Remove</button> : null}</div></Row>
            <Row title="Square mark" hint="Optional icon for tight layouts"><div className="set-logo"><span className="co-hero-mark sm" style={{ background: b.secondary }}>{b.mark ? <Paw color="#2B1B13" /> : '—'}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { brandSet('mark', true); toast('Pick an image from your computer', { kind: 'info' }); }}>{b.mark ? 'Replace' : 'Add mark'}</button>
              {b.mark ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { brandSet('mark', false); saved(); }}>Remove</button> : null}</div></Row>
          </>}
          {x.tile === 'colors' && <>
            <Row title="Primary" hint="Main buttons and brand mark">{swatches('color', 'Primary color')}</Row>
            <Row title="Secondary" hint="Soft surfaces and product cards">{swatches('secondary', 'Secondary color')}</Row>
            <Row title="Accent" hint="Small highlights">{swatches('accent', 'Accent color')}</Row>
          </>}
          {x.tile === 'fonts' && <>
            <Row title="Heading"><Select label="Heading font" value={b.fontHeading} options={FONTS} onChange={(v) => { brandSet('fontHeading', v); saved(); }} /></Row>
            <Row title="Body"><Select label="Body font" value={b.fontBody} options={FONTS} onChange={(v) => { brandSet('fontBody', v); saved(); }} /></Row>
          </>}
          {x.tile === 'profile' && <>
            {([['name', 'Store name', ''], ['website', 'Website', 'Used for import and footer links'], ['tagline', 'Tagline', 'Shown under the preview'], ['fromName', 'From name', 'Inbox display name'], ['from', 'From email', 'Replies come back here']] as const).map(([k, t, h]) => (
              <Row key={k} title={t} hint={h}><input className="input" value={b[k]} onChange={(e) => brandSet(k, e.target.value)} onBlur={saved} /></Row>
            ))}
            <Row title="Voice summary" hint="Full guide opens as a document" wide><div className="bk-voice"><p>{b.voice}</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => set((y) => ({ ...y, doc: 'voice', tile: null }))}>Open Brand Voice Guide</button></div></Row>
          </>}
        </div>
      ) : null}

      <div className="co-docs">
        <header className="co-sec-h"><h3>Documents</h3><small>Voice and product truth for drafts</small></header>
        {x.docs.map((d) => (
          <button key={d.id} type="button" className="co-doc-row" onClick={() => set((y) => ({ ...y, doc: d.id, docEdit: false }))}>
            <span><b>{d.title}</b><small>{d.id === 'voice' ? 'Tone & messaging' : 'What you sell'}</small></span>
            <span className={`kn-chip ${d.approved ? 'is-ok' : 'is-draft'}`}>{d.approved ? 'Approved' : 'Draft'}</span><Icon name="chevronRight" />
          </button>
        ))}
      </div>

      <div className="co-facts">
        <header className="co-sec-h"><h3>Facts</h3><small>What emails are allowed to say</small>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const id = `f-${Date.now()}`; set((y) => ({ ...y, facts: [...y.facts, { id, group: 'FAQs', name: '', value: '', src: 'Added by you', age: 'Now', usedBy: [], own: true, review: true }], sel: id })); }}><Icon name="plus" />Add a fact</button>
        </header>
        {x.shipAsked ? (
          <div className="kn-missing">
            <Icon name="alert" />
            <div><b>Do you ship to Australia?</b><small>Dana Okafor asked and your site doesn’t say.</small>
              <div className="su-test"><input className="input" placeholder="e.g. Yes, 7–10 days, duty included" value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Your answer" />
                <button type="button" className="btn btn-secondary btn-sm" disabled={!answer.trim()} onClick={() => { const id = `f-${Date.now()}`; const undo = snap(); set((y) => ({ ...y, shipAsked: false, facts: [...y.facts, { id, group: 'FAQs', name: 'Shipping to Australia', value: answer.trim(), src: 'Added by you', age: 'Now', usedBy: [], own: true }], sel: id })); setAnswer(''); toast('Added to your facts', { undo }); }}>Save</button></div>
            </div>
          </div>
        ) : null}
        {groups.map((g) => (
          <div key={g} className="kn-group">
            <h4>{g}</h4>
            {x.facts.filter((f) => f.group === g).map((f) => (
              <button key={f.id} type="button" className={`kn-row${f.off ? ' off' : ''}`} aria-current={x.sel === f.id} onClick={() => set((y) => ({ ...y, sel: f.id, tile: null }))}>
                <span className="kn-name"><b>{f.name || 'New fact'}</b><small>{f.own ? 'Added by you' : f.site ? 'Changed by you' : f.src}</small></span>
                <span className="kn-val">{f.value || 'Not filled in'}</span>
                <span className={`kn-chip ${f.review ? 'is-draft' : 'is-ok'}`}>{f.review ? 'Needs review' : 'Approved'}</span>
                <span className={`kn-age${f.stale ? ' warn' : ''}`}>{f.age}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>

    <aside className={`set-side${x.tile ? ' preview' : ''}`}><div className="set-side-in kn-side">
      {x.tile ? <>
        <div className="set-side-k">How your emails look</div>
        <div className="set-mail ml-skin" style={pageVars({ ...PAGE_STYLE, accent: b.color })}><MailBody doc={PREVIEW} /></div>
        <p className="kn-hint">{b.fontHeading} · {b.fontBody}{b.tagline ? ` · ${b.tagline}` : ''}</p>
      </> : sel ? <>
        <div className="set-side-k">{sel.group} · <span className={`kn-chip ${sel.review ? 'is-draft' : 'is-ok'}`}>{sel.review ? 'Needs review' : 'Approved'}</span> · <span className="kn-chip">{sel.own || sel.site ? 'Override' : 'Site'}</span></div>
        {sel.own ? <label className="field"><span className="label">What it’s about</span><input className="input" value={sel.name} onChange={(e) => fact(sel.id, { name: e.target.value })} /></label> : <h3 className="kn-title">{sel.name}</h3>}
        <label className="field"><span className="label">What emails can say</span>
          <input className="input" value={sel.value} disabled={sel.off} onChange={(e) => fact(sel.id, { value: e.target.value, review: true, site: sel.own || sel.site ? sel.site : sel.value })} /></label>
        {sel.site && !sel.own ? <p className="kn-mine">Your website says {sel.site}.<button type="button" className="kn-link" onClick={() => fact(sel.id, { value: sel.site!, site: undefined, review: true })}>Use that instead</button></p> : null}
        {sel.own ? null : <><div className="set-side-k gap">Where it’s from</div><p className="kn-src">{sel.src}<small className={sel.stale ? 'warn' : undefined}>{sel.stale ? `Couldn’t check for ${sel.age}` : `Checked ${sel.age === 'Now' ? 'just now' : `${sel.age} ago`}`}</small></p></>}
        <div className="set-side-k gap">Used in</div>
        {sel.usedBy.length
          ? <div className="kn-used">{sel.usedBy.map((id) => <button key={id} type="button" className="kn-link" onClick={() => onGo?.({ to: 'inbox', id })}>{WHO[id] ?? id}</button>)}</div>
          : <p className="kn-src"><small>No emails right now</small></p>}
        {sel.off ? <small className="set-side-note">Expired, so no email will use it.</small>
          : <label className="switch kn-switch"><input type="checkbox" checked={!sel.blocked} onChange={(e) => { fact(sel.id, { blocked: !e.target.checked }); toast(e.target.checked ? 'Emails can use this' : 'Emails won’t use this'); }} />Emails can use this</label>}
        {sel.review && !sel.off ? <button type="button" className="btn btn-primary btn-sm kn-approve" onClick={() => { const undo = snap(); fact(sel.id, { review: false, age: 'Now' }); toast('Approved for email', { undo }); }}>Approve for email</button> : null}
      </> : null}
    </div></aside>
  </>;
}

export function DemoChanges({ onGo }: { onGo?: (go: Go) => void }) {
  const x = useS();
  const [page, setPage] = useState('');
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
          <p className="ch-why">Your shipping page still says over $35, so your site gives two answers. Emails say over $35 until you choose.</p>
          <div className="ch-act">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { fact('ship', { value: 'Orders over $35', review: false }); resolve('ship', 'Emails keep saying free shipping over $35'); }}>Keep over $35</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { fact('ship', { value: 'Orders over $50', review: false, site: 'Orders over $35' }); resolve('ship', 'Emails now say free shipping over $50'); }}>Use over $50</button>
          </div>
        </> : c.kind === 'returns' ? <>
          <p className="ch-why">The email to {link('alex')} still says 30-day returns.</p>
          <div className="ch-act">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { fact('returns', { value: '14 days', review: false }); resolve('returns', 'Facts and the email now say 14-day returns', 'alex'); }}>Update the email</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { people.updatePerson('alex', { status: 'hold' }); resolve('returns', 'The email to Alex Morgan is on hold', 'alex'); }}>Hold it</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { people.updatePerson('alex', { skipped: true }); resolve('returns', 'The email to Alex Morgan was cancelled'); }}>Cancel it</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve('returns', 'Ignored')}>Ignore</button>
          </div>
        </> : c.kind === 'stock' ? <>
          <p className="ch-why">{link('taylor')} came back twice for this, and their email is on hold until it’s in stock.</p>
          <div className="ch-act">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { people.updatePerson('taylor', { status: 'review', warn: false, evidenceGone: false, note: 'In stock, checked just now', offer: 'Sending: it’s back in stock', sendAt: 'today 7:00 PM' }); resolve('stock', 'The email to tbrooks@outlook.com is ready for review', 'taylor'); }}>Move their email to review</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve('stock', 'Ignored. Their email stays on hold')}>Ignore</button>
          </div>
        </> : null}
    </article>
  );

  return <>
    <div className="set-main">
      <header className="set-head"><h2>Website changes</h2></header>
      <p className="kn-lead">When something on your site changes, the emails that mention it are checked before they go out. Today this is a demo; it will be fed by page monitoring.</p>
      {failed ? (
        <div className="alert alert-warning ch-fail"><Icon name="alert" /><div><b>Couldn’t check Salmon Kibble 4 kg</b><p>The page timed out {failed.age}, so it may have changed. The email to tbrooks@outlook.com stays on hold.</p></div>
          <button type="button" className={`btn btn-secondary btn-sm${x.retrying ? ' loading' : ''}`} disabled={x.retrying} onClick={() => {
            set((y) => ({ ...y, retrying: true }));
            window.setTimeout(() => {
              set((y) => ({ ...y, retrying: false, pages: y.pages.map((p) => (p.failed ? { ...p, failed: false, age: 'just now' } : p)), changes: [{ id: 'stock', page: '/products/salmon-kibble-4kg', title: 'Salmon Kibble 4 kg', old: 'Out of stock', now: 'In stock', when: 'just now', kind: 'stock' }, ...y.changes], facts: y.facts.map((f) => (f.id === 'kibble' ? { ...f, value: '$42.00, in stock', stale: false, age: 'Now' } : f)) }));
              toast('Checked. Salmon Kibble is back in stock');
            }, 1200);
          }}>{x.retrying ? 'Checking…' : 'Try again'}</button></div>
      ) : null}
      {open.length ? <><h3 className="kn-group-h">To review</h3><div className="ch-rows">{open.map(row)}</div></> : failed ? null : <p className="ch-none">Nothing to review. New changes show up here.</p>}
      {done.length ? <><h3 className="kn-group-h">Handled</h3><div className="ch-rows">{done.map(row)}</div></> : null}
    </div>
    <aside className="set-side"><div className="set-side-in">
      <div className="set-side-k ch-side-head"><span>Pages we watch</span><button type="button" className="kn-link" onClick={() => { set((y) => ({ ...y, pages: y.pages.map((p) => (p.failed ? p : { ...p, age: 'just now' })) })); toast('Checked every page'); }}>Check now</button></div>
      <ul className="ch-pages">{x.pages.map((p) => <li key={p.url} className={p.failed ? 'warn' : undefined}><Icon name={p.failed ? 'alert' : 'check'} /><div><b>{p.url}</b><small>{p.failed ? `Couldn’t check, last tried ${p.age}` : `Checked ${p.age}`}</small></div></li>)}</ul>
      <div className="set-side-k gap">Watch another page</div>
      <div className="su-test"><input className="input" placeholder="/pages/about" aria-label="Page to watch" value={page} onChange={(e) => setPage(e.target.value)} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={!page.trim()} onClick={() => { const url = page.trim().startsWith('/') ? page.trim() : `/${page.trim()}`; set((y) => ({ ...y, pages: [...y.pages, { url, age: 'just now' }] })); setPage(''); toast(`Watching ${url}`); }}>Add</button></div>
      <label className="field ch-every"><span className="label">Check every</span><Select label="Check every" value={x.every} options={['Hour', '15 minutes', 'Day']} onChange={(v) => { set((y) => ({ ...y, every: v })); saved(); }} /></label>
    </div></aside>
  </>;
}

export function DemoSending() {
  const x = useS();
  const put = (k: keyof S['sending'], v: string) => set((y) => ({ ...y, sending: { ...y.sending, [k]: v } }));
  const sent = 700;
  return <>
    <div className="set-main">
      <header className="set-head"><h2>Sending</h2></header>
      <Row title="Sent by" hint="The name people see in their inbox"><input className="input" value={x.sending.by} onChange={(e) => put('by', e.target.value)} onBlur={saved} /></Row>
      <Row title="Sent from" hint="Replies come back here"><input className="input" value={x.sending.from} onChange={(e) => put('from', e.target.value)} onBlur={saved} /></Row>
      <Row title="Daily limit" hint="Across all your emails"><Select label="Daily limit" value={x.sending.limit} options={['2,000 per day', '5,000 per day', '10,000 per day']} onChange={(v) => { put('limit', v); saved(); }} /></Row>
      <Row title="Quiet hours" hint="In each person’s own time zone"><Select label="Quiet hours" value={x.sending.quiet} options={['9 PM to 8 AM', '10 PM to 7 AM', 'No quiet hours']} onChange={(v) => { put('quiet', v); saved(); }} /></Row>
      <Row title="Stop everything" hint="Holds every scheduled email until you turn it back on">
        {x.paused
          ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { set((y) => ({ ...y, paused: false })); toast('Sending is back on'); }}><Icon name="play" />Turn sending back on</button>
          : <button type="button" className="btn btn-danger-soft btn-sm" onClick={() => { set((y) => ({ ...y, paused: true })); toast('All sending paused', { undo: () => set((y) => ({ ...y, paused: false })) }); }}><Icon name="pause" />Stop all sending</button>}
      </Row>
    </div>
    <aside className="set-side"><div className="set-side-in">
      <div className="set-side-k">Today</div>
      <div className="set-stat"><b>{sent.toLocaleString('en-US')}</b><span>of {x.sending.limit.replace(' per day', '')} sent</span></div>
      <div className="progress"><span style={{ ['--v' as string]: `${(sent / Number(x.sending.limit.replace(/\D/g, ''))) * 100}%` }} /></div>
      {x.paused ? <p className="set-paused"><Icon name="pause" />Paused. Nothing goes out until you turn it back on.</p> : null}
      <div className="set-side-k gap">mail.pawsome.shop</div>
      <ul className="set-dns">
        <li><Icon name="check" /><div><b>DKIM</b><small>Your emails are signed</small></div></li>
        <li><Icon name="check" /><div><b>SPF</b><small>We’re allowed to send for you</small></div></li>
        <li className="warn"><Icon name="alert" /><div><b>DMARC</b><small>Emails still send. A stricter rule would protect your domain better.</small></div></li>
      </ul>
      <small className="set-side-note">Checked 2 minutes ago</small>
    </div></aside>
  </>;
}

export function DemoPrivacy() {
  const x = useS();
  const put = (k: keyof S['privacy'], v: string | boolean) => { set((y) => ({ ...y, privacy: { ...y.privacy, [k]: v } })); saved(); };
  return <>
    <div className="set-main">
      <header className="set-head"><h2>Privacy</h2></header>
      <Row title="Session replay" hint="Anything typed is hidden before it’s saved"><label className="switch"><input type="checkbox" checked={x.privacy.replay} aria-label="Session replay" onChange={(e) => put('replay', e.target.checked)} /></label></Row>
      <Row title="AI" hint="What the AI can see when it writes">
        <div className="seg" role="group" aria-label="AI mode">{['Standard', 'Strict', 'Off'].map((m) => <button key={m} type="button" aria-pressed={x.privacy.ai === m} onClick={() => put('ai', m)}>{m}</button>)}</div>
      </Row>
      <Row title="Keep data for" hint="Recordings and visits, then deleted"><Select label="Keep data for" value={x.privacy.keep} options={['90 days', '30 days', '1 year']} onChange={(v) => put('keep', v)} /></Row>
    </div>
    <aside className="set-side"><div className="set-side-in">
      <div className="set-side-k">What we keep</div>
      <ul className="set-list"><li>Pages they looked at</li><li>What they added to the cart</li><li>Discount codes they tried</li></ul>
      <div className="set-side-k gap">What we never keep</div>
      <ul className="set-list no"><li>Passwords</li><li>Card numbers</li><li>Anything else typed in a form</li></ul>
    </div></aside>
  </>;
}
