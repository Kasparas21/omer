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
  products?: ProductStat[];
  campaigns?: CampaignStat[];
  sourceRevenue?: NamedRevenue[];
  pageRevenue?: PathRevenue[];
};

export function installSnippet(project: Project, appOrigin: string) {
  return `<script src="${appOrigin}/tracker.js?v=3" data-site="${project.writeKey}" defer></script>`;
}

export function installPrompt(project: Project, appOrigin: string) {
  return [
    `Install Unfair Weekend on ${project.origin}.`,
    '',
    'Find the website project in this repository. In a monorepo, choose the app that serves this website.',
    'Add this script once to the shared <head> or root document so it loads on every page:',
    '',
    installSnippet(project, appOrigin),
    '',
    'Keep the script URL and data-site value unchanged. Follow the framework’s supported way to add a deferred script.',
    'After the script is ready, connect the existing analytics consent flow to window.unfairweekend.consent({ analytics: true }). Call it only when analytics consent is granted, including when restoring a previous choice.',
    'Call window.unfairweekend.consent({ analytics: false }) if consent is withdrawn. If the site has no consent flow, tell me so we can add an explicit opt-in before enabling analytics.',
    'Once consent is granted, the tracker records page views, unique visitors, referrers, paths, and visit duration.',
    'On thank-you / checkout success pages call window.unfairweekend.purchase({ amount, currency, orderId, products }).',
    'When you know the shopper, call window.unfairweekend.identify({ email, name }).',
    'For email performance without sending from Unfair Weekend, call window.unfairweekend.emailOpen({ campaign }) and window.unfairweekend.emailClick({ campaign }) from your ESP links or open pixel.',
    'Do not send passwords, payment details, or session replay data.',
    'Report which files changed and how to verify the first event.',
  ].join('\n');
}
