/* Campaigns: the follow-up recipes. The list shows each one by the email it sends; a campaign opens on its own
   page (who gets it, the email big enough to read), with Settings in a window and the email editor one click
   away. A new campaign: name it and add steps (or start from a template) in the create card, then write the
   email yourself in the editor. When it's on, the server matches real visitors and queues their emails in
   Opportunities for approval. The demo store shows the kit's example set; a real store's campaigns are saved
   on the server. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { Dropdown } from './ui/Dropdown';
import { toast } from './ui/toast';
import { DEMO_MAIL_BRAND, MailBrandProvider, MailInbox, MailPeek } from './Mail';
import { MailEditor } from './MailEditor';
import { CampaignCreator } from './CampaignCreator';
import { FLOWS, PAGE_STYLE, PICKS, PERSONAL_MAILS, campaignStats, type Flow } from './storeData';
import { DEMO_SPACE, demo as store, pickValue, useDemo, type CampaignSettings, type CampaignState } from './demoState';
import { useBrand } from './brandStore';
import { starterMail, storeMailBrand, storePage } from './campaignMail';
import { TEMPLATES, WAITS, stepLabel, stepType, triggerLine, type CampaignTrigger } from '../server/trigger-library';

type Suggestion = {
  id: string;
  title: string;
  audienceSummary: string;
  evidenceCount: number;
  status: string;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-US');

export function Campaigns({ space, storeName, host, projectId, openId, editing, onOpen, onEdit }: {
  /** DEMO_SPACE for the demo store, otherwise the project id: each store keeps its own campaigns. */
  space: string;
  storeName: string;
  host?: string;
  /** Real project id for Ghost suggestions from shared hooks. */
  projectId?: string;
  openId?: string;
  editing: boolean;
  onOpen: (id?: string) => void;
  onEdit: (on: boolean) => void;
  onBack?: () => void;
}) {
  const { campaigns, personal, ready } = useDemo(space);
  const brand = useBrand(space);
  const demo = space === DEMO_SPACE;
  const open = campaigns.find((c) => c.id === openId);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let gone = false;
    void fetch(`/api/projects/${projectId}/campaign-suggestions`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as { suggestions?: Suggestion[] };
        if (!gone) setSuggestions((data.suggestions || []).filter((s) => s.status === 'suggested'));
      })
      .catch(() => { if (!gone) setSuggestions([]); });
    return () => { gone = true; };
  }, [projectId]);

  const mailBrand = (c?: CampaignState) => (demo ? DEMO_MAIL_BRAND : storeMailBrand(storeName, brand, c?.settings.from, host));
  const wrap = (node: ReactNode, c?: CampaignState) => <MailBrandProvider value={mailBrand(c)}>{node}</MailBrandProvider>;
  /** A new email starts blank, in the store's look. */
  const write = (c: CampaignState) => {
    if (!c.published) store.updateCampaign(c.id, { published: { doc: starterMail(), page: demo ? { ...PAGE_STYLE } : storePage(brand) } });
    onEdit(true);
  };

  if (open && editing && open.published) {
    return wrap(
      <MailEditor key={open.id} space={space} brand={brand} published={open.published}
        onPublish={(draft) => store.updateCampaign(open.id, { published: draft })} />, open,
    );
  }
  if (open) return wrap(<CampaignPage key={open.id} c={open} space={space} storeName={storeName} onWrite={() => write(open)} onClose={() => onOpen(undefined)} />, open);
  if (!ready) return <div className="cp-screen" aria-busy="true" />;

  const ordered = [...campaigns.filter((c) => c.suggested && !c.dismissed), ...campaigns.filter((c) => !c.suggested)];
  const create = () => setCreating(true);
  /** Nothing is made until the create card is done: then the campaign, a blank email, and straight to the editor. */
  const made = ({ name, trigger }: { name: string; trigger: CampaignTrigger }) => {
    const id = store.add(space, demo ? undefined : storeName, name);
    const icon = (TEMPLATES.find((t) => t.id === trigger.template)?.icon ?? 'megaphone') as CampaignState['icon'];
    store.setTrigger(id, trigger, { icon, published: { doc: starterMail(), page: demo ? { ...PAGE_STYLE } : storePage(brand) } });
    setCreating(false);
    onOpen(id);
    onEdit(true);
  };
  const dismissSuggestion = async (id: string) => {
    if (!projectId) return;
    try {
      await fetch(`/api/projects/${projectId}/campaign-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast('Could not dismiss suggestion', { kind: 'warn' });
    }
  };
  const acceptSuggestion = async (id: string, title: string) => {
    if (!projectId) return;
    try {
      await fetch(`/api/projects/${projectId}/campaign-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      onOpen(store.add(space, demo ? undefined : storeName, title));
      toast('Campaign shell created — email content comes next');
    } catch {
      toast('Could not accept suggestion', { kind: 'warn' });
    }
  };
  return (
    <div className="cp-screen">
      <h1 className="sr-only">Campaigns</h1>
      <div className="cpx-grid">
        <section className={`v2-card cpx-card cpx-main-card${personal ? '' : ' is-off'}`} aria-labelledby="cpMainT">
          <header><Icon name="ghost" /><h3 id="cpMainT">Personal follow-ups</h3>
            <label className="switch"><input type="checkbox" checked={personal} aria-label="Personal follow-ups on or off" onChange={(e) => store.setPersonal(e.target.checked, space)} /></label>
          </header>
          <div className="cpx-stage cpx-stage-3" aria-hidden="true">
            <span className="cpx-off-chip"><Icon name="pause" />Paused</span>
            {space === DEMO_SPACE
              ? PERSONAL_MAILS.map((m) => <MailPeek key={m.subject} doc={m} />)
              : <><SkeletonMail kind="pics" /><SkeletonMail kind="pics" short /><SkeletonMail kind="letter" /></>}
            {space === DEMO_SPACE ? null : <span className="cpx-first-chip"><Icon name="send" />Your first follow-ups show up here once they’re sent</span>}
          </div>
        </section>
        {suggestions.map((s) => (
          <article key={s.id} className="v2-card cpx-card is-suggested">
            <header>
              <Icon name="ghost" /><h3>{s.title}</h3>
              <span className="cpx-ai-chip"><Icon name="ghost" />Suggested</span>
            </header>
            <div className="cpx-stage cpx-suggest-body">
              <p>{s.audienceSummary}</p>
              <small>{s.evidenceCount} people</small>
              <div className="cpx-suggest-acts">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void acceptSuggestion(s.id, s.title)}>Use this</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void dismissSuggestion(s.id)}>Dismiss</button>
              </div>
            </div>
          </article>
        ))}
        {ordered.map((c) => <MailBrandProvider key={c.id} value={mailBrand(c)}><Card c={c} onOpen={() => onOpen(c.id)} /></MailBrandProvider>)}
        <NewCard onClick={create} />
      </div>
      {creating ? <CampaignCreator space={space} name="New campaign" onDone={made} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function Card({ c, onOpen }: { c: CampaignState; onOpen: () => void }) {
  const off = !c.draft && !c.on;
  return (
    <article className={`v2-card cpx-card${off ? ' is-off' : ''}${c.suggested ? ' is-suggested' : ''}`} role="link" tabIndex={0}
      aria-label={c.suggested ? `${c.name}, suggested by Ghost` : c.name}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('.switch')) onOpen(); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(); } }}>
      <header>
        <Icon name={c.icon as IconName} /><h3>{c.name}</h3>
        {c.suggested ? <span className="cpx-ai-chip"><Icon name="ghost" />Suggested by Ghost</span>
          : c.draft ? <span className="cp-st cp-st-draft">Draft</span>
          : <>{off ? <span className="cpx-off-label">Paused</span> : null}
            <label className="switch"><input type="checkbox" checked={c.on} aria-label={`${c.name} on or off`} onChange={(e) => store.updateCampaign(c.id, { on: e.target.checked })} /></label></>}
      </header>
      <div className="cpx-stage" aria-hidden="true">
        {c.published ? <MailPeek doc={c.published.doc} page={c.published.page} /> : <div className="cpx-thumb-empty"><Icon name="mail" /><span>No email yet</span></div>}
      </div>
    </article>
  );
}

