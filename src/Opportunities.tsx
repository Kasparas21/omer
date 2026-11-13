/* Opportunities: people worth a follow-up, a rail to pick one, why we think so, and the email we'd send.
   Laid out like the UI kit. Only the demo store has drafts today; real projects get an empty state until
   email drafting ships. */
import { useState } from 'react';
import { Icon } from './ui/Icon';
import { Orb } from './ui/Orb';
import { Dropdown } from './ui/Dropdown';
import { Menu } from './ui/Menu';
import { toast } from './ui/toast';
import { MailBody, MailPhone, Sender, pageVars, senderName } from './Mail';
import { MailEditor } from './MailEditor';
import { PAGE_STYLE, PEOPLE, STORE, type JourneyDay, type Person, type Reply, type ReplyState } from './storeData';
import { demo as store, useDemo, type PersonState, DEMO_SPACE } from './demoState';
import { DEMO_BRAND_SPACE, useBrand } from './brandStore';

type Tab = 'review' | 'hold' | 'approved' | 'replies';
const REJECT = ['Wrong moment', 'Wrong offer', 'Doesn’t sound like us', 'Already talking to them', 'No reason'];
const RL_LABEL: Record<ReplyState, string> = { open: 'Waiting for your answer', fyi: 'No answer needed', answered: 'You answered', done: 'Done', resumed: 'Still following up', ooo: 'Out of office', optout: 'Unsubscribed' };
const RL_STATE: Record<ReplyState, string> = { open: 'Follow-ups stopped until you answer', fyi: 'They bought. Nothing else will go out', answered: 'You answered. Follow-ups stay stopped', done: 'Marked as done', resumed: 'Follow-ups are back on', ooo: 'Follow-ups wait until they’re back', optout: 'Unsubscribed. They won’t get another email' };

const who = (p: { name: string | null; email: string | null }) => p.name || p.email || 'Unknown visitor';
const canSend = (p: PersonState) => !!p.email;
const inTab = (p: PersonState, tab: Tab) => !p.skipped && (tab === 'approved' ? p.status === 'sent' || p.status === 'scheduled' : p.status === tab);

function strength(p: PersonState) {
  if (p.evidenceGone) return { k: 'gone', label: 'Unavailable' };
  if (p.warn) return { k: 'stale', label: 'Stale' };
  if (!p.email) return { k: 'weak', label: 'Weak' };
  const n = p.journey.reduce((a, d) => a + d.rows.length, 0);
  return n >= 4 ? { k: 'strong', label: 'Strong' } : { k: 'fair', label: 'Fair' };
}
function whenLine(p: PersonState) {
  if (p.rec === 'support') return 'Needs a person, not an email';
  if (p.rec === 'wait') return 'Waiting until they leave';
  if (p.snoozed) return `Snoozed until ${p.snoozed}`;
  if (p.status === 'sent') return `Sent ${p.sentAgo}`;
  if (p.status === 'scheduled') return `Scheduled, sends ${p.sendAt} their time`;
  if (p.status === 'hold') return <span className="warn">Held until stock is confirmed</span>;
  return `Sends ${p.sendAt} their time`;
}

