export type Project = {
  id: string;
  name: string;
  origin: string;
  writeKey: string;
  firstEventAt: string | null;
  pageViews?: { day: string; count: number }[];
};

export function installSnippet(project: Project, appOrigin: string) {
  return `<script src="${appOrigin}/tracker.js" data-site="${project.writeKey}" defer></script>`;
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
    'Report which files changed and how to verify the first event. Do not send form values, identity data, or replay data.',
  ].join('\n');
}
