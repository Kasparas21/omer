import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, BookOpen, Check, ChevronDown, CodeXml, Copy, Globe2, LayoutDashboard, Plus, RefreshCw, X } from 'lucide-react';
import { installPrompt, installSnippet, type Project } from './project';
import './styles.css';

type ProjectError = { field?: 'name' | 'website'; error: string };

function Ghost({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 19.5v-9a7 7 0 0 1 14 0v9q-1.75-2-3.5 0q-1.75-2-3.5 0q-1.75-2-3.5 0q-1.75-2-3.5 0z" />
    <ellipse cx="9.6" cy="11" rx="1.1" ry="1.5" fill="currentColor" stroke="none" />
    <ellipse cx="14.4" cy="11" rx="1.1" ry="1.5" fill="currentColor" stroke="none" />
  </svg>;
}

async function getProjects(signal?: AbortSignal) {
  const response = await fetch('/api/projects', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load projects.');
  const data: { projects: Project[] } = await response.json();
  return data.projects;
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selection, setSelection] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ProjectError>();
  const [notice, setNotice] = useState('');
  const [manualCopy, setManualCopy] = useState<'script' | 'prompt'>();
  const createDialog = useRef<HTMLDialogElement>(null);
  const guideDialog = useRef<HTMLDialogElement>(null);
  const dashboardHeading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const pending = useRef<AbortController | null>(null);

  const project = projects.find(({ id }) => id === selection) ?? projects[0];
  const snippet = project ? installSnippet(project, window.location.origin) : '';

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
      if (interactive) {
        const selected = current.find(({ id }) => id === project?.id);
        setNotice(selected?.firstEventAt ? 'First event received.' : 'Still waiting for the first event.');
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
    void refresh();
    return () => pending.current?.abort();
  }, []);

  useEffect(() => {
    if (!project || project.firstEventAt) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !checking && !saving) void refresh();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [project?.id, project?.firstEventAt, checking, saving]);

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
      setNotice('Project created.');
      createDialog.current?.close();
      requestAnimationFrame(() => dashboardHeading.current?.focus());
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

  return <>
    <a href="#dashboard" className="skip">Skip to dashboard</a>
    <header className="top">
      <div className="top-inner">
        <a href="/" className="wordmark"><span className="brand-icon"><Ghost size={22} /></span>Unfair Weekend</a>
        {projects.length > 0 && <label className="project-picker">
          <Globe2 size={16} aria-hidden="true" />
          <select aria-label="Current project" value={project?.id} onChange={(event) => {
            setSelection(event.target.value);
            setNotice('');
          }}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <ChevronDown className="select-arrow" size={15} aria-hidden="true" />
        </label>}
        <button className="button secondary new-project" onClick={openCreate}><Plus size={17} aria-hidden="true" /> New project</button>
      </div>
    </header>

    <main id="dashboard" className="dashboard">
      <header className="page-head">
        <h1 tabIndex={-1} ref={dashboardHeading}>Dashboard</h1>
        <p>{project ? new URL(project.origin).host : 'Connect your website to start collecting events.'}</p>
      </header>

      {loading ? <div className="empty-card"><p role="status">Loading projects…</p></div> :
        loadError && !project ? <div className="empty-card">
          <h2>Unable to load projects</h2>
          <p>Try again to see your dashboard.</p>
          <button className="button secondary" onClick={() => void refresh(true)} disabled={checking}>Try again</button>
        </div> : !project ? <section className="empty-card">
          <span className="feature-icon"><Globe2 size={26} aria-hidden="true" /></span>
          <h2>Connect your website</h2>
          <p>Create a project to get your tracking script and confirm your first event.</p>
          <button className="button primary" onClick={openCreate}><Plus size={18} aria-hidden="true" /> Add a project</button>
        </section> : <div className="setup-grid">
          <section className="install-card" aria-labelledby="install-heading">
            <div className="feature-icon"><CodeXml size={24} aria-hidden="true" /></div>
            <h2 id="install-heading">Install the tracking script</h2>
            <p>Add the script to the shared head of <strong>{new URL(project.origin).host}</strong>. If you’re using a coding assistant, paste the install prompt into it.</p>
            <div className="snippet">
              <div className="snippet-bar"><span>HTML</span><button className="button compact" onClick={() => void copy('script')}><Copy size={15} aria-hidden="true" /> Copy script</button></div>
              <pre><code>{snippet}</code></pre>
            </div>
            <div className="install-actions">
              <button className="button primary" onClick={() => void copy('prompt')}><Copy size={17} aria-hidden="true" /> Copy install prompt</button>
              <button className="button text-button" onClick={openGuide}>Installation guide <ArrowUpRight size={16} aria-hidden="true" /></button>
            </div>
          </section>
          <section className="activity-card" aria-labelledby="activity-heading">
            <div className="activity-art" aria-hidden="true">
              <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
              <span className="signal signal-one" /><span className="signal signal-two" /><span className="signal signal-three" />
              <div className="ghost-tile"><Ghost size={52} /></div>
            </div>
            <div className="activity-body">
              <div className={`status-pill${project.firstEventAt ? ' received' : ''}`}>{project.firstEventAt ? <Check size={14} aria-hidden="true" /> : <span aria-hidden="true" />} {project.firstEventAt ? 'Connected' : 'Awaiting installation'}</div>
              <h2 id="activity-heading">{project.firstEventAt ? 'First event received' : 'Waiting for events'}</h2>
              <p>{project.firstEventAt ? <>Received on <time dateTime={project.firstEventAt}>{new Date(project.firstEventAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>.</> :
                'After installing the script, visit your site and grant analytics consent to send the first event.'}</p>
              {!project.firstEventAt && <button className="button secondary" disabled={checking} onClick={() => void refresh(true)}>
                <RefreshCw size={16} aria-hidden="true" /> {checking ? 'Checking…' : 'Check installation'}
              </button>}
              {loadError && <p className="error-text">Unable to check installation. Try again.</p>}
            </div>
          </section>
        </div>}
      <div className={notice ? 'notice' : 'sr-only'} role="status">{notice}</div>
    </main>

    <nav className="dock" aria-label="Dashboard tools">
      <a href="#dashboard" className="dock-item active" aria-label="Dashboard" aria-current="page" title="Dashboard"><LayoutDashboard size={20} aria-hidden="true" /></a>
      <button className="dock-item" aria-label="Installation guide" title="Installation guide" onClick={openGuide}><BookOpen size={20} aria-hidden="true" /></button>
    </nav>

    <dialog ref={createDialog} className="dialog" aria-labelledby="create-heading" onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <div className="dialog-content">
        <button className="icon-button close" type="button" aria-label="Close new project" disabled={saving} onClick={() => createDialog.current?.close()}><X size={19} aria-hidden="true" /></button>
        <span className="feature-icon"><Globe2 size={24} aria-hidden="true" /></span>
        <h2 id="create-heading">Add a project</h2>
        <p>Enter a website you own or manage.</p>
        <form ref={form} onSubmit={createProject}>
          <label htmlFor="project-name">Project name</label>
          <input id="project-name" name="name" placeholder="Example Store" required maxLength={80} autoFocus aria-invalid={error?.field === 'name'} aria-describedby={error?.field === 'name' ? 'name-error' : undefined} />
          {error?.field === 'name' && <p id="name-error" className="error-text" role="alert">{error.error}</p>}
          <label htmlFor="project-site">Website address</label>
          <input id="project-site" name="website" placeholder="https://example.com" required maxLength={500} inputMode="url" autoCapitalize="none" spellCheck={false} aria-invalid={error?.field === 'website'} aria-describedby={error?.field === 'website' ? 'website-error' : undefined} />
          {error?.field === 'website' && <p id="website-error" className="error-text" role="alert">{error.error}</p>}
          {error && !error.field && <p className="error-text" role="alert">{error.error}</p>}
          <button className="button primary submit" disabled={saving}>{saving ? 'Creating project…' : 'Create project'}</button>
        </form>
      </div>
    </dialog>

    <dialog ref={guideDialog} className="dialog guide" aria-labelledby="guide-heading">
      <div className="dialog-content">
        <button className="icon-button close" type="button" aria-label="Close installation guide" autoFocus onClick={() => guideDialog.current?.close()}><X size={19} aria-hidden="true" /></button>
        <span className="feature-icon"><BookOpen size={23} aria-hidden="true" /></span>
        <h2 id="guide-heading">Installation guide</h2>
        {manualCopy && project && <div className="manual-copy">
          <label htmlFor="manual-copy">{manualCopy === 'script' ? 'Copy the script manually' : 'Copy the install prompt manually'}</label>
          <textarea id="manual-copy" readOnly rows={5} value={manualCopy === 'script' ? snippet : installPrompt(project, window.location.origin)} />
        </div>}
        <ol className="guide-steps">
          <li><strong>Add your script</strong><p>Paste the project script into the shared <code>&lt;head&gt;</code> of your site. In a framework, use the root document or its script component. Add it once across your site.</p></li>
          <li><strong>Connect analytics consent</strong><p>After the script loads, call this from your consent banner when analytics consent is granted. Call it again with <code>analytics: false</code> if consent is withdrawn.</p><pre><code>{'window.unfairweekend.consent({ analytics: true });'}</code></pre></li>
          <li><strong>Check your installation</strong><p>Visit the exact website address in your project and grant analytics consent. Return to the dashboard to see your first event. The tracker sends a single installation signal without cookies or form data.</p></li>
        </ol>
        {project && <button className="button primary" onClick={() => void copy('script')}><Copy size={17} aria-hidden="true" /> Copy script</button>}
        <p role="status" className="guide-notice">{notice}</p>
      </div>
    </dialog>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
