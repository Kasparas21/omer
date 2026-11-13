/* Brand knowledge: six folders (logo, colours, fonts, products, brand photos & voice, store facts). Hovering
   tips a folder's frosted front open; clicking opens it in place: the other folders step back and the folder's
   card slides out under its row. Click the folder again or anywhere outside to close it. The store pages we
   monitor are their own Settings tab (MonitoringSection, at the bottom). */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { Dropdown } from './ui/Dropdown';
import { Uploader } from './ui/Uploader';
import { toast } from './ui/toast';
import { FONTS } from './Mail';
import {
  DEMO_BRAND_SPACE, MONITOR_LIMIT, fileFrom, folderCount, newId, updateBrand, useBrand,
  type Brand, type BrandColor, type BrandFile, type ColorRole, type FolderId, type LogoSlot,
} from './brandStore';
import { demoFacts, useDemoFacts } from './DemoSettings';

const FOLDERS: { id: FolderId; name: string; icon: IconName; one: string; many: string; empty: string }[] = [
  { id: 'logo', name: 'Logo', icon: 'star', one: 'file', many: 'files', empty: 'Add your logo' },
  { id: 'colors', name: 'Colors', icon: 'layers', one: 'color', many: 'colors', empty: 'Add brand colors' },
  { id: 'fonts', name: 'Fonts', icon: 'fontsize', one: 'font', many: 'fonts', empty: 'Pick your fonts' },
  { id: 'products', name: 'Products', icon: 'tag', one: 'product', many: 'products', empty: 'Add products' },
  { id: 'brand', name: 'Brand photos & voice', icon: 'image', one: 'item', many: 'items', empty: 'Add photos and tone' },
  { id: 'facts', name: 'Store facts', icon: 'book', one: 'fact', many: 'facts', empty: 'Add store facts' },
];

const loadedFonts = new Set<string>();
/** An uploaded font file becomes a usable family for the previews. */
function useFontFile(id: string, blob?: Blob) {
  const [, setReady] = useState(loadedFonts.has(id));
  useEffect(() => {
    if (!blob || loadedFonts.has(id)) return;
    let gone = false;
    void blob.arrayBuffer().then((data) => new FontFace(`bk-${id}`, data).load()).then((face) => {
      document.fonts.add(face);
      loadedFonts.add(id);
      if (!gone) setReady(true);
    }).catch(() => toast('That font file could not be read', { kind: 'warn' }));
    return () => { gone = true; };
  }, [id, blob]);
}
const fontStack = (f: { id: string; family: string; file?: BrandFile | null }) =>
  f.file && loadedFonts.has(f.id) ? `"bk-${f.id}", ${f.family || 'system-ui'}` : f.family ? `"${f.family}", system-ui` : 'inherit';

