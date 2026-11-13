/* The email editor: the email on a dotted canvas, blocks to add down the left, the style (or the picked block)
   on the right, Desktop/iPhone and undo/redo in a small dock. Changes stay a draft until Publish. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { FONTS, MailBody, MailPhone, pageVars, type MailEdit } from './Mail';
import { STORE, type BlockStyle, type MailDoc, type PageStyle } from './storeData';
import { useSlidingPill } from './ui/useSlidingPill';

export type Draft = { doc: MailDoc; page: PageStyle };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const ADD: { type: string; icon: IconName; label: string }[] = [
  { type: 'header', icon: 'heading', label: 'Heading' }, { type: 'body', icon: 'list', label: 'Text' }, { type: 'image', icon: 'image', label: 'Image' },
  { type: 'button', icon: 'pointer', label: 'Button' }, { type: 'product', icon: 'cart', label: 'Product' }, { type: 'div', icon: 'minus', label: 'Divider' },
  { type: 'sig', icon: 'user', label: 'Signature' },
];
const BLOCK: Record<string, { icon: IconName; name: string; hint: string }> = {
  logo: { icon: 'image', name: 'Logo', hint: 'Your logo and colour come from your brand kit, so every email matches your site.' },
  headline: { icon: 'heading', name: 'Heading', hint: 'The first thing they read. Keep it short.' },
  body: { icon: 'list', name: 'Text', hint: 'A paragraph of the email.' },
  products: { icon: 'cart', name: 'Products', hint: 'Products from your store.' },
  code: { icon: 'tag', name: 'Discount code', hint: 'A code made for this person.' },
  cta: { icon: 'pointer', name: 'Button', hint: 'Where the email sends them.' },
  hero: { icon: 'image', name: 'Image', hint: 'A big product photo at the top' },
  cart: { icon: 'cart', name: 'Cart', hint: 'What’s in their cart, as they left it' },
  perks: { icon: 'check', name: 'Perks', hint: 'Shipping and returns, from your store settings' },
  sig: { icon: 'user', name: 'Signature', hint: 'Who the email is from' },
  div: { icon: 'minus', name: 'Divider', hint: 'A thin line between parts of the email' },
  footer: { icon: 'list', name: 'Footer', hint: 'Your address and an unsubscribe link.' },
};
const KIT = [STORE.color, '#191B22', '#2F5FD0', '#1F7A5C', '#B23A6B', '#7A3FC8'];

/** The way back lives in the app shelf crumb above the editor, as in the kit. */
export function MailEditor({ published, onPublish }: {
  published: Draft;
  onPublish: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => clone(published));
  const [sel, setSel] = useState('page');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const devPill = useSlidingPill<HTMLDivElement>(device);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const [, bump] = useState(0);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(published), [draft, published]);
  const doc = draft.doc;

  /** Every change goes through here so it can be undone. */
  function change(next: (d: Draft) => void, keepSel?: string) {
    setDraft((cur) => {
      const copy = clone(cur);
      next(copy);
      if (JSON.stringify(copy) === JSON.stringify(cur)) return cur;
      undo.current = [...undo.current.slice(-59), JSON.stringify(cur)];
      redo.current = [];
      return copy;
    });
    if (keepSel) setSel(keepSel);
    bump((n) => n + 1);
  }
  function step(from: React.MutableRefObject<string[]>, to: React.MutableRefObject<string[]>) {
    const last = from.current.pop();
    if (!last) return;
    to.current.push(JSON.stringify(draft));
    const next = JSON.parse(last) as Draft;
    setDraft(next);
    if (sel !== 'page' && sel !== 'logo' && !next.doc.order.includes(sel)) setSel('page');
    bump((n) => n + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target as HTMLElement).isContentEditable || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) step(redo, undo); else step(undo, redo); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const edit: MailEdit = {
    sel,
    onSelect: setSel,
    onText: (k, v) => change((d) => {
      if (k === 'headline') d.doc.headline = v;
      else if (k === 'cta') d.doc.cta = v;
      else if (k.startsWith('body.')) d.doc.body[Number(k.split('.')[1])] = v;
    }),
    onAct: (act) => {
      const order = doc.order;
      const i = order.indexOf(sel);
      if (i < 0) return;
      if (act === 'del') { change((d) => { d.doc.order.splice(i, 1); }, 'page'); return; }
      if (act === 'up' && i > 0) change((d) => { const o = d.doc.order; [o[i - 1], o[i]] = [o[i], o[i - 1]]; });
      if (act === 'down' && i < order.length - 2) change((d) => { const o = d.doc.order; [o[i + 1], o[i]] = [o[i], o[i + 1]]; });
      if (act === 'dup') {
        const type = sel.split('.')[0];
        let key = '';
        change((d) => {
          if (type === 'body') { d.doc.body.push(d.doc.body[Number(sel.split('.')[1])]); key = `body.${d.doc.body.length - 1}`; }
          else if (type === 'div') key = `div.${Date.now()}`;
          if (key) d.doc.order.splice(i + 1, 0, key);
        });
        if (key) setSel(key);
      }
    },
  };

  function add(type: string) {
    let key = '';
    change((d) => {
      const o = d.doc.order;
      const at = sel === 'page' || sel === 'logo' ? Math.max(0, o.indexOf('footer') - 1) : o.indexOf(sel);
      if (type === 'body') { d.doc.body.push('Write something here.'); key = `body.${d.doc.body.length - 1}`; }
      else if (type === 'div') key = `div.${Date.now()}`;
      else if (type === 'header') { if (!d.doc.headline) d.doc.headline = 'A short heading'; key = 'headline'; }
      else if (type === 'image') { d.doc.hero ??= { photo: d.doc.products?.[0]?.photo ?? 'starter' }; key = 'hero'; }
      else if (type === 'button') { if (!d.doc.cta) d.doc.cta = 'Shop now'; key = 'cta'; }
      else if (type === 'product') { if (!d.doc.products?.length) d.doc.products = [{ photo: 'starter', name: 'Kitten Starter Pack', now: '$49.00', note: 'From your store' }]; key = 'products'; }
      else if (type === 'sig') key = 'sig';
      if (key && !o.includes(key)) o.splice(at + 1, 0, key);
    });
    window.setTimeout(() => setSel(key || 'page'));
  }

  const setPage = <K extends keyof PageStyle>(k: K, v: PageStyle[K]) => change((d) => { d.page[k] = v; });
  const setBlock = (prop: keyof BlockStyle, v: string) => change((d) => { d.doc.blocks[sel] = { ...(d.doc.blocks[sel] ?? {}), [prop]: v }; });

  const panel = sel === 'page' ? (
    <>
      <header><Icon name="sliders" /><h3>Style</h3></header>
      <div className="v2-in cpe-panel-in">
        <section className="cpe-sec"><h4>Colours</h4>
          <div className="cpe-grid">
            <Color label="Background" value={draft.page.bg} onChange={(v) => setPage('bg', v)} />
            <Color label="Email" value={draft.page.fill} onChange={(v) => setPage('fill', v)} />
            <Color label="Text" value={draft.page.text} onChange={(v) => setPage('text', v)} />
          </div>
          <div className="cpe-f"><span>Buttons and logo</span>
            <div className="cpe-kit">{KIT.map((c) => <button key={c} type="button" className="cpe-kit-sw" style={{ ['--c' as string]: c }} aria-pressed={draft.page.accent.toLowerCase() === c.toLowerCase()} aria-label={`Use ${c}`} onClick={() => setPage('accent', c)} />)}</div>
          </div>
        </section>
        <section className="cpe-sec"><h4>Text</h4>
          <div className="cpe-grid">
            <Font label="Headings" value={draft.page.headFont} onChange={(v) => setPage('headFont', v)} />
            <Font label="Body" value={draft.page.bodyFont} onChange={(v) => setPage('bodyFont', v)} />
            <Num label="Size" icon="fontsize" value={draft.page.size} max={24} onChange={(v) => setPage('size', v)} />
          </div>
        </section>
        <section className="cpe-sec"><h4>Shape</h4>
          <div className="cpe-grid">
            <Num label="Width" icon="width" value={draft.page.width} max={800} onChange={(v) => setPage('width', v)} />
            <Num label="Corners" icon="corner" value={draft.page.corners} max={40} onChange={(v) => setPage('corners', v)} />
          </div>
        </section>
      </div>
    </>
  ) : (() => {
    const type = sel.split('.')[0];
    const info = BLOCK[type] ?? BLOCK.body;
    const s = doc.blocks[sel] ?? {};
    const seg = (label: string, prop: keyof BlockStyle, cur: string, opts: [string, string][]) => (
      <div className="cpe-f"><span>{label}</span>
        <div className="seg cpe-seg" role="group" aria-label={label}>{opts.map(([v, l]) => <button key={v} type="button" aria-pressed={cur === v} onClick={() => setBlock(prop, v)}>{l}</button>)}</div>
      </div>
    );
    const alignSeg = seg('Align', 'align', s.align ?? 'left', [['left', 'Left'], ['center', 'Center']]);
    return (
      <>
        <header><button type="button" className="cpe-back" aria-label="Back to style" onClick={() => setSel('page')}><Icon name="chevronLeft" /></button><Icon name={info.icon} /><h3>{info.name}</h3></header>
        <div className="v2-in cpe-panel-in">
          <section className="cpe-sec">
            <p className="cpe-hint">{info.hint}</p>
            {type === 'headline' && <>{seg('Size', 'size', s.size ?? 'm', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}{alignSeg}</>}
            {type === 'body' && <>{alignSeg}<p className="cpe-hint">Click the words in the email to change them. Type {'{{first_name}}'} where their name should go.</p></>}
            {type === 'cta' && <>
              <label className="cpe-f"><span>Button text</span><input className="input cpe-text" value={doc.cta} onChange={(e) => change((d) => { d.doc.cta = e.target.value; })} /></label>
              {seg('Width', 'width', s.width ?? 'full', [['full', 'Full width'], ['fit', 'Fit text']])}
            </>}
            {type === 'code' && doc.code && <>
              <label className="cpe-f"><span>Line under the code</span><input className="input cpe-text" value={doc.code.n} onChange={(e) => change((d) => { if (d.doc.code) d.doc.code.n = e.target.value; })} /></label>
              <p className="cpe-hint">The code itself is checked against your store before each email.</p>
            </>}
            {type === 'products' && <>{(doc.products?.length ?? 0) > 1 ? seg('Layout', 'layout', s.layout ?? 'side', [['side', 'Side by side'], ['list', 'List']]) : null}<p className="cpe-hint">Photos and prices come straight from your store.</p></>}
            {type === 'footer' && <>
              <label className="cpe-f"><span>Footer text</span><input className="input cpe-text" value={doc.footer ?? STORE.address} onChange={(e) => change((d) => { d.doc.footer = e.target.value; })} /></label>
              <p className="cpe-hint">Your address and an unsubscribe link are required.</p>
            </>}
          </section>
          {type === 'logo' || type === 'footer' ? null : <button type="button" className="btn btn-ghost btn-sm cpe-del" onClick={() => edit.onAct('del')}><Icon name="trash" />Remove this block</button>}
        </div>
      </>
    );
  })();

  const subject = <input className="cpe-subject" value={doc.subject} placeholder="Subject line" aria-label="Subject" onChange={(e) => change((d) => { d.doc.subject = e.target.value; })} />;

  return (
    <div className="cpe">
      <div className="cpe-body">
        <div className="cpe-surface" aria-hidden="true" />
        <div className="cpe-canvas" onPointerDown={(e) => { if (e.target === e.currentTarget) setSel('page'); }}>
          {device === 'phone' ? (
            <div className="cpe-phonewrap"><MailPhone doc={doc} page={draft.page} subject={subject}><MailBody doc={doc} edit={edit} /></MailPhone></div>
          ) : (
            <div className="cpe-zoom">
              <label className="cpe-subjrow"><span>Subject</span>{subject}</label>
              <div className="cpe-page ml-skin" style={pageVars(draft.page)}><MailBody doc={doc} edit={edit} /></div>
            </div>
          )}
        </div>
        <div className="cpe-tools" role="toolbar" aria-label="Add a block" aria-orientation="vertical">
          <div className="cpe-grip" aria-hidden="true"><span>Add</span></div>
          {ADD.map((a, i) => (
            <span key={a.type} className="cpe-tool">
              {i === 5 ? <i className="cpe-tools-sep" /> : null}
              <button type="button" aria-label={`Add ${a.label.toLowerCase()}`} title={`Add ${a.label.toLowerCase()}`} onClick={() => add(a.type)}><Icon name={a.icon} /></button>
            </span>
          ))}
        </div>
        <div className="cpe-dock">
          <div className="seg cpe-devseg" role="group" aria-label="Preview size" ref={devPill}>
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Icon name="monitor" />Desktop</button>
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}><Icon name="phone" />iPhone</button>
          </div>
          <i className="cpe-dock-sep" />
          <button type="button" className="cpe-ib" aria-label="Undo" title="Undo" disabled={!undo.current.length} onClick={() => step(undo, redo)}><Icon name="undo" /></button>
          <button type="button" className="cpe-ib" aria-label="Redo" title="Redo" disabled={!redo.current.length} onClick={() => step(redo, undo)}><Icon name="redo" /></button>
        </div>
        <div className="cpe-side">
          <aside className="cpe-panel v2-card" aria-label="Style">{panel}</aside>
          <div className="cpe-pubrow">
            {dirty ? <span className="cpe-state">Not live yet</span> : null}
            <button type="button" className="btn btn-primary cpe-pub" disabled={!dirty} onClick={() => onPublish(clone(draft))}>Publish</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => setHex(value.toUpperCase()), [value]);
  return (
    <label className="cpe-f"><span>{label}</span>
      <span className="cpe-in cpe-color">
        <span className="cpe-sw" style={{ background: value }}><input type="color" value={value.length === 7 ? value : '#000000'} aria-label={label} onChange={(e) => onChange(e.target.value)} /></span>
        <input className="cpe-hex" value={hex} spellCheck={false} aria-label={`${label} hex`} onChange={(e) => { setHex(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} />
      </span>
    </label>
  );
}
function Font({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="cpe-f"><span>{label}</span>
      <span className="cpe-select-wrap"><select className="select cpe-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select><Icon name="chevronDown" /></span>
    </label>
  );
}
function Num({ label, icon, value, max, onChange }: { label: string; icon: IconName; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="cpe-f"><span>{label}</span>
      <span className="cpe-in"><Icon name={icon} /><input type="number" min={0} max={max} value={value} aria-label={label} onChange={(e) => onChange(Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))))} /><small>px</small></span>
    </label>
  );
}
