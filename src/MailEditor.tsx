/* The email editor: the email on a dotted canvas, blocks to add down the left, the style (or the picked block)
   on the right, Desktop/iPhone and undo/redo in a small dock. You write it: subject, preview, headline, text,
   images and products from Brand knowledge (or uploaded, or a link), the button and where it goes. Changes
   stay a draft until Save. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { setLeaveGuard } from './leaveGuard';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './ui/Icon';
import { Dropdown } from './ui/Dropdown';
import { Uploader } from './ui/Uploader';
import { toast } from './ui/toast';
import { FONTS, MailBody, MailPhone, pageVars, useMailBrand, type MailEdit } from './Mail';
import { PHOTOS, STORE, photo, type BlockStyle, type MailDoc, type PageStyle, type Product } from './storeData';
import { useSlidingPill } from './ui/useSlidingPill';
import type { Brand, BrandFile } from './brandStore';
import { lastingSrc, uploadImage } from './campaignMail';
import { FIELDS, FIELD_RE } from '../server/trigger-library';
import { mailDocToHtml } from '../server/email-html';

export type Draft = { doc: MailDoc; page: PageStyle };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const ADD: { type: string; icon: IconName; label: string }[] = [
  { type: 'header', icon: 'heading', label: 'Heading' }, { type: 'body', icon: 'list', label: 'Text' }, { type: 'image', icon: 'image', label: 'Image' },
  { type: 'button', icon: 'pointer', label: 'Button' }, { type: 'product', icon: 'cart', label: 'Product' }, { type: 'div', icon: 'minus', label: 'Divider' },
  { type: 'sig', icon: 'user', label: 'Signature' },
];
const BLOCK: Record<string, { icon: IconName; name: string; hint: string }> = {
  logo: { icon: 'image', name: 'Logo', hint: 'From Brand knowledge.' },
  headline: { icon: 'heading', name: 'Heading', hint: 'Click it in the email to type.' },
  body: { icon: 'list', name: 'Text', hint: 'Click it in the email to type. Add a personal field from the bottom bar.' },
  products: { icon: 'cart', name: 'Products', hint: '' },
  code: { icon: 'tag', name: 'Discount code', hint: '' },
  cta: { icon: 'pointer', name: 'Button', hint: '' },
  hero: { icon: 'image', name: 'Image', hint: '' },
  cart: { icon: 'cart', name: 'Cart', hint: 'What’s in their cart, as they left it.' },
  perks: { icon: 'check', name: 'Perks', hint: '' },
  sig: { icon: 'user', name: 'Signature', hint: 'The sender is set in the campaign’s Settings.' },
  div: { icon: 'minus', name: 'Divider', hint: '' },
  footer: { icon: 'list', name: 'Footer', hint: 'An unsubscribe link is always added.' },
};
const DEMO_PRODUCTS: Product[] = (Object.keys(PHOTOS) as (keyof typeof PHOTOS)[]).map((k) => ({ photo: k, name: k[0].toUpperCase() + k.slice(1), now: '' }));
const KIT = [STORE.color, '#191B22', '#2F5FD0', '#1F7A5C', '#B23A6B', '#7A3FC8'];

/** The way back lives in the app shelf crumb above the editor, as in the kit. */
export function MailEditor({ space, brand, published, onPublish }: {
  /** Where uploads go: the store's project id, or the demo store. */
  space: string;
  brand: Brand;
  published: Draft;
  onPublish: (draft: Draft) => void;
}) {
  const mailBrand = useMailBrand();
  // Swatches: the store's own colours first, then a few safe ones.
  const kit = [...new Set([...brand.colors.map((c) => c.hex.toUpperCase()), ...KIT.map((c) => c.toUpperCase())])].slice(0, 6);
  const [uploading, setUploading] = useState(false);
  // What you can put in an email: the store's own photos and products (the demo store's examples otherwise).
  const shelf = useMemo(() => {
    type Pic = { key: string; label: string; file?: BrandFile; src: string };
    // Everything with a picture in Brand knowledge, by folder.
    const groups: { id: string; name: string; items: Pic[] }[] = [
      { id: 'products', name: 'Products', items: brand.products.flatMap((p) => [p.image, p.image2].filter(Boolean).map((f, i) => ({ key: `r-${f!.id}-${i}`, label: p.name, file: f!, src: f!.src }))) },
      { id: 'photos', name: 'Photos', items: brand.photos.map((f, i) => ({ key: `p-${f.id}-${i}`, label: f.name, file: f, src: f.src })) },
      { id: 'logos', name: 'Logos', items: (['primary', 'mark', 'dark'] as const).flatMap((k) => (brand.logos[k] ? [{ key: `l-${k}`, label: k === 'primary' ? 'Main logo' : k === 'mark' ? 'Square icon' : 'Logo on dark', file: brand.logos[k]!, src: brand.logos[k]!.src }] : [])) },
    ].map((g) => ({ ...g, items: g.items.filter((x) => x.src) })).filter((g) => g.items.length);
    const photos = groups.flatMap((g) => g.items);
    const products: Product[] = brand.products.length
      ? brand.products.map((p) => ({ name: p.name, now: p.price, img: p.image?.src }))
      : space === 'demo' ? DEMO_PRODUCTS : [];
    return { groups, photos, products, files: new Map(brand.products.map((p) => [p.name, p.image ?? null])) };
  }, [brand]);
  async function imageFrom(file: BrandFile | File | null, src?: string): Promise<string | null> {
    if (!file) return src ?? null;
    setUploading(true);
    try { return file instanceof File ? await uploadImage(space, file) : await lastingSrc(space, file); }
    catch (e) { toast(e instanceof Error ? e.message : 'Upload failed', { kind: 'warn' }); return null; }
    finally { setUploading(false); }
  }
  const [draft, setDraft] = useState<Draft>(() => clone(published));
  const [sel, setSel] = useState('page');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const devPill = useSlidingPill<HTMLDivElement>(device);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const [, bump] = useState(0);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(published), [draft, published]);
  const doc = draft.doc;
  // Unsaved changes: leaving asks first (keep editing, discard, or save and leave); closing the tab warns too.
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const off = setLeaveGuard((proceed) => { setLeaving(() => proceed); return true; });
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', warn);
    return () => { off(); removeEventListener('beforeunload', warn); };
  }, [dirty]);
  // Personal fields go where you were last typing: subject, preview, or text in the email.
  const lastText = useRef<{ el: HTMLElement; range?: Range } | null>(null);
  useEffect(() => {
    const remember = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.closest('.cpe')) return;
      if (active.matches('.cpe-subject')) { lastText.current = { el: active }; return; }
      if (active.isContentEditable) {
        const selection = document.getSelection();
        lastText.current = { el: active, range: selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : undefined };
      }
    };
    document.addEventListener('selectionchange', remember);
    document.addEventListener('focusin', remember);
    return () => { document.removeEventListener('selectionchange', remember); document.removeEventListener('focusin', remember); };
  }, []);
  function insertField(key: string) {
    const token = `{{${key}}}`;
    const target = lastText.current;
    if (!target?.el.isConnected) { toast('Click into the text first, then add a field', { kind: 'warn' }); return; }
    if (target.el instanceof HTMLInputElement) {
      const input = target.el;
      const at = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? at;
      const next = input.value.slice(0, at) + token + input.value.slice(end);
      const which = input.classList.contains('cpe-preview') ? 'preview' : 'subject';
      change((d) => { d.doc[which] = next; });
      window.setTimeout(() => { input.focus(); input.setSelectionRange(at + token.length, at + token.length); });
      return;
    }
    target.el.focus();
    const selection = document.getSelection();
    if (target.range && selection) { selection.removeAllRanges(); selection.addRange(target.range); }
    document.execCommand('insertText', false, token);
  }
  const usedFields = useMemo(() => {
    const d = draft.doc;
    const text = [d.subject, d.preview ?? '', d.headline, d.cta, ...d.body].join(' ');
    return FIELDS.filter((f) => [...text.matchAll(FIELD_RE)].some((m) => m[1] === f.key));
  }, [draft.doc]);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const fieldsRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!fieldsOpen) return;
    const away = (e: PointerEvent) => { if (!fieldsRef.current?.contains(e.target as Node)) setFieldsOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFieldsOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [fieldsOpen]);


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
      // With nothing picked, new blocks go above the sign-off (or the footer).
      // Pictures and products go above the button; anything else above the sign-off.
      const visual = (type === 'image' || type === 'product') && o.includes('cta');
      const end = visual ? o.indexOf('cta') : o.includes('sig') ? o.indexOf('sig') : o.indexOf('footer');
      const at = sel === 'page' || sel === 'logo' ? Math.max(-1, end - 1) : o.indexOf(sel);
      if (type === 'body') { d.doc.body.push(''); key = `body.${d.doc.body.length - 1}`; }
      else if (type === 'div') key = `div.${Date.now()}`;
      else if (type === 'header') { key = 'headline'; }
      else if (type === 'image') { d.doc.hero ??= {}; key = 'hero'; }
      else if (type === 'button') { if (!d.doc.cta) d.doc.cta = 'Shop now'; key = 'cta'; }
      else if (type === 'product') { if (!d.doc.products?.length) d.doc.products = []; key = 'products'; }
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
        {usedFields.length ? (
          <section className="cpe-sec"><h4>Personal fields</h4>
            <p className="cpe-hint">What each one says when we don’t know it for someone.</p>
            {usedFields.map((f) => (
              <label key={f.key} className="cpe-fallback">
                <span className="ml-var" data-label={f.name} aria-hidden="true">{`{{${f.key}}}`}</span>
                <input className="input cpe-text" value={draft.doc.vars?.[f.key] ?? f.fallback} placeholder="Leave it out" aria-label={`${f.name} if unknown`}
                  onChange={(e) => change((d) => { d.doc.vars = { ...(d.doc.vars ?? {}), [f.key]: e.target.value }; })} />
              </label>
            ))}
          </section>
        ) : null}
        <section className="cpe-sec"><h4>Colours</h4>
          <div className="cpe-grid">
            <Color label="Background" value={draft.page.bg} onChange={(v) => setPage('bg', v)} />
            <Color label="Email" value={draft.page.fill} onChange={(v) => setPage('fill', v)} />
            <Color label="Text" value={draft.page.text} onChange={(v) => setPage('text', v)} />
          </div>
          <div className="cpe-f"><span>Buttons and logo</span>
            <div className="cpe-kit">{kit.map((c) => <button key={c} type="button" className="cpe-kit-sw" style={{ ['--c' as string]: c }} aria-pressed={draft.page.accent.toLowerCase() === c.toLowerCase()} aria-label={`Use ${c}`} onClick={() => setPage('accent', c)} />)}</div>
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
    const alignSeg = seg('Align', 'align', s.align ?? (doc.kind === 'personal' ? 'left' : 'center'), [['left', 'Left'], ['center', 'Center']]);
    const heroSrc = doc.hero?.src || (doc.hero?.photo ? photo(PHOTOS[doc.hero.photo], 400) : '');
    const setHero = (src: string | null) => { if (src) change((d) => { d.doc.hero = { src }; }); };
    const productSrc = (p: Product) => p.img || (p.photo ? photo(PHOTOS[p.photo], 200) : '');
    const addProduct = async (p: Product) => {
      const file = shelf.files.get(p.name) ?? null;
      const img = file ? await imageFrom(file) : p.img ?? null;
      change((d) => { d.doc.products = [...(d.doc.products ?? []), { ...p, img: img ?? p.img }]; if (!d.doc.order.includes('products')) d.doc.order.splice(Math.max(0, d.doc.order.indexOf('cta')), 0, 'products'); });
    };
    return (
      <>
        <header><button type="button" className="cpe-back" aria-label="Back to style" onClick={() => setSel('page')}><Icon name="chevronLeft" /></button><Icon name={info.icon} /><h3>{info.name}</h3></header>
        <div className="v2-in cpe-panel-in">
          <section className="cpe-sec">
            {info.hint ? <p className="cpe-hint">{info.hint}</p> : null}
            {type === 'headline' && <>{seg('Size', 'size', s.size ?? 'm', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}{alignSeg}</>}
            {type === 'body' && alignSeg}
            {type === 'cta' && <>
              <label className="cpe-f"><span>Button text</span><input className="input cpe-text" value={doc.cta} onChange={(e) => change((d) => { d.doc.cta = e.target.value; })} /></label>
              <label className="cpe-f"><span>Link</span><input className="input cpe-text" value={doc.ctaUrl ?? ''} placeholder="https://… (your store if empty)" inputMode="url" onChange={(e) => change((d) => { d.doc.ctaUrl = e.target.value.trim(); })} /></label>
              {seg('Width', 'width', s.width ?? 'fit', [['fit', 'Fit text'], ['full', 'Full width']])}
            </>}
            {type === 'hero' && <>
              {heroSrc ? <div className="cpe-img-now"><img src={heroSrc} alt="" /></div> : null}
              {shelf.groups.length ? (
                <BrandLibrary groups={shelf.groups} current={heroSrc} busy={uploading} onPick={(p) => void imageFrom(p.file ?? null, p.src).then(setHero)} />
              ) : <p className="cpe-lib-empty">Nothing in Brand knowledge yet. Add products, photos or a logo there and they show up here.</p>}
              <details className="cpe-more" open={!shelf.groups.length}>
                <summary><Icon name="upload" />Upload or paste a link</summary>
                <Uploader compact accept="image/png,image/jpeg,image/webp,image/gif" maxMb={5} title={uploading ? 'Uploading…' : 'Upload an image'}
                  onFiles={([f]) => void imageFrom(f).then(setHero)} />
                <input className="input cpe-text" placeholder="https://…" aria-label="Image link" inputMode="url" defaultValue={doc.hero?.src?.startsWith('http') ? doc.hero.src : ''}
                  onBlur={(e) => { const v = e.target.value.trim(); if (/^https?:\/\//i.test(v)) setHero(v); }} />
              </details>
            </>}
            {type === 'code' && doc.code && <>
              <label className="cpe-f"><span>Line under the code</span><input className="input cpe-text" value={doc.code.n} onChange={(e) => change((d) => { if (d.doc.code) d.doc.code.n = e.target.value; })} /></label>
              <p className="cpe-hint">The code itself is checked against your store before each email.</p>
            </>}
            {type === 'products' && <>
              {(doc.products?.length ?? 0) > 1 ? seg('Layout', 'layout', s.layout ?? 'side', [['side', 'Side by side'], ['list', 'List']]) : null}
              {doc.products?.length ? <ul className="cpe-prods">{doc.products.map((p, i) => (
                <li key={i}>
                  <label className="cpe-prod-img" title="Change the photo">
                    {productSrc(p) ? <img src={productSrc(p)} alt="" /> : <span className="cpe-prod-ph"><Icon name="upload" /></span>}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void imageFrom(f).then((src) => { if (src) change((d) => { d.doc.products![i].img = src; delete d.doc.products![i].photo; }); }); }} />
                  </label>
                  <span className="cpe-prod-t">
                    <input className="cpe-plain" value={p.name} placeholder="Name" aria-label="Product name" onChange={(e) => change((d) => { d.doc.products![i].name = e.target.value; })} />
                    <input className="cpe-plain small" value={p.now} placeholder="Price" aria-label="Price" onChange={(e) => change((d) => { d.doc.products![i].now = e.target.value; })} />
                  </span>
                  <button type="button" className="cpe-x" aria-label={`Remove ${p.name}`} onClick={() => change((d) => { d.doc.products!.splice(i, 1); })}><Icon name="x" /></button>
                </li>
              ))}</ul> : null}
              <div className="cpe-f"><span>Add</span>
                <div className="cpe-shelf">{shelf.products.filter((p) => !doc.products?.some((x) => x.name === p.name)).map((p) => (
                  <button key={p.name} type="button" className="cpe-shelf-i" title={p.name} aria-label={`Add ${p.name}`} disabled={uploading} onClick={() => void addProduct(p)}>
                    {productSrc(p) ? <img src={productSrc(p)} alt="" /> : <Icon name="cart" />}
                  </button>
                ))}
                <button type="button" className="cpe-shelf-i is-new" aria-label="Add a product by hand" onClick={() => void addProduct({ name: 'Product', now: '' })}><Icon name="plus" /></button>
                </div>
              </div>
            </>}
            {type === 'footer' && <>
              <label className="cpe-f"><span>Footer text</span><input className="input cpe-text" value={doc.footer ?? (mailBrand.paw ? STORE.address : mailBrand.address)} onChange={(e) => change((d) => { d.doc.footer = e.target.value; })} /></label>
            </>}
          </section>
          {type === 'logo' || type === 'footer' ? null : <button type="button" className="btn btn-ghost btn-sm cpe-del" onClick={() => edit.onAct('del')}><Icon name="trash" />Remove this block</button>}
        </div>
      </>
    );
  })();

  const subject = <input className="cpe-subject" value={doc.subject} placeholder="Subject line" aria-label="Subject" onChange={(e) => change((d) => { d.doc.subject = e.target.value; })} />;
  const previewLine = <input className="cpe-subject cpe-preview" value={doc.preview ?? ''} placeholder="Preview text (after the subject in the inbox)" aria-label="Preview text" onChange={(e) => change((d) => { d.doc.preview = e.target.value; })} />;

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
              <label className="cpe-subjrow"><span>Preview</span>{previewLine}</label>
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
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} title="Desktop" aria-label="Desktop"><Icon name="monitor" /><span className="cpe-lbl">Desktop</span></button>
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} title="iPhone" aria-label="iPhone"><Icon name="phone" /><span className="cpe-lbl">iPhone</span></button>
          </div>
          <i className="cpe-dock-sep" />
          <button type="button" className="cpe-ib" aria-label="Undo" title="Undo" disabled={!undo.current.length} onClick={() => step(undo, redo)}><Icon name="undo" /></button>
          <button type="button" className="cpe-ib" aria-label="Redo" title="Redo" disabled={!redo.current.length} onClick={() => step(redo, undo)}><Icon name="redo" /></button>
          <button
            type="button"
            className="cpe-ib"
            aria-label="Copy HTML"
            title="Copy production HTML"
            onClick={() => {
              try {
                const html = mailDocToHtml(doc, draft.page, {
                  name: mailBrand.name,
                  logo: mailBrand.logo,
                  sender: mailBrand.sender,
                  signoff: mailBrand.signoff,
                  address: mailBrand.address,
                }, {
                  openPixel: 'https://example.com/o.gif',
                  unsubscribeUrl: 'https://example.com/unsubscribe',
                  wrapClick: (url) => url || '#',
                  name: null,
                });
                void navigator.clipboard.writeText(html).then(
                  () => toast('HTML copied — paste into Litmus or a test send'),
                  () => toast('Could not copy HTML', { kind: 'warn' }),
                );
              } catch (error) {
                toast(error instanceof Error ? error.message : 'Could not build HTML', { kind: 'warn' });
              }
            }}
          >
            <Icon name="file" />
          </button>
          <i className="cpe-dock-sep" />
          <span ref={fieldsRef} className={`cpe-fields${fieldsOpen ? ' open' : ''}`}>
            <button type="button" className="cpe-fields-btn" aria-haspopup="menu" aria-expanded={fieldsOpen}
              onMouseDown={(e) => e.preventDefault()} onClick={() => setFieldsOpen((o) => !o)} title="Personal field" aria-label="Personal field"><Icon name="user" /><span className="cpe-lbl">Personal field</span></button>
            {fieldsOpen ? (
              <span className="cpe-fields-menu menu" role="menu">
                <span className="menu-label">Filled in for each person</span>
                {FIELDS.map((f) => (
                  <button key={f.key} type="button" role="menuitem" className="menu-item" onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { insertField(f.key); setFieldsOpen(false); }}>
                    <span className="cpe-fields-name">{f.name}</span><small>{f.example}</small>
                  </button>
                ))}
              </span>
            ) : null}
          </span>
        </div>
        <div className="cpe-side">
          <aside className="cpe-panel v2-card" aria-label="Style">{panel}</aside>
          <div className="cpe-pubrow">
            <span className={`cpe-state${dirty ? ' is-dirty' : ''}`}><i />{dirty ? 'Not saved yet' : 'All saved'}</span>
            <button type="button" className="btn btn-primary btn-sm cpe-pub" disabled={!dirty || uploading} onClick={() => onPublish(clone(draft))}>Save</button>
          </div>
        </div>
      </div>
      {leaving ? createPortal(
        <div className="cc-modal">
          <div className="cc-scrim" onClick={() => setLeaving(null)} />
          <section className="cc-card cpe-leave" role="alertdialog" aria-modal="true" aria-labelledby="cpeLeaveT">
            <div className="cc-inner cc-screen">
              <header className="cc-head">
                <span className="cc-chip">Not saved yet</span>
                <h2 id="cpeLeaveT">Save your changes?</h2>
                <p>You changed this email since you last saved.</p>
              </header>
              <div className="cc-actions">
                <button type="button" className="cc-btn" onClick={() => { const go = leaving; setLeaving(null); go(); }}>Discard</button>
                <button type="button" className="cc-btn is-primary" disabled={uploading} onClick={() => { const go = leaving; onPublish(clone(draft)); setLeaving(null); go(); }}>Save and leave</button>
              </div>
              <button type="button" className="cc-link" autoFocus onClick={() => setLeaving(null)}>Keep editing</button>
            </div>
          </section>
        </div>,
        document.querySelector('.app') ?? document.body,
      ) : null}
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
      <Dropdown label={label} value={value} className="cpe-dd" options={FONTS.map((f) => ({ value: f, label: f }))} onChange={onChange} />
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