/** A follow-up that hasn't been written yet: the shape of an email, before the first real one goes out. */
function SkeletonMail({ kind, short }: { kind: 'pics' | 'letter'; short?: boolean }) {
  const bar = (w: string, cls = '') => <i className={`cpx-sk${cls}`} style={{ width: w }} />;
  return (
    <div className="cpx-skmail">
      {kind === 'pics' ? <>
        {bar(short ? '58%' : '72%', ' cpx-sk-title')}
        {bar('22%')}
        {bar('94%')}{bar('88%')}{short ? null : bar('40%')}
        <span className="cpx-skmail-pics"><i /><i /></span>
      </> : <>
        {bar('24%')}
        {bar('92%')}{bar('70%')}
        {bar('86%')}{bar('52%')}
        {bar('30%', ' cpx-sk-link')}
        {bar('18%', ' cpx-sk-sign')}
      </>}
    </div>
  );
}

function NewCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="v2-card cpx-card cpx-new" onClick={onClick}>
      <header><Icon name="plus" /><h3>New campaign</h3></header>
      <div className="cpx-stage cpx-new-stage">
        <span className="cpx-new-ic" aria-hidden="true"><Icon name="plus" /></span>
        <b>Create a campaign</b>
        <span>Choose who gets it, then write the email.</span>
      </div>
    </button>
  );
}

