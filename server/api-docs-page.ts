/* Public polished HTML for GET /docs/api. Examples live here — Settings only manages keys. */
import { appURL } from './auth';

const BASE = appURL.replace(/\/$/, '');

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root{
  color-scheme:light;
  --bg0:#f3f1ec;--bg1:#e8eef6;--ink:#16181d;--muted:#5c6573;--line:#d9dde3;
  --card:#fffcf8;--code:#f0f2f5;--accent:#1f4fd8;--accent-soft:#e8eefc;--ok:#1a6b52;
  --font:"Instrument Sans",system-ui,-apple-system,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  --r:16px;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;min-height:100vh;color:var(--ink);font:16px/1.55 var(--font);
  background:
    radial-gradient(900px 480px at 12% -10%,#d7e4f8 0%,transparent 55%),
    radial-gradient(700px 420px at 92% 8%,#f0e6d8 0%,transparent 50%),
    linear-gradient(180deg,var(--bg0),#f7f6f3 40%,var(--bg1));
}
a{color:var(--accent);text-underline-offset:3px}
a:hover{color:#163aa8}
.wrap{width:min(820px,100%);margin:0 auto;padding:28px 22px 72px}
.top{
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  margin-bottom:40px;padding-bottom:18px;border-bottom:1px solid color-mix(in srgb,var(--line) 80%,transparent);
}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:600;letter-spacing:-0.02em}
.brand-mark{
  width:32px;height:32px;border-radius:10px;display:grid;place-items:center;
  background:var(--ink);color:#fff;font-size:14px;font-weight:700;
}
.top nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}
.top nav a{color:var(--muted);text-decoration:none;font-weight:500}
.top nav a:hover{color:var(--ink)}
.hero{margin:0 0 36px}
.hero h1{
  margin:0 0 10px;font-size:clamp(2rem,4.5vw,2.75rem);line-height:1.1;
  letter-spacing:-0.035em;font-weight:700;
}
.hero p{margin:0;max-width:42ch;font-size:1.125rem;color:var(--muted);line-height:1.5}
.hero .cta{display:inline-flex;margin-top:18px;gap:10px;flex-wrap:wrap}
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:10px 16px;border-radius:999px;font:inherit;font-size:14px;font-weight:600;
  text-decoration:none;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;
}
.btn:hover{border-color:color-mix(in srgb,var(--ink) 18%,var(--line))}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.primary:hover{background:#163aa8;border-color:#163aa8;color:#fff}
.btn.ghost{background:transparent}
section{margin:0 0 28px}
section>h2{
  margin:0 0 8px;font-size:1.15rem;letter-spacing:-0.02em;font-weight:650;
}
section>p.lead{margin:0 0 14px;color:var(--muted);max-width:54ch}
.card{
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  padding:18px 18px 16px;box-shadow:0 1px 0 rgb(22 24 29 / 0.03);
}
.row{display:grid;gap:10px}
@media(min-width:640px){.row.two{grid-template-columns:1fr 1fr}}
.field span{display:block;font-size:12.5px;font-weight:550;color:var(--muted);margin-bottom:6px}
.field .box{
  display:flex;align-items:center;gap:8px;padding:10px 10px 10px 12px;
  border-radius:12px;background:var(--code);border:1px solid var(--line);
}
.field code{flex:1;min-width:0;font-family:var(--mono);font-size:12.5px;overflow-wrap:anywhere}
.steps{margin:0;padding:0;list-style:none;display:grid;gap:10px}
.steps li{
  display:grid;grid-template-columns:28px 1fr;gap:12px;align-items:start;
  padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:var(--card);
}
.steps b.n{
  width:28px;height:28px;border-radius:99px;display:grid;place-items:center;
  background:var(--accent-soft);color:var(--accent);font-size:13px;font-weight:700;
}
.steps p{margin:0;color:var(--muted);font-size:14.5px}
.steps strong{color:var(--ink);font-weight:600}
.ex{
  margin:0 0 12px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);
}
.ex-head{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:9px 12px;border-bottom:1px solid var(--line);background:#faf9f6;
}
.ex-head span{font-size:13px;font-weight:550;color:var(--ink)}
.ex pre{
  margin:0;padding:14px 16px;overflow-x:auto;background:var(--code);
  font-family:var(--mono);font-size:12px;line-height:1.55;color:var(--ink);
}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted);font-weight:600;background:#faf9f6}
tr:last-child td{border-bottom:0}
td code{font-family:var(--mono);font-size:12px}
.pill{
  display:inline-block;padding:2px 8px;border-radius:6px;font-family:var(--mono);
  font-size:11px;font-weight:500;background:var(--code);color:var(--ink);
}
.warn{
  padding:14px 16px;border-radius:14px;border:1px solid color-mix(in srgb,var(--ok) 28%,var(--line));
  background:color-mix(in srgb,var(--ok) 7%,var(--card));color:var(--ink);font-size:14.5px;
}
.warn strong{color:var(--ok)}
.foot{
  margin-top:40px;padding-top:18px;border-top:1px solid var(--line);
  font-size:13.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:space-between;
}
.foot a{color:var(--muted)}
.foot a:hover{color:var(--ink)}
.copy{font-size:12.5px;padding:6px 10px;border-radius:999px}
`;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function example(id: string, title: string, code: string) {
  return `
  <div class="ex">
    <div class="ex-head">
      <span>${esc(title)}</span>
      <button type="button" class="btn ghost copy" data-copy="${esc(id)}">Copy</button>
    </div>
    <pre id="${esc(id)}"><code>${esc(code)}</code></pre>
  </div>`;
}

export function apiDocsHtml() {
  const listStores = `curl -sS -H "Authorization: Bearer omk_…" \\\n  "${BASE}/api/projects?view=summary"`;
  const dashboard = `curl -sS -H "Authorization: Bearer $OMER_KEY" \\\n  "${BASE}/api/projects?project=$PROJECT_ID"`;
  const live = `curl -sS -H "Authorization: Bearer $OMER_KEY" \\\n  "${BASE}/api/projects/$PROJECT_ID/live"`;
  const opps = `curl -sS -H "Authorization: Bearer $OMER_KEY" \\\n  "${BASE}/api/projects/$PROJECT_ID/opportunities"`;
  const draft = `curl -sS -X POST -H "Authorization: Bearer $OMER_KEY" \\\n  "${BASE}/api/projects/$PROJECT_ID/opportunities/$OPPORTUNITY_ID/draft"`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>API · Omer</title>
  <meta name="description" content="Call Omer with a personal API key — stores, analytics, people, and follow-ups.">
  <style>${STYLE}</style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">O</span>Omer</a>
      <nav>
        <a href="#start">Quick start</a>
        <a href="#examples">Examples</a>
        <a href="#routes">Routes</a>
        <a href="/">Dashboard</a>
      </nav>
    </header>

    <div class="hero">
      <h1>Omer API</h1>
      <p>Same access as the dashboard — for scripts, Codex, Zapier, and your own tools.</p>
      <div class="cta">
        <a class="btn primary" href="/">Open Omer</a>
        <a class="btn" href="#examples">See examples</a>
      </div>
    </div>

    <section id="auth" aria-labelledby="auth-title">
      <h2 id="auth-title">Authenticate</h2>
      <p class="lead">Create a key in Settings → Integrations → API. Send it on every request.</p>
      <div class="card row two">
        <div class="field">
          <span>Header</span>
          <div class="box"><code>Authorization: Bearer omk_…</code><button type="button" class="btn ghost copy" data-copy-text="Authorization: Bearer omk_…">Copy</button></div>
        </div>
        <div class="field">
          <span>Base URL</span>
          <div class="box"><code>${esc(BASE)}</code><button type="button" class="btn ghost copy" data-copy-text="${esc(BASE)}">Copy</button></div>
        </div>
      </div>
    </section>

    <section id="start" aria-labelledby="start-title">
      <h2 id="start-title">Quick start</h2>
      <ol class="steps">
        <li><b class="n">1</b><p><strong>Create a key</strong> in Settings. It’s shown once — copy it immediately.</p></li>
        <li><b class="n">2</b><p><strong>List stores</strong> to get a project id for the store you care about.</p></li>
        <li><b class="n">3</b><p><strong>Call any route</strong> with that id — dashboard, people, opportunities, drafts.</p></li>
      </ol>
    </section>

    <section id="examples" aria-labelledby="ex-title">
      <h2 id="ex-title">Examples</h2>
      <p class="lead">Replace <code>omk_…</code> with your key. Draft does not send; <code>…/send</code> does.</p>
      ${example('ex-list', 'List stores', listStores)}
      ${example('ex-dash', 'Dashboard for one store', dashboard)}
      ${example('ex-live', 'Live visitors', live)}
      ${example('ex-opps', 'List opportunities', opps)}
      ${example('ex-draft', 'Draft a follow-up (no send)', draft)}
    </section>

    <section id="routes" aria-labelledby="routes-title">
      <h2 id="routes-title">Useful routes</h2>
      <p class="lead">All paths are under the base URL. Project ids come from the summary list.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Method</th><th>Path</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><span class="pill">GET</span></td><td><code>/api/projects?view=summary</code></td><td>Stores and project ids</td></tr>
            <tr><td><span class="pill">GET</span></td><td><code>/api/projects?project={id}</code></td><td>Analytics dashboard</td></tr>
            <tr><td><span class="pill">GET</span></td><td><code>/api/projects/{id}/live</code></td><td>Live and recent visitors</td></tr>
            <tr><td><span class="pill">GET</span></td><td><code>/api/projects/{id}/visitors/{vid}</code></td><td>Person profile</td></tr>
            <tr><td><span class="pill">GET</span></td><td><code>/api/projects/{id}/opportunities</code></td><td>Follow-up queue</td></tr>
            <tr><td><span class="pill">POST</span></td><td><code>…/opportunities/{oid}/draft</code></td><td>AI draft (does not send)</td></tr>
            <tr><td><span class="pill">POST</span></td><td><code>…/opportunities/{oid}/send</code></td><td>Sends a real email</td></tr>
            <tr><td><span class="pill">GET</span></td><td><code>/api/projects/{id}/campaigns</code></td><td>Campaigns</td></tr>
            <tr><td><span class="pill">GET</span></td><td><code>/api/projects/{id}/brand</code></td><td>Brand knowledge</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="safe-title">
      <h2 id="safe-title">Safety</h2>
      <div class="warn">
        <strong>Sending is real.</strong> <code>POST …/send</code> and campaign runs deliver email to customers. Draft and review first. Keys act as the signed-in owner — revoke unused ones in Settings.
      </div>
    </section>

    <footer class="foot">
      <span>Errors return JSON <code>{ "error": "…" }</code>.</span>
      <span>
        <a href="/mcp">MCP for Claude &amp; Cursor</a>
        ·
        <a href="/openapi.json">Machine schema</a>
        ·
        <a href="/docs/api.md">Markdown</a>
      </span>
    </footer>
  </div>
  <script>
    document.querySelectorAll('[data-copy],[data-copy-text]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-copy');
        const text = id
          ? (document.getElementById(id)?.innerText || '')
          : (btn.getAttribute('data-copy-text') || '');
        try {
          await navigator.clipboard.writeText(text.trim());
          const prev = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(() => { btn.textContent = prev; }, 1200);
        } catch (_) {}
      });
    });
  </script>
</body>
</html>`;
}
