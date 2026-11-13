/* Settings: sliding pill tabs on top, Brand knowledge first (glass folders with everything Ghost writes
   emails with), then the other sections in their sheet with side notes. */
import { useState } from 'react';
import type { Project } from './project';
import { Icon } from './ui/Icon';
import { useThumb } from './ui/useThumb';
import { useSlidingPill } from './ui/useSlidingPill';
import { BrandKnowledge } from './BrandKnowledge';
import { DEMO_BRAND_SPACE } from './brandStore';
import { DemoChanges, DemoCompany, DemoPrivacy, DemoSending, useDemoSettingsCounts } from './DemoSettings';
import type { Go } from './DashboardV2';

export type DockMode = 'always' | 'scroll' | 'auto';
export type SettingsTab = 'brand' | 'company' | 'changes' | 'sending' | 'privacy' | 'dock';
type Tab = SettingsTab;

const DOCK_MODES: { id: DockMode; label: string }[] = [
  { id: 'always', label: 'Always show' },
  { id: 'scroll', label: 'Hide on scroll' },
  { id: 'auto', label: 'Always hidden' },
];

function Row({ title, hint, children, wide }: { title: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`set-row${wide ? ' wide' : ''}`}>
      <div className="set-k"><b>{title}</b>{hint && <small>{hint}</small>}</div>
      <div className="set-v">{children}</div>
    </div>
  );
}

const Soon = () => <span className="status-pill">Coming next</span>;

