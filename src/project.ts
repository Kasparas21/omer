export type DayCount = { day: string; count: number };
export type DayDwell = { day: string; avgMs: number };
export type NamedCount = { name: string; count: number };
export type PathCount = { path: string; count: number };
export type HourCount = { hour: string; views: number; people: number };
export type ProductStat = { name: string; count: number; revenue: number };
export type CampaignStat = { name: string; revenue: number; count: number };
export type NamedRevenue = { name: string; revenue: number };
export type PathRevenue = { path: string; revenue: number };

export type Project = {
  id: string;
  name: string;
  origin: string;
  writeKey: string;
  firstEventAt: string | null;
  replayEnabled?: boolean;
  /** Stored override; null/undefined = auto */
  displayCurrency?: string | null;
  /** Resolved display currency (auto or override) */
  currency?: string;
  pageViews?: DayCount[];
  visitors?: DayCount[];
  dwell?: DayDwell[];
  sources?: NamedCount[];
  pages?: PathCount[];
  hours?: HourCount[];
  sales?: DayCount[];
  orders?: DayCount[];
  returningSales?: DayCount[];
  clicked?: DayCount[];
  emailOpens?: DayCount[];
  /** Real outbound emails from Omer (project_email_messages). */
  emailSents?: DayCount[];
  products?: ProductStat[];
  campaigns?: CampaignStat[];
  sourceRevenue?: NamedRevenue[];
  pageRevenue?: PathRevenue[];
};

export function installSnippet(project: Project, appOrigin: string) {
  return `<script src="${appOrigin}/tracker.js?v=19" data-site="${project.writeKey}" defer></script>`;
}

export function installPrompt(project: Project, appOrigin: string) {
  return [
    `Install Omer on ${project.origin}.`,
    '',
    '1) Add this script once to the shared <head> (every page). Keep the URL and data-site unchanged:',
    installSnippet(project, appOrigin),
    '',
    '2) Cookie banner / analytics consent is required.',
    'If the site already has a cookie banner, wire analytics acceptance to:',
    '  window.omer.consent({ analytics: true })',
    'and withdrawal / reject to:',
    '  window.omer.consent({ analytics: false })',
    'Call the same when restoring a saved choice. Do not track before consent.',
    'If there is no cookie banner, add a simple analytics opt-in banner first, then wire it the same way.',
    '',
    '3) Prefer window.omer.track(name, props) for product/checkout steps (email_entered, shipping_options_shown, page_exit, order_completed, …).',
    'On checkout success you may also call window.omer.purchase({ amount, currency, orderId, products }).',
    'When you know the shopper, call window.omer.identify({ email, name }) or track email_entered.',
    '(window.unfairweekend is an alias of window.omer.)',
    '',
    'Do not capture passwords or payment fields. Tell me which files changed and how to verify the first event after granting consent.',
  ].join('\n');
}