/** A value inside a sentence that can be changed in place, styled as text. */
function InlinePick({ value, opts, label, onChange }: { value: string; opts: readonly string[]; label: string; onChange: (v: string) => void }) {
  return <Dropdown label={label} value={value} className="cpx-dd" options={opts.map((o) => ({ value: o, label: o }))} onChange={onChange} />;
}
function PickIn({ c, k }: { c: CampaignState; k: string }) {
  return <InlinePick value={pickValue(c, k)} opts={PICKS[k].opts} label="Change" onChange={(v) => store.setPick(c.id, k, v)} />;
}
function stepText(c: CampaignState, text: string) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return m ? <PickIn key={i} c={c} k={m[1]} /> : <span key={i}>{part}</span>;
  });
}

function FlowCard({ c, flow, onChange, queue }: { c: CampaignState; flow: Flow | null; onChange: () => void; queue: { review: number; sent: number } | null }) {
  const t = c.trigger;
  if (t?.steps.length) {
    return (
      <>
        <div className="cpx-lane"><span className="cpx-lane-k"><Icon name="user" />What they do</span>
          <ol className="cpx-steps">{t.steps.map((s, i) => (
            <li key={i} className="cpx-step"><span className="cpx-ic"><Icon name={stepType(s.kind).icon as IconName} /></span><div><p>{stepLabel(s)}</p></div></li>
          ))}</ol>
        </div>
        <div className="cpx-lane is-us"><span className="cpx-lane-k"><Icon name="ghost" />What we do</span>
          <ol className="cpx-steps">
            <li className="cpx-step is-us"><span className="cpx-ic"><Icon name="send" /></span><div><p>We write your email to them <InlinePick value={t.wait} opts={WAITS} label="When" onChange={(v) => store.setTrigger(c.id, { ...t, wait: v })} /></p>
              <small>It waits for your OK in Opportunities{queue ? ` · ${queue.review} waiting, ${queue.sent} sent` : ''}</small></div></li>
          </ol>
        </div>
        <div className="cpx-flow-acts"><button type="button" className="btn btn-ghost btn-sm" onClick={onChange}><Icon name="edit" />Edit steps</button></div>
      </>
    );
  }
  if (!flow) {
    return (
      <div className="cpx-flow-empty">
        <p>Who gets this campaign?</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onChange}><Icon name="plus" />Add steps</button>
      </div>
    );
  }
  const step = (s: Flow['they'][number], us: boolean) => (
    <li key={s.t} className={`cpx-step${us ? ' is-us' : ''}`}>
      <span className="cpx-ic"><Icon name={s.icon} /></span>
      <div><p>{stepText(c, s.t)}</p>{s.s ? <small>{s.s}</small> : null}</div>
    </li>
  );
  return (
    <>
      <div className="cpx-lane"><span className="cpx-lane-k"><Icon name="user" />What they do</span><ol className="cpx-steps">{flow.they.map((s) => step(s, false))}</ol></div>
      <div className="cpx-lane is-us"><span className="cpx-lane-k"><Icon name="ghost" />What we do</span><ol className="cpx-steps">{flow.we.map((s) => step(s, true))}</ol></div>
      <ul className="cpx-notes">
        <li><Icon name={c.mode === 'auto' ? 'zap' : 'check'} /><span>{c.mode === 'auto' ? 'It goes out by itself. Prices, stock and codes are checked first.' : 'It waits for your OK in Opportunities before it goes out.'}</span></li>
        <li><Icon name="x" /><span>Stops as soon as they buy, reply or unsubscribe.</span></li>
      </ul>
    </>
  );
}

