/* Brand knowledge: five glass folders (logo, colours, fonts, products, brand photos & voice). Hovering tips a
   folder's frosted front open; clicking opens it in place: the other folders step back and a drawer slides
   out under its row with everything inside, ready to replace, edit, add or remove. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { toast } from './ui/toast';
import { FONTS } from './Mail';
import {
  fileFrom, folderCount, newId, updateBrand, useBrand,
  type Brand, type BrandFile, type FolderId, type LogoSlot,
} from './brandStore';

const FOLDERS: { id: FolderId; name: string; icon: IconName; one: string; many: string; empty: string }[] = [
  { id: 'logo', name: 'Logo', icon: 'star', one: 'file', many: 'files', empty: 'Add your logo' },
  { id: 'colors', name: 'Colors', icon: 'layers', one: 'color', many: 'colors', empty: 'Add brand colors' },
  { id: 'fonts', name: 'Fonts', icon: 'fontsize', one: 'font', many: 'fonts', empty: 'Pick your fonts' },
  { id: 'products', name: 'Products', icon: 'tag', one: 'product', many: 'products', empty: 'Add products' },
  { id: 'brand', name: 'Brand photos & voice', icon: 'image', one: 'item', many: 'items', empty: 'Add photos and tone' },
];

const loadedFonts = new Set<string>();
/** An uploaded font file becomes a usable family for the previews. */
function useFontFile(id: string, blob?: Blob) {
  const [ready, setReady] = useState(loadedFonts.has(id));
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
  return ready;
}
const fontStack = (f: { id: string; family: string; file?: BrandFile | null }) =>
  f.file && loadedFonts.has(f.id) ? `"bk-${f.id}", ${f.family || 'system-ui'}` : f.family ? `"${f.family}", system-ui` : 'inherit';

export function BrandKnowledge({ space, storeName, host }: { space: string; storeName: string; host: string }) {
  const brand = useBrand(space);
  const [open, setOpen] = useState<FolderId | null>(null);
  // Keep showing the last folder's contents while the drawer slides shut.
  const [shown, setShown] = useState<FolderId | null>(null);
  useEffect(() => { if (open) setShown(open); }, [open]);
  const [cols, setCols] = useState(5);
  const grid = useRef<HTMLDivElement>(null);
  const set = (next: (b: Brand) => Brand) => updateBrand(space, next);

  // The drawer sits right under the open folder's row, so it needs to know how many folders fit in a row.
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const openIndex = FOLDERS.findIndex((f) => f.id === (open ?? shown));
  const shownFolder = FOLDERS[openIndex];
  const rowEnd = openIndex < 0 ? FOLDERS.length - 1 : Math.min(FOLDERS.length - 1, Math.floor(openIndex / cols) * cols + cols - 1);
  const notch = openIndex < 0 ? 50 : ((openIndex % cols) + 0.5) * (100 / Math.min(cols, FOLDERS.length));

  return (
    <section className="bk" aria-labelledby="bkTitle">
      <header className="bk-head">
        <div>
          <h2 id="bkTitle">Brand knowledge</h2>
          <p>Everything Ghost uses so emails look and sound like {storeName}.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm bk-import"
          onClick={() => toast(`Reading ${host} automatically is coming soon. Add files by hand for now.`, { kind: 'info' })}>
          <Icon name="download" />Import from {host}<span className="bk-soon">Soon</span>
        </button>
      </header>

      <div className={`bk-grid${open ? ' has-open' : ''}`} ref={grid}>
        {FOLDERS.map((f, i) => {
          const n = folderCount(brand, f.id);
          return (
            <button key={f.id} type="button" className={`bk-item${open === f.id ? ' is-open' : ''}`} style={{ order: i * 2 }}
              aria-expanded={open === f.id} aria-controls="bkDrawer" onClick={() => setOpen(open === f.id ? null : f.id)}>
              <GlassFolder papers={papersFor(brand, f.id)} />
              <span className="bk-name">{f.name}</span>
              <span className="bk-count">{n ? `${n} ${n === 1 ? f.one : f.many}` : f.empty}</span>
            </button>
          );
        })}
        <div id="bkDrawer" className={`bk-drawer${open ? ' is-open' : ''}`} style={{ order: rowEnd * 2 + 1, ['--notch' as string]: `${notch}%` } as CSSProperties}
          role="region" aria-label={shownFolder ? `${shownFolder.name} folder` : undefined} aria-hidden={!open} inert={!open}>
          <div className="bk-drawer-in">
            {shownFolder && (
              <div className="bk-panel" key={shownFolder.id}>
                <header className="bk-panel-head">
                  <h3><Icon name={shownFolder.icon} />{shownFolder.name}</h3>
                  <button type="button" className="bk-close" aria-label="Close folder" onClick={() => setOpen(null)}><Icon name="x" /></button>
                </header>
                {shownFolder.id === 'logo' && <LogoFolder brand={brand} set={set} />}
                {shownFolder.id === 'colors' && <ColorFolder brand={brand} set={set} />}
                {shownFolder.id === 'fonts' && <FontFolder brand={brand} set={set} />}
                {shownFolder.id === 'products' && <ProductFolder brand={brand} set={set} />}
                {shownFolder.id === 'brand' && <BrandFolder brand={brand} set={set} />}
              </div>
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
  if (id === 'colors') return b.colors.slice(0, 3).map((c) => ({ color: c.hex }));
  if (id === 'fonts') return b.fonts.filter((f) => f.family || f.file).slice(0, 2).map((f) => ({ text: 'Aa', font: fontStack(f) }));
  if (id === 'products') return b.products.filter((p) => p.image).slice(0, 3).map((p) => ({ img: p.image!.src }));
  return b.photos.slice(0, 3).map((p) => ({ img: p.src }));
}

function GlassFolder({ papers }: { papers: Paper[] }) {
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
      <span className="gf-front"><span className="gf-shine" /></span>
    </span>
  );
}

// ---------- shared bits
type FolderProps = { brand: Brand; set: (next: (b: Brand) => Brand) => void };

/** Drop files on it or click to pick: one place to add things in every folder. */
function DropZone({ accept, multiple, label, hint, onFiles, className = '' }: {
  accept: string; multiple?: boolean; label: string; hint?: string; onFiles: (files: File[]) => void; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const files = [...e.dataTransfer.files]; if (files.length) onFiles(multiple ? files : files.slice(0, 1)); };
  return (
    <button type="button" className={`bk-drop${over ? ' is-over' : ''} ${className}`.trim()} onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <span className="bk-drop-ic"><Icon name="upload" /></span>
      <b>{label}</b>
      {hint ? <small>{hint}</small> : null}
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) onFiles(files); }} />
    </button>
  );
}