export function BrandKnowledge({ space, demo = false }: { space: string; demo?: boolean }) {
  const brand = useBrand(space);
  const facts = useFacts(space, demo, brand);
  const [open, setOpen] = useState<FolderId | null>(null);
  // Keep showing the last folder's contents while its card slides shut.
  const [shown, setShown] = useState<FolderId | null>(null);
  useEffect(() => { if (open) setShown(open); }, [open]);
  // Once the card has finished sliding open, let menus inside it (the font list) spill over its edges.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (!open) return;
    const t = window.setTimeout(() => setSettled(true), 520);
    return () => clearTimeout(t);
  }, [open]);
  const [cols, setCols] = useState(6);
  const grid = useRef<HTMLDivElement>(null);
  const set = (next: (b: Brand) => Brand) => updateBrand(space, next);

  // The card sits right under the open folder's row, so it needs to know how many folders fit in a row.
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close on Escape, or on a click anywhere that isn't the open folder or its card.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.isConnected || t.closest('.bk-drawer, .bk-item, .dd-list, .toasts')) return;
      setOpen(null);
    };
    window.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
  }, [open]);

  const openIndex = FOLDERS.findIndex((f) => f.id === (open ?? shown));
  const shownFolder = FOLDERS[openIndex];
  const rowEnd = openIndex < 0 ? FOLDERS.length - 1 : Math.min(FOLDERS.length - 1, Math.floor(openIndex / cols) * cols + cols - 1);
  const notch = openIndex < 0 ? 50 : ((openIndex % cols) + 0.5) * (100 / Math.min(cols, FOLDERS.length));
  const count = (id: FolderId) => {
    const f = FOLDERS.find((x) => x.id === id)!;
    const n = id === 'facts' ? facts.list.length : folderCount(brand, id);
    return n ? `${n} ${n === 1 ? f.one : f.many}` : f.empty;
  };

  return (
    <section className="bk" aria-label="Brand knowledge">
      <div className={`bk-grid${open ? ' has-open' : ''}`} ref={grid}>
        {FOLDERS.map((f, i) => (
          <button key={f.id} type="button" className={`bk-item${open === f.id ? ' is-open' : ''}`} style={{ order: i * 2 }}
            aria-expanded={open === f.id} aria-controls="bkDrawer" onClick={() => setOpen(open === f.id ? null : f.id)}>
            <GlassFolder icon={f.icon} papers={f.id === 'facts' ? facts.list.slice(0, 3).map(() => ({})) : papersFor(brand, f.id)} />
            <span className="bk-name">{f.name}</span>
            <span className="bk-count">{count(f.id)}</span>
          </button>
        ))}
        <div id="bkDrawer" className={`bk-drawer${open ? ' is-open' : ''}${open && settled ? ' is-settled' : ''}`} style={{ order: rowEnd * 2 + 1, ['--notch' as string]: `${notch}%` } as CSSProperties}
          role="region" aria-label={shownFolder ? `${shownFolder.name} folder` : undefined} aria-hidden={!open} inert={!open}>
          <div className="bk-drawer-in">
            {shownFolder && (
              <section className="bk-panel v2-card" key={shownFolder.id}>
                <header><Icon name={shownFolder.icon} /><h3>{shownFolder.name}</h3><span className="bk-panel-count">{count(shownFolder.id)}</span></header>
                <div className="v2-in bk-panel-in">
                  {shownFolder.id === 'logo' && <LogoFolder brand={brand} set={set} />}
                  {shownFolder.id === 'colors' && <ColorFolder brand={brand} set={set} />}
                  {shownFolder.id === 'fonts' && <FontFolder brand={brand} set={set} />}
                  {shownFolder.id === 'products' && <ProductFolder brand={brand} set={set} />}
                  {shownFolder.id === 'brand' && <BrandFolder brand={brand} set={set} />}
                  {shownFolder.id === 'facts' && <FactsFolder facts={facts} />}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- the folder itself
type Paper = { img?: string; color?: string; text?: string; font?: string; dark?: boolean };
function papersFor(b: Brand, id: FolderId): Paper[] {
  if (id === 'logo') return (['primary', 'mark', 'dark'] as LogoSlot[]).map((k) => b.logos[k] ? { img: b.logos[k]!.src, dark: k === 'dark' } : null).filter(Boolean) as Paper[];
  if (id === 'colors') return orderedColors(b.colors).slice(0, 3).map((c) => ({ color: c.hex }));
  if (id === 'fonts') return b.fonts.filter((f) => f.family || f.file).slice(0, 2).map((f) => ({ text: 'Aa', font: fontStack(f) }));
  if (id === 'products') return b.products.filter((p) => p.image).slice(0, 3).map((p) => ({ img: p.image!.src }));
  if (id === 'facts') return b.facts.slice(0, 3).map(() => ({}));
  return b.photos.slice(0, 3).map((p) => ({ img: p.src }));
}

function GlassFolder({ papers, icon }: { papers: Paper[]; icon: IconName }) {
  const shown = papers.length ? papers : [{}, {}];
  return (
    <span className="gf" aria-hidden="true">
      <span className="gf-back" />
      <span className="gf-papers">
        {shown.map((p, i) => (
          <span key={i} className={`gf-paper${p.dark ? ' is-dark' : ''}${p.img || p.color || p.text ? '' : ' is-blank'}`}
            style={{ ['--i' as string]: i, ['--n' as string]: shown.length, background: p.color } as CSSProperties}>
            {p.img ? <img src={p.img} alt="" draggable={false} /> : null}
            {p.text ? <b style={{ fontFamily: p.font }}>{p.text}</b> : null}
          </span>
        ))}
      </span>
      <span className="gf-front"><span className="gf-shine" /><Icon name={icon} /></span>
    </span>
  );
}

// ---------- shared bits
type FolderProps = { brand: Brand; set: (next: (b: Brand) => Brand) => void };

function PickButton({ accept, label, onFile, icon = 'upload', className = 'btn btn-secondary btn-sm', title }: { accept: string; label: string; onFile: (f: File) => void; icon?: IconName; className?: string; title?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} title={title} aria-label={label ? undefined : title} onClick={() => input.current?.click()}><Icon name={icon} />{label}</button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </>
  );
}

const images = (files: File[]) => files.filter((f) => f.type.startsWith('image/') || /\.svg$/i.test(f.name));
function Items({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bk-items ${className}`.trim()}>{children}</div>;
}
const fanIn = (i: number) => ({ ['--i' as string]: i }) as CSSProperties;

// ---------- Logo
const LOGO_SLOTS: { id: LogoSlot; name: string; hint: string }[] = [
  { id: 'primary', name: 'Main logo', hint: 'Top of every email' },
  { id: 'mark', name: 'Square icon', hint: 'Small spaces and avatars' },
  { id: 'dark', name: 'Logo on dark', hint: 'White or light version' },
];
function LogoFolder({ brand, set }: FolderProps) {
  const put = (slot: LogoSlot, file: File | null) => set((b) => ({ ...b, logos: { ...b.logos, [slot]: file ? fileFrom(file) : null } }));
  return (
    <Items className="bk-logos">
      {LOGO_SLOTS.map((s, i) => {
        const f = brand.logos[s.id];
        return (
          <div key={s.id} className="bk-card" style={fanIn(i)}>
            {f ? (
              <div className={`bk-logo-stage${s.id === 'dark' ? ' is-dark' : ''}`}><img src={f.src} alt={s.name} /></div>
            ) : (
              <Uploader accept="image/*,.svg" title={`Add ${s.name.toLowerCase()}`} hint="SVG or PNG · up to 5 MB" maxMb={5} tone={s.id === 'dark' ? 'dark' : 'light'} className="bk-logo-up"
                onFiles={(files) => { const img = images(files)[0]; if (img) put(s.id, img); else toast('Pick an image file', { kind: 'warn' }); }} />
            )}
            <div className="bk-card-foot">
              <span><b>{s.name}</b><small>{f ? f.name : s.hint}</small></span>
              {f ? <span className="bk-card-acts">
                <PickButton accept="image/*,.svg" label="Replace" icon="refund" onFile={(file) => put(s.id, file)} />
                <button type="button" className="bk-icon-btn" aria-label={`Remove ${s.name.toLowerCase()}`} onClick={() => put(s.id, null)}><Icon name="trash" /></button>
              </span> : null}
            </div>
          </div>
        );
      })}
    </Items>
  );
}

// ---------- Colors: main, secondary and accent first, then any others
const ROLES: { id: ColorRole; name: string; hint: string; def: string }[] = [
  { id: 'main', name: 'Main color', hint: 'Buttons, links and your mark', def: '#6360F0' },
  { id: 'secondary', name: 'Secondary color', hint: 'Backgrounds and soft panels', def: '#EDEBFF' },
  { id: 'accent', name: 'Accent color', hint: 'Prices, badges and highlights', def: '#1F1F24' },
];
function orderedColors(colors: BrandColor[]) {
  return [...ROLES.map((r) => colors.find((c) => c.role === r.id)).filter(Boolean) as BrandColor[], ...colors.filter((c) => !c.role)];
}
function Swatch({ color, label, onHex }: { color: BrandColor; label: string; onHex: (hex: string) => void }) {
  return (
    <label className="bk-swatch" style={{ background: color.hex }}>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(color.hex) ? color.hex : '#000000'} aria-label={`Change ${label}`} onChange={(e) => onHex(e.target.value.toUpperCase())} />
      <span className="bk-swatch-hint"><Icon name="edit" />Change</span>
    </label>
  );
}
function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input className="bk-inline bk-hex" value={value} aria-label="Hex code" spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => { const v = e.target.value.trim(); if (!/^#[0-9a-f]{6}$/i.test(v)) onChange(/^[0-9a-f]{6}$/i.test(v) ? `#${v}`.toUpperCase() : '#000000'); }} />
  );
}
function ColorFolder({ brand, set }: FolderProps) {
  const edit = (id: string, patch: Partial<BrandColor>) => set((b) => ({ ...b, colors: b.colors.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const others = brand.colors.filter((c) => !c.role);
  return (
    <div className="bk-colors-wrap">
      <Items className="bk-colors bk-roles">
        {ROLES.map((r, i) => {
          const c = brand.colors.find((x) => x.role === r.id);
          return c ? (
            <div key={r.id} className="bk-card bk-color" style={fanIn(i)}>
              <Swatch color={c} label={r.name} onHex={(hex) => edit(c.id, { hex })} />
              <div className="bk-card-foot">
                <span><b>{r.name}</b><HexInput value={c.hex} onChange={(hex) => edit(c.id, { hex })} /></span>
              </div>
            </div>
          ) : (
            <button key={r.id} type="button" className="bk-card bk-color is-empty" style={fanIn(i)}
              onClick={() => set((b) => ({ ...b, colors: [...b.colors, { id: newId(), name: r.name, hex: r.def, role: r.id }] }))}>
              <span className="bk-swatch bk-swatch-empty"><Icon name="plus" /></span>
              <span className="bk-card-foot"><span><b>{r.name}</b><small>{r.hint}</small></span></span>
            </button>
          );
        })}
      </Items>
      <h4 className="bk-sub">Other colors</h4>
      <Items className="bk-colors">
        {others.map((c, i) => (
          <div key={c.id} className="bk-card bk-color" style={fanIn(i + 3)}>
            <Swatch color={c} label={c.name || 'color'} onHex={(hex) => edit(c.id, { hex })} />
            <div className="bk-card-foot">
              <span>
                <input className="bk-inline bk-strong" value={c.name} placeholder="Name" aria-label="Color name" onChange={(e) => edit(c.id, { name: e.target.value })} />
                <HexInput value={c.hex} onChange={(hex) => edit(c.id, { hex })} />
              </span>
              <button type="button" className="bk-icon-btn" aria-label={`Remove ${c.name || 'color'}`} onClick={() => set((b) => ({ ...b, colors: b.colors.filter((x) => x.id !== c.id) }))}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
        <button type="button" className="bk-add" style={fanIn(others.length + 3)}
          onClick={() => set((b) => ({ ...b, colors: [...b.colors, { id: newId(), name: `Color ${b.colors.filter((x) => !x.role).length + 1}`, hex: '#9AA3B2' }] }))}>
          <span className="bk-add-ic"><Icon name="plus" /></span><b>Add color</b>
        </button>
      </Items>
    </div>
  );
}

// ---------- Fonts
function FontCard({ font, onChange, i }: { font: Brand['fonts'][number]; onChange: (patch: Partial<Brand['fonts'][number]>) => void; i: number }) {
  useFontFile(font.id, font.file?.blob);
  const families = font.family && !FONTS.includes(font.family) ? [font.family, ...FONTS] : FONTS;
  return (
    <div className="bk-card bk-font" style={fanIn(i)}>
      <div className="bk-font-stage" style={{ fontFamily: fontStack(font) }}>
        <b>Aa</b>
        <p>{font.role === 'Headings' ? 'Kibble or pâté? Here’s the difference.' : 'Your cart is saved, and you can pay another way here.'}</p>
      </div>
      <div className="bk-card-foot">
        <span><b>{font.role}</b><small>{font.file ? font.file.name : font.family || 'Not set yet'}</small></span>
        <Dropdown label={`${font.role} font`} value={font.family} align="end" className="bk-font-dd"
          options={[...(font.family ? [] : [{ value: '', label: 'Choose a font' }]), ...families.map((f) => ({ value: f, label: f }))]}
          onChange={(v) => onChange({ family: v })} />
      </div>
      {font.file ? (
        <div className="bk-font-file">
          <span><Icon name="file" />{font.file.name}</span>
          <button type="button" className="bk-icon-btn" aria-label="Remove font file" onClick={() => onChange({ file: null })}><Icon name="trash" /></button>
        </div>
      ) : (
        <Uploader compact accept=".woff2,.woff,.ttf,.otf" maxMb={5} title="Upload your own font" hint=".woff2, .ttf or .otf"
          onFiles={([file]) => onChange({ file: fileFrom(file), family: font.family || file.name.replace(/\.[^.]+$/, '') })} />
      )}
    </div>
  );
}
function FontFolder({ brand, set }: FolderProps) {
  return (
    <Items className="bk-fonts">
      {brand.fonts.map((f, i) => (
        <FontCard key={f.id} font={f} i={i} onChange={(patch) => set((b) => ({ ...b, fonts: b.fonts.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) }))} />
      ))}
    </Items>
  );
}

// ---------- Products: one or two photos each; the second shows on hover
function ProductCard({ p, i, set }: { p: Brand['products'][number]; i: number; set: FolderProps['set'] }) {
  const [second, setSecond] = useState(false);
  const edit = (patch: Partial<Brand['products'][number]>) => set((b) => ({ ...b, products: b.products.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) }));
  const showing = second && p.image2 ? 'image2' : 'image';
  return (
    <div className={`bk-card bk-product${p.image2 ? ' has-two' : ''}`} style={fanIn(i)}
      onPointerEnter={() => setSecond(true)} onPointerLeave={() => setSecond(false)}>
      <div className="bk-product-img">
        {p.image ? <img src={p.image.src} alt={p.name} className={showing === 'image' ? 'is-on' : ''} /> : <Icon name="image" />}
        {p.image2 ? <img src={p.image2.src} alt={`${p.name}, second photo`} className={showing === 'image2' ? 'is-on' : ''} /> : null}
        {p.image2 ? <span className="bk-dots" aria-hidden="true"><i className={showing === 'image' ? 'on' : ''} /><i className={showing === 'image2' ? 'on' : ''} /></span> : null}
        <span className="bk-product-acts">
          {p.image2
            ? <button type="button" className="bk-chip-btn" onClick={() => edit({ image2: null })}><Icon name="minus" />2nd photo</button>
            : <PickButton accept="image/*" label="2nd photo" icon="plus" className="bk-chip-btn" onFile={(f) => edit({ image2: fileFrom(f) })} />}
          <PickButton accept="image/*" label="" icon="refund" className="bk-chip-btn is-icon"
            title={showing === 'image2' ? 'Replace the second photo' : 'Replace the photo'}
            onFile={(f) => edit(showing === 'image2' ? { image2: fileFrom(f) } : { image: fileFrom(f) })} />
          <button type="button" className="bk-icon-btn" aria-label={`Remove ${p.name}`} onClick={() => set((b) => ({ ...b, products: b.products.filter((x) => x.id !== p.id) }))}><Icon name="trash" /></button>
        </span>
      </div>
      <div className="bk-product-copy">
        <input className="bk-inline bk-strong" value={p.name} placeholder="Product name" aria-label="Product name" onChange={(e) => edit({ name: e.target.value })} />
        <input className="bk-inline" value={p.price} placeholder="Price" aria-label="Price" onChange={(e) => edit({ price: e.target.value })} />
      </div>
    </div>
  );
}
function ProductFolder({ brand, set }: FolderProps) {
  const add = (files: File[]) => {
    const imgs = images(files);
    if (!imgs.length) { toast('Pick image files', { kind: 'warn' }); return; }
    set((b) => ({ ...b, products: [...b.products, ...imgs.map((f) => ({ id: newId(), name: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), price: '', image: fileFrom(f), image2: null }))] }));
  };
  return (
    <Items className="bk-products">
      {brand.products.map((p, i) => <ProductCard key={p.id} p={p} i={i} set={set} />)}
      <Uploader accept="image/*" multiple title="Add products" hint={false} onFiles={add} className="bk-fill" />
    </Items>
  );
}

// ---------- Brand photos & voice: photos, then voice as settings rows (plain text you click to edit)
/** Text that reads as text and grows as you type; no box, no resize handle. */
function PlainText({ value, placeholder, label, onChange, lines = false }: { value: string; placeholder: string; label: string; onChange: (v: string) => void; lines?: boolean }) {
  const el = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    const fit = () => { t.style.height = '0px'; t.style.height = `${t.scrollHeight}px`; };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(t);
    return () => ro.disconnect();
  }, [value]);
  return (
    <textarea ref={el} className="bk-plain" rows={1} value={value} placeholder={placeholder} aria-label={label} spellCheck
      onChange={(e) => onChange(lines ? e.target.value : e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => { if (!lines && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}
const VOICE_ROWS: { id: keyof Brand['voice']; name: string; hint: string; placeholder: string; lines?: boolean }[] = [
  { id: 'tagline', name: 'Tagline', hint: 'One line about the store', placeholder: 'Add a tagline' },
  { id: 'tone', name: 'Tone of voice', hint: 'How every email should sound', placeholder: 'e.g. warm, short sentences, never pushy', lines: true },
  { id: 'about', name: 'About', hint: 'Who you are and what you sell', placeholder: 'Add a few lines in your own words', lines: true },
];
function BrandFolder({ brand, set }: FolderProps) {
  const add = (files: File[]) => {
    const imgs = images(files);
    if (!imgs.length) { toast('Pick image files', { kind: 'warn' }); return; }
    set((b) => ({ ...b, photos: [...b.photos, ...imgs.map(fileFrom)] }));
  };
  const voice = (k: keyof Brand['voice'], v: string) => set((b) => ({ ...b, voice: { ...b.voice, [k]: v } }));
  return (
    <div className="bk-brand">
      <Items className="bk-photos">
        {brand.photos.map((p, i) => (
          <div key={p.id + i} className="bk-photo" style={fanIn(i)}>
            <img src={p.src} alt={p.name} />
            <button type="button" className="bk-icon-btn" aria-label={`Remove ${p.name}`} onClick={() => set((b) => ({ ...b, photos: b.photos.filter((x, j) => !(x.id === p.id && j === i)) }))}><Icon name="trash" /></button>
          </div>
        ))}
        <Uploader accept="image/*" multiple title="Add photos" hint={false} onFiles={add} className="bk-fill" />
      </Items>
      <div className="bk-rows" style={fanIn(brand.photos.length + 1)}>
        {VOICE_ROWS.map((r) => (
          <div key={r.id} className="bk-row">
            <div className="bk-row-k"><b>{r.name}</b><small>{r.hint}</small></div>
            <PlainText value={brand.voice[r.id]} placeholder={r.placeholder} label={r.name} lines={r.lines} onChange={(v) => voice(r.id, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Store facts: what emails are allowed to say (prices, offers, policies, answers)
type FactView = { id: string; group: string; name: string; value: string; src?: string; review?: boolean; off?: boolean; own?: boolean };
type Facts = {
  list: FactView[];
  /** A question a shopper asked that the site doesn't answer (demo store). */
  ask: { q: string; who: string } | null;
  approve: (id: string) => void;
  edit: (id: string, value: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  add: (name: string, value: string, group: string) => void;
  answer: (value: string) => void;
};
const FACT_GROUPS = ['Products', 'Offers', 'Policies', 'FAQs'];
function useFacts(space: string, demo: boolean, brand: Brand): Facts {
  const d = useDemoFacts();
  if (demo || space === DEMO_BRAND_SPACE) {
    return {
      list: d.facts.filter((f) => f.group !== 'Visual'),
      ask: d.ask ? { q: 'Do you ship to Australia?', who: 'Dana Okafor asked and your site doesn’t say.' } : null,
      ...demoFacts,
    };
  }
  const set = (next: (b: Brand) => Brand) => updateBrand(space, next);
  const patch = (id: string, p: Partial<Brand['facts'][number]>) => set((b) => ({ ...b, facts: b.facts.map((f) => (f.id === id ? { ...f, ...p } : f)) }));
  return {
    list: brand.facts.map((f) => ({ ...f, own: true, src: 'Added by you' })),
    ask: null,
    approve: (id) => patch(id, { review: false }),
    edit: (id, value) => patch(id, { value }),
    rename: (id, name) => patch(id, { name }),
    remove: (id) => set((b) => ({ ...b, facts: b.facts.filter((f) => f.id !== id) })),
    add: (name, value, group) => set((b) => ({ ...b, facts: [...b.facts, { id: newId(), group, name, value }] })),
    answer: () => undefined,
  };
}
function FactsFolder({ facts }: { facts: Facts }) {
  const [answer, setAnswer] = useState('');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [group, setGroup] = useState('FAQs');
  const groups = [...FACT_GROUPS, ...new Set(facts.list.map((f) => f.group).filter((g) => !FACT_GROUPS.includes(g)))];
  let n = 0;
  return (
    <div className="bk-facts">
      {facts.ask ? (
        <form className="bk-ask" onSubmit={(e) => { e.preventDefault(); if (!answer.trim()) return; facts.answer(answer.trim()); setAnswer(''); toast('Added to your store facts'); }}>
          <span className="bk-ask-ic" aria-hidden="true"><Icon name="alert" /></span>
          <span className="bk-ask-q"><b>{facts.ask.q}</b><small>{facts.ask.who}</small></span>
          <span className="bk-ask-a">
            <input value={answer} placeholder="e.g. Yes, 7–10 days, duty included" aria-label="Your answer" onChange={(e) => setAnswer(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!answer.trim()}>Save</button>
          </span>
        </form>
      ) : null}
      {groups.map((g) => {
        const rows = facts.list.filter((f) => f.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="bk-fact-group">
            <h4 className="bk-sub">{g}</h4>
            <ul className="bk-fact-list">
              {rows.map((f) => (
                <li key={f.id} className={`bk-fact${f.off ? ' is-off' : ''}`} style={fanIn(n++)}>
                  <span className="bk-fact-name">
                    {f.own ? <input className="bk-inline bk-strong" value={f.name} placeholder="What it’s about" aria-label="What it’s about" onChange={(e) => facts.rename(f.id, e.target.value)} /> : <b>{f.name}</b>}
                    <small>{f.own ? 'Added by you' : f.src}</small>
                  </span>
                  <input className="bk-inline bk-fact-val" value={f.value} placeholder="What emails can say" aria-label={`${f.name || 'Fact'} value`} disabled={f.off}
                    onChange={(e) => facts.edit(f.id, e.target.value)} />
                  <span className="bk-fact-state">
                    {f.off ? <span className="bk-mon-state">Expired</span>
                      : f.review ? <button type="button" className="bk-mon-state is-change" title="Approve for email" onClick={() => { facts.approve(f.id); toast('Approved for email'); }}><i />Needs review<Icon name="check" /></button>
                      : <span className="bk-mon-state is-ok"><i />Approved</span>}
                  </span>
                  {f.own ? <button type="button" className="bk-icon-btn" aria-label={`Remove ${f.name || 'fact'}`} onClick={() => facts.remove(f.id)}><Icon name="trash" /></button> : <span className="bk-fact-gap" />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!facts.list.length ? <p className="bk-mon-empty">Nothing yet. Add your shipping, returns and current offers so emails get them right.</p> : null}
      <form className="bk-fact-add" onSubmit={(e) => { e.preventDefault(); if (!name.trim() || !value.trim()) return; facts.add(name.trim(), value.trim(), group); setName(''); setValue(''); }}>
        <Dropdown label="Group" value={group} className="bk-fact-dd" options={FACT_GROUPS.map((g) => ({ value: g, label: g }))} onChange={setGroup} />
        <input value={name} placeholder="What it’s about" aria-label="What the fact is about" onChange={(e) => setName(e.target.value)} />
        <input value={value} placeholder="What emails can say" aria-label="What emails can say" onChange={(e) => setValue(e.target.value)} />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={!name.trim() || !value.trim()}><Icon name="plus" />Add fact</button>
      </form>
    </div>
  );
}

// ---------- Monitoring: up to 10 of the store's own pages
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
function cleanPath(input: string, host: string): { path: string } | { error: string } | null {
  let v = input.trim();
  if (!v) return null;
  try {
    if (/^https?:\/\//i.test(v) || /^[^/]+\.[a-z]{2,}(\/|$)/i.test(v)) {
      const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      if (url.host.replace(/^www\./, '') !== host.replace(/^www\./, '')) return { error: `Only pages on ${host}` };
      v = url.pathname + url.search;
    }
  } catch { return { error: 'That doesn’t look like a page address' }; }
  if (!v.startsWith('/')) v = `/${v}`;
  return { path: v.replace(/\/+$/, '') || '/' };
}
function Monitoring({ brand, set, host, topPages, onChanges }: FolderProps & { host: string; topPages: { path: string; count: number }[]; onChanges: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const pages = brand.monitor;
  const full = pages.length >= MONITOR_LIMIT;
  const watched = new Set(pages.map((p) => p.path));
  const suggestions = topPages.map((p) => p.path).filter((p) => p && !watched.has(p)).slice(0, 6);
  const add = (raw: string) => {
    if (full) { setError(`Up to ${MONITOR_LIMIT} pages`); return; }
    const r = cleanPath(raw, host);
    if (!r) return;
    if ('error' in r) { setError(r.error); return; }
    if (watched.has(r.path)) { setError('Already monitored'); return; }
    set((b) => ({ ...b, monitor: [...b.monitor, { id: newId(), path: r.path, addedAt: new Date().toISOString(), checkedAt: null, change: null }] }));
    setValue(''); setError('');
  };
  return (
    <section className="v2-card bk-monitor" aria-labelledby="bkMonT">
      <header><Icon name="eye" /><h3 id="bkMonT">Pages we check</h3><span className="bk-panel-count">{pages.length} of {MONITOR_LIMIT} pages</span></header>
      <div className="v2-in bk-monitor-in">
        <p className="bk-monitor-lede">We check these pages on {host} for price, stock and code changes, so emails never quote stale facts.</p>
        <form className={`bk-mon-add${error ? ' has-error' : ''}`} onSubmit={(e) => { e.preventDefault(); add(value); }}>
          <label className="bk-mon-field">
            <span className="bk-mon-host">{host}</span>
            <input value={value} placeholder="/products/your-best-seller" aria-label={`Page on ${host} to monitor`} disabled={full}
              onChange={(e) => { setValue(e.target.value); if (error) setError(''); }} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={full || !value.trim()}><Icon name="plus" />Add page</button>
        </form>
        {error ? <p className="bk-mon-error" role="alert">{error}</p> : null}
        {suggestions.length && !full ? (
          <div className="bk-mon-suggest">
            <span>Your top pages</span>
            {suggestions.map((p) => (
              <button key={p} type="button" className="bk-mon-chip" onClick={() => add(p)}><Icon name="plus" />{p}</button>
            ))}
          </div>
        ) : null}
        {pages.length ? (
          <ul className="bk-mon-list">
            {pages.map((p, i) => (
              <li key={p.id} className="bk-mon-row" style={fanIn(i)}>
                <span className="bk-mon-ic" aria-hidden="true"><Icon name="file" /></span>
                <span className="bk-mon-page"><b>{p.path}</b><small>{host}{p.path === '/' ? '' : p.path}</small></span>
                {p.change ? (
                  <button type="button" className="bk-mon-state is-change" onClick={onChanges}><i />{p.change}<Icon name="chevronRight" /></button>
                ) : (
                  <span className={`bk-mon-state${p.checkedAt ? ' is-ok' : ''}`}><i />{p.checkedAt ? `No changes · ${ago(p.checkedAt)}` : 'First check soon'}</span>
                )}
                <button type="button" className="bk-icon-btn" aria-label={`Stop monitoring ${p.path}`} onClick={() => set((b) => ({ ...b, monitor: b.monitor.filter((x) => x.id !== p.id) }))}><Icon name="trash" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bk-mon-empty">No pages yet. Start with your best sellers and your shipping page.</p>
        )}
      </div>
    </section>
  );
}

/** The Monitoring tab: the same pages, stored with the rest of the store's brand knowledge. */
export function MonitoringSection({ space, host, topPages, onChanges }: { space: string; host: string; topPages: { path: string; count: number }[]; onChanges: () => void }) {
  const brand = useBrand(space);
  return (
    <section className="bk" aria-label="Monitoring">
      <Monitoring brand={brand} set={(next) => updateBrand(space, next)} host={host} topPages={topPages} onChanges={onChanges} />
    </section>
  );
}