export type OpTab = Tab;
export function Opportunities({ demo, editing, onEdit, onPeople, onBack, start }: {
  demo: boolean;
  /** Opened from the Dashboard: a tab, and who to show. */
  start?: { tab?: Tab; id?: string };
  editing: boolean;
  onEdit: (on: boolean) => void;
  onPeople: () => void;
  onBack: () => void;
}) {
  const { people, replies, campaigns } = useDemo();
  const demoBrand = useBrand(DEMO_BRAND_SPACE);
  const [tab, setTab] = useState<Tab>(start?.tab ?? 'review');
  const [camp, setCamp] = useState('all');
  const [pickedId, setPicked] = useState<string>(start?.tab !== 'replies' && start?.id ? start.id : 'alex');
  const [replyId, setReplyId] = useState<string>(start?.tab === 'replies' && start.id ? start.id : 'r-dana');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');

  if (!demo) {
    // Nothing to review yet — quiet blank, same language as Live / Profile.
    return (
      <div className="omer-blank op-empty">
        <h1 className="sr-only">Opportunities</h1>
        <span className="omer-blank-ic" aria-hidden="true"><Icon name="mail" /></span>
        <h2>Nothing to review yet</h2>
        <p>When someone leaves without buying, their follow-up email waits here for you to approve.</p>
        <button type="button" className="btn btn-secondary omer-blank-cta" onClick={onPeople}>See who’s visiting<Icon name="arrowUpRight" /></button>
      </div>
    );
  }

  const inCamp = (p: PersonState) => camp === 'all' || p.campaign === camp;
  const count = (t: Tab) => people.filter((p) => inCamp(p) && inTab(p, t)).length;
  const openReplies = replies.filter((r) => r.state === 'open').length;
  const shown = people.filter((p) => inCamp(p) && inTab(p, tab));
  const picked = shown.find((p) => p.id === pickedId) ?? shown[0];
  const reply = replies.find((r) => r.id === replyId) ?? replies[0];

  if (editing && picked) {
    return (
      <MailEditor key={picked.id} space={DEMO_SPACE} brand={demoBrand} published={{ doc: picked.mail, page: picked.page ?? PAGE_STYLE }}
        onPublish={(draft) => { store.updatePerson(picked.id, { mail: draft.doc, page: draft.page }); toast('Saved to the draft'); }} />
    );
  }

  const sub = tab === 'replies'
    ? (openReplies ? `${openReplies} ${openReplies === 1 ? 'reply' : 'replies'} need you` : 'No open replies')
    : (count('review') ? `${count('review')} to review` : 'You’re caught up');

  return (
    <div className="op-screen">
      <header className="op-intro">
        <h1 className="op-title">Opportunities</h1>
        <p>{sub}</p>
        <nav className="ib-tabs op-tabs" aria-label="Show">
          {(['review', 'hold', 'approved', 'replies'] as Tab[]).map((t) => (
            <button key={t} type="button" className="ib-tab" aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'review' ? 'Review' : t === 'hold' ? 'Hold' : t === 'approved' ? 'Approved' : 'Replies'}<span>{t === 'replies' ? openReplies : count(t)}</span>
            </button>
          ))}
        </nav>
        {tab === 'replies' ? null : (
          <Dropdown label="Filter by campaign" value={camp} onChange={setCamp} className="op-campaign"
            options={[{ value: 'all', label: 'All campaigns' }, ...campaigns.filter((c) => !c.draft).map((c) => ({ value: c.id, label: c.name }))]} />
        )}
      </header>

      {tab === 'replies' ? (
        <>
          <div className="op-rail" role="listbox" aria-label="Replies">
            {replies.map((r) => (
              <button key={r.id} type="button" role="option" aria-selected={r.id === reply?.id} className="op-card" onClick={() => setReplyId(r.id)}>
                <Orb seed={r.id} size={44} />
                <span className="op-card-t">
                  <span className="op-card-h"><b>{who(r)}</b><time>{r.time}</time></span>
                  <span className="op-card-o rl-snip">{r.text[0]}</span>
                  <span className="op-chips"><span className={`op-state${r.state === 'open' ? ' is-wait' : ''}`}>{RL_LABEL[r.state]}</span></span>
                </span>
              </button>
            ))}
          </div>
          {reply ? <ReplyDetail r={reply} onPeople={onPeople} /> : null}
        </>
      ) : shown.length === 0 ? (
        <p className="ho-empty op-none">{tab === 'review' ? 'All done. Nothing left here.' : 'Nothing here right now.'}</p>
      ) : <>
        <div className="op-rail" role="listbox" aria-label="Opportunities">
          {shown.map((p) => {
            const s = strength(p);
            const warn = p.changed && p.status === 'review' ? 'Price changed' : !canSend(p) && p.status === 'review' ? 'No email' : p.snoozed ? 'Hold' : '';
            return (
              <button key={p.id} type="button" role="option" aria-selected={p.id === picked?.id} className="op-card" onClick={() => setPicked(p.id)}>
                <Orb seed={p.id} size={44} />
                <span className="op-card-t">
                  <span className="op-card-h"><b>{who(p)}</b><time>{p.time}</time></span>
                  <span className="op-card-o">{p.offer}</span>
                  <span className="op-chips"><span className={`op-chip is-${s.k}`}>{s.label}</span>{warn ? <span className="op-chip is-warn">{warn}</span> : null}</span>
                </span>
              </button>
            );
          })}
        </div>
        {picked ? <Detail key={picked.id} p={picked} device={device} onDevice={setDevice} onEdit={() => onEdit(true)} onPeople={onPeople} /> : null}
      </>}
    </div>
  );
}

