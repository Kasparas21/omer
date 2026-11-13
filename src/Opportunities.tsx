/* Opportunities: people worth a follow-up, a rail to pick one, and their draft. Laid out like the UI kit.
   Only the demo store has drafts today; real projects get an empty state until email drafting ships. */
import { useMemo, useState } from 'react';
import { Icon } from './ui/Icon';
import { Orb } from './ui/Orb';
import { Dropdown } from './ui/Dropdown';
import { OPPORTUNITIES, PHOTOS, photo, type Opportunity } from './storeData';

type Tab = 'review' | 'hold' | 'approved' | 'replies';
const TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'Review' }, { id: 'hold', label: 'Hold' }, { id: 'approved', label: 'Approved' }, { id: 'replies', label: 'Replies' },
];
const REPLIES = 2; // demo: replies live in the inbox, shown as a count like the kit

export function Opportunities({ demo, storeName, onProfile, onBack }: {
  demo: boolean;
  storeName: string;
  onProfile: (id: string) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('review');
  const [campaign, setCampaign] = useState('all');
  const [approved, setApproved] = useState<string[]>([]);
  const [pickedId, setPicked] = useState<string>();
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');

  const people = useMemo(() => OPPORTUNITIES.map((p) => (approved.includes(p.id) ? { ...p, status: 'approved' as const } : p)), [approved]);
  const shown = people.filter((p) => p.status === tab && (campaign === 'all' || p.campaign === campaign));
  const picked = shown.find((p) => p.id === pickedId) ?? shown[0];
  const count = (t: Tab) => (t === 'replies' ? REPLIES : people.filter((p) => p.status === t).length);

  if (!demo) {
    return (
      <div className="v2-empty-screen">
        <h1 className="v2-title">Opportunities</h1>
        <section className="v2-card"><div className="v2-in omer-soon"><div className="empty">
          <span className="empty-ico"><Icon name="inbox" /></span>
          <h4>No opportunities yet</h4>
          <p>Moments where a follow-up would help show up here once email drafting is connected.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>Back to Dashboard</button>
        </div></div></section>
      </div>
    );
  }

  return (
    <div className="op-screen">
      <header className="op-intro">
        <h1 className="op-title">Opportunities</h1>
        <p>{count('review')} to review</p>
        <nav className="ib-tabs op-tabs" aria-label="Opportunity status">
          {TABS.map((t) => <button key={t.id} type="button" className="ib-tab" aria-pressed={tab === t.id} onClick={() => { setTab(t.id); setPicked(undefined); }}>{t.label}<span>{count(t.id)}</span></button>)}
        </nav>
        <Dropdown label="Campaign" value={campaign} onChange={setCampaign} className="op-campaign"
          options={[{ value: 'all', label: 'All campaigns' }, ...[...new Set(OPPORTUNITIES.map((p) => p.campaign))].map((c) => ({ value: c, label: c }))]} />
      </header>

      {tab === 'replies' ? (
        <p className="ho-empty op-none">Replies land in your email inbox. Two people replied today.</p>
      ) : shown.length === 0 ? (
        <p className="ho-empty op-none">Nothing here right now.</p>
      ) : <>
        <div className="op-rail" role="listbox" aria-label="People">
          {shown.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={p.id === picked?.id} className="op-card" onClick={() => setPicked(p.id)}>
              <Orb seed={p.id} size={44} />
              <span className="op-card-t">
                <span className="op-card-h"><b>{p.name}</b><time>{p.time}</time></span>
                <span className="op-card-o">{p.offer}</span>
                <span className="op-chips"><span className={`op-chip ${p.strength === 'Strong' ? 'is-strong' : ''}`}>{p.strength}</span>{p.flags?.map((f) => <span key={f} className="op-chip is-warn">{f}</span>)}</span>
              </span>
            </button>
          ))}
        </div>
        {picked && <Detail p={picked} store={storeName} device={device} onDevice={setDevice} onProfile={onProfile}
          approved={picked.status === 'approved'} onApprove={() => setApproved((ids) => (ids.includes(picked.id) ? ids : [...ids, picked.id]))} />}
      </>}
    </div>
  );
}

