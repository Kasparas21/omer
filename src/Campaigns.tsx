/* Campaigns: the follow-up recipes. The list shows each one by the email it sends; a campaign opens on its own
   page (who gets it, the email big enough to read), with Settings in a window and the email editor one click
   away. A new campaign: name it and add steps (or start from a template) in the create card, then write the
   email yourself in the editor. When it's on, the server matches real visitors every 10 minutes: their email
   waits for approval in Opportunities, or sends by itself (outside their quiet hours, within the daily
   limit). It's dropped if they buy first. The demo store shows the product's example set; a real store's
   campaigns, settings and numbers come from the server. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './ui/Icon';
import { Dropdown } from './ui/Dropdown';
import { toast } from './ui/toast';
import { DEMO_MAIL_BRAND, MailBrandProvider, MailInbox, MailPeek } from './Mail';
import { MailEditor } from './MailEditor';
import { CampaignCreator, moneyWhole } from './CampaignCreator';
import { PAGE_STYLE, PERSONAL_MAILS, campaignStats, type MailDoc, type PageStyle } from './storeData';
import { DEMO_SPACE, demo as store, useDemo, type CampaignSettings, type CampaignState } from './demoState';
import { useBrand } from './brandStore';
import { starterMail, storeMailBrand, storePage } from './campaignMail';
import { TEMPLATES, WAITS, stepLabel, stepType, triggerLine, type CampaignTrigger } from '../server/trigger-library';
import { moneyFormatter } from './money';

type Suggestion = {
  id: string;
  title: string;
  audienceSummary: string;
  evidenceCount: number;
  status: string;
};
/** Per campaign, from the server: emails waiting or queued, sent, and what they led to in the last 14 days. */
type Queue = { review: number; scheduled: number; sent: number; sent14: number; bought: number; salesCents: number; currency: string | null };

const num = new Intl.NumberFormat('en-US');
const isProject = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

export function Campaigns({ space, storeName, host, projectId, openId, editing, onOpen, onEdit, currency = 'usd' }: {
  /** DEMO_SPACE for the demo store, otherwise the project id: each store keeps its own campaigns. */
  space: string;
  storeName: string;
  host?: string;
  /** Real project id for Omer's suggestions from shared hooks. */
  projectId?: string;
  currency?: string;
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
  const [creating, setCreating] = useState<{ name: string; suggestion?: string } | null>(null);
  const [sentPersonal, setSentPersonal] = useState<{ doc: MailDoc; page: PageStyle | null }[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let gone = false;
    void fetch(`/api/projects/${projectId}/campaign-suggestions`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as { suggestions?: Suggestion[] };
        if (!gone) setSuggestions((data.suggestions || []).filter((s) => s.status === 'suggested'));
      })
      .catch(() => { if (!gone) setSuggestions([]); });
    void fetch(`/api/projects/${projectId}/campaigns/personal`)
      .then((r) => r.json())
      .then((d: { sent?: { doc: MailDoc; page: PageStyle | null }[] }) => { if (!gone) setSentPersonal((d.sent ?? []).filter((m) => m.doc && Array.isArray(m.doc.body))); })
      .catch(() => undefined);
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
  if (open) return wrap(<CampaignPage key={open.id} c={open} space={space} storeName={storeName} currency={currency} onWrite={() => write(open)} onClose={() => onOpen(undefined)} />, open);
  if (!ready) return <div className="cp-screen" aria-busy="true" />;

  const ordered = [...campaigns.filter((c) => c.suggested && !c.dismissed), ...campaigns.filter((c) => !c.suggested)];
  /** Nothing is made until the create card is done: then the campaign, a blank email, and straight to the editor. */
  const made = ({ name, trigger }: { name: string; trigger: CampaignTrigger }) => {
    const id = store.add(space, demo ? undefined : storeName, name);
    const icon = (TEMPLATES.find((t) => t.id === trigger.template)?.icon ?? 'megaphone') as CampaignState['icon'];
    store.setTrigger(id, trigger, { icon, published: { doc: starterMail(), page: demo ? { ...PAGE_STYLE } : storePage(brand) } });
    if (creating?.suggestion) void patchSuggestion(creating.suggestion, 'accepted');
    setCreating(null);
    onOpen(id);
    onEdit(true);
  };
  async function patchSuggestion(id: string, status: 'accepted' | 'dismissed') {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/campaign-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast('Couldn’t update the suggestion', { kind: 'warn' });
    }
  }
  const realPersonal = !demo && sentPersonal.length > 0;
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
            {demo
              ? PERSONAL_MAILS.map((m) => <MailPeek key={m.subject} doc={m} />)
              : realPersonal
                ? sentPersonal.map((m, i) => <MailPeek key={i} doc={m.doc} page={m.page ?? undefined} />)
                : <><SkeletonMail kind="pics" /><SkeletonMail kind="pics" short /><SkeletonMail kind="letter" /></>}
            {demo || realPersonal ? null : <span className="cpx-first-chip"><Icon name="send" />Your first follow-ups show up here once they’re sent</span>}
          </div>
        </section>
        {suggestions.map((s) => (
          <article key={s.id} className="v2-card cpx-card is-suggested">
            <header>
              <Icon name="ghost" /><h3>{s.title}</h3>
              <span className="cpx-ai-chip"><Icon name="ghost" />Suggested by Omer</span>
            </header>
            <div className="cpx-stage cpx-suggest-body">
              <p>{s.audienceSummary}</p>
              <small>{s.evidenceCount} people</small>
              <div className="cpx-suggest-acts">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating({ name: s.title, suggestion: s.id })}>Use this</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void patchSuggestion(s.id, 'dismissed')}>Dismiss</button>
              </div>
            </div>
          </article>
        ))}
        {ordered.map((c) => <MailBrandProvider key={c.id} value={mailBrand(c)}><Card c={c} onOpen={() => onOpen(c.id)} /></MailBrandProvider>)}
        <NewCard onClick={() => setCreating({ name: 'New campaign' })} />
      </div>
      {creating ? <CampaignCreator space={space} name={creating.name} currency={currency} onDone={made} onClose={() => setCreating(null)} /> : null}
    </div>
  );
}

