/* Campaigns: the follow-up recipes, each card a live preview of the email it writes. Laid out like the UI kit.
   The demo store shows the kit's example set; real projects start with an empty create card. */
import { useState } from 'react';
import { Icon } from './ui/Icon';
import { CAMPAIGNS, PHOTOS, photo, type Campaign } from './storeData';

const PERSONAL = [
  { headline: 'Kibble or pâté?', hi: 'Hi Ben,', body: 'Kibble is easy and lasts for weeks. Pâté is softer and better for picky eaters. Most people keep a bit of both.', photos: ['kibble', 'pate'] as const },
  { headline: 'Which size fits?', hi: 'Hi Dana,', body: 'You asked twice if the Cozy Nook fits a big cat. It does, up to 9 kg, and the Tall Tower fits up to 12 kg.', photos: ['nook', 'tower'] as const },
];

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return <label className="switch cp-toggle"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} aria-label={label} /></label>;
}

function Hi() {
  return <p className="cp-hi">Hi <code>{'{{first_name}}'}</code>,</p>;
}

function Preview({ c }: { c: Campaign }) {
  return (
    <div className="cp-mail">
      {c.headline ? <h4>{c.headline}</h4> : null}
      <Hi />
      {c.body.split('\n\n').map((para) => <p key={para}>{para}</p>)}
      {c.id === 'interest' && <p><span className="cp-link">See the Kitten Pâté<Icon name="arrowRight" /></span></p>}
      {c.photos && <div className={`cp-photos n${c.photos.length}`}>{c.photos.map((k) => <img key={k} src={photo(PHOTOS[k], 600)} alt="" loading="lazy" />)}</div>}
      {c.product && <div className="cp-product"><div><b>{c.product.name}</b><small>{c.product.detail}</small></div><b>{c.product.price}</b><span className="cp-cta">{c.product.cta}</span></div>}
      {c.cart && <div className="cp-cart">
        <div className="cp-cart-r"><span>{c.cart.name}</span><b>{c.cart.price}</b></div>
        <div className="cp-cart-r"><span>Shipping</span><b><s>{c.cart.shipping}</s> Free</b></div>
        <span className="cp-cta">Finish my order</span>
      </div>}
    </div>
  );
}

export function Campaigns({ demo, onBack }: { demo: boolean; onBack: () => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c.state === 'on'])));
  const [personal, setPersonal] = useState(true);

  if (!demo) {
    return (
      <div className="cp-screen">
        <h1 className="v2-title cp-title">Campaigns</h1>
        <div className="cp-grid">
          <button type="button" className="cp-new" onClick={onBack}>
            <span className="cp-new-sk" aria-hidden="true"><i /><i /><i /><i /></span>
            <span className="cp-new-t"><Icon name="plus" />Create new campaign</span>
            <small>Follow-up recipes appear here once email drafting is connected.</small>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-screen">
      <h1 className="sr-only">Campaigns</h1>
      <section className="v2-card cp-personal">
        <header><Icon name="ghost" /><h3>Personal follow-ups</h3><Toggle on={personal} label="Personal follow-ups" onChange={setPersonal} /></header>
        <div className={`cp-band${personal ? '' : ' is-off'}`}>
          {PERSONAL.map((m) => (
            <div key={m.headline} className="cp-mail cp-band-mail">
              <h4>{m.headline}</h4><p className="cp-hi">{m.hi}</p><p>{m.body}</p>
              <div className="cp-photos n2">{m.photos.map((k) => <img key={k} src={photo(PHOTOS[k], 500)} alt="" loading="lazy" />)}</div>
            </div>
          ))}
          <div className="cp-mail cp-band-mail is-plain">
            <p className="cp-hi">Hi Nadia,</p>
            <p>Marc here. It looks like your card didn’t go through when you tried to buy the Tall Tower.</p>
            <p>It happens. Your cart is saved, and you can pay another way here:</p>
            <p><span className="cp-link">Finish my order<Icon name="arrowRight" /></span></p>
            <p>Or just reply and we’ll sort it out together.</p>
            <p className="cp-sig"><b>Marc</b><small>Founder, Pawsome</small></p>
            <p className="cp-foot">Pawsome · 12 Harbor St, Portland, OR</p>
          </div>
        </div>
      </section>

      <div className="cp-grid">
        {CAMPAIGNS.map((c) => (
          <section key={c.id} className={`v2-card cp-card${c.state === 'on' && !on[c.id] ? ' is-off' : ''}`}>
            <header>
              <Icon name={c.icon} /><h3>{c.name}</h3>
              {c.state === 'suggested' ? <span className="cp-tag is-ghost"><Icon name="ghost" />Suggested by Ghost</span>
                : c.state === 'draft' ? <span className="cp-tag">Draft</span>
                : <Toggle on={on[c.id]} label={c.name} onChange={(v) => setOn((s) => ({ ...s, [c.id]: v }))} />}
            </header>
            <div className="v2-in cp-in"><Preview c={c} /></div>
          </section>
        ))}
        <button type="button" className="cp-new">
          <span className="cp-new-sk" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="cp-new-t"><Icon name="plus" />Create new campaign</span>
        </button>
      </div>
    </div>
  );
}
