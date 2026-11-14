/* Settings: pill tabs on top, then plain rows: a label and its value, nothing else. Brand knowledge first
   (folders with everything emails are written with), then the store's setup, website changes, monitored
   pages, sending and privacy. The dock's behaviour lives in the account menu. */
import { useCallback, useEffect, useState } from 'react';
import type { Project } from './project';
import { Icon } from './ui/Icon';
import { useSlidingPill } from './ui/useSlidingPill';
import { BrandKnowledge, MonitoringSection } from './BrandKnowledge';
import { DEMO_BRAND_SPACE, updateBrand, useBrand } from './brandStore';
import { DemoChanges, DemoPrivacy, DemoSending, useDemoSettingsCounts } from './DemoSettings';
import { DemoIntegrations, ProjectIntegrations } from './ProjectIntegrations';
import { ProjectSending } from './ProjectSending';
import { ConnectAI } from './ConnectAI';
import { toast } from './ui/toast';
import type { Go } from './DashboardV2';

export type DockMode = 'always' | 'scroll' | 'auto';
/** 'company' is the Store tab (kept as the id so older links still land there). */
export type SettingsTab = 'brand' | 'company' | 'changes' | 'monitoring' | 'sending' | 'integrations' | 'privacy';
type Tab = SettingsTab;

export const DOCK_MODES: { id: DockMode; label: string }[] = [
  { id: 'always', label: 'Always show' },
  { id: 'scroll', label: 'Hide on scroll' },
  { id: 'auto', label: 'Always hidden' },
];

const CURRENCY_OPTIONS = [
  { value: 'auto', label: 'Auto', flag: null as string | null },
  { value: 'usd', label: 'USD', flag: 'us' },
  { value: 'eur', label: 'EUR', flag: 'eu' },
  { value: 'gbp', label: 'GBP', flag: 'gb' },
  { value: 'cad', label: 'CAD', flag: 'ca' },
  { value: 'aud', label: 'AUD', flag: 'au' },
  { value: 'sek', label: 'SEK', flag: 'se' },
  { value: 'nok', label: 'NOK', flag: 'no' },
  { value: 'dkk', label: 'DKK', flag: 'dk' },
  { value: 'pln', label: 'PLN', flag: 'pl' },
  { value: 'chf', label: 'CHF', flag: 'ch' },
  { value: 'jpy', label: 'JPY', flag: 'jp' },
];

function currencyFlag(code: string | null | undefined): string | null {
  const hit = CURRENCY_OPTIONS.find((o) => o.value === (code || '').toLowerCase());
  return hit?.flag ?? null;
}

type Usage = {
  pageviews: number;
  purchases: number;
  identifies: number;
  emailOpens: number;
  emailClicks: number;
  total: number;
  days: { day: string; pageviews: number }[];
};

function Row({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`set-row${wide ? ' wide' : ''}`}>
      <div className="set-k"><b>{title}</b></div>
      <div className="set-v">{children}</div>
    </div>
  );
}