function PersonHead({ name, email, cc, line, seed, onPeople }: { name: string | null; email: string | null; cc: string; line: React.ReactNode; seed: string; onPeople: () => void }) {
  return (
    <button type="button" className="op-who" aria-label={`View ${who({ name, email })}’s profile`} onClick={onPeople}>
      <Orb seed={seed} size={48} />
      <span className="op-who-t">
        <span className="op-who-h"><b>{who({ name, email })}</b><span className="op-profile">Profile<Icon name="chevronRight" /></span></span>
        <small><span className="flag"><img src={`/assets/flags/${cc}.svg`} alt="" /></span><span>{email ? (name ? `${email} · ` : '') : 'No email · '}{line}</span></small>
      </span>
    </button>
  );
}

function Journey({ days, source, after }: { days: JourneyDay[]; source: Person['source']; after?: Person['after'] }) {
  const row = (r: { t: string; s?: string; ok?: boolean }) => <li key={r.t} className={r.ok ? 'ok' : undefined}><b>{r.t}</b>{r.s ? <small>{r.s}</small> : null}</li>;
  return (
    <div className="jn">
      {days.map((d, i) => (
        <div key={d.d + i}>
          <span className="date-pill">{d.d}</span>
          <ol className="op-journey">{i === 0 ? row({ t: `Came from ${source.src}`, s: source.kind + (source.camp ? ` · ${source.camp}` : '') }) : null}{d.rows.map(row)}</ol>
        </div>
      ))}
      {after ? <ol className="op-journey">{after.map(row)}</ol> : null}
    </div>
  );
}

