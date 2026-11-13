/* What starts a campaign: search the library, browse it by group, describe it in your own words (Ghost picks
   or builds the trigger), or build your own from parts. Opens as a window over the campaign page. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './ui/Icon';
import { Dropdown } from './ui/Dropdown';
import { toast } from './ui/toast';
import {
  EVENTS, GROUPS, LIBRARY, THENS, paramValue, searchTriggers,
  type CustomEvent, type CustomThen, type LibraryTrigger, type TriggerGroup, type TriggerRef,
} from '../server/trigger-library';

const isProject = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const preview = (t: LibraryTrigger) => t.when.replace(/\{(\w+)\}/g, (_, k: string) => paramValue({ id: t.id, params: {} }, k));

export function TriggerPicker({ space, current, onPick, onClose }: {
  space: string;
  current?: TriggerRef | null;
  onPick: (ref: TriggerRef) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<TriggerGroup | 'all'>('all');
  const [mode, setMode] = useState<'list' | 'build'>(current?.custom ? 'build' : 'list');
  const [busy, setBusy] = useState(false);
  const [event, setEvent] = useState<CustomEvent>(current?.custom?.event ?? 'bought');
  const [match, setMatch] = useState(current?.custom?.match ?? '');
  const [then, setThen] = useState<CustomThen>(current?.custom?.then ?? 'gone');
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    search.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.dd')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const found = useMemo(() => {
    const list = query.trim() ? searchTriggers(query) : LIBRARY;
    return group === 'all' ? list : list.filter((t) => t.group === group);
  }, [query, group]);

  async function describe() {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      let ref: TriggerRef | null = null;
      if (isProject(space)) {
        const res = await fetch(`/api/projects/${space}/campaigns/describe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
        if (res.ok) ref = ((await res.json()) as { trigger: TriggerRef }).trigger;
      }
      if (!ref) { const best = searchTriggers(text)[0]; ref = best ? { id: best.id, params: {} } : null; }
      if (ref?.custom) { setEvent(ref.custom.event); setMatch(ref.custom.match); setThen(ref.custom.then); setMode('build'); return; }
      if (ref) onPick(ref);
      else toast('Couldn’t match that. Try building it below.', { kind: 'warn' });
    } finally { setBusy(false); }
  }

  return createPortal(
    <div className="cpx-modal is-open">
      <div className="cpx-scrim" onClick={onClose} />
      <section className={`cpx-dialog tp${mode === 'build' ? ' is-build' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tpTitle">
        <header className="cpx-dialog-h">
          <div><h2 id="tpTitle">{mode === 'build' ? 'Build your own' : 'What starts it?'}</h2></div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon round" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </header>

        {mode === 'list' ? <>
          <div className="tp-top">
            <form className="tp-search" onSubmit={(e) => { e.preventDefault(); if (found[0] && query.trim().split(/\s+/).length <= 2) onPick({ id: found[0].id, params: {} }); else void describe(); }}>
              <Icon name="search" />
              <input ref={search} value={query} placeholder="Search, or describe it: bought kibble 3 weeks ago" aria-label="Search triggers"
                onChange={(e) => setQuery(e.target.value)} />
              {query ? <button type="button" className="tp-clear" aria-label="Clear" onClick={() => { setQuery(''); search.current?.focus(); }}><Icon name="x" /></button> : null}
            </form>
            <div className="tp-groups" role="group" aria-label="Groups">
              {[{ id: 'all' as const, name: 'All' }, ...GROUPS].map((g) => (
                <button key={g.id} type="button" className="tp-group" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</button>
              ))}
            </div>
          </div>
          <div className="cpx-dialog-b tp-list">
            {query.trim().length > 2 ? (
              <button type="button" className={`tp-row tp-ai${busy ? ' is-busy' : ''}`} disabled={busy} onClick={() => void describe()}>
                <span className="tp-ic"><Icon name="ghost" /></span>
                <span className="tp-t"><b>{busy ? 'Setting it up…' : `Set up “${query.trim()}”`}</b><small>Ghost turns it into a trigger you can check</small></span>
                <Icon name="arrowRight" />
              </button>
            ) : null}
            {found.map((t) => (
              <button key={t.id} type="button" className="tp-row" aria-current={current?.id === t.id ? 'true' : undefined} onClick={() => onPick({ id: t.id, params: current?.id === t.id ? current.params : {} })}>
                <span className="tp-ic"><Icon name={t.icon as IconName} /></span>
                <span className="tp-t"><b>{t.name}</b><small>{preview(t)}</small></span>
                {current?.id === t.id ? <Icon name="check" /> : null}
              </button>
            ))}
            {!found.length && query.trim().length <= 2 ? <p className="tp-none">Nothing matches</p> : null}
          </div>
          <footer className="cpx-dialog-f tp-foot">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('build')}><Icon name="sliders" />Build your own</button>
          </footer>
        </> : <>
          <div className="cpx-dialog-b tp-build">
            <p className="tp-sentence">
              <span>When someone</span>
              <Dropdown label="What they did" value={event} className="tp-dd" options={EVENTS.map((e) => ({ value: e.id, label: e.label.toLowerCase() }))} onChange={(v) => setEvent(v as CustomEvent)} />
              <input className="tp-match" value={match} placeholder="anything" aria-label="Product, page or word" size={Math.max(8, match.length + 1)} onChange={(e) => setMatch(e.target.value)} />
              <Dropdown label="What happened next" value={then} className="tp-dd" options={THENS.map((t) => ({ value: t.id, label: t.label }))} onChange={(v) => setThen(v as CustomThen)} />
            </p>
          </div>
          <footer className="cpx-dialog-f tp-foot">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('list')}><Icon name="chevronLeft" />Library</button>
            <button type="button" className="btn btn-primary btn-sm tp-use" onClick={() => onPick({ id: 'custom', params: current?.params ?? {}, custom: { event, match: match.trim(), then } })}>Use this</button>
          </footer>
        </>}
      </section>
    </div>,
    // Inside the app shell (for its colours), outside the page (whose entrance animation would move it).
    document.querySelector('.app') ?? document.body,
  );
}