export function Settings({ project, topPages, snippet, onCopy, onGuide, startTab, demo = false, onGo, onProjectUpdate, onReplay, storageReady = true, replayBusy = false }: {
  startTab?: Tab;
  /** The demo store shows the kit's full example Settings. */
  demo?: boolean;
  onGo?: (go: Go) => void;
  project: Project;
  /** The store's most-visited pages, offered as pages to monitor. */
  topPages?: { path: string; count: number }[];
  snippet: string;
  onCopy: (kind: 'script' | 'prompt') => void;
  onGuide: () => void;
  onSetup: () => void;
  onReplay?: (enabled: boolean) => void;
  onProjectUpdate?: (project: Project) => void;
  storageReady?: boolean;
  replayBusy?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(startTab ?? 'brand');
  const tabPill = useSlidingPill<HTMLElement>(tab);
  const host = (() => { try { return new URL(project.origin).host; } catch { return project.origin; } })();
  const counts = useDemoSettingsCounts();
  const space = demo ? DEMO_BRAND_SPACE : project.id;
  const brand = useBrand(space);
  const changeRows = (brand.changes || []).filter((c) => !c.seen);
  const [name, setName] = useState(project.name);
  const [currencyChoice, setCurrencyChoice] = useState(project.displayCurrency || 'auto');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [storeBusy, setStoreBusy] = useState(false);

  useEffect(() => {
    setName(project.name);
    setCurrencyChoice(project.displayCurrency || 'auto');
  }, [project.id, project.name, project.displayCurrency]);

  const loadUsage = useCallback(async () => {
    if (demo) {
      setUsage({
        pageviews: 4,
        purchases: 0,
        identifies: 0,
        emailOpens: 0,
        emailClicks: 0,
        total: 4,
        days: [
          { day: '2026-11-10', pageviews: 4 },
          { day: '2026-11-11', pageviews: 0 },
        ],
      });
      return;
    }
    const res = await fetch(`/api/projects/${project.id}/usage`);
    const data = await res.json().catch(() => ({})) as { usage?: Usage; error?: string };
    if (!res.ok || !data.usage) throw new Error(data.error || 'Could not load usage');
    setUsage(data.usage);
  }, [demo, project.id]);

  useEffect(() => {
    if (tab !== 'company') return;
    void loadUsage().catch((error) => toast(error instanceof Error ? error.message : 'Could not load usage', { kind: 'warn' }));
  }, [tab, loadUsage]);

  const patchStore = async (body: { name?: string; displayCurrency?: string | null }) => {
    if (demo || storeBusy) return;
    setStoreBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as { project?: Project; error?: string };
      if (!res.ok || !data.project) throw new Error(data.error || 'Save failed');
      onProjectUpdate?.(data.project);
      toast('Saved');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Save failed', { kind: 'warn' });
    } finally {
      setStoreBusy(false);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(project.writeKey);
      toast('Copied');
    } catch {
      toast('Could not copy', { kind: 'warn' });
    }
  };

  const tabs: { id: Tab; title: string; badge?: number }[] = [
    { id: 'brand', title: 'Brand knowledge', badge: demo ? counts.company : 0 },
    { id: 'company', title: 'Store' },
    { id: 'changes', title: 'Website changes', badge: demo ? counts.changes : changeRows.length },
    { id: 'monitoring', title: 'Monitoring' },
    { id: 'sending', title: 'Sending' },
    { id: 'integrations', title: 'Integrations' },
    { id: 'privacy', title: 'Privacy' },
  ];

  const maxBar = Math.max(1, ...(usage?.days || []).map((d) => d.pageviews));
  const emailEvents = (usage?.emailOpens || 0) + (usage?.emailClicks || 0);

  return (
    <div className="omer-settings st-page">
      <header className="st-top">
        <h1 className="sr-only">Settings</h1>
        <nav className="pill-tabs st-tabs" aria-label="Settings sections" ref={tabPill}>
          {tabs.map((item) => (
            <button key={item.id} type="button" className="ib-tab" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
              {item.title}{item.badge ? <span>{item.badge}</span> : null}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'brand' ? (
        <BrandKnowledge key={project.id} space={space} host={host} demo={demo} />
      ) : tab === 'monitoring' ? (
        <MonitoringSection key={project.id} space={space} host={host} topPages={topPages ?? []} onChanges={() => setTab('changes')} />
      ) : (
      <div className="st-body omer-rows-in" key={tab}>
        <div className="set-sheet">
          {demo && tab === 'changes' && <DemoChanges onGo={onGo} />}
          {demo && tab === 'sending' && <DemoSending />}
          {demo && tab === 'integrations' && <><DemoIntegrations /><ConnectAI /></>}
          {demo && tab === 'privacy' && <DemoPrivacy />}
          {tab === 'company' && (
            <>
              <div className="set-main">
                <Row title="Name">
                  <input
                    className="input"
                    value={name}
                    maxLength={80}
                    disabled={storeBusy || demo}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                      if (demo || name.trim() === project.name) return;
                      void patchStore({ name: name.trim() });
                    }}
                  />
                </Row>
                <Row title="Website">
                  <a className="omer-set-link" href={project.origin} target="_blank" rel="noreferrer">{host}<Icon name="arrowUpRight" /></a>
                </Row>
                <Row title="Project token" wide>
                  <div className="su-code omer-set-snippet">
                    <pre>{project.writeKey}</pre>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => void copyToken()}><Icon name="copy" />Copy</button>
                  </div>
                </Row>
                <Row title="Currency">
                  <span className="set-currency">
                    {(() => {
                      const flag = currencyChoice === 'auto'
                        ? currencyFlag(project.currency)
                        : currencyFlag(currencyChoice);
                      return flag
                        ? <span className="flag" aria-hidden="true"><img src={`/assets/flags/${flag}.svg`} alt="" draggable={false} /></span>
                        : null;
                    })()}
                    <span className="cpe-select-wrap">
                      <select
                        className="select"
                        aria-label="Display currency"
                        value={currencyChoice}
                        disabled={storeBusy || demo}
                        onChange={(e) => {
                          const value = e.target.value;
                          setCurrencyChoice(value);
                          void patchStore({ displayCurrency: value === 'auto' ? null : value });
                        }}
                      >
                        {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <Icon name="chevronDown" />
                    </span>
                    {currencyChoice === 'auto' ? (
                      <span className="set-currency-hint">{(project.currency || 'usd').toUpperCase()}</span>
                    ) : null}
                  </span>
                </Row>
                <Row title="Tracking">
                  <span className={`status-pill ${project.firstEventAt ? 'received' : ''}`}><span className="lvp-dot" aria-hidden="true" />{project.firstEventAt ? 'Live' : 'Not installed'}</span>
                </Row>
                <Row title="Session replay">
                  {!storageReady ? (
                    <span className="omer-set-val">Storage not configured on this server</span>
                  ) : project.replayEnabled ? (
                    <span className="status-pill received"><Icon name="checkCircle" />On</span>
                  ) : (
                    <span className="omer-set-acts">
                      <span className="status-pill"><Icon name="alert" />Off</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={demo || replayBusy || !onReplay}
                        onClick={() => onReplay?.(true)}
                      >
                        Turn on
                      </button>
                    </span>
                  )}
                </Row>
                <Row title="Install script" wide>
                  <div className="su-code omer-set-snippet"><pre>{snippet}</pre>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => onCopy('script')}><Icon name="copy" />Copy</button>
                  </div>
                </Row>
                <Row title="Install prompt">
                  <span className="omer-set-acts">
                    <button className="btn btn-ghost btn-sm" type="button" onClick={onGuide}><Icon name="book" />Guide</button>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => onCopy('prompt')}><Icon name="copy" />Copy</button>
                  </span>
                </Row>
              </div>
              <aside className="set-side">
                <div className="set-side-in">
                  <div className="set-side-k">Usage</div>
                  <p className="set-send-lede">Events this calendar month.</p>
                  {usage?.days?.length ? (
                    <div className="set-usage-bars" aria-hidden="true">
                      {usage.days.map((d) => (
                        <i key={d.day} style={{ height: `${Math.max(4, (d.pageviews / maxBar) * 100)}%` }} title={d.day} />
                      ))}
                    </div>
                  ) : null}
                  {usage ? (
                    <ul className="set-usage">
                      <li><span><i className="set-usage-dot" style={{ ['--c' as string]: '#4F7CFF' }} />Pageview</span><span>{usage.pageviews}</span></li>
                      <li><span><i className="set-usage-dot" style={{ ['--c' as string]: '#22A06B' }} />Transaction</span><span>{usage.purchases}</span></li>
                      <li><span><i className="set-usage-dot" style={{ ['--c' as string]: '#F5A524' }} />Identify</span><span>{usage.identifies}</span></li>
                      <li><span><i className="set-usage-dot" style={{ ['--c' as string]: '#8B5CF6' }} />Email</span><span>{emailEvents}</span></li>
                      <li><span><i className="set-usage-dot" style={{ ['--c' as string]: '#94A3B8' }} />Total</span><span>{usage.total}</span></li>
                    </ul>
                  ) : (
                    <p className="omer-set-note">Loading…</p>
                  )}
                </div>
              </aside>
            </>
          )}
          {!demo && tab === 'changes' && (
            <div className="set-main solo">
              {changeRows.length ? (
                <ul className="set-change-list">
                  {changeRows.map((c) => (
                    <li key={c.id} className="set-change-row">
                      <span className="set-change-copy">
                        <b>{c.path}</b>
                        <small>{c.summary}</small>
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => updateBrand(space, (b) => ({
                          ...b,
                          changes: (b.changes || []).map((x) => (x.id === c.id ? { ...x, seen: true } : x)),
                        }))}
                      >
                        Mark seen
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty omer-set-empty">
                  <span className="empty-ico"><Icon name="checkCircle" /></span>
                  <h4>Nothing to review</h4>
                  <p>When monitored pages change, they show up here.</p>
                </div>
              )}
            </div>
          )}
          {!demo && tab === 'sending' && <ProjectSending projectId={project.id} />}
          {!demo && tab === 'integrations' && <><ProjectIntegrations projectId={project.id} /><ConnectAI /></>}
          {!demo && tab === 'privacy' && (
            <div className="set-main solo">
              <Row title="Consent"><span className="status-pill received"><Icon name="check" />Required</span></Row>
              <Row title="Location"><span className="omer-set-val">City</span></Row>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
