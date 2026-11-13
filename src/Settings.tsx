/* Settings: pill tabs on top, then plain rows: a label and its value, nothing else. Brand knowledge first
   (folders with everything emails are written with), then the store's setup, website changes, monitored
   pages, sending and privacy. The dock's behaviour lives in the account menu. */
import { useState } from 'react';
import type { Project } from './project';
import { Icon } from './ui/Icon';
import { useSlidingPill } from './ui/useSlidingPill';
import { BrandKnowledge, MonitoringSection } from './BrandKnowledge';
import { DEMO_BRAND_SPACE, updateBrand, useBrand } from './brandStore';
import { DemoChanges, DemoPrivacy, DemoSending, useDemoSettingsCounts } from './DemoSettings';
import type { Go } from './DashboardV2';

export type DockMode = 'always' | 'scroll' | 'auto';
/** 'company' is the Store tab (kept as the id so older links still land there). */
export type SettingsTab = 'brand' | 'company' | 'changes' | 'monitoring' | 'sending' | 'privacy';
type Tab = SettingsTab;

export const DOCK_MODES: { id: DockMode; label: string }[] = [
  { id: 'always', label: 'Always show' },
  { id: 'scroll', label: 'Hide on scroll' },
  { id: 'auto', label: 'Always hidden' },
];

function Row({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`set-row${wide ? ' wide' : ''}`}>
      <div className="set-k"><b>{title}</b></div>
      <div className="set-v">{children}</div>
    </div>
  );
}

const Soon = () => <span className="status-pill">Soon</span>;

export function Settings({ project, topPages, snippet, onCopy, onGuide, startTab, demo = false, onGo }: {
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
  const tabs: { id: Tab; title: string; badge?: number }[] = [
    { id: 'brand', title: 'Brand knowledge', badge: demo ? counts.company : 0 },
    { id: 'company', title: 'Store' },
    { id: 'changes', title: 'Website changes', badge: demo ? counts.changes : changeRows.length },
    { id: 'monitoring', title: 'Monitoring' },
    { id: 'sending', title: 'Sending' },
    { id: 'privacy', title: 'Privacy' },
  ];

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
          {demo && tab === 'privacy' && <DemoPrivacy />}
          {tab === 'company' && (
            <div className="set-main solo">
              <Row title="Name"><span className="omer-set-val">{project.name}</span></Row>
              <Row title="Website">
                <a className="omer-set-link" href={project.origin} target="_blank" rel="noreferrer">{host}<Icon name="arrowUpRight" /></a>
              </Row>
              <Row title="Tracking">
                <span className={`status-pill ${project.firstEventAt ? 'received' : ''}`}><span className="lvp-dot" aria-hidden="true" />{project.firstEventAt ? 'Live' : 'Not installed'}</span>
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
          {!demo && tab === 'sending' && (
            <div className="set-main solo">
              <Row title="From name"><Soon /></Row>
              <Row title="From email"><Soon /></Row>
              <Row title="Daily limit"><Soon /></Row>
              <Row title="Quiet hours"><Soon /></Row>
            </div>
          )}
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