function Card({ c, onOpen }: { c: CampaignState; onOpen: () => void }) {
  const off = !c.draft && !c.on;
  return (
    <article className={`v2-card cpx-card${off ? ' is-off' : ''}${c.suggested ? ' is-suggested' : ''}`} role="link" tabIndex={0}
      aria-label={c.suggested ? `${c.name}, suggested by Omer` : c.name}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('.switch')) onOpen(); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(); } }}>
      <header>
        <Icon name={c.icon as IconName} /><h3>{c.name}</h3>
        {c.suggested ? <span className="cpx-ai-chip"><Icon name="ghost" />Suggested by Omer</span>
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

function FlowCard({ c, money, onChange, queue }: { c: CampaignState; money: (n: number) => string; onChange: () => void; queue: Queue | null }) {
  const t = c.trigger;
  if (!t?.steps.length) {
    return (
      <div className="cpx-flow-empty">
        <p>Who gets this campaign?</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onChange}><Icon name="plus" />Add steps</button>
      </div>
    );
  }
  const auto = c.mode === 'auto';
  const counts = queue ? (auto ? `${num.format(queue.scheduled)} queued · ${num.format(queue.sent)} sent` : `${num.format(queue.review)} waiting · ${num.format(queue.sent)} sent`) : '';
  return (
    <>
      <div className="cpx-lane"><span className="cpx-lane-k"><Icon name="user" />What they do</span>
        <ol className="cpx-steps">{t.steps.map((s, i) => (
          <li key={i} className="cpx-step"><span className="cpx-ic"><Icon name={stepType(s.kind).icon as IconName} /></span><div><p>{stepLabel(s, money)}</p></div></li>
        ))}</ol>
      </div>
      <div className="cpx-lane is-us"><span className="cpx-lane-k"><Icon name="ghost" />What we do</span>
        <ol className="cpx-steps">
          <li className="cpx-step is-us"><span className="cpx-ic"><Icon name={auto ? 'zap' : 'send'} /></span><div>
            <p>{auto ? 'We send your email' : 'We write your email'} <Dropdown label="When" value={t.wait} className="cpx-dd" options={WAITS.map((w) => ({ value: w, label: w }))} onChange={(v) => store.setTrigger(c.id, { ...t, wait: v })} /></p>
            <small>{auto ? `By itself, not at night for them, up to ${c.settings.limit}` : 'It waits for your OK in Opportunities'}{counts ? ` · ${counts}` : ''}</small></div></li>
          <li className="cpx-step is-us"><span className="cpx-ic"><Icon name="x" /></span><div><p>Dropped if they buy first</p>
            <small>Or if it hasn’t gone out within {c.settings.expires}</small></div></li>
        </ol>
      </div>
      <div className="cpx-flow-acts"><button type="button" className="btn btn-secondary btn-sm" onClick={onChange}><Icon name="edit" />Edit steps</button></div>
    </>
  );
}

