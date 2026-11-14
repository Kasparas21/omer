/* Making (or changing) who gets a campaign, in one small card that morphs between screens: name it, add steps
   (people who do these, in order), pick each step's type, then pick its details from the store's own data
   (pages, sources, countries, products) with search. Or start from a template and adjust. The card grows and
   shrinks smoothly to fit each screen, and screens slide in the direction you're going. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './ui/Icon';
import { Dropdown } from './ui/Dropdown';
import {
  DURATIONS, GROUPS, STEP_TYPES, WAITS, searchTemplates, stepLabel, stepType,
  type CampaignTrigger, type Step, type StepKind, type Template, type TemplateGroup,
} from '../server/trigger-library';

type Opt = { value: string; count: number; label?: string };
type Options = { pages: Opt[]; entry: Opt[]; exit: Opt[]; sources: Opt[]; countries: Opt[]; products: Opt[] };
type Screen = 'name' | 'steps' | 'library' | 'type' | 'pick';

const isProject = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
const DEMO_OPTIONS: Options = {
  pages: ['/', '/products/tall-tower', '/products/cozy-nook', '/products/kitten-starter-pack', '/products/salmon-kibble-4kg', '/cart', '/checkout', '/pages/shipping', '/blogs/kitten-care'].map((value, i) => ({ value, count: 120 - i * 11 })),
  entry: ['/', '/products/tall-tower', '/blogs/kitten-care'].map((value, i) => ({ value, count: 60 - i * 12 })),
  exit: ['/cart', '/products/tall-tower', '/pages/shipping'].map((value, i) => ({ value, count: 40 - i * 9 })),
  sources: ['instagram.com', 'google.com', 'tiktok.com', 'facebook.com'].map((value, i) => ({ value, count: 50 - i * 10 })),
  countries: [['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['LT', 'Lithuania']].map(([value, label], i) => ({ value, label, count: 80 - i * 15 })),
  products: ['Kitten Starter Pack', 'Salmon Kibble 4 kg', 'Tall Tower', 'Cozy Nook', 'Grain-free Kitten Pâté'].map((value, i) => ({ value, count: 30 - i * 4 })),
};

export function CampaignCreator({ space, name: startName, trigger: start, editing = false, onDone, onClose }: {
  space: string;
  name: string;
  trigger?: CampaignTrigger | null;
  /** Changing an existing campaign: opens on its steps and saves instead of creating. */
  editing?: boolean;
  onDone: (result: { name: string; trigger: CampaignTrigger }) => void;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState<Screen>(editing ? 'steps' : 'name');
  const [dir, setDir] = useState<1 | -1>(1);
  const [name, setName] = useState(startName === 'New campaign' ? '' : startName);
  const [steps, setSteps] = useState<Step[]>(start?.steps ?? []);
  const [wait, setWait] = useState(start?.wait ?? 'right away');
  const [template, setTemplate] = useState(start?.template);
  const [kind, setKind] = useState<StepKind>('visited');
  const [options, setOptions] = useState<Options | null>(isProject(space) ? null : DEMO_OPTIONS);
  const [reach, setReach] = useState<{ people: number; withEmail: number } | null>(null);

  const go = (next: Screen, d: 1 | -1 = 1) => { setDir(d); setScreen(next); };
  const trigger: CampaignTrigger = { steps, wait, ...(template ? { template } : {}) };
  const ready = steps.some((s) => s.kind !== 'no_buy' && s.kind !== 'no_return');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as Element).closest?.('.dd')) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!isProject(space)) return;
    void fetch(`/api/projects/${space}/campaigns/options`).then((r) => r.json()).then((o: Options) => setOptions(o)).catch(() => setOptions({ pages: [], entry: [], exit: [], sources: [], countries: [], products: [] }));
  }, [space]);
  // How many people did these steps lately (real stores), checked a moment after the steps change.
  useEffect(() => {
    if (!isProject(space) || !ready) { setReach(null); return; }
    const t = window.setTimeout(() => {
      void fetch(`/api/projects/${space}/campaigns/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger }) })
        .then((r) => r.json()).then(setReach).catch(() => setReach(null));
    }, 350);
    return () => clearTimeout(t);
  }, [space, JSON.stringify(steps)]);

  function useTemplate(t: Template) {
    setSteps(t.steps.map((s) => ({ ...s })));
    setWait(t.wait);
    setTemplate(t.id);
    if (!name.trim()) setName(t.name);
    go('steps', -1);
  }
  function addStep(step: Step) { setSteps((s) => [...s, step]); setTemplate(undefined); go('steps', -1); }

  let body: ReactNode;
  if (screen === 'name') {
    body = (
      <form className="cc-screen" onSubmit={(e) => { e.preventDefault(); if (name.trim()) go('steps'); }}>
        <Head chip="New campaign" title="Name your campaign" note="Give it a name you’ll recognize." />
        <input className="cc-input" autoFocus value={name} placeholder="e.g. Abandoned cart" aria-label="Campaign name" onChange={(e) => setName(e.target.value)} />
        <div className="cc-actions">
          <button type="button" className="cc-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="cc-btn is-primary" disabled={!name.trim()}>Continue</button>
        </div>
      </form>
    );
  } else if (screen === 'steps') {
    body = (
      <div className="cc-screen">
        <Head chip={editing ? name || 'Campaign' : 'New campaign'} title={editing ? 'Who gets it' : 'Add steps'} note="People who do these, in order, get your email." />
        <div className="cc-tray">
          {steps.map((s, i) => (
            <div key={i} className="cc-step">
              <span className="cc-num">{i + 1}</span>
              <Icon name={stepType(s.kind).icon as IconName} />
              <span className="cc-step-t">{stepLabel(s)}</span>
              <button type="button" className="cc-x" aria-label={`Remove step ${i + 1}`} onClick={() => { setSteps((x) => x.filter((_, j) => j !== i)); setTemplate(undefined); }}><Icon name="x" /></button>
            </div>
          ))}
          <button type="button" className="cc-add" onClick={() => go('type')}><Icon name="plus" />Add step</button>
        </div>
        <button type="button" className="cc-link" onClick={() => go('library')}><Icon name="book" />{steps.length ? 'Replace with a template' : 'Start from a template'}<Icon name="chevronRight" /></button>
        <div className="cc-send">
          <span>Send it</span>
          <Dropdown label="When to send" value={wait} className="cc-dd" options={WAITS.map((w) => ({ value: w, label: w }))} onChange={setWait} />
          {reach ? <small className="cc-reach">{reach.people} {reach.people === 1 ? 'person' : 'people'} lately · {reach.withEmail} with an email</small> : null}
        </div>
        <div className="cc-actions">
          <button type="button" className="cc-btn" onClick={() => (editing ? onClose() : go('name', -1))}>{editing ? 'Cancel' : 'Back'}</button>
          <button type="button" className="cc-btn is-primary" disabled={!ready} onClick={() => onDone({ name: name.trim() || startName, trigger })}>{editing ? 'Save' : 'Create'}</button>
        </div>
      </div>
    );
  } else if (screen === 'library') {
    body = <Library onPick={useTemplate} onBack={() => go('steps', -1)} />;
  } else if (screen === 'type') {
    body = (
      <div className="cc-screen">
        <Head chip="Add step" title="Select step type" note="Choose what they did." />
        <div className="cc-tray cc-list">
          {STEP_TYPES.map((t) => (
            <button key={t.kind} type="button" className="cc-row" onClick={() => { setKind(t.kind); go('pick'); }}>
              <Icon name={t.icon as IconName} /><span>{t.name}</span><Icon name="chevronRight" />
            </button>
          ))}
        </div>
        <div className="cc-actions one"><button type="button" className="cc-btn" onClick={() => go('steps', -1)}>Back</button></div>
      </div>
    );
  } else {
    body = <Pick kind={kind} options={options} onPick={addStep} onBack={() => go('type', -1)} />;
  }

  return createPortal(
    <div className="cc-modal">
      <div className="cc-scrim" onClick={onClose} />
      <Morph screen={screen} dir={dir}>{body}</Morph>
    </div>,
    document.querySelector('.app') ?? document.body,
  );
}

function Head({ chip, title, note }: { chip: string; title: string; note?: string }) {
  return (
    <header className="cc-head">
      <span className="cc-chip">{chip}</span>
      <h2>{title}</h2>
      {note ? <p>{note}</p> : null}
    </header>
  );
}

/** The card: its height follows the screen inside it, and each new screen slides in from the side you go. */
function Morph({ screen, dir, children }: { screen: Screen; dir: 1 | -1; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <section className="cc-card" role="dialog" aria-modal="true" style={height ? { height } : undefined}>
      <div ref={inner} className="cc-inner">
        <div key={screen} className={`cc-slide ${dir === 1 ? 'is-fwd' : 'is-back'}`}>{children}</div>
      </div>
    </section>
  );
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="cc-search">
      <Icon name="search" />
      <input autoFocus value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Library({ onPick, onBack }: { onPick: (t: Template) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<TemplateGroup | 'all'>('all');
  const list = useMemo(() => searchTemplates(q).filter((t) => group === 'all' || t.group === group), [q, group]);
  return (
    <div className="cc-screen">
      <Head chip="Templates" title="Start from a template" note="Pick one, then change its steps if you like." />
      <Search value={q} onChange={setQ} placeholder="Search templates" />
      <div className="cc-groups" role="group" aria-label="Groups">
        {[{ id: 'all' as const, name: 'All' }, ...GROUPS].map((g) => (
          <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</button>
        ))}
      </div>
      <div className="cc-tray cc-list is-tall">
        {list.length ? list.map((t) => (
          <button key={t.id} type="button" className="cc-row is-tpl" onClick={() => onPick(t)}>
            <span className="cc-ic"><Icon name={t.icon as IconName} /></span>
            <span className="cc-row-t"><b>{t.name}</b><small>{t.steps.map(stepLabel).join(' → ')}</small></span>
            <Icon name="plus" />
          </button>
        )) : <p className="cc-none">No templates found.</p>}
      </div>
      <div className="cc-actions one"><button type="button" className="cc-btn" onClick={onBack}>Back</button></div>
    </div>
  );
}

/** A step's details: a page, source, country or product from the store's data, or how long for "didn't" steps. */
function Pick({ kind, options, onPick, onBack }: { kind: StepKind; options: Options | null; onPick: (s: Step) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const t = stepType(kind);
  const query = q.trim();
  let rows: { key: string; label: ReactNode; meta?: string; step: Step }[] = [];
  if (t.negative) {
    rows = DURATIONS.map((d) => ({ key: d, label: `Within ${d}`, step: { kind, value: '', within: d } }));
  } else if (kind === 'visited' || kind === 'landed' || kind === 'left') {
    const list = (kind === 'visited' ? options?.pages : kind === 'landed' ? options?.entry : options?.exit) ?? [];
    const found = list.filter((o) => o.value.toLowerCase().includes(query.toLowerCase()));
    const typed = query ? (query.startsWith('/') ? query : `/${query}`) : '';
    rows = [
      ...(query ? [] : [{ key: '*', label: 'Any page', step: { kind, value: '', match: 'is' as const } }]),
      ...(typed ? [
        { key: 'starts', label: <>Pages starting with <b>{typed}</b></>, step: { kind, value: typed, match: 'starts' as const } },
      ] : []),
      ...found.map((o) => ({ key: o.value, label: o.value, meta: o.count ? String(o.count) : undefined, step: { kind, value: o.value, match: 'is' as const } })),
    ];
  } else if (kind === 'source' || kind === 'country' || kind === 'bought') {
    const list = (kind === 'source' ? options?.sources : kind === 'country' ? options?.countries : options?.products) ?? [];
    const found = list.filter((o) => `${o.value} ${o.label ?? ''}`.toLowerCase().includes(query.toLowerCase()));
    const anyLabel = kind === 'source' ? 'Anywhere (any referrer)' : kind === 'country' ? 'Any country' : 'Anything';
    rows = [
      ...(query ? [] : [{ key: '*', label: anyLabel, step: { kind, value: '' } }]),
      ...(query && kind !== 'country' && !found.some((o) => o.value.toLowerCase() === query.toLowerCase())
        ? [{ key: 'typed', label: <>{kind === 'bought' ? 'Product name contains' : 'Source contains'} <b>{query}</b></>, step: { kind, value: query } }] : []),
      ...found.map((o) => ({ key: o.value, label: o.label ? `${o.label}` : o.value, meta: o.count ? String(o.count) : undefined, step: { kind, value: o.value } })),
    ];
  }
  const loading = !t.negative && !options;
  return (
    <div className="cc-screen">
      <Head chip="Add step" title={t.pick} note={t.note} />
      {t.negative ? null : <Search value={q} onChange={setQ} placeholder={`Search ${kind === 'country' ? 'countries' : kind === 'source' ? 'sources' : kind === 'bought' ? 'products' : 'pages'}`} />}
      <div className="cc-tray cc-list is-tall">
        {loading ? <p className="cc-none">Loading…</p>
          : rows.length ? rows.map((r) => (
            <button key={r.key} type="button" className="cc-row is-pick" onClick={() => onPick(r.step)}>
              <span className="cc-row-v">{r.label}</span>{r.meta ? <small>{r.meta}</small> : null}<Icon name="plus" />
            </button>
          )) : <p className="cc-none">Nothing found in your analytics yet.</p>}
      </div>
      <div className="cc-actions one"><button type="button" className="cc-btn" onClick={onBack}>Back</button></div>
    </div>
  );
}
