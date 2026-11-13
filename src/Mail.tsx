/* One email renderer for the whole app: Opportunities drafts, campaign cards, the campaign page and the editor.
   The store's own look (its colour, fonts, page style), not Omer's. In edit mode each block can be selected,
   its words typed over, and moved, copied or removed. */
import { Fragment, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { Icon } from './ui/Icon';
import { Orb } from './ui/Orb';
import { PAGE_STYLE, PHOTOS, STORE, photo, type MailDoc, type PageStyle } from './storeData';

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
  };
}

export function Paw({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg className="ml-paw" viewBox="0 0 24 24" aria-hidden="true" fill={color}>
      <ellipse cx="12" cy="15.5" rx="5" ry="4.2" /><circle cx="5.6" cy="10" r="2.1" /><circle cx="9.5" cy="6.6" r="2.1" /><circle cx="14.5" cy="6.6" r="2.1" /><circle cx="18.4" cy="10" r="2.1" />
    </svg>
  );
}

/** {{first_name}} shows as a chip: filled in for each customer when it sends. */
function words(text: string) {
  return text.split(/(\{\{\w+\}\})/).map((part, i) =>
    /^\{\{\w+\}\}$/.test(part)
      ? <span key={i} className="ml-var" contentEditable={false} title="Filled in for each customer when it sends">{part}</span>
      : <Fragment key={i}>{part}</Fragment>);
}

export type MailEdit = {
  sel: string;
  onSelect: (key: string) => void;
  onText: (key: string, text: string) => void;
  onAct: (act: 'up' | 'down' | 'dup' | 'del') => void;
};

const TEXT_KEYS = /^(headline|body\.\d+|cta)$/;

export function MailBody({ doc, edit, typing = true, onText }: { doc: MailDoc; edit?: MailEdit; typing?: boolean; onText?: (key: string, text: string) => void }) {
  const personal = doc.kind === 'personal';
  const style = (k: string) => doc.blocks[k] ?? {};
  const align = (k: string): CSSProperties | undefined => (style(k).align === 'center' ? { textAlign: 'center' } : undefined);
  // Typed text is read back on blur. The key changes with the text so undo/redo redraws it.
  const write = edit?.onText ?? onText;
  const editable = (k: string, text: string) => (write && typing && TEXT_KEYS.test(k)
    ? { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false, onBlur: (e: FocusEvent<HTMLElement>) => { const v = e.currentTarget.innerText.trim(); if (v !== text) write(k, v); } }
    : {});

  const block = (k: string): ReactNode => {
    const [t, n] = k.split('.');
    if (t === 'headline') return doc.headline ? <h1 key={doc.headline} className={`ml-h size-${style(k).size ?? 'm'}`} style={align(k)} {...editable(k, doc.headline)}>{doc.headline}</h1> : null;
    if (t === 'body') { const text = doc.body[Number(n)]; return text != null ? <p key={text} style={align(k)} {...editable(k, text)}>{words(text)}</p> : null; }
    if (t === 'div') return <hr className="ml-hr" />;
    if (t === 'products') {
      if (!doc.products?.length) return null;
      const two = doc.products.length > 1 && style(k).layout !== 'list';
      return (
        <div className={`ml-prods${two ? ' two' : ''}`}>
          {doc.products.map((p) => (
            <div key={p.name} className="ml-prod">
              {p.flat ? null : <img className="ml-photo" src={photo(PHOTOS[p.photo], two ? 500 : 900)} alt="" loading="lazy" />}
              <div className="ml-prod-t"><b>{p.name}</b><span className="ml-price">{p.was ? <s>{p.was}</s> : null}{p.now}</span>{p.note ? <small>{p.note}</small> : null}</div>
              {p.specs ? <dl className="ml-specs">{p.specs.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl> : null}
            </div>
          ))}
        </div>
      );
    }
    if (t === 'code') return doc.code ? <div className="ml-code"><div><b>Your code</b><small>{doc.code.n}</small></div><code>{doc.code.c}</code></div> : null;
    if (t === 'cta') {
      if (!doc.cta) return null;
      if (personal) return <p className="ml-link"><span key={doc.cta} {...editable(k, doc.cta)}>{doc.cta}</span> →</p>;
      return <div className={`ml-cta-row${style(k).width === 'fit' ? ' fit' : ''}`}><span key={doc.cta} className="ml-cta" {...editable(k, doc.cta)}>{doc.cta}</span></div>;
    }
    if (t === 'hero') return doc.hero ? <div className="ml-hero"><img className="ml-photo" src={photo(PHOTOS[doc.hero.photo], 900)} alt="" loading="lazy" />{doc.hero.tag ? <span>{doc.hero.tag}</span> : null}</div> : null;
    if (t === 'cart') {
      if (!doc.cart) return null;
      return (
        <div className="ml-cart">
          <div className="ml-cart-item"><img src={photo(PHOTOS[doc.cart.photo], 160)} alt="" loading="lazy" /><b>{doc.cart.item}</b><span>{doc.cart.price}</span></div>
          {doc.cart.lines.map(([a, b]) => <div key={a} className="ml-cart-line"><span>{a}</span><span dangerouslySetInnerHTML={{ __html: b }} /></div>)}
          <div className="ml-cart-line total"><span>Total</span><span>{doc.cart.total}</span></div>
        </div>
      );
    }
    if (t === 'perks') return doc.perks ? <p className="ml-perks">{doc.perks.join(' · ')}</p> : null;
    if (t === 'sig') {
      return personal
        ? <div className="ml-sig plain"><b>Marc</b><small>Founder, {STORE.name}</small></div>
        : <div className="ml-sig"><Orb seed="pawsome-marc" size={30} /><div><b>Marc</b><small>{STORE.name}</small></div></div>;
    }
    if (t === 'footer') return <div className="ml-foot">{doc.footer ?? STORE.address}<br /><u>Unsubscribe</u>{personal ? null : <> · <u>View in browser</u></>}</div>;
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
        ? <div className={`ml-blk${edit.sel === 'logo' ? ' sel' : ''}`} onPointerDown={() => edit.onSelect('logo')}><div className="ml-logo"><Paw /><span>{STORE.name.toLowerCase()}</span></div></div>
        : <div className="ml-logo"><Paw /><span>{STORE.name.toLowerCase()}</span></div>}
      <div className="ml-main">
        {doc.order.map((k) => { const node = block(k); return node ? wrap(k, node) : null; })}
      </div>
    </div>
  );
}

