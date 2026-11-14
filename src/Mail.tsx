/* One email renderer for the whole app: Opportunities drafts, campaign cards, the campaign page and the editor.
   The store's own look (its colour, fonts, page style), not Omer's. In edit mode each block can be selected,
   its words typed over, and moved, copied or removed. */
import { createContext, Fragment, useContext, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { Icon } from './ui/Icon';
import { Orb } from './ui/Orb';
import { PAGE_STYLE, PHOTOS, STORE, photo, type MailDoc, type PageStyle } from './storeData';
import { FIELDS } from '../server/trigger-library';

export const FONTS = ['Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS'];
const STACK: Record<string, string> = {
  Inter: 'var(--font, Inter, system-ui, sans-serif)', Arial: 'Arial, sans-serif', Helvetica: 'Helvetica, Arial, sans-serif', Georgia: 'Georgia, serif',
  'Times New Roman': '"Times New Roman", Times, serif', Verdana: 'Verdana, sans-serif', Tahoma: 'Tahoma, sans-serif', 'Trebuchet MS': '"Trebuchet MS", sans-serif',
};
export function pageVars(page: PageStyle = PAGE_STYLE): CSSProperties {
  return {
    ['--ml-bg' as string]: page.bg, ['--ml-fill' as string]: page.fill, ['--ml-text' as string]: page.text, ['--ml-accent' as string]: page.accent,
    ['--ml-head' as string]: STACK[page.headFont] ?? STACK.Inter, ['--ml-body' as string]: STACK[page.bodyFont] ?? STACK.Inter,
    ['--ml-size' as string]: `${page.size}px`, ['--ml-width' as string]: `${page.width}px`, ['--ml-corners' as string]: `${page.corners}px`,
    ['--ml-cta-radius' as string]: `${page.ctaRadius ?? 999}px`,
    ['--ml-head-size' as string]: `${page.headSize ?? 34}px`,
  };
}

/** Whose email it is: the demo store is Pawsome (paw logo, Marc); a real store brings its own name and logo. */
export type MailBrand = { name: string; logo?: string; sender: string; signoff: string; address: string; paw?: boolean };
export const DEMO_MAIL_BRAND: MailBrand = { name: STORE.name, sender: 'Marc', signoff: STORE.name, address: STORE.address, paw: true };
const BrandCtx = createContext<MailBrand>(DEMO_MAIL_BRAND);
export const MailBrandProvider = BrandCtx.Provider;
export const useMailBrand = () => useContext(BrandCtx);
const imgOf = (x: { photo?: string; src?: string; img?: string }, w: number) =>
  x.src || x.img || (x.photo && x.photo in PHOTOS ? photo(PHOTOS[x.photo as keyof typeof PHOTOS], w) : '');

function Logo() {
  const b = useMailBrand();
  if (b.paw) return <div className="ml-logo"><Paw /><span>{b.name.toLowerCase()}</span></div>;
  return <div className="ml-logo">{b.logo ? <img className="ml-logo-img" src={b.logo} alt={b.name} /> : <span className="ml-logo-name">{b.name}</span>}</div>;
}

export function Paw({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg className="ml-paw" viewBox="0 0 24 24" aria-hidden="true" fill={color}>
      <ellipse cx="12" cy="15.5" rx="5" ry="4.2" /><circle cx="5.6" cy="10" r="2.1" /><circle cx="9.5" cy="6.6" r="2.1" /><circle cx="14.5" cy="6.6" r="2.1" /><circle cx="18.4" cy="10" r="2.1" />
    </svg>
  );
}

/** {{first_name}} shows as a chip named "First name": filled in for each person when their email is made. The
    chip keeps the {{token}} as its text (shrunk away), so typing around it saves the token, not the label. */
function words(text: string) {
  return text.split(/(\{\{\w+\}\})/).map((part, i) => {
    if (!/^\{\{\w+\}\}$/.test(part)) return <Fragment key={i}>{part}</Fragment>;
    const key = part.slice(2, -2);
    const label = FIELDS.find((f) => f.key === key)?.name ?? key.replace(/_/g, ' ');
    return <span key={i} className="ml-var" contentEditable={false} data-label={label} title="Filled in for each person">{part}</span>;
  });
}

export type MailEdit = {
  sel: string;
  onSelect: (key: string) => void;
  onText: (key: string, text: string) => void;
  onAct: (act: 'up' | 'down' | 'dup' | 'del') => void;
};

const TEXT_KEYS = /^(headline|body\.\d+|cta)$/;

const PLACEHOLDER: Record<string, string> = { headline: 'Write a headline', body: 'Write your message', cta: 'Button text' };

export function MailBody({ doc, edit, typing = true, onText }: { doc: MailDoc; edit?: MailEdit; typing?: boolean; onText?: (key: string, text: string) => void }) {
  const personal = doc.kind === 'personal';
  const brand = useMailBrand();
  const style = (k: string) => doc.blocks[k] ?? {};
  const align = (k: string): CSSProperties | undefined => (style(k).align ? { textAlign: style(k).align } : undefined);
  // Typed text is read back on blur. The key changes with the text so undo/redo redraws it.
  const write = edit?.onText ?? onText;
  const editable = (k: string, text: string) => (write && typing && TEXT_KEYS.test(k)
    ? { contentEditable: true, suppressContentEditableWarning: true, spellCheck: true, 'data-ph': PLACEHOLDER[k.split('.')[0]],
      onBlur: (e: FocusEvent<HTMLElement>) => { const v = e.currentTarget.innerText.trim(); if (v !== text) write(k, v); },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter' && k !== 'body' && !k.startsWith('body.')) { e.preventDefault(); e.currentTarget.blur(); } } }
    : {});

  const block = (k: string): ReactNode => {
    const [t, n] = k.split('.');
    if (t === 'headline') return doc.headline || edit ? <h1 key={doc.headline} className={`ml-h size-${style(k).size ?? 'm'}`} style={align(k)} {...editable(k, doc.headline)}>{doc.headline}</h1> : null;
    if (t === 'body') { const text = doc.body[Number(n)]; return text != null && (text || edit) ? <p key={text} style={align(k)} {...editable(k, text)}>{words(text)}</p> : null; }
    if (t === 'div') return <hr className="ml-hr" />;
    if (t === 'products') {
      if (!doc.products?.length) return edit ? <div className="ml-hero-empty ml-prods-empty"><Icon name="cart" /><span>Choose products</span></div> : null;
      const two = doc.products.length > 1 && style(k).layout !== 'list';
      return (
        <div className={`ml-prods${two ? ' two' : ''}`}>
          {doc.products.map((p) => (
            <div key={p.name} className="ml-prod">
              {p.flat || !imgOf(p, 500) ? null : <img className="ml-photo" src={imgOf(p, two ? 500 : 900)} alt="" loading="lazy" />}
              <div className="ml-prod-t"><b>{p.name}</b><span className="ml-price">{p.was ? <s>{p.was}</s> : null}{p.now}</span>{p.note ? <small>{p.note}</small> : null}</div>
              {p.specs ? <dl className="ml-specs">{p.specs.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl> : null}
            </div>
          ))}
        </div>
      );
    }
    if (t === 'code') return doc.code ? <div className="ml-code"><div><b>Your code</b><small>{doc.code.n}</small></div><code>{doc.code.c}</code></div> : null;
    if (t === 'cta') {
      if (!doc.cta && !edit) return null;
      if (personal) return <p className="ml-link"><span key={doc.cta} {...editable(k, doc.cta)}>{doc.cta}</span> →</p>;
      return <div className={`ml-cta-row${style(k).width === 'full' ? ' full' : ''}`}><span key={doc.cta} className="ml-cta" {...editable(k, doc.cta)}>{doc.cta}</span></div>;
    }
    if (t === 'hero') {
      if (!doc.hero) return null;
      const src = imgOf(doc.hero, 900);
      if (!src) return edit ? <div className="ml-hero ml-hero-empty"><Icon name="image" /><span>Choose an image</span></div> : null;
      return <div className="ml-hero"><img className="ml-photo" src={src} alt="" loading="lazy" />{doc.hero.tag ? <span>{doc.hero.tag}</span> : null}</div>;
    }
    if (t === 'cart') {
      if (!doc.cart) return null;
      return (
        <div className="ml-cart">
          <div className="ml-cart-item"><img src={imgOf(doc.cart, 160)} alt="" loading="lazy" /><b>{doc.cart.item}</b><span>{doc.cart.price}</span></div>
          {doc.cart.lines.map(([a, b]) => <div key={a} className="ml-cart-line"><span>{a}</span><span dangerouslySetInnerHTML={{ __html: b }} /></div>)}
          <div className="ml-cart-line total"><span>Total</span><span>{doc.cart.total}</span></div>
        </div>
      );
    }
    if (t === 'perks') {
      const rows = doc.perks?.length ? doc.perks : doc.features;
      return rows?.length ? <p className="ml-perks">{rows.join(' · ')}</p> : null;
    }
    if (t === 'features') {
      const rows = doc.features?.length ? doc.features : doc.perks;
      if (!rows?.length) return null;
      return (
        <ul className="ml-features">
          {rows.slice(0, 4).map((f) => <li key={f}>{f}</li>)}
        </ul>
      );
    }
    if (t === 'social') return doc.social?.length ? <p className="ml-social">{doc.social.join('  ·  ')}</p> : null;
    if (t === 'sig') {
      return personal
        ? <div className="ml-sig plain"><b>{brand.sender}</b><small>{brand.paw ? `Founder, ${brand.name}` : brand.signoff}</small></div>
        : <div className="ml-sig"><Orb seed={brand.paw ? 'pawsome-marc' : brand.name} size={30} /><div><b>{brand.sender}</b><small>{brand.signoff}</small></div></div>;
    }
    if (t === 'footer') return <div className="ml-foot">{doc.footer || brand.address}<br /><u>Unsubscribe</u>{personal ? null : <> · <u>View in browser</u></>}</div>;
    return null;
  };

  const wrap = (k: string, node: ReactNode) => {
    if (!edit) return <Fragment key={k}>{node}</Fragment>;
    const dup = k.startsWith('body') || k.startsWith('div');
    return (
      <div key={k} className={`ml-blk${edit.sel === k ? ' sel' : ''}`} data-blk={k}
        onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('.ml-tools')) edit.onSelect(k); }}>
        {node}
        {k === 'footer' ? null : (
          <div className="ml-tools" contentEditable={false}>
            <button type="button" aria-label="Move up" onClick={() => edit.onAct('up')}><Icon name="chevronUp" /></button>
            <button type="button" aria-label="Move down" onClick={() => edit.onAct('down')}><Icon name="chevronDown" /></button>
            {dup ? <button type="button" aria-label="Duplicate" onClick={() => edit.onAct('dup')}><Icon name="copy" /></button> : null}
            <button type="button" aria-label="Delete" onClick={() => edit.onAct('del')}><Icon name="trash" /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`ml${personal ? ' personal' : ''}${edit ? ' is-editing' : ''}`}>
      {personal ? null : edit
        ? <div className={`ml-blk${edit.sel === 'logo' ? ' sel' : ''}`} onPointerDown={() => edit.onSelect('logo')}><Logo /></div>
        : <Logo />}
      <div className="ml-main">
        {doc.order.map((k) => { const node = block(k); return node ? wrap(k, node) : null; })}
      </div>
    </div>
  );
}

/** The sender's mark: the store's paw, or Marc's own orb on a personal note. */
export function Sender({ doc, size = 30 }: { doc: MailDoc; size?: number }) {
  const b = useMailBrand();
  if (!b.paw) return <span className="ml-avatar" style={{ width: size, height: size }}>{b.name.slice(0, 1).toUpperCase()}</span>;
  return doc.kind === 'personal'
    ? <Orb seed="pawsome-marc" size={size} />
    : <span className="ml-avatar" style={{ width: size, height: size }}><Paw color="#fff" /></span>;
}
function SenderName({ doc }: { doc: MailDoc }) {
  const b = useMailBrand();
  if (!b.paw) return <>{b.sender === b.name ? b.name : `${b.sender} from ${b.name}`}</>;
  return <>{doc.kind === 'personal' ? `Marc from ${STORE.name}` : STORE.name}</>;
}
export const senderName = (doc: MailDoc) => (doc.kind === 'personal' ? `Marc from ${STORE.name}` : STORE.name);

/** The email as it lands in an inbox: subject, sender, then the email on its page colour. */
export function MailInbox({ doc, page }: { doc: MailDoc; page?: PageStyle }) {
  return (
    <div className="ml-inbox">
      <div className="ml-subject"><span>{words(doc.subject)} <span className="ml-tag">Inbox</span></span><Icon name="star" /></div>
      <div className="ml-from">
        <Sender doc={doc} />
        <div><b><SenderName doc={doc} /></b> {useMailBrand().paw ? <span className="ml-addr">&lt;{STORE.from}&gt;</span> : null}<small>to {doc.to ?? 'me'}</small></div>
        <div className="ml-from-r"><span>9:41 AM</span><Icon name="reply" /><Icon name="more" /></div>
      </div>
      <div className="ml-canvas ml-skin" style={pageVars(page)}><MailBody doc={doc} /></div>
    </div>
  );
}

/** A small, non-interactive copy of the email for cards. */
export function MailPeek({ doc, page }: { doc: MailDoc; page?: PageStyle }) {
  return <div className="ml-peek ml-skin" style={pageVars(page)} aria-hidden="true"><MailBody doc={doc} /></div>;
}

/** Gmail on an iPhone, drawn simply: status bar, toolbar, subject, sender, then the email. */
export function MailPhone({ doc, page, children, subject }: { doc: MailDoc; page?: PageStyle; children?: ReactNode; subject?: ReactNode }) {
  return (
    <div className="iph" aria-label="iPhone preview">
      <div className="iph-screen">
        <div className="iph-status"><b>9:41</b><i className="iph-island" /><span className="iph-sys"><Icon name="pulse" /><span className="iph-bat" /></span></div>
        <div className="gm-bar"><Icon name="arrowLeft" /><span /><Icon name="archive" /><Icon name="trash" /><Icon name="mail" /><Icon name="more" /></div>
        <div className="gm-scroll">
          <div className="gm-subj">{subject ?? <span>{words(doc.subject)}</span>}<span className="ml-tag">Inbox</span><Icon name="star" /></div>
          <div className="gm-from"><Sender doc={doc} size={34} /><div><p><b><SenderName doc={doc} /></b><span>9:41 AM</span></p><p className="gm-to">to me</p></div><Icon name="reply" /><Icon name="more" /></div>
          <div className="ml-skin is-mobile" style={pageVars(page)}>{children ?? <MailBody doc={doc} />}</div>
          <div className="gm-acts"><span><Icon name="reply" />Reply</span><span><Icon name="arrowRight" />Forward</span></div>
        </div>
        <i className="iph-home" />
      </div>
    </div>
  );
}