function Detail({ p, device, onDevice, onEdit, onPeople }: { p: PersonState; device: 'desktop' | 'phone'; onDevice: (d: 'desktop' | 'phone') => void; onEdit: () => void; onPeople: () => void }) {
  const s = strength(p);
  const editable = p.status === 'review' || p.status === 'hold';
  const [note, setNote] = useState(p.recNote ?? '');
  const prev = { status: p.status, skipped: p.skipped, snoozed: p.snoozed, sendAt: p.sendAt, sentAgo: p.sentAgo, rec: p.rec };
  const undo = () => store.updatePerson(p.id, prev);
  const write = (k: string, v: string) => {
    const mail = JSON.parse(JSON.stringify(p.mail)) as Person['mail'];
    if (k === 'headline') mail.headline = v; else if (k === 'cta') mail.cta = v; else if (k.startsWith('body.')) mail.body[Number(k.split('.')[1])] = v;
    store.updatePerson(p.id, { mail });
  };
  const approve = (when?: string) => {
    if (when === 'now') { store.updatePerson(p.id, { status: 'sent', sentAgo: 'just now' }); toast(`Sent to ${who(p)}`, { undo }); return; }
    const at = when ?? p.sendAt;
    store.updatePerson(p.id, { status: 'scheduled', sendAt: at });
    toast(`Approved. Sends ${at}`, { undo });
  };
  const skip = (reason?: string) => { store.updatePerson(p.id, { skipped: true }); toast(reason && reason !== 'No reason' ? `Skipped · ${reason}` : 'Skipped', { undo }); };
  const sendOk = canSend(p) && p.status !== 'hold';
  const sendWhy = !canSend(p) ? 'No recipient email — can’t send' : p.status === 'hold' ? 'Held until stock is confirmed' : undefined;

  const more = (
    <Menu trigger={(a) => <button type="button" className="btn btn-ghost btn-icon round" aria-label="More" {...a}><Icon name="more" /></button>}
      items={[
        { label: <><Icon name="edit" />Generate</>, onPick: () => toast('Writing a new version…', { kind: 'info' }) },
        { label: <><Icon name="send" />Send test</>, onPick: () => toast('Test sent to your inbox') },
        { label: <><Icon name="clock" />Snooze until tomorrow</>, onPick: () => { store.updatePerson(p.id, { status: 'hold', snoozed: 'tomorrow' }); toast('Snoozed until tomorrow', { undo }); } },
        { label: <><Icon name="clock" />Snooze until next week</>, onPick: () => { store.updatePerson(p.id, { status: 'hold', snoozed: 'next week' }); toast('Snoozed until next week', { undo }); } },
        'sep',
        ...REJECT.map((r) => ({ label: r === 'No reason' ? 'Skip' : `Skip · ${r}`, onPick: () => skip(r) })),
        'sep',
        { label: <><Icon name="x" />Stop contacting them</>, danger: true, onPick: () => { store.updatePerson(p.id, { skipped: true }); toast(`${who(p)} won’t get emails from you`, { undo }); } },
      ]} />
  );

  let actions: React.ReactNode;
  if (p.rec) {
    actions = <div className="em-act-pri">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => skip()}>Skip</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { store.updatePerson(p.id, { rec: undefined }); toast('Email written. Review it below', { kind: 'info' }); }}>Generate email</button>
      {p.rec === 'support' ? <button type="button" className="btn btn-primary btn-sm" onClick={() => { store.updatePerson(p.id, { skipped: true }); toast('Sent to support@pawsome.shop', { undo }); }}>Send to support</button> : null}
    </div>;
  } else if (p.status === 'sent') {
    actions = p.bought ? <span className="badge badge-success"><Icon name="dollar" />Bought {p.bought}</span> : null;
  } else if (p.status === 'scheduled') {
    actions = <div className="em-act-pri"><button type="button" className="btn btn-secondary" onClick={() => { store.updatePerson(p.id, { status: 'review' }); toast('Back in Review'); }}>Undo</button></div>;
  } else if (p.snoozed) {
    actions = <div className="em-act-pri"><button type="button" className="btn btn-secondary" onClick={() => { store.updatePerson(p.id, { status: 'review', snoozed: undefined }); toast('Back in Review'); }}>Bring it back now</button></div>;
  } else if (p.status === 'hold') {
    actions = <><div className="em-act-sec">{more}</div><div className="em-act-pri"><button type="button" className="btn btn-secondary" onClick={() => toast('Re-checking the product feed…', { kind: 'info' })}>Re-check</button></div></>;
  } else {
    actions = <>
      <div className="em-act-sec">{more}<button type="button" className="btn btn-secondary" onClick={onEdit}>Edit</button></div>
      <div className="em-act-pri">
        <span className="op-split">
          <button type="button" className="btn btn-primary" disabled={!sendOk} title={sendWhy} onClick={() => approve()}>Approve</button>
          <Menu head="When should it send?" trigger={(a) => <button type="button" className="btn btn-primary op-split-more" aria-label="Choose when it sends" disabled={!sendOk} title={sendWhy} {...a}><Icon name="chevronDown" /></button>}
            items={[
              { label: 'Send now', onPick: () => approve('now') },
              { label: `Best time for them: ${p.sendAt}`, onPick: () => approve() },
              ...(p.sendAt === 'tomorrow 9:00 AM' ? [] : [{ label: 'Tomorrow 9:00 AM', onPick: () => approve('tomorrow 9:00 AM') }]),
            ]} />
        </span>
      </div>
    </>;
  }

  return (
    <section className="op-detail" aria-label={who(p)}>
      <PersonHead name={p.name} email={p.email} cc={p.cc} seed={p.id} line={whenLine(p)} onPeople={onPeople} />
      <div className="op-head">
        <div><h2>{p.offer}</h2><p>{p.title}</p></div>
        <div className="op-actions em-act">{actions}</div>
      </div>
      <div className="op-cols">
        <div className="op-side">
          <div className="op-k"><span>Why</span><span className={`op-chip is-${s.k}`}>{s.label}</span></div>
          <div className="op-why"><Icon name="ghost" /><div><b>{p.why}</b><small className={p.warn || p.evidenceGone ? 'warn' : undefined}>{p.note}</small></div></div>
          {!canSend(p) ? <p className="op-anon" role="status">No recipient email — Approve stays off.</p> : null}
          <div className="op-k"><span>What they did</span></div>
          <Journey days={p.journey} source={p.source} after={p.after} />
          {p.evidenceGone ? (
            <div className="jn-clip jn-clip-gone" role="status"><span className="jn-clip-cap">Replay unavailable<small>Evidence expired or was never captured</small></span></div>
          ) : (
            <button type="button" className="jn-clip" onClick={onPeople}>
              <span className="jn-clip-view" aria-hidden="true"><span className="jn-clip-page"><b>pawsome</b><i /><i /><i /></span><span className="jn-clip-play"><Icon name="play" /></span></span>
              <span className="jn-clip-cap">Watch replay<small>3m</small></span>
            </button>
          )}
        </div>

        {p.rec ? (
          <div className="op-draft">
            <div className="op-draft-h"><span>Next step</span><small>Not sending</small></div>
            <div className="op-rec">
              <h3>{p.recTitle}</h3>
              <p>{p.recWhy}</p>
              {p.rec === 'support' ? (
                <label className="field"><span className="label">Note for support</span>
                  <textarea className="textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                  <span className="hint">Goes to support@pawsome.shop</span>
                </label>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="op-draft">
            <div className="op-draft-h"><span>Draft</span><small>Preview only — Generate never sends</small></div>
            {p.changed && p.status === 'review' ? (
              <div className="alert alert-warning op-alert"><Icon name="alert" /><div><b>{p.changed.t}</b><p>{p.changed.d}</p></div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { store.updatePerson(p.id, { changed: undefined }); toast('Marked as checked'); }}>Looks right</button></div>
            ) : null}
            <div className="op-subject">
              <h3 contentEditable={editable} suppressContentEditableWarning spellCheck={false} key={p.mail.subject}
                onBlur={(e) => { const v = e.currentTarget.innerText.trim(); if (editable && v && v !== p.mail.subject) store.updatePerson(p.id, { mail: { ...p.mail, subject: v } }); }}>{p.mail.subject}</h3>
              <span className="op-devices" role="group" aria-label="Preview">
                <button type="button" aria-pressed={device === 'desktop'} aria-label="Desktop" onClick={() => onDevice('desktop')}><Icon name="monitor" /></button>
                <button type="button" aria-pressed={device === 'phone'} aria-label="Mobile" onClick={() => onDevice('phone')}><Icon name="phone" /></button>
              </span>
            </div>
            <div className="op-from"><Sender doc={p.mail} /><div><b>{senderName(p.mail)}</b><small>to {p.email ?? 'no recipient yet'}</small></div></div>
            {device === 'phone'
              ? <div className="op-phone"><MailPhone doc={p.mail} page={p.page}><MailBody doc={p.mail} onText={editable ? write : undefined} /></MailPhone></div>
              : <div className="op-sheet ml-skin" style={pageVars(p.page)}><MailBody doc={p.mail} onText={editable ? write : undefined} /></div>}
          </div>
        )}
      </div>
    </section>
  );
}