function CampaignPage({ c, space, storeName, onWrite, onClose }: { c: CampaignState; space: string; storeName: string; onWrite: () => void; onClose: () => void }) {
  const [settings, setSettings] = useState(false);
  const [picking, setPicking] = useState(false);
  const onEdit = onWrite;
  const real = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(space);
  const [queue, setQueue] = useState<{ review: number; sent: number } | null>(null);
  useEffect(() => {
    if (!real || !c.trigger) return;
    void fetch(`/api/projects/${space}/campaigns`).then((r) => r.json()).then((d: { queue?: Record<string, { review: number; sent: number }> }) => setQueue(d.queue?.[c.id] ?? { review: 0, sent: 0 })).catch(() => undefined);
  }, [space, c.id, c.on]);
  function picked({ name: n, trigger }: { name: string; trigger: CampaignTrigger }) {
    store.setTrigger(c.id, trigger, n && n !== c.name ? { name: n } : {});
    if (n && n !== c.name) setName(n);
    setPicking(false);
  }
  function turnOn() {
    if (!c.trigger?.steps.length && !c.flow) { setPicking(true); return; }
    if (!c.published) { toast('Write the email first', { kind: 'warn' }); onWrite(); return; }
    if (!c.published.doc.subject.trim()) { toast('Add a subject line first', { kind: 'warn' }); onWrite(); return; }
    store.start(c.id);
  }
  const [name, setName] = useState(c.name);
  const [saved, setSaved] = useState(false);
  const flow = c.flow ? FLOWS[c.flow] : null;
  const [sent, bought, sales] = campaignStats(c);
  const rate = sent && bought ? Math.round(sent / bought) : 0;
  const status = c.draft ? 'Draft' : c.on ? 'Active' : 'Inactive';
  const savedTimer = useRef(0);
  function flash() { setSaved(true); window.clearTimeout(savedTimer.current); savedTimer.current = window.setTimeout(() => setSaved(false), 1400); }

  return (
    <div className="cpx-page">
      <header className="cpx-head">
        <div className="cpx-head-l">
          <div className="cpx-name-row">
            <input className="cp-name" value={name} aria-label="Campaign name" size={Math.max(6, name.length)}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => { const v = name.trim() || c.name; setName(v); if (v !== c.name) { store.updateCampaign(c.id, { name: v }); flash(); } }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            {c.suggested ? <span className="cpx-ai-chip"><Icon name="ghost" />Suggested by Ghost</span> : null}
            <span className={`set-saved${saved ? ' show' : ''}`}><Icon name="check" />Saved</span>
          </div>
          <p className="cpx-about">{c.trigger ? triggerLine(c.trigger) : flow ? flow.about : 'Choose who gets it, then write the email.'}</p>
        </div>
        <div className="cpx-head-r">
          {c.suggested ? <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { store.updateCampaign(c.id, { dismissed: true }); onClose(); }}>Not now</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => store.start(c.id)}><Icon name="play" />Turn on</button>
          </> : c.draft || !c.on ? <>
            <span className={`cp-st ${c.draft ? 'cp-st-draft' : 'cp-st-inactive'}`}>{c.draft ? 'Draft' : 'Paused'}</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={turnOn}><Icon name="play" />{c.draft ? 'Turn on' : 'Turn back on'}</button>
          </> : (
            <label className="switch cpx-onoff"><input type="checkbox" checked aria-label="Campaign on or off" onChange={() => store.updateCampaign(c.id, { on: false })} /><span className="cp-state">{status}</span></label>
          )}
          <button type="button" className="btn btn-secondary btn-sm" aria-haspopup="dialog" onClick={() => setSettings(true)}><Icon name="sliders" />Settings</button>
        </div>
      </header>

      {c.suggested && c.facts ? (
        <div className="cpx-nums cpx-facts" aria-label="Why Ghost suggests it">
          {c.facts.map(([k, v]) => <div key={k}><span>{k}</span><b dangerouslySetInnerHTML={{ __html: v }} /></div>)}
          <small>Nothing sends until you turn it on</small>
        </div>
      ) : sent ? (
        <div className="cpx-nums" aria-label="Last 14 days">
          <div><span>Sent</span><b>{num.format(sent)}</b></div>
          <div><span>Bought</span><b>{num.format(bought)}</b></div>
          <div><span>Sales</span><b className="pos">{money.format(sales)}</b></div>
          <div><span>Became an order</span><b>1 in {rate}</b></div>
          <small>Last 14 days</small>
        </div>
      ) : null}

      <div className="cpx-main">
        <section className="v2-card cpx-flow">
          <header><Icon name="cursor" /><h3>How it works</h3></header>
          <div className="v2-in"><FlowCard c={c} flow={flow} queue={queue} onChange={() => setPicking(true)} /></div>
        </section>
        <section className="v2-card cpx-email">
          <header><Icon name="mail" /><h3>The email</h3>
            {c.published ? <button type="button" className="btn btn-ghost btn-sm cpx-edit" onClick={onEdit}><Icon name="edit" />Edit email</button> : null}
          </header>
          <div className="v2-in">
            {c.published
              ? <div className="cpx-mail" role="button" tabIndex={0} aria-label="Edit the email" onClick={onEdit} onKeyDown={(e) => { if (e.key === 'Enter') onEdit(); }}><MailInbox doc={c.published.doc} page={c.published.page} /></div>
              : <div className="cpx-mail-empty"><Icon name="mail" /><button type="button" className="btn btn-primary btn-sm" onClick={onWrite}><Icon name="edit" />Write the email</button></div>}
          </div>
        </section>
      </div>

      {settings ? <SettingsDialog c={c} storeName={space === DEMO_SPACE ? '' : storeName} onClose={() => setSettings(false)} onDelete={() => { store.remove(c.id); onClose(); }} /> : null}
      {picking ? <CampaignCreator space={space} name={c.name} trigger={c.trigger} editing onDone={picked} onClose={() => setPicking(false)} /> : null}
    </div>
  );
}