function CampaignPage({ c, space, storeName, onWrite, onClose, currency = 'usd' }: { c: CampaignState; space: string; storeName: string; onWrite: () => void; onClose: () => void; currency?: string }) {
  const [settings, setSettings] = useState(false);
  const [picking, setPicking] = useState(false);
  const onEdit = onWrite;
  const real = isProject(space);
  const [queue, setQueue] = useState<Queue | null>(null);
  useEffect(() => {
    if (!real) return;
    const empty: Queue = { review: 0, scheduled: 0, sent: 0, sent14: 0, bought: 0, salesCents: 0, currency: null };
    void fetch(`/api/projects/${space}/campaigns`).then((r) => r.json()).then((d: { queue?: Record<string, Queue> }) => setQueue({ ...empty, ...(d.queue?.[c.id] ?? {}) })).catch(() => undefined);
  }, [space, c.id, c.on, c.mode]);
  function picked({ name: n, trigger }: { name: string; trigger: CampaignTrigger }) {
    store.setTrigger(c.id, trigger, n && n !== c.name ? { name: n } : {});
    if (n && n !== c.name) setName(n);
    setPicking(false);
  }
  function turnOn() {
    if (!c.trigger?.steps.length) { setPicking(true); return; }
    if (!c.published) { toast('Write the email first', { kind: 'warn' }); onWrite(); return; }
    if (!c.published.doc.subject.trim()) { toast('Add a subject line first', { kind: 'warn' }); onWrite(); return; }
    store.start(c.id);
  }
  const [name, setName] = useState(c.name);
  const [saved, setSaved] = useState(false);
  const wholeMoney = useMemo(() => moneyWhole(currency), [currency]);
  // Real stores: what its emails led to (orders within 7 days of an email, last 14 days). Demo: the product's numbers.
  const demoStats = campaignStats(c);
  const sent = real ? queue?.sent14 ?? 0 : demoStats[0];
  const bought = real ? queue?.bought ?? 0 : demoStats[1];
  const sales = real ? (queue?.salesCents ?? 0) / 100 : demoStats[2];
  const money = moneyFormatter((real ? queue?.currency : null) || currency);
  const rate = sent && bought ? Math.max(1, Math.round(sent / bought)) : 0;
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
            {c.suggested ? <span className="cpx-ai-chip"><Icon name="ghost" />Suggested by Omer</span> : null}
            <span className={`set-saved${saved ? ' show' : ''}`}><Icon name="check" />Saved</span>
          </div>
          <p className="cpx-about">{c.trigger?.steps.length ? triggerLine(c.trigger, wholeMoney) : 'Choose who gets it, then write the email.'}</p>
        </div>
        <div className="cpx-head-r">
          {c.suggested ? <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { store.updateCampaign(c.id, { dismissed: true }); onClose(); }}>Not now</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={turnOn}><Icon name="play" />Turn on</button>
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
        <div className="cpx-nums cpx-facts" aria-label="Why Omer suggests it">
          {c.facts.map(([k, v]) => <div key={k}><span>{k}</span><b dangerouslySetInnerHTML={{ __html: v }} /></div>)}
          <small>Nothing sends until you turn it on</small>
        </div>
      ) : sent ? (
        <div className="cpx-nums" aria-label="Last 14 days">
          <div><span>Sent</span><b>{num.format(sent)}</b></div>
          <div><span>Bought</span><b>{num.format(bought)}</b></div>
          <div><span>Sales</span><b className={sales ? 'pos' : undefined}>{money.format(sales)}</b></div>
          <div><span>Became an order</span><b>{rate ? `1 in ${rate}` : '–'}</b></div>
          <small>Last 14 days{real ? ' · orders within 7 days of an email' : ''}</small>
        </div>
      ) : null}

      <div className="cpx-main">
        <section className="v2-card cpx-flow">
          <header><Icon name="cursor" /><h3>How it works</h3></header>
          <div className="v2-in"><FlowCard c={c} money={wholeMoney} queue={real ? queue : null} onChange={() => setPicking(true)} /></div>
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
      {picking ? <CampaignCreator space={space} name={c.name} trigger={c.trigger} currency={currency} editing onDone={picked} onClose={() => setPicking(false)} /> : null}
    </div>
  );
}

