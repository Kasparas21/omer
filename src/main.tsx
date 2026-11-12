import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen, Check, ChevronDown, Copy, Globe2, Inbox, LayoutDashboard, Lock, Mail,
  Plus, RefreshCw, Settings, Users, BarChart3, X,
} from 'lucide-react';
import { installPrompt, installSnippet, type Project } from './project';
import './styles.css';
import { AuthGate } from './auth';

type ProjectError = { field?: 'name' | 'website'; error: string };
type SetupStep = 'site' | 'brand' | 'install' | 'check' | 'sender';
type AppScreen = 'home' | 'opportunities' | 'people' | 'results' | 'campaigns' | 'settings';

const DOCK: { id: AppScreen; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'opportunities', label: 'Opportunities', icon: Inbox },
  { id: 'people', label: 'People', icon: Users },
  { id: 'results', label: 'Results', icon: BarChart3 },
  { id: 'campaigns', label: 'Campaigns', icon: Mail },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SETUP_STEPS: { id: SetupStep; label: string; locked?: boolean }[] = [
  { id: 'site', label: 'Your website' },
  { id: 'brand', label: 'Your brand', locked: true },
  { id: 'install', label: 'Install the snippet' },
  { id: 'check', label: 'Check it works' },
  { id: 'sender', label: 'Your sender', locked: true },
];