function Detail({ p, store, device, onDevice, onProfile, approved, onApprove }: {
  p: Opportunity; store: string; device: 'desktop' | 'phone'; onDevice: (d: 'desktop' | 'phone') => void;
  onProfile: (id: string) => void; approved: boolean; onApprove: () => void;
}) {
  return (
    <section className="op-detail" aria-label={`Draft for ${p.name}`}>
      <div className="op-who">
        <Orb seed={p.id} size={48} />
        <div>
          <div className="op-who-h"><b>{p.name}</b><button type="button" className="op-profile" onClick={() => onProfile(p.id)}>Profile<Icon name="chevronRight" /></button></div>
          <small><span className="flag"><img src={`/assets/flags/${p.cc}.svg`} alt="" /></span>{p.email} · Sends {p.sendAt} their time</small>
        </div>
      </div>
      <div className="op-head">
        <div><h2>{p.offer}</h2><p>{p.title}</p></div>
        <div className="op-actions">
          <button type="button" className="btn btn-ghost btn-icon round" aria-label="More"><Icon name="more" /></button>
          <button type="button" className="btn btn-secondary">Edit</button>
          <span className="op-split">
            <button type="button" className="btn btn-primary" onClick={onApprove} disabled={approved}>{approved ? 'Approved' : 'Approve'}</button>
            <button type="button" className="btn btn-primary op-split-more" aria-label="Approve options"><Icon name="chevronDown" /></button>
          </span>
        </div>
      </div>
      <div className="op-cols">
        <div className="op-side">
          <div className="op-k"><span>Why</span><small>{p.strength}</small></div>
          <div className="op-why"><Icon name="ghost" /><div><b>{p.why}</b><small>{p.note}</small></div></div>
          <div className="op-k"><span>What they did</span></div>
          <ol className="op-journey"><li className="op-day">Today</li>{p.journey.map((row) => <li key={row.t}><b>{row.t}</b><small>{row.s}</small></li>)}</ol>
        </div>
        <div className="op-draft">
          <div className="op-draft-h"><span>Draft</span><small>Preview only — Generate never sends</small></div>
          <div className="op-subject">
            <h3>{p.draft.subject}</h3>
            <span className="op-devices" role="group" aria-label="Preview size">
              <button type="button" aria-pressed={device === 'desktop'} aria-label="Desktop" onClick={() => onDevice('desktop')}><Icon name="monitor" /></button>
              <button type="button" aria-pressed={device === 'phone'} aria-label="Phone" onClick={() => onDevice('phone')}><Icon name="phone" /></button>
            </span>
          </div>
          <div className="op-from"><span className="op-from-mark">P</span><b>{store}</b></div>
          <EmailPreview p={p} store={store} phone={device === 'phone'} />
        </div>
      </div>
    </section>
  );
}

export function EmailPreview({ p, store, phone }: { p: Opportunity; store: string; phone?: boolean }) {
  const d = p.draft;
  return (
    <article className={`mail${phone ? ' is-phone' : ''}`}>
      <div className="mail-brand"><span aria-hidden="true">🐾</span>{store.toLowerCase()}</div>
      <h4 className="mail-h">{d.headline}</h4>
      {d.body.map((line) => <p key={line}>{line}</p>)}
      {d.product && <>
        <img className="mail-photo" src={photo(PHOTOS[d.product.photo], 900)} alt="" loading="lazy" />
        <div className="mail-product">
          <div><b>{d.product.name}</b><small>{d.product.detail}</small></div>
          <div>{d.product.was !== d.product.now && <s>{d.product.was}</s>}<b>{d.product.now}</b></div>
        </div>
      </>}
      {d.code && <div className="mail-code"><div><b>Your code</b><small>{d.code.note}</small></div><code>{d.code.code}</code></div>}
      <span className="mail-cta">{d.cta}</span>
      <p className="mail-fine">Free shipping over $35 · 30-day returns</p>
      <div className="mail-sign"><span className="mail-sign-orb" aria-hidden="true" /><div><b>Marc</b><small>{store}</small></div></div>
      <p className="mail-foot">{store} · 12 Harbor St, Portland, OR · Unsubscribe · View in browser</p>
    </article>
  );
}