export function Settings({ project, topPages, snippet, dockMode, onDockMode, onCopy, onGuide, onSetup, startTab, demo = false, onGo, onReplay, storageReady = false, replayBusy = false }: {
  startTab?: Tab;
  /** The demo store shows the kit's full example Settings. */
  demo?: boolean;
  onGo?: (go: Go) => void;
  project: Project;
  /** The store's most-visited pages, offered as pages to monitor. */
  topPages?: { path: string; count: number }[];
  snippet: string;
  dockMode: DockMode;
  onDockMode: (mode: DockMode) => void;
  onCopy: (kind: 'script' | 'prompt') => void;
  onGuide: () => void;
  onSetup: () => void;
  onReplay?: (enabled: boolean) => void;
  storageReady?: boolean;
  replayBusy?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(startTab ?? 'brand');
  const tabPill = useSlidingPill<HTMLElement>(tab);
  const seg = useThumb<HTMLDivElement>('button[aria-pressed="true"]', `${tab}:${dockMode}`, true);
  const host = (() => { try { return new URL(project.origin).host; } catch { return project.origin; } })();
  const counts = useDemoSettingsCounts();
  const replayOn = Boolean(project.replayEnabled);
  const tabs: { id: Tab; title: string; badge?: number }[] = [
    { id: 'brand', title: 'Brand knowledge' },
    { id: 'company', title: 'Company', badge: demo ? counts.company : 0 },
    { id: 'changes', title: 'Website changes', badge: demo ? counts.changes : 0 },
    { id: 'sending', title: 'Sending' },
    { id: 'privacy', title: 'Privacy' },
    { id: 'dock', title: 'Dock' },
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
        <BrandKnowledge key={project.id} space={demo ? DEMO_BRAND_SPACE : project.id} host={host} topPages={topPages ?? []} onChanges={() => setTab('changes')} />
      ) : (
      <div className="st-body omer-rows-in" key={tab}>
        <div className="set-sheet">
          {demo && tab === 'company' && <DemoCompany onGo={onGo} />}
          {demo && tab === 'changes' && <DemoChanges onGo={onGo} />}
          {demo && tab === 'sending' && <DemoSending />}
          {demo && tab === 'privacy' && <DemoPrivacy />}
          {!demo && tab === 'company' && <>
            <div className="set-main">
              <header className="set-head"><h2>Company</h2></header>
              <Row title="Name" hint="Shown in the switcher at the top"><span className="omer-set-val">{project.name}</span></Row>
              <Row title="Website" hint="Events are accepted only from this exact address">
                <a className="omer-set-link" href={project.origin} target="_blank" rel="noreferrer">{project.origin}<Icon name="arrowUpRight" /></a>
              </Row>
              <Row title="Tracking" hint="The first consented page view turns this on">
                <span className={`status-pill ${project.firstEventAt ? 'received' : ''}`}><span className="lvp-dot" aria-hidden="true" />{project.firstEventAt ? 'Receiving events' : 'Waiting for install'}</span>
              </Row>
              <Row title="Install script" hint={`Once, in the shared head of ${host}`} wide>
                <div className="su-code omer-set-snippet"><pre>{snippet}</pre>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => onCopy('script')}><Icon name="copy" />Copy</button>
                </div>
              </Row>
              <Row title="Coding assistant" hint="A ready prompt that installs it and wires consent">
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => onCopy('prompt')}><Icon name="copy" />Copy install prompt</button>
              </Row>
            </div>
            <aside className="set-side"><div className="set-side-in">
              <div className="set-side-k">Brand DNA</div>
              <p className="su-side-p">Logo, colours, voice and products read from {host}, so drafts sound like you.</p>
              <Soon />
              <div className="set-side-k gap">Setup</div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={onSetup}><Icon name="list" />First-time setup</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={onGuide}><Icon name="book" />Installation guide</button>
            </div></aside>
          </>}
          {!demo && tab === 'changes' && (
            <div className="set-main solo">
              <header className="set-head"><h2>Website changes</h2></header>
              <div className="empty omer-set-empty">
                <span className="empty-ico"><Icon name="checkCircle" /></span>
                <h4>Nothing to review</h4>
                <p>When prices, codes or products on {host} change, the facts emails rely on show up here to check.</p>
              </div>
            </div>
          )}
          {!demo && tab === 'sending' && <>
            <div className="set-main">
              <header className="set-head"><h2>Sending</h2></header>
              <Row title="Sent by" hint="The name people see in their inbox"><Soon /></Row>
              <Row title="Sent from" hint="Replies come back here"><Soon /></Row>
              <Row title="Daily limit" hint="Across all your emails"><Soon /></Row>
              <Row title="Quiet hours" hint="In each person’s own time zone"><Soon /></Row>
            </div>
            <aside className="set-side"><div className="set-side-in">
              <div className="set-side-k">Today</div>
              <p className="omer-set-note">No emails are sent until a sending domain is connected.</p>
            </div></aside>
          </>}
          {!demo && tab === 'privacy' && <>
            <div className="set-main">
              <header className="set-head"><h2>Privacy</h2></header>
              <Row title="Analytics consent" hint="Nothing is recorded until the visitor allows analytics">
                <span className="status-pill received"><Icon name="check" />Required</span>
              </Row>
              <Row title="Session replay" hint={storageReady
                ? 'Masked rrweb recordings, kept for 7 days. Inputs and checkout fields stay blocked.'
                : 'Needs Cloudflare R2 storage on the server before it can turn on.'}>
                {storageReady ? (
                  <button
                    type="button"
                    className={`status-pill${replayOn ? ' received' : ''}`}
                    disabled={replayBusy || !onReplay}
                    onClick={() => onReplay?.(!replayOn)}
                    aria-pressed={replayOn}
                  >
                    {replayBusy ? 'Saving…' : replayOn ? 'On' : 'Off'}
                  </button>
                ) : <span className="status-pill">Storage not configured</span>}
              </Row>
              <Row title="Location" hint="City and country from the request, never the IP address"><span className="omer-set-val">City level</span></Row>
              <Row title="Purchase events" hint="Call window.unfairweekend.purchase on thank-you pages">
                <span className="omer-set-val">amount, currency, orderId</span>
              </Row>
              <Row title="Identify" hint="Call window.unfairweekend.identify when you know the shopper">
                <span className="omer-set-val">email, name</span>
              </Row>
              <Row title="Email performance" hint="Open/click ingest only — Unfair Weekend does not send yet">
                <span className="omer-set-val">emailOpen / emailClick</span>
              </Row>
            </div>
            <aside className="set-side"><div className="set-side-in">
              <div className="set-side-k">What we keep</div>
              <ul className="set-list"><li>Pages they looked at</li><li>Where they came from</li><li>How long they stayed</li><li>Purchases and identified email when you send them</li><li>Email open and click events you report</li>{replayOn && <li>Masked session recordings for 7 days</li>}</ul>
              <div className="set-side-k gap">What we never keep</div>
              <ul className="set-list no"><li>IP addresses</li><li>Passwords or card numbers</li><li>Anything typed in a form</li>{!replayOn && <li>Session recordings while replay is off</li>}</ul>
            </div></aside>
          </>}
          {tab === 'dock' && (
            <div className="set-main solo">
              <header className="set-head"><h2>Dock</h2></header>
              <Row title="Bottom dock" hint="Hidden: move near it or tap it to bring it back" wide>
                <div className="seg has-thumb" role="group" aria-label="Dock behavior" ref={seg.host}>
                  <span className="seg-thumb" ref={seg.thumb} aria-hidden="true" />
                  {DOCK_MODES.map((mode) => (
                    <button key={mode.id} type="button" aria-pressed={dockMode === mode.id} onClick={() => onDockMode(mode.id)}>{mode.label}</button>
                  ))}
                </div>
              </Row>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