const SETTING_OPTIONS: Record<Exclude<keyof CampaignSettings, 'from'>, string[]> = {
  limit: ['50 a day', '100 a day', '200 a day', '500 a day', '1,000 a day'],
  who: ['Everyone with an email', 'Never bought before', 'Bought before'],
  freq: ['1 email a week', '2 emails a week', '1 email a month'],
  quiet: ['9 PM to 8 AM', '10 PM to 7 AM', 'No quiet hours'],
  expires: ['24 hours', '48 hours', '7 days'],
};

/** A campaign's settings, in the same card as the create flow. Every change saves right away. */
function SettingsDialog({ c, storeName, onClose, onDelete }: { c: CampaignState; storeName: string; onClose: () => void; onDelete: () => void }) {
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as Element).closest?.('.dd, .dd-list')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const flash = () => { setSaved(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setSaved(false), 1400); };
  const set = (k: keyof CampaignSettings, v: string) => { store.setSetting(c.id, k, v); flash(); };
  const fromOpts = storeName ? [storeName, `The ${storeName} team`] : ['Marc from Pawsome', 'Pawsome', 'The Pawsome team'];
  const row = (title: string, hint: string, k: keyof CampaignSettings, opts: string[]) => (
    <div className="cps-row">
      <span className="cps-k"><b>{title}</b>{hint ? <small>{hint}</small> : null}</span>
      <Dropdown label={title} value={c.settings[k]} className="cc-dd cps-dd" align="end" options={(opts.includes(c.settings[k]) ? opts : [c.settings[k], ...opts]).map((o) => ({ value: o, label: o }))} onChange={(v) => set(k, v)} />
    </div>
  );
  const auto = c.mode === 'auto';
  return createPortal(
    <div className="cc-modal">
      <div className="cc-scrim" onClick={onClose} />
      <section className="cc-card cps-card" role="dialog" aria-modal="true" aria-labelledby="cpsTitle">
        <div className="cc-inner cps-inner">
          <header className="cc-head">
            <span className="cc-chip">{c.name}</span>
            <h2 id="cpsTitle">Settings</h2>
            <p className={`cps-saved${saved ? ' show' : ''}`}><Icon name="check" />Saved</p>
          </header>

          <div className="cps-group">
            <span className="cc-group">Sending</span>
            <div className="cps-seg" role="group" aria-label="Who approves">
              <button type="button" aria-pressed={!auto} onClick={() => { store.updateCampaign(c.id, { mode: 'review' }); flash(); }}><Icon name="check" />You approve each one</button>
              <button type="button" aria-pressed={auto} onClick={() => { store.updateCampaign(c.id, { mode: 'auto' }); flash(); }}><Icon name="zap" />Sends by itself</button>
            </div>
            <div className="cc-tray">
              {auto ? row('Daily limit', 'For this campaign', 'limit', SETTING_OPTIONS.limit) : null}
              {auto ? row('Quiet hours', 'In their own time zone', 'quiet', SETTING_OPTIONS.quiet) : null}
              {row('From', 'The sender name they see', 'from', fromOpts)}
            </div>
          </div>

          <div className="cps-group">
            <span className="cc-group">Who gets it</span>
            <div className="cc-tray">
              {row('People', 'Only people with an email', 'who', SETTING_OPTIONS.who)}
              {row('Most per person', 'Across all campaigns', 'freq', SETTING_OPTIONS.freq)}
              {row('Drop it after', 'If it hasn’t gone out', 'expires', SETTING_OPTIONS.expires)}
            </div>
            <p className="cc-hint"><Icon name="info" />It’s always dropped if they buy before it goes out.</p>
          </div>

          <div className="cc-actions">
            <button type="button" className={`cc-btn cps-del${confirm ? ' is-armed' : ''}`} onClick={() => (confirm ? onDelete() : setConfirm(true))} onBlur={() => setConfirm(false)}>
              <Icon name="trash" />{confirm ? 'Delete for good?' : 'Delete'}
            </button>
            <button type="button" className="cc-btn is-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </section>
    </div>,
    document.querySelector('.app') ?? document.body,
  );
}