function SettingsDialog({ c, storeName, onClose, onDelete }: { c: CampaignState; storeName: string; onClose: () => void; onDelete: () => void }) {
  const box = useRef<HTMLElement>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button, select')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const set = (k: keyof CampaignSettings, v: string) => { store.setSetting(c.id, k, v); setSaved(true); window.setTimeout(() => setSaved(false), 1400); };
  const row = (title: string, hint: string, k: keyof CampaignSettings, opts: string[]) => (
    <div className="set-row">
      <div className="set-k"><b>{title}</b>{hint ? <small>{hint}</small> : null}</div>
      <div className="set-v"><Dropdown label={title} value={c.settings[k]} className="cpx-set-dd" align="end" options={[...new Set([c.settings[k], ...opts])].map((o) => ({ value: o, label: o }))} onChange={(v) => set(k, v)} /></div>
    </div>
  );
  const auto = c.mode === 'auto';
  return (
    <div className="cpx-modal is-open">
      <div className="cpx-scrim" onClick={onClose} />
      <section className="cpx-dialog" role="dialog" aria-modal="true" aria-labelledby="cpSetTitle" ref={box}>
        <header className="cpx-dialog-h"><div><h2 id="cpSetTitle">Settings</h2><p>{c.name}</p></div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon round" aria-label="Close settings" onClick={onClose}><Icon name="x" /></button></header>
        <div className="cpx-dialog-b">
          <section className="cpx-set">
            <h3>Approval</h3>
            <div className="seg cpx-seg" role="group" aria-label="Who approves">
              <button type="button" aria-pressed={!auto} onClick={() => store.updateCampaign(c.id, { mode: 'review' })}>You approve each one</button>
              <button type="button" aria-pressed={auto} onClick={() => store.updateCampaign(c.id, { mode: 'auto' })}>Sends by itself</button>
            </div>
            {auto ? <div className="cpx-auto">
              <p className="cpx-auto-note"><Icon name="alert" />Emails go out without you. Prices, stock and codes are still checked right before each one.</p>
              {row('Daily limit', 'For this campaign', 'limit', ['200 a day', '500 a day', '1,000 a day'])}
            </div> : null}
          </section>
          <section className="cpx-set">
            <h3>Who gets it</h3>
            {row('People', 'Anyone without an email can’t get one', 'who', ['Everyone with an email', 'Never bought before', 'Bought before'])}
            {row('Most per person', 'Across all your campaigns', 'freq', ['1 email a week', '2 emails a week', '1 email a month'])}
          </section>
          <section className="cpx-set">
            <h3>Timing</h3>
            {row('Quiet hours', 'In their own time zone', 'quiet', ['Same as Settings: 9 PM to 8 AM', 'No quiet hours'])}
            {row('Drop it after', 'If it hasn’t gone out by then', 'expires', ['24 hours', '48 hours', '7 days'])}
          </section>
          <section className="cpx-set">
            <h3>Sending</h3>
            {row('From', '', 'from', storeName ? [storeName, `The ${storeName} team`] : ['Marc from Pawsome', 'Pawsome'])}
            {row('Goal', 'Reaching it ends the campaign for them', 'goal', ['They buy', 'They finish checkout', 'They buy this product'])}
          </section>
        </div>
        <footer className="cpx-dialog-f">
          <button type="button" className="btn btn-ghost btn-sm cp-del" onClick={onDelete}><Icon name="trash" />Delete campaign</button>
          <span className={`set-saved${saved ? ' show' : ''}`}><Icon name="check" />Saved</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