/** Pictures already in Brand knowledge, by folder: pick one and it goes in the email. */
function BrandLibrary({ groups, current, busy, onPick }: {
  groups: { id: string; name: string; items: { key: string; label: string; file?: BrandFile; src: string }[] }[];
  current: string;
  busy: boolean;
  onPick: (p: { key: string; label: string; file?: BrandFile; src: string }) => void;
}) {
  const [tab, setTab] = useState(groups[0]?.id ?? '');
  const group = groups.find((g) => g.id === tab) ?? groups[0];
  return (
    <div className="cpe-lib">
      <div className="cpe-lib-h"><span>From Brand knowledge</span>
        {groups.length > 1 ? (
          <div className="cpe-lib-tabs" role="tablist">
            {groups.map((g) => <button key={g.id} type="button" role="tab" aria-selected={g.id === group.id} onClick={() => setTab(g.id)}>{g.name}</button>)}
          </div>
        ) : null}
      </div>
      <div className="cpe-shelf is-lib">{group.items.map((p) => (
        <button key={p.key} type="button" className={`cpe-shelf-i${group.id === 'logos' ? ' is-logo' : ''}${p.key === 'l-dark' ? ' is-dark' : ''}`} title={p.label} aria-label={`Use ${p.label}`}
          aria-pressed={current === p.src} disabled={busy} onClick={() => onPick(p)}><img src={p.src} alt="" /></button>
      ))}</div>
    </div>
  );
}