function PickButton({ accept, label, onFile, icon = 'upload' }: { accept: string; label: string; onFile: (f: File) => void; icon?: IconName }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}><Icon name={icon} />{label}</button>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </>
  );
}

const images = (files: File[]) => files.filter((f) => f.type.startsWith('image/'));
function Items({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bk-items ${className}`.trim()}>{children}</div>;
}

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
          <div key={s.id} className="bk-card" style={{ ['--i' as string]: i } as CSSProperties}>
            {f ? (
              <div className={`bk-logo-stage${s.id === 'dark' ? ' is-dark' : ''}`}><img src={f.src} alt={s.name} /></div>
            ) : (
              <DropZone accept="image/*,.svg" label={`Add ${s.name.toLowerCase()}`} hint="SVG or PNG" className={s.id === 'dark' ? 'is-dark' : ''}
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

// ---------- Colors
function ColorFolder({ brand, set }: FolderProps) {
  const edit = (id: string, patch: Partial<{ name: string; hex: string }>) => set((b) => ({ ...b, colors: b.colors.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  return (
    <Items className="bk-colors">
      {brand.colors.map((c, i) => (
        <div key={c.id} className="bk-card bk-color" style={{ ['--i' as string]: i } as CSSProperties}>
          <label className="bk-swatch" style={{ background: c.hex }}>
            <input type="color" value={c.hex} aria-label={`Change ${c.name || 'color'}`} onChange={(e) => edit(c.id, { hex: e.target.value.toUpperCase() })} />
            <span className="bk-swatch-hint"><Icon name="edit" />Change</span>
          </label>
          <div className="bk-card-foot">
            <span>
              <input className="bk-inline" value={c.name} placeholder="Name" aria-label="Color name" onChange={(e) => edit(c.id, { name: e.target.value })} />
              <input className="bk-inline bk-hex" value={c.hex} aria-label="Hex code" spellCheck={false}
                onChange={(e) => edit(c.id, { hex: e.target.value })}
                onBlur={(e) => { const v = e.target.value.trim(); if (!/^#[0-9a-f]{6}$/i.test(v)) edit(c.id, { hex: /^[0-9a-f]{6}$/i.test(v) ? `#${v}`.toUpperCase() : '#000000' }); }} />
            </span>
            <button type="button" className="bk-icon-btn" aria-label={`Remove ${c.name || 'color'}`} onClick={() => set((b) => ({ ...b, colors: b.colors.filter((x) => x.id !== c.id) }))}><Icon name="trash" /></button>
          </div>
        </div>
      ))}
      <button type="button" className="bk-add" style={{ ['--i' as string]: brand.colors.length } as CSSProperties}
        onClick={() => set((b) => ({ ...b, colors: [...b.colors, { id: newId(), name: b.colors.length ? `Color ${b.colors.length + 1}` : 'Primary', hex: '#6360F0' }] }))}>
        <span className="bk-drop-ic"><Icon name="plus" /></span><b>Add color</b>
      </button>
    </Items>
  );
}