function ReplyDetail({ r, onPeople }: { r: Reply; onPeople: () => void }) {
  const [text, setText] = useState('');
  const sample = PEOPLE.find((x) => x.id === r.sample)!;
  const doc = { ...sample.mail, body: [r.hi, ...sample.mail.body.slice(1)], to: r.email };
  const why = { answered: 'You answered, so nothing else goes out unless you turn follow-ups back on.', done: 'Marked as done. Follow-ups stay stopped.', resumed: 'Follow-ups are back on, so their next email goes out as planned.' }[r.state as string] ?? r.why;
  const setState = (state: ReplyState, msg: string) => { const was = r.state; store.updateReply(r.id, { state }); toast(msg, { undo: () => store.updateReply(r.id, { state: was }) }); };
  const msg = (mark: React.ReactNode, name: string, at: string, lines: string[], key: string) => (
    <article key={key} className="rl-msg">{mark}<div><header><b>{name}</b><time>{at}</time></header>{lines.map((t) => <p key={t}>{t}</p>)}</div></article>
  );
  return (
    <section className="op-detail" aria-label={`Reply from ${who(r)}`}>
      <PersonHead name={r.name} email={r.email} cc={r.cc} seed={r.id} line={RL_STATE[r.state]} onPeople={onPeople} />
      <div className="op-head">
        <div><h2>{RL_LABEL[r.state]}</h2><p>{r.text[0]}</p></div>
        <div className="op-actions em-act">
          {r.state === 'open' || r.state === 'answered' ? <button type="button" className="btn btn-ghost" onClick={() => setState('resumed', 'Follow-ups are back on')}>Keep following up</button> : null}
          {r.state === 'open' || r.state === 'fyi' || r.state === 'answered' ? <button type="button" className="btn btn-secondary" onClick={() => setState('done', 'Marked as done')}>Mark as done</button> : null}
        </div>
      </div>
      <div className="op-cols">
        <div className="op-side">
          <div className="op-k"><span>Why</span></div>
          <div className="op-why"><Icon name="ghost" /><div><b>{why}</b><small>{r.note}</small></div></div>
          <div className="op-k"><span>What they did</span></div>
          <Journey days={r.journey} source={r.source} />
        </div>
        <div className="op-draft rl-thread">
          <h3 className="rl-subj">Re: {sample.mail.subject}</h3>
          <details className="rl-sent">
            <summary><span className="rl-sum"><Sender doc={doc} /><span><b>{senderName(doc)}</b><small>Your email · {r.sentAt}</small></span></span><span className="rl-show">Show email<Icon name="chevronDown" /></span></summary>
            <div className="rl-sent-body ml-skin" style={pageVars()}><MailBody doc={doc} /></div>
          </details>
          {msg(<Orb seed={r.id} size={30} />, who(r), r.at, r.text, 'them')}
          {(r.sent ?? []).map((t, i) => msg(<Sender doc={doc} />, `${senderName(doc)} (you)`, 'Just now', [t], `you-${i}`))}
          {r.state !== 'ooo' && r.state !== 'optout' ? (
            <div className="rl-box">
              <label className="sr-only" htmlFor={`rl-${r.id}`}>Your answer</label>
              <textarea className="textarea" id={`rl-${r.id}`} rows={3} placeholder="Write your answer" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="rl-box-foot"><small>Sends from {STORE.from}</small>
                <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => {
                  const was = { state: r.state, sent: r.sent };
                  store.updateReply(r.id, { state: 'answered', sent: [...(r.sent ?? []), text.trim()] });
                  setText('');
                  toast(`Sent to ${who(r)}`, { undo: () => store.updateReply(r.id, was) });
                }}><Icon name="send" />Send</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