/** The sender's mark: the store's paw, or Marc's own orb on a personal note. */
export function Sender({ doc, size = 30 }: { doc: MailDoc; size?: number }) {
  return doc.kind === 'personal'
    ? <Orb seed="pawsome-marc" size={size} />
    : <span className="ml-avatar" style={{ width: size, height: size }}><Paw color="#fff" /></span>;
}
export const senderName = (doc: MailDoc) => (doc.kind === 'personal' ? `Marc from ${STORE.name}` : STORE.name);

/** The email as it lands in an inbox: subject, sender, then the email on its page colour. */
export function MailInbox({ doc, page }: { doc: MailDoc; page?: PageStyle }) {
  return (
    <div className="ml-inbox">
      <div className="ml-subject"><span>{doc.subject} <span className="ml-tag">Inbox</span></span><Icon name="star" /></div>
      <div className="ml-from">
        <Sender doc={doc} />
        <div><b>{senderName(doc)}</b> <span className="ml-addr">&lt;{STORE.from}&gt;</span><small>to {doc.to ?? 'me'}</small></div>
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
          <div className="gm-subj">{subject ?? <span>{doc.subject}</span>}<span className="ml-tag">Inbox</span><Icon name="star" /></div>
          <div className="gm-from"><Sender doc={doc} size={34} /><div><p><b>{senderName(doc)}</b><span>9:41 AM</span></p><p className="gm-to">to me</p></div><Icon name="reply" /><Icon name="more" /></div>
          <div className="ml-skin is-mobile" style={pageVars(page)}>{children ?? <MailBody doc={doc} />}</div>
          <div className="gm-acts"><span><Icon name="reply" />Reply</span><span><Icon name="arrowRight" />Forward</span></div>
        </div>
        <i className="iph-home" />
      </div>
    </div>
  );
}