// ---------- Fonts
function FontRow({ font, onChange, i }: { font: Brand['fonts'][number]; onChange: (patch: Partial<Brand['fonts'][number]>) => void; i: number }) {
  useFontFile(font.id, font.file?.blob);
  const options = font.family && !FONTS.includes(font.family) ? [font.family, ...FONTS] : FONTS;
  return (
    <div className="bk-card bk-font" style={{ ['--i' as string]: i } as CSSProperties}>
      <div className="bk-font-stage" style={{ fontFamily: fontStack(font) }}>
        <b>Aa</b>
        <p>{font.role === 'Headings' ? 'Kibble or pâté? Here’s the difference.' : 'Your cart is saved, and you can pay another way here.'}</p>
      </div>
      <div className="bk-card-foot">
        <span><b>{font.role}</b><small>{font.file ? font.file.name : font.family || 'Not set yet'}</small></span>
        <span className="bk-card-acts">
          <select className="bk-select" value={font.family} aria-label={`${font.role} font`} onChange={(e) => onChange({ family: e.target.value })}>
            {!font.family && <option value="">Choose…</option>}
            {options.map((f) => <option key={f}>{f}</option>)}
          </select>
          <PickButton accept=".woff2,.woff,.ttf,.otf" label={font.file ? 'Replace file' : 'Upload'} onFile={(file) => onChange({ file: fileFrom(file), family: font.family || file.name.replace(/\.[^.]+$/, '') })} />
          {font.file ? <button type="button" className="bk-icon-btn" aria-label="Remove font file" onClick={() => onChange({ file: null })}><Icon name="trash" /></button> : null}
        </span>
      </div>
    </div>
  );
}
function FontFolder({ brand, set }: FolderProps) {
  return (
    <Items className="bk-fonts">
      {brand.fonts.map((f, i) => (
        <FontRow key={f.id} font={f} i={i} onChange={(patch) => set((b) => ({ ...b, fonts: b.fonts.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) }))} />
      ))}
    </Items>
  );
}

// ---------- Products
function ProductFolder({ brand, set }: FolderProps) {
  const edit = (id: string, patch: Partial<Brand['products'][number]>) => set((b) => ({ ...b, products: b.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const add = (files: File[]) => {
    const imgs = images(files);
    if (!imgs.length) { toast('Pick image files', { kind: 'warn' }); return; }
    set((b) => ({ ...b, products: [...b.products, ...imgs.map((f) => ({ id: newId(), name: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), price: '', image: fileFrom(f) }))] }));
  };
  return (
    <Items className="bk-products">
      {brand.products.map((p, i) => (
        <div key={p.id} className="bk-card bk-product" style={{ ['--i' as string]: i } as CSSProperties}>
          <div className="bk-product-img">
            {p.image ? <img src={p.image.src} alt={p.name} /> : <Icon name="image" />}
            <span className="bk-product-acts">
              <PickButton accept="image/*" label="Replace" icon="refund" onFile={(f) => edit(p.id, { image: fileFrom(f) })} />
              <button type="button" className="bk-icon-btn" aria-label={`Remove ${p.name}`} onClick={() => set((b) => ({ ...b, products: b.products.filter((x) => x.id !== p.id) }))}><Icon name="trash" /></button>
            </span>
          </div>
          <div className="bk-product-copy">
            <input className="bk-inline bk-strong" value={p.name} placeholder="Product name" aria-label="Product name" onChange={(e) => edit(p.id, { name: e.target.value })} />
            <input className="bk-inline" value={p.price} placeholder="Price" aria-label="Price" onChange={(e) => edit(p.id, { price: e.target.value })} />
          </div>
        </div>
      ))}
      <DropZone accept="image/*" multiple label="Add products" hint="Drop product photos — one product each" onFiles={add} className="bk-product-drop" />
    </Items>
  );
}

// ---------- Brand photos & voice
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
          <div key={p.id + i} className="bk-photo" style={{ ['--i' as string]: i } as CSSProperties}>
            <img src={p.src} alt={p.name} />
            <button type="button" className="bk-icon-btn" aria-label={`Remove ${p.name}`} onClick={() => set((b) => ({ ...b, photos: b.photos.filter((x, j) => !(x.id === p.id && j === i)) }))}><Icon name="trash" /></button>
          </div>
        ))}
        <DropZone accept="image/*" multiple label="Add photos" hint="Lifestyle and hero shots" onFiles={add} />
      </Items>
      <div className="bk-voice">
        <label><span>Tagline</span><input value={brand.voice.tagline} placeholder="One line about the store" onChange={(e) => voice('tagline', e.target.value)} /></label>
        <label><span>Tone of voice</span><textarea rows={2} value={brand.voice.tone} placeholder="How emails should sound, e.g. warm, short sentences, never pushy" onChange={(e) => voice('tone', e.target.value)} /></label>
        <label><span>About</span><textarea rows={3} value={brand.voice.about} placeholder="Who you are and what you sell, in your own words" onChange={(e) => voice('about', e.target.value)} /></label>
      </div>
    </div>
  );
}
