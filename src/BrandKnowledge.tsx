/* Brand knowledge: glass folders (logo, colours, fonts, products, brand photos, documents), then the store
   pages we monitor. Hovering tips a folder's frosted front open; clicking opens it in place: the other folders
   step back and the folder's card slides out under its row. Click the folder again or anywhere outside to
   close it. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { Dropdown } from './ui/Dropdown';
import { Uploader } from './ui/Uploader';
import { toast } from './ui/toast';
import { FONTS } from './Mail';
import {
  DEMO_BRAND_SPACE, MONITOR_LIMIT, fileFrom, folderCount, importBrandFromSite, newId, updateBrand, useBrand,
  type Brand, type BrandColor, type BrandFile, type ColorRole, type FolderId, type LogoSlot,
} from './brandStore';

const FOLDERS: { id: FolderId; name: string; icon: IconName; one: string; many: string; empty: string }[] = [
  { id: 'logo', name: 'Logo', icon: 'star', one: 'file', many: 'files', empty: 'Add your logo' },
  { id: 'colors', name: 'Colors', icon: 'layers', one: 'color', many: 'colors', empty: 'Add brand colors' },
  { id: 'fonts', name: 'Fonts', icon: 'fontsize', one: 'font', many: 'fonts', empty: 'Pick your fonts' },
  { id: 'products', name: 'Products', icon: 'tag', one: 'product', many: 'products', empty: 'Add products' },
  { id: 'photos', name: 'Brand photos', icon: 'image', one: 'photo', many: 'photos', empty: 'Add brand photos' },
  { id: 'docs', name: 'Documents', icon: 'file', one: 'doc', many: 'docs', empty: 'Import from your site' },
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

export function BrandKnowledge({ space, host, topPages, onChanges }: {
  space: string;
  host: string;
  topPages: { path: string; count: number }[];
  onChanges: () => void;
}) {
  const brand = useBrand(space);
  const [importing, setImporting] = useState(false);
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
  const [cols, setCols] = useState(5);
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
    const n = folderCount(brand, id);
    return n ? `${n} ${n === 1 ? f.one : f.many}` : f.empty;
  };

  const canImport = space !== DEMO_BRAND_SPACE;
  const runImport = async () => {
    if (!canImport || importing) return;
    setImporting(true);
    try {
      await importBrandFromSite(space);
      toast('Brand knowledge updated from your site');
      setOpen('docs');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', { kind: 'warn' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="bk" aria-label="Brand knowledge">
      {canImport ? (
        <div className="bk-import">
          <div>
            <b>Import from {host}</b>
            <p>Pulls colours, fonts, photos, Product Information and a Brand Voice Guide for follow-up emails.</p>
          </div>
          <button type="button" className={`btn btn-secondary${importing ? ' loading' : ''}`} disabled={importing} onClick={() => void runImport()}>
            {importing ? 'Reading your site…' : brand.importedAt ? 'Import again' : 'Import from website'}
          </button>
        </div>
      ) : null}
      <div className={`bk-grid${open ? ' has-open' : ''}`} ref={grid}>
        {FOLDERS.map((f, i) => (
          <button key={f.id} type="button" className={`bk-item${open === f.id ? ' is-open' : ''}`} style={{ order: i * 2 }}
            aria-expanded={open === f.id} aria-controls="bkDrawer" onClick={() => setOpen(open === f.id ? null : f.id)}>
            <GlassFolder papers={papersFor(brand, f.id)} />
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
                  {shownFolder.id === 'photos' && <PhotosFolder brand={brand} set={set} />}
                  {shownFolder.id === 'docs' && <DocsFolder brand={brand} set={set} />}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <Monitoring brand={brand} set={set} host={host} topPages={topPages} onChanges={onChanges} />
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
  if (id === 'photos') return b.photos.slice(0, 3).map((p) => ({ img: p.src }));
  const docs = b.docs || { product: '', voice: '' };
  return [
    docs.product ? { text: 'Pi' } : null,
    docs.voice ? { text: 'Vv' } : null,
  ].filter(Boolean) as Paper[];
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
      <Uploader accept="image/*" multiple title="Add products" hint="Drop photos · one product each" onFiles={add} className="bk-fill" />
    </Items>
  );
}

// ---------- Brand photos
function PhotosFolder({ brand, set }: FolderProps) {
  const add = (files: File[]) => {
    const imgs = images(files);
    if (!imgs.length) { toast('Pick image files', { kind: 'warn' }); return; }
    set((b) => ({ ...b, photos: [...b.photos, ...imgs.map(fileFrom)] }));
  };
  return (
    <Items className="bk-photos">
      {brand.photos.map((p, i) => (
        <div key={p.id + i} className="bk-photo" style={fanIn(i)}>
          <img src={p.src} alt={p.name} />
          <button type="button" className="bk-icon-btn" aria-label={`Remove ${p.name}`} onClick={() => set((b) => ({ ...b, photos: b.photos.filter((x, j) => !(x.id === p.id && j === i)) }))}><Icon name="trash" /></button>
        </div>
      ))}
      <Uploader accept="image/*" multiple title="Add photos" hint="Lifestyle and hero shots" onFiles={add} className="bk-fill" />
    </Items>
  );
}

// ---------- Documents: Product Information + Brand Voice Guide (email-scoped)
function DocsFolder({ brand, set }: FolderProps) {
  const docs = brand.docs || { product: '', voice: '' };
  const voice = (k: keyof Brand['voice'], v: string) => set((b) => ({ ...b, voice: { ...b.voice, [k]: v } }));
  const doc = (k: keyof Brand['docs'], v: string) => set((b) => ({ ...b, docs: { ...(b.docs || { product: '', voice: '' }), [k]: v } }));
  return (
    <div className="bk-docs">
      <div className="bk-voice">
        <label><span>Tagline</span><input value={brand.voice.tagline} placeholder="One line about the store" onChange={(e) => voice('tagline', e.target.value)} /></label>
        <label><span>Tone of voice</span><textarea rows={2} value={brand.voice.tone} placeholder="How emails should sound, e.g. warm, short sentences, never pushy" onChange={(e) => voice('tone', e.target.value)} /></label>
        <label><span>About</span><textarea rows={3} value={brand.voice.about} placeholder="Who you are and what you sell, in your own words" onChange={(e) => voice('about', e.target.value)} /></label>
      </div>
      <label className="bk-doc">
        <span>Product Information</span>
        <textarea rows={12} value={docs.product} placeholder="Import from your website to draft this, or write what follow-up emails are allowed to promise." onChange={(e) => doc('product', e.target.value)} />
      </label>
      <label className="bk-doc">
        <span>Brand Voice Guide</span>
        <textarea rows={12} value={docs.voice} placeholder="Import from your website to draft how follow-up emails should sound." onChange={(e) => doc('voice', e.target.value)} />
      </label>
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
      <header><Icon name="eye" /><h3 id="bkMonT">Monitoring</h3><span className="bk-panel-count">{pages.length} of {MONITOR_LIMIT} pages</span></header>
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