function Ghost({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 19.5v-9a7 7 0 0 1 14 0v9q-1.75-2-3.5 0q-1.75-2-3.5 0q-1.75-2-3.5 0q-1.75-2-3.5 0z" />
      <ellipse cx="9.6" cy="11" rx="1.1" ry="1.5" fill="currentColor" stroke="none" />
      <ellipse cx="14.4" cy="11" rx="1.1" ry="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

async function getProjects(signal?: AbortSignal) {
  const response = await fetch('/api/projects', { signal, cache: 'no-store' });
  if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
  if (!response.ok) throw new Error('Unable to load projects.');
  const data: { projects: Project[] } = await response.json();
  return data.projects;
}

function stepIndex(id: SetupStep) {
  return SETUP_STEPS.findIndex((step) => step.id === id);
}

function App({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selection, setSelection] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ProjectError>();
  const [notice, setNotice] = useState('');
  const [manualCopy, setManualCopy] = useState<'script' | 'prompt'>();
  const [step, setStep] = useState<SetupStep>('site');
  const [reached, setReached] = useState(0);
  const [forceSetup, setForceSetup] = useState(false);
  const [screen, setScreen] = useState<AppScreen>('home');
  const createDialog = useRef<HTMLDialogElement>(null);
  const guideDialog = useRef<HTMLDialogElement>(null);
  const dashboardHeading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const pending = useRef<AbortController | null>(null);

  const project = projects.find(({ id }) => id === selection) ?? projects[0];
  const snippet = project ? installSnippet(project, window.location.origin) : '';
  const setupComplete = Boolean(project?.firstEventAt);
  const inSetup = !loading && !loadError && (!setupComplete || forceSetup);

  async function refresh(interactive = false) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if (interactive) setChecking(true);
    try {
      const current = await getProjects(controller.signal);
      if (controller.signal.aborted) return;
      setProjects(current);
      setLoadError(false);
      const selected = current.find(({ id }) => id === (selection ?? project?.id)) ?? current[0];
      if (selected && !selection) setSelection(selected.id);
      if (selected?.firstEventAt) {
        setReached(stepIndex('check'));
        setStep('check');
        if (interactive) setNotice('First event received.');
      } else if (selected) {
        setReached((value) => Math.max(value, stepIndex('install')));
        if (interactive) setNotice('Still waiting for the first event.');
      }
    } catch {
      if (!controller.signal.aborted) {
        setLoadError(true);
        if (interactive) setNotice('Unable to check installation. Try again.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setChecking(false);
      }
    }
  }

  useEffect(() => {
    void refresh().then(() => undefined);
    return () => pending.current?.abort();
  }, []);

  useEffect(() => {
    if (loading || loadError) return;
    if (!project) {
      setStep('site');
      setReached(0);
      return;
    }
    if (project.firstEventAt) {
      setReached(stepIndex('check'));
      return;
    }
    setReached((value) => Math.max(value, stepIndex('install')));
    setStep((current) => (current === 'site' || current === 'brand' ? 'install' : current));
  }, [loading, loadError, project?.id, project?.firstEventAt]);

  useEffect(() => {
    if (!project || project.firstEventAt || !inSetup) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !checking && !saving) void refresh();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [project?.id, project?.firstEventAt, checking, saving, inSetup]);

  function goStep(next: SetupStep) {
    const index = stepIndex(next);
    const meta = SETUP_STEPS[index];
    if (!meta || meta.locked || index > reached) return;
    setStep(next);
    setNotice('');
  }

  function openCreate() {
    setError(undefined);
    form.current?.reset();
    createDialog.current?.showModal();
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const target = event.currentTarget;
    const fields = new FormData(target);
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.get('name'), website: fields.get('website') }),
      });
      if (!response.ok) {
        const issue: ProjectError = await response.json();
        setError(issue);
        if (issue.field) (target.elements.namedItem(issue.field) as HTMLInputElement | null)?.focus();
        return;
      }
      const data: { project: Project } = await response.json();
      pending.current?.abort();
      setProjects((current) => [data.project, ...current]);
      setSelection(data.project.id);
      setLoading(false);
      setChecking(false);
      setLoadError(false);
      setReached(stepIndex('install'));
      setStep('install');
      setNotice('Project created.');
      createDialog.current?.close();
    } catch {
      setError({ error: 'Unable to create the project. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  }

  function openGuide() {
    setNotice('');
    setManualCopy(undefined);
    guideDialog.current?.showModal();
  }

  async function copy(kind: 'script' | 'prompt') {
    if (!project) return;
    const value = kind === 'script' ? snippet : installPrompt(project, window.location.origin);
    try {
      await navigator.clipboard.writeText(value);
      setNotice(kind === 'script' ? 'Script copied.' : 'Install prompt copied.');
    } catch {
      setManualCopy(kind);
      if (!guideDialog.current?.open) guideDialog.current?.showModal();
      requestAnimationFrame(() => {
        const field = guideDialog.current?.querySelector('textarea');
        field?.focus();
        field?.select();
      });
    }
  }

  function renderSetupPane() {
    if (step === 'site') {
      return (
        <>
          <div className="set-main">
            <header className="su-head">
              <h2>What’s your website?</h2>
              <p>Create a project with the exact website origin you own or manage. You’ll get an install script next.</p>
            </header>
            <div className="su-site">
              <button className="btn btn-primary" type="button" onClick={openCreate}>
                <Plus size={17} aria-hidden="true" /> Add a project
              </button>
            </div>
            <footer className="su-foot">
              <span />
              <button className="btn btn-primary" type="button" disabled>Continue</button>
            </footer>
          </div>
          <aside className="set-side">
            <div className="set-side-in">
              <div className="set-side-k">What happens next</div>
              <ul className="set-dns">
                <li><i className="su-dot" /><div><b>Install the snippet</b><small>One script in your shared head</small></div></li>
                <li><i className="su-dot" /><div><b>Grant analytics consent</b><small>The tracker stays quiet until then</small></div></li>
                <li><i className="su-dot" /><div><b>Confirm the first event</b><small>We store a single installation receipt</small></div></li>
              </ul>
            </div>
          </aside>
        </>
      );
    }

    if (step === 'brand' || step === 'sender') {
      return (
        <div className="set-main solo">
          <header className="su-head">
            <h2>{step === 'brand' ? 'Your brand' : 'Your sender'}</h2>
            <p>{step === 'brand'
              ? 'Brand import from your site lands once Firecrawl context is wired. No mock scrape here.'
              : 'Sender DNS and test email land once SES sending is wired. No fake DNS theatre here.'}</p>
          </header>
          <p className="su-locked"><Lock size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 8 }} /> Coming next — this step stays locked until the real backend exists.</p>
          <footer className="su-foot">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => goStep(step === 'brand' ? 'site' : 'check')}>Back</button>
            <button className="btn btn-primary" type="button" disabled>Continue</button>
          </footer>
        </div>
      );
    }

    if (step === 'install' && project) {
      return (
        <>
          <div className="set-main">
            <header className="su-head">
              <h2>Add this to your site</h2>
              <p>Paste it before the closing head tag on every page of <strong>{new URL(project.origin).host}</strong>.</p>
            </header>
            <div className="su-code">
              <pre>{snippet}</pre>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void copy('script')}>
                <Copy size={15} aria-hidden="true" /> Copy
              </button>
            </div>
            <div className="su-alt">
              <span>Using a coding assistant?</span>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void copy('prompt')}>Copy install prompt</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={openGuide}>Installation guide</button>
            </div>
            <footer className="su-foot">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => goStep('site')}>Back</button>
              <button className="btn btn-primary" type="button" onClick={() => { setReached((value) => Math.max(value, stepIndex('check'))); setStep('check'); }}>
                Check installation
              </button>
            </footer>
          </div>
          <aside className="set-side">
            <div className="set-side-in">
              <div className="set-side-k">What it sends</div>
              <ul className="set-list">
                <li>One installation signal after consent</li>
                <li>Your public project key</li>
                <li>The browser Origin for matching</li>
              </ul>
              <div className="set-side-k gap">Not sent</div>
              <ul className="set-list no">
                <li>Passwords or form values</li>
                <li>Replay or identity data</li>
                <li>Anything before analytics consent</li>
              </ul>
            </div>
          </aside>
        </>
      );
    }

    if (step === 'check' && project) {
      const received = Boolean(project.firstEventAt);
      return (
        <>
          <div className="set-main">
            <header className="su-head">
              <h2>{checking ? 'Checking your site…' : received ? 'First event received' : 'Waiting for events'}</h2>
              <p>{checking
                ? 'Looking for the first consented installation receipt.'
                : received
                  ? <>Received on <time dateTime={project.firstEventAt!}>{new Date(project.firstEventAt!).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>.</>
                  : 'Visit your site, grant analytics consent, then check again.'}</p>
            </header>
            <ul className="set-dns">
              <li className={project ? '' : 'wait'}>
                {project ? <Check className="ico" size={16} aria-hidden="true" /> : <i className="su-dot" />}
                <div><b>Project created</b><small>{new URL(project.origin).host}</small></div>
              </li>
              <li className={received ? '' : 'wait'}>
                {checking ? <span className="su-spin" aria-hidden="true" /> : received ? <Check className="ico" size={16} aria-hidden="true" /> : <i className="su-dot" />}
                <div>
                  <b>{received ? 'Installation receipt stored' : 'Waiting for consent + install signal'}</b>
                  {received && <small>Duplicates keep the original timestamp</small>}
                </div>
              </li>
            </ul>
            <footer className="su-foot">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => goStep('install')}>Back</button>
              {received
                ? <button className="btn btn-primary" type="button" onClick={() => {
                    setForceSetup(false);
                    setNotice('Setup complete for this slice.');
                    requestAnimationFrame(() => dashboardHeading.current?.focus());
                  }}>
                    Go to my dashboard
                  </button>
                : <button className="btn btn-primary" type="button" disabled={checking} onClick={() => void refresh(true)}>
                    <RefreshCw size={16} aria-hidden="true" /> {checking ? 'Checking…' : 'Check installation'}
                  </button>}
            </footer>
          </div>
          <aside className="set-side">
            <div className="set-side-in">
              <div className="set-side-k">Nothing showing up?</div>
              <p className="su-side-p">Open the exact website address in your project, grant analytics consent, then check again.</p>
              <button className="btn btn-secondary btn-sm" type="button" disabled={checking} onClick={() => void refresh(true)}>Check again</button>
              <button className="btn btn-ghost btn-sm" type="button" style={{ marginTop: 8 }} onClick={openGuide}>Installation guide</button>
            </div>
          </aside>
        </>
      );
    }

    return null;
  }

  return (
    <>
      <a href="#dashboard" className="skip">Skip to dashboard</a>
      <header className="top">
        <div className="top-inner">
          <a href="/" className="wordmark"><span className="brand-icon"><Ghost size={22} /></span>Unfair Weekend</a>
          {projects.length > 0 && (
            <label className="project-picker">
              <Globe2 size={16} aria-hidden="true" />
              <select
                aria-label="Current project"
                value={project?.id}
                onChange={(event) => {
                  setSelection(event.target.value);
                  setNotice('');
                }}
              >
                {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <ChevronDown className="select-arrow" size={15} aria-hidden="true" />
            </label>
          )}
          <div className="top-actions">
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void onSignOut().catch(() => setNotice('Unable to sign out. Try again.'))}>Sign out</button>
            <button className="btn btn-secondary btn-sm new-project" type="button" onClick={openCreate}>
              <Plus size={16} aria-hidden="true" /> New project
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <main id="dashboard" className="dashboard">
          <div className="empty-card"><p role="status">Loading projects…</p></div>
        </main>
      ) : loadError && !project ? (
        <main id="dashboard" className="dashboard">
          <div className="empty-card">
            <h2>Unable to load projects</h2>
            <p>Try again to see your dashboard.</p>
            <button className="btn btn-secondary" type="button" onClick={() => void refresh(true)} disabled={checking}>Try again</button>
          </div>
        </main>
      ) : inSetup ? (
        <main id="dashboard" className="ib set su">
          <nav className="ib-list" aria-label="Setup steps">
            <div className="set-navs">
              {SETUP_STEPS.map((item, index) => {
                const done = index < reached || (item.id === 'check' && setupComplete);
                const here = item.id === step;
                const open = !item.locked && index <= reached;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="set-nav su-nav"
                    aria-current={here ? 'true' : undefined}
                    disabled={!open}
                    onClick={() => goStep(item.id)}
                  >
                    <span className={`su-n${done ? ' done' : ''}`}>
                      {item.locked ? <Lock size={12} aria-hidden="true" /> : done ? <Check size={14} aria-hidden="true" /> : index + 1}
                    </span>
                    <b>{item.label}</b>
                  </button>
                );
              })}
            </div>
          </nav>
          <div className="ib-detail">
            <div className="set-sheet">{renderSetupPane()}</div>
            <div className={notice ? 'notice' : 'sr-only'} role="status">{notice}</div>
          </div>
        </main>
      ) : (
        <main id="dashboard" className={`app-body ${screen === 'home' ? 'ho v2 v2-empty' : 'v2-screen'}`}>
          {screen === 'home' && project ? (
            <>
              <div className="v2-backdrop" aria-hidden="true">
                <div className="v2-row"><div className="v2-ghost v2-ghost-tall"><p className="v2-ghost-t" style={{ width: '28%' }}> </p><p className="v2-ghost-t" style={{ width: '44%' }}> </p><p className="v2-ghost-t" style={{ width: '62%' }}> </p></div></div>
                <div className="v2-row v2-three">
                  <div className="v2-ghost"><p className="v2-ghost-t" style={{ width: '34%' }}> </p><p className="v2-ghost-t" style={{ width: '52%' }}> </p></div>
                  <div className="v2-ghost"><p className="v2-ghost-t" style={{ width: '34%' }}> </p><p className="v2-ghost-t" style={{ width: '52%' }}> </p></div>
                  <div className="v2-ghost"><p className="v2-ghost-t" style={{ width: '34%' }}> </p><p className="v2-ghost-t" style={{ width: '52%' }}> </p></div>
                </div>
                <div className="v2-row v2-two">
                  <div className="v2-ghost v2-ghost-mid"><p className="v2-ghost-t" style={{ width: '38%' }}> </p></div>
                  <div className="v2-ghost v2-ghost-mid"><p className="v2-ghost-t" style={{ width: '30%' }}> </p></div>
                </div>
              </div>
              <div className="v2-connect">
                <div className={`v2-link${project.firstEventAt ? ' is-on' : ''}`}>
                  <span className="v2-tile" aria-hidden="true">
                    <img className="brand-logo" src="/assets/logos/shopify.svg" alt="" draggable={false} />
                  </span>
                  <i className="v2-dots" aria-hidden="true" />
                  <span className="v2-tile v2-tile-us" aria-hidden="true"><Ghost size={34} /></span>
                </div>
                <h2 tabIndex={-1} ref={dashboardHeading}>
                  {project.firstEventAt ? `Watching ${new URL(project.origin).host}` : 'Connect your website'}
                </h2>
                <p>
                  {project.firstEventAt
                    ? <>First event received {project.firstEventAt && <time dateTime={project.firstEventAt}>{new Date(project.firstEventAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>}. Live visitors, opportunities and email metrics land here as we ship those slices — no mock charts.</>
                    : 'Install the snippet and grant analytics consent to confirm the connection.'}
                </p>
                <div className="v2-cta-row">
                  <button
                    type="button"
                    className="btn btn-primary v2-cta"
                    onClick={() => {
                      setForceSetup(true);
                      setStep(project.firstEventAt ? 'check' : 'install');
                      setReached((value) => Math.max(value, stepIndex(project.firstEventAt ? 'check' : 'install')));
                    }}
                  >
                    {project.firstEventAt ? 'Open setup' : 'Finish setup'}
                  </button>
                  <button type="button" className="btn btn-secondary v2-cta" onClick={openGuide}>Installation guide</button>
                </div>
              </div>
            </>
          ) : (
            <div className="v2-empty-screen">
              <h1>{DOCK.find((item) => item.id === screen)?.label}</h1>
              <section className="v2-card">
                <header><Inbox size={16} aria-hidden="true" /><h3>Coming next</h3></header>
                <div className="v2-in">
                  <p className="su-side-p">
                    {screen === 'opportunities' && 'Review and approve follow-up emails here once generation and opportunities are wired.'}
                    {screen === 'people' && 'Visitor profiles and replays show here once capture and identity are live — no sample people.'}
                    {screen === 'results' && 'Revenue and send results show here once campaigns actually send.'}
                    {screen === 'campaigns' && 'Campaign recipes live here once the recipe engine ships.'}
                    {screen === 'settings' && 'Brand, sender and team settings land here as those backends ship.'}
                  </p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setScreen('home')}>Back to Home</button>
                </div>
              </section>
            </div>
          )}
          <div className={notice ? 'notice v2-notice' : 'sr-only'} role="status">{notice}</div>
        </main>
      )}

      {!inSetup && (
        <nav className="dock" aria-label="Product">
          {DOCK.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`dock-item${screen === id ? ' active' : ''}`}
              aria-label={label}
              aria-current={screen === id ? 'page' : undefined}
              title={label}
              onClick={() => setScreen(id)}
            >
              <Icon size={20} aria-hidden="true" />
            </button>
          ))}
          <button className="dock-item" type="button" aria-label="Installation guide" title="Installation guide" onClick={openGuide}>
            <BookOpen size={20} aria-hidden="true" />
          </button>
        </nav>
      )}

      <dialog ref={createDialog} className="dialog" aria-labelledby="create-heading" onCancel={(event) => { if (saving) event.preventDefault(); }}>
        <div className="dialog-content">
          <button className="btn btn-ghost btn-icon round close" type="button" aria-label="Close new project" disabled={saving} onClick={() => createDialog.current?.close()}>
            <X size={19} aria-hidden="true" />
          </button>
          <span className="feature-icon"><Globe2 size={24} aria-hidden="true" /></span>
          <h2 id="create-heading">Add a project</h2>
          <p>Enter a website you own or manage.</p>
          <form ref={form} onSubmit={createProject}>
            <div className="field">
              <label className="label" htmlFor="project-name">Project name</label>
              <input className="input" id="project-name" name="name" placeholder="Example Store" required maxLength={80} autoFocus aria-invalid={error?.field === 'name'} aria-describedby={error?.field === 'name' ? 'name-error' : undefined} />
              {error?.field === 'name' && <p id="name-error" className="hint error" role="alert">{error.error}</p>}
            </div>
            <div className="field">
              <label className="label" htmlFor="project-site">Website address</label>
              <input className="input" id="project-site" name="website" placeholder="https://example.com" required maxLength={500} inputMode="url" autoCapitalize="none" spellCheck={false} aria-invalid={error?.field === 'website'} aria-describedby={error?.field === 'website' ? 'website-error' : undefined} />
              {error?.field === 'website' && <p id="website-error" className="hint error" role="alert">{error.error}</p>}
            </div>
            {error && !error.field && <p className="hint error" role="alert">{error.error}</p>}
            <button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Creating project…' : 'Create project'}</button>
          </form>
        </div>
      </dialog>

      <dialog ref={guideDialog} className="dialog guide" aria-labelledby="guide-heading">
        <div className="dialog-content">
          <button className="btn btn-ghost btn-icon round close" type="button" aria-label="Close installation guide" autoFocus onClick={() => guideDialog.current?.close()}>
            <X size={19} aria-hidden="true" />
          </button>
          <span className="feature-icon"><BookOpen size={23} aria-hidden="true" /></span>
          <h2 id="guide-heading">Installation guide</h2>
          {manualCopy && project && (
            <div className="manual-copy">
              <label className="label" htmlFor="manual-copy">{manualCopy === 'script' ? 'Copy the script manually' : 'Copy the install prompt manually'}</label>
              <textarea id="manual-copy" readOnly rows={5} value={manualCopy === 'script' ? snippet : installPrompt(project, window.location.origin)} />
            </div>
          )}
          <ol className="guide-steps">
            <li>
              <strong>Add your script</strong>
              <p>Paste the project script into the shared <code>&lt;head&gt;</code> of your site. In a framework, use the root document or its script component. Add it once across your site.</p>
            </li>
            <li>
              <strong>Connect analytics consent</strong>
              <p>After the script loads, call this from your consent banner when analytics consent is granted. Call it again with <code>analytics: false</code> if consent is withdrawn.</p>
              <pre><code>{'window.unfairweekend.consent({ analytics: true });'}</code></pre>
            </li>
            <li>
              <strong>Check your installation</strong>
              <p>Visit the exact website address in your project and grant analytics consent. Return here to see your first event. The tracker sends a single installation signal without cookies or form data.</p>
            </li>
          </ol>
          {project && (
            <button className="btn btn-primary" type="button" onClick={() => void copy('script')}>
              <Copy size={17} aria-hidden="true" /> Copy script
            </button>
          )}
          <p role="status" className="notice">{notice}</p>
        </div>
      </dialog>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <AuthGate>{(onSignOut) => <App onSignOut={onSignOut} />}</AuthGate>,
);
