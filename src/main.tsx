import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen, Check, Copy, Globe2, Lock, Plus, RefreshCw, X,
} from 'lucide-react';
import { installPrompt, installSnippet, type Project } from './project';
import './styles.css';
import { AuthGate } from './auth';
import { DashboardV2, type Go } from './DashboardV2';
import { LiveGlobe } from './LiveGlobe';
import { People } from './People';
import { Profile } from './Profile';
import { Opportunities, type OpTab } from './Opportunities';
import { Campaigns } from './Campaigns';
import { Results } from './Results';
import { Toasts } from './ui/toast';
import { DEMO_SPACE, useDemo } from './demoState';
import { Settings, type DockMode, type SettingsTab } from './Settings';
import { useLive } from './live';
import { Icon, type IconName } from './ui/Icon';
import { Dock } from './ui/Dock';
import { ProjectMenu } from './ui/ProjectMenu';
import { isDemo } from './demo';

type ProjectError = { field?: 'name' | 'website'; error: string };
type SetupStep = 'site' | 'brand' | 'install' | 'check' | 'sender';
type AppScreen = 'home' | 'inbox' | 'visitors' | 'campaigns' | 'results' | 'globe' | 'settings';
type ProfileFocus = { projectId: string; seed: string };

const DOCK: { id: AppScreen; label: string; icon: IconName; live?: boolean }[] = [
  { id: 'home', label: 'Dashboard', icon: 'home' },
  { id: 'inbox', label: 'Opportunities', icon: 'inbox' },
  { id: 'visitors', label: 'People', icon: 'users' },
  { id: 'campaigns', label: 'Campaigns', icon: 'megaphone' },
  { id: 'results', label: 'Results', icon: 'chart' },
  { id: 'globe', label: 'Live', icon: 'globe', live: true },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const WHERE: Record<AppScreen, string> = {
  home: '',
  inbox: 'Opportunities',
  visitors: 'People',
  campaigns: 'Campaigns',
  results: 'Results',
  globe: 'Live',
  settings: 'Settings',
};

const SETUP_STEPS: { id: SetupStep; label: string; locked?: boolean }[] = [
  { id: 'site', label: 'Your website' },
  { id: 'brand', label: 'Your brand', locked: true },
  { id: 'install', label: 'Install the snippet' },
  { id: 'check', label: 'Check it works' },
  { id: 'sender', label: 'Your sender', locked: true },
];

async function getProjects(signal?: AbortSignal, projectId?: string) {
  const response = await fetch(projectId ? `/api/projects?project=${projectId}` : '/api/projects?view=summary', { signal, cache: 'no-store' });
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
  const [collapsed, setCollapsed] = useState(false);
  const [analytics, setAnalytics] = useState<Project>();
  const [initial, setInitial] = useState('');
  const [liveFocus, setLiveFocus] = useState<string>();
  const [profile, setProfile] = useState<ProfileFocus>();
  const [campaignId, setCampaignId] = useState<string>();
  const [profileName, setProfileName] = useState('');
  const [editing, setEditing] = useState(false);
  // Where a Dashboard row sent you: the screen opens there (a tab, a person, a filter). The key remounts it.
  const [start, setStart] = useState<{ n: number; op?: { tab?: OpTab; id?: string }; people?: { source?: string; country?: string }; settings?: SettingsTab }>({ n: 0 });
  function go(to: Go) {
    setProfile(undefined);
    setEditing(false);
    setCampaignId(to.to === 'campaigns' ? to.id : undefined);
    setStart((s) => ({
      n: s.n + 1,
      op: to.to === 'inbox' ? { tab: to.tab, id: to.id } : undefined,
      people: to.to === 'visitors' ? { source: to.source, country: to.country } : undefined,
      settings: to.to === 'settings' ? to.tab : undefined,
    }));
    setScreen(to.to);
    window.scrollTo({ top: 0 });
  }
  const [replayStorage, setReplayStorage] = useState(false);
  const [replayBusy, setReplayBusy] = useState(false);
  const [dockMode, setDockMode] = useState<DockMode>(() => {
    try {
      const saved = localStorage.getItem('omer.dock');
      return saved === 'always' || saved === 'auto' ? saved : 'scroll';
    } catch { return 'scroll'; }
  });
  const createDialog = useRef<HTMLDialogElement>(null);
  const guideDialog = useRef<HTMLDialogElement>(null);
  const dashboardHeading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const pending = useRef<AbortController | null>(null);

  const project = projects.find(({ id }) => id === selection) ?? projects[0];
  const snippet = project ? installSnippet(project, window.location.origin) : '';
  const setupComplete = Boolean(project?.firstEventAt);
  const live = useLive(setupComplete ? project?.id : undefined);
  const campaignSpace = project && !isDemo(project) ? project.id : DEMO_SPACE;
  const campaignState = useDemo(campaignSpace);
  const liveCount = live.data.online;
  const inSetup = !loading && !loadError && (!setupComplete || forceSetup);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/get-session', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { user?: { name?: string; email?: string } } | null) => {
        const who = data?.user?.name?.trim() || data?.user?.email || '';
        setInitial(who.charAt(0).toUpperCase());
      })
      .catch(() => {});
    fetch('/api/config', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { replayStorage?: boolean } | null) => {
        if (data) setReplayStorage(Boolean(data.replayStorage));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.dash = '2';
    document.documentElement.dataset.dock = 'glass'; // kit setting: glass dock
    return () => { delete document.documentElement.dataset.dash; delete document.documentElement.dataset.dock; };
  }, []);

  useEffect(() => { setProfile(undefined); setCampaignId(undefined); setEditing(false); }, [project?.id]);

  useEffect(() => {
    const id = project?.id;
    if (!id || !setupComplete || screen !== 'home') return;
    const controller = new AbortController();
    let pending = false;
    async function update() {
      if (document.hidden || pending || controller.signal.aborted) return;
      pending = true;
      try {
        const [current] = await getProjects(controller.signal, id);
        if (current && !controller.signal.aborted) setAnalytics(current);
      } catch { /* keep the last snapshot */ }
      finally { pending = false; }
    }
    void update();
    const timer = window.setInterval(update, 10000);
    document.addEventListener('visibilitychange', update);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [project?.id, setupComplete, screen]);

  useEffect(() => {
    try { localStorage.setItem('omer.dock', dockMode); } catch { /* per-browser convenience only */ }
  }, [dockMode]);

  useEffect(() => {
    setCollapsed(dockMode === 'auto');
    if (inSetup || screen === 'globe' || dockMode !== 'scroll') return;
    // Kit behaviour: down hides into the page pill, a clear scroll up (or the top) brings it back.
    let last = window.scrollY;
    let travel = 0;
    function onScroll() {
      const y = window.scrollY;
      const dy = y - last;
      last = y;
      if (y < 24) { travel = 0; setCollapsed(false); return; }
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
      if (travel > 12 && !document.querySelector('.app-dock:hover')) setCollapsed(true);
      else if (travel < -40) setCollapsed(false);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [screen, inSetup, dockMode]);

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
                    setNotice('');
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

  // Inside a campaign the shelf trades the store switcher for the way back, as in the kit.
  const openCampaign = screen === 'campaigns' && project ? campaignState.campaigns.find((c) => c.id === campaignId) : undefined;
  const onProfile = screen === 'visitors' && project && profile?.projectId === project.id;
  const nested = inSetup ? undefined
    : openCampaign ? { back: 'Campaigns', title: openCampaign.name, go: () => { setCampaignId(undefined); setEditing(false); } }
    : onProfile ? { back: 'People', title: profileName || 'Profile', go: () => setProfile(undefined) }
    : screen === 'inbox' && editing ? { back: 'Opportunities', title: 'Edit email', go: () => setEditing(false) }
    : undefined;

  return (
    <div className={`app has-shelf${screen === 'globe' && !inSetup ? ' globe-mode' : ''}${nested ? ' shelf-nested' : ''}${editing && !inSetup ? ' is-editing' : ''}`} data-screen={inSetup ? 'setup' : screen}>
      <a href="#dashboard" className="skip">Skip to dashboard</a>
      <header className="app-shelf">
        <div className="app-shelf-in">
          <div className="app-shelf-l">
            <button type="button" className="app-shelf-logo" aria-label="Dashboard" onClick={() => { setScreen('home'); setForceSetup(false); }}><Icon name="ghost" /></button>
            {projects.length > 0 && (
              <ProjectMenu projects={projects} current={project?.id} onAdd={openCreate} onPick={(id) => {
                setSelection(id);
                setForceSetup(false);
                setScreen('home');
                setNotice('');
              }} />
            )}
            {nested ? <button type="button" className="app-shelf-back" aria-label={`Back to ${nested.back}`} onClick={nested.go}><Icon name="arrowLeft" /><span>{nested.back}</span></button> : null}
            {!inSetup && (nested?.title ?? WHERE[screen]) ? <span className="app-shelf-where">{nested?.title ?? WHERE[screen]}</span> : null}
          </div>
          <div className="app-shelf-r">
            <details className="omer-account" onToggle={(event) => {
              const box = event.currentTarget;
              if (!box.open) return;
              const close = (e: PointerEvent) => { if (!box.contains(e.target as Node)) { box.open = false; document.removeEventListener('pointerdown', close); } };
              document.addEventListener('pointerdown', close);
            }}>
              <summary className="app-shelf-account" aria-label="Your account"><span className="app-shelf-avatar" aria-hidden="true">{initial || <Icon name="user" />}</span></summary>
              <div className="omer-account-panel menu" role="menu">
                <button className="menu-item" role="menuitem" type="button" onClick={(e) => { e.currentTarget.closest('details')!.open = false; openCreate(); }}><Icon name="plus" />New project</button>
                <button className="menu-item" role="menuitem" type="button" onClick={(e) => { e.currentTarget.closest('details')!.open = false; openGuide(); }}><Icon name="book" />Installation guide</button>
                <button className="menu-item" role="menuitem" type="button" onClick={(e) => { e.currentTarget.closest('details')!.open = false; setScreen('settings'); setForceSetup(false); }}><Icon name="settings" />Settings</button>
                <button className="menu-item" role="menuitem" type="button" onClick={() => void onSignOut().catch(() => setNotice('Unable to sign out. Try again.'))}><Icon name="exit" />Sign out</button>
              </div>
            </details>
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
        <main id="dashboard" className={`app-body ${screen === 'home' ? 'ho v2' : screen === 'globe' ? 'globe-body' : 'v2-screen'}`}>
          {screen === 'home' && project ? (
            <DashboardV2 key={project.id} project={analytics?.id === project.id ? analytics : project} headingRef={dashboardHeading} onGo={go}
              onGlobe={() => { setLiveFocus(undefined); setScreen('globe'); }} onPeople={() => setScreen('visitors')} onInbox={() => setScreen('inbox')} onSetup={() => {
                setForceSetup(true);
                setStep('check');
                setReached(stepIndex('check'));
              }} />
          ) : screen === 'globe' && project ? (
            <LiveGlobe key={project.id} {...live} focusSeed={liveFocus} demo={isDemo(project)} />
          ) : screen === 'visitors' && project && profile?.projectId === project.id ? (
            <Profile key={profile.seed} projectId={project.id} seed={profile.seed}
              onName={setProfileName}
              onBack={() => setProfile(undefined)}
              onLive={() => { setLiveFocus(profile.seed); setProfile(undefined); setScreen('globe'); }} />
          ) : screen === 'visitors' && project ? (
            <People key={`${project.id}-${start.n}`} {...live} demo={isDemo(project)} start={start.people} onLive={() => { setLiveFocus(undefined); setScreen('globe'); }}
              onOpen={(seed) => { setProfileName(''); setProfile({ projectId: project.id, seed }); window.scrollTo({ top: 0 }); }} />
          ) : screen === 'settings' && project ? (
            <Settings key={`settings-${start.n}`} startTab={start.settings} demo={isDemo(project)} onGo={go} project={project} snippet={snippet} dockMode={dockMode} onDockMode={setDockMode}
              storageReady={replayStorage} replayBusy={replayBusy}
              onReplay={async (enabled) => {
                setReplayBusy(true);
                try {
                  const response = await fetch(`/api/projects/${project.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ replayEnabled: enabled }),
                  });
                  const data: { project?: Project; storageReady?: boolean; error?: string } = await response.json();
                  if (!response.ok) throw new Error(data.error || 'Unable to update replay');
                  if (typeof data.storageReady === 'boolean') setReplayStorage(data.storageReady);
                  if (data.project) {
                    setProjects((list) => list.map((row) => (row.id === data.project!.id ? { ...row, ...data.project } : row)));
                  }
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : 'Unable to update replay');
                } finally {
                  setReplayBusy(false);
                }
              }}
              onCopy={(kind) => void copy(kind)} onGuide={openGuide} onSetup={() => {
                setForceSetup(true);
                setStep('install');
                setReached((value) => Math.max(value, stepIndex('install')));
              }} />
          ) : screen === 'inbox' && project ? (
            <Opportunities key={`${project.id}-${start.n}`} start={start.op} demo={isDemo(project)} editing={editing} onEdit={setEditing}
              onPeople={() => setScreen('visitors')} onBack={() => setScreen('home')} />
          ) : screen === 'campaigns' && project ? (
            <Campaigns key={project.id} space={campaignSpace} storeName={project.name} openId={campaignId} editing={editing}
              onOpen={(id) => { setCampaignId(id); setEditing(false); window.scrollTo({ top: 0 }); }} onEdit={(on) => { setEditing(on); window.scrollTo({ top: 0 }); }} onBack={() => setScreen('home')} />
          ) : screen === 'results' && project ? (
            <Results key={project.id} project={analytics?.id === project.id ? analytics : project} demo={isDemo(project)}
              onCampaign={(id) => { setCampaignId(id); setEditing(false); setScreen('campaigns'); window.scrollTo({ top: 0 }); }}
              onCampaigns={() => { setCampaignId(undefined); setEditing(false); setScreen('campaigns'); window.scrollTo({ top: 0 }); }} />
          ) : (
            <div className="v2-empty-screen">
              <h1 className="v2-title">{WHERE[screen] || 'Soon'}</h1>
              <section className="v2-card">
                <div className="v2-in omer-soon">
                  <div className="empty">
                    <span className="empty-ico"><Icon name={DOCK.find(({ id }) => id === screen)?.icon ?? 'inbox'} /></span>
                    <h4>
                      {screen === 'inbox' && 'No opportunities yet'}
                      {screen === 'campaigns' && 'No campaigns yet'}
                      {screen === 'results' && 'No results yet'}
                    </h4>
                    <p>
                      {screen === 'inbox' && 'Moments where a follow-up would help show up here once email drafting is connected.'}
                      {screen === 'campaigns' && 'Follow-up recipes and their sends live here once the email engine ships.'}
                      {screen === 'results' && 'Revenue from follow-up emails shows up here once campaigns start sending.'}
                    </p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setScreen('home')}>Back to Dashboard</button>
                  </div>
                </div>
              </section>
            </div>
          )}
          <div className={notice ? 'notice v2-notice' : 'sr-only'} role="status">{notice}</div>
        </main>
      )}

      <Toasts />
      {!inSetup && !editing && (
        <Dock
          items={DOCK.map((item) => (item.live ? { ...item, count: liveCount } : item))}
          current={screen}
          collapsed={collapsed && dockMode !== 'always'}
          onReveal={() => setCollapsed(false)}
          onLeave={() => { if (dockMode === 'auto') setCollapsed(true); }}
          onPick={(id) => {
            if (id === 'globe') setLiveFocus(undefined);
            if (id !== 'visitors') setProfile(undefined);
            setCampaignId(undefined);
            setEditing(false);
            setStart((s) => ({ n: s.n + 1 }));
            setScreen(id);
            if (dockMode !== 'auto') setCollapsed(false);
            window.scrollTo({ top: 0 });
          }}
        />
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
              <p>Visit the exact website address in your project and grant analytics consent. Return here to see visitors, page views, sources, pages, and visit duration. The tracker only runs after consent and does not send form or identity data.</p>
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
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <AuthGate>{(onSignOut) => <App onSignOut={onSignOut} />}</AuthGate>,
);
