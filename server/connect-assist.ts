/* Sticky “open in Claude / ChatGPT / Cursor” pages. Browser install tabs often vanish after
   handing off to an app — these pages stay on Omer so people can retry and finish Allow. */
import { Hono } from 'hono';
import { appURL } from './auth';

const MCP = `${appURL.replace(/\/$/, '')}/mcp`;

function b64json(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function claudeUrl() {
  const q = new URLSearchParams({
    modal: 'add-custom-connector',
    connectorName: 'Omer',
    connectorUrl: MCP,
  });
  return `https://claude.ai/customize/connectors?${q}`;
}

function chatgptUrl() {
  // Lands on Create custom MCP server (n8n / OpenAI community); URL still pasted by hand.
  return 'https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins';
}

function cursorHttps() {
  const config = encodeURIComponent(b64json({ url: MCP }));
  return `https://cursor.com/install-mcp?name=${encodeURIComponent('omer')}&config=${config}`;
}

function cursorApp() {
  const config = encodeURIComponent(b64json({ url: MCP }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent('omer')}&config=${config}`;
}

const STYLE = `
:root{color-scheme:light;--bg:#f6f6f4;--card:#fff;--text:#16181d;--muted:#5b6472;--line:#e6e7ea;--accent:#2f6df6;--ok:#1f7a5c}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 28px 24px}
.mark{width:48px;height:48px;border-radius:99px;display:grid;place-items:center;background:#f0f1f3;border:1px solid #e8e9ec;margin-bottom:14px;overflow:hidden}
.mark img{width:24px;height:24px;object-fit:contain}
h1{font-size:22px;line-height:1.25;margin:0 0 8px}p{margin:0 0 14px;color:var(--muted)}
ol{margin:0 0 18px;padding-left:20px;color:var(--muted)}li{margin:6px 0}b{color:var(--text)}
.url{display:flex;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#f7f7f8;margin:0 0 16px}
.url code{flex:1;min-width:0;overflow-wrap:anywhere;font-size:13px;color:var(--text)}
.row{display:flex;flex-wrap:wrap;gap:10px}.btn{flex:1;min-width:140px;font:inherit;font-weight:600;padding:12px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);cursor:pointer;text-align:center;text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.note{margin-top:16px;font-size:13.5px;color:var(--muted)}.ok{color:var(--ok);font-weight:600}
`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
};

export function createConnectAssistApp() {
  const app = new Hono();

  app.get('/connect/claude', (c) => {
    const open = claudeUrl();
    const html = page('Connect Claude · Omer', `
      <div class="mark"><img src="/assets/logos/claude.svg" alt=""></div>
      <h1>Connect Claude</h1>
      <p>We’ll open Claude with <b>Omer</b> and the server URL already filled. This page stays open if the other tab closes.</p>
      <ol>
        <li>Click <b>Open Claude</b> below</li>
        <li>In Claude, press <b>Continue</b> / <b>Add</b></li>
        <li>When Omer asks, press <b>Allow</b></li>
      </ol>
      <div class="url"><code id="mcp">${MCP}</code><button type="button" class="btn" id="copy">Copy</button></div>
      <div class="row">
        <a class="btn primary" id="open" href="${open}" target="_blank" rel="noopener">Open Claude</a>
        <a class="btn" href="/">Back to Omer</a>
      </div>
      <p class="note" id="status">Tip: if Claude’s tab vanishes, use <b>Open Claude</b> again from here.</p>
      <script>
        const mcp = ${JSON.stringify(MCP)};
        const openHref = ${JSON.stringify(open)};
        document.getElementById('copy').onclick = async () => {
          try { await navigator.clipboard.writeText(mcp); document.getElementById('status').innerHTML = '<span class="ok">URL copied</span>'; }
          catch { document.getElementById('status').textContent = 'Could not copy — select the URL above.'; }
        };
        // Soft auto-open once; keep this tab. User can retry with the button.
        setTimeout(() => { window.open(openHref, '_blank', 'noopener'); }, 400);
      </script>`);
    return c.html(html, 200, headers);
  });

  app.get('/connect/chatgpt', (c) => {
    const open = chatgptUrl();
    const html = page('Connect ChatGPT · Omer', `
      <div class="mark"><img src="/assets/logos/chatgpt.svg" alt=""></div>
      <h1>Connect ChatGPT</h1>
      <p>Opens ChatGPT’s <b>create connector</b> form. Paste the Omer URL (already copied) and choose <b>OAuth</b>.</p>
      <ol>
        <li>Click <b>Open ChatGPT</b> (URL is copied for you)</li>
        <li>Name it <b>Omer</b>, paste the URL, auth = <b>OAuth</b></li>
        <li>When Omer asks, press <b>Allow</b></li>
      </ol>
      <div class="url"><code id="mcp">${MCP}</code><button type="button" class="btn" id="copy">Copy</button></div>
      <div class="row">
        <a class="btn primary" id="open" href="${open}" target="_blank" rel="noopener">Open ChatGPT</a>
        <a class="btn" href="/">Back to Omer</a>
      </div>
      <p class="note" id="status">ChatGPT can’t prefill the URL yet — paste is still required once.</p>
      <script>
        const mcp = ${JSON.stringify(MCP)};
        const openHref = ${JSON.stringify(open)};
        async function copyUrl() {
          try { await navigator.clipboard.writeText(mcp); document.getElementById('status').innerHTML = '<span class="ok">URL copied — paste it in ChatGPT</span>'; return true; }
          catch { document.getElementById('status').textContent = 'Select and copy the URL above, then open ChatGPT.'; return false; }
        }
        document.getElementById('copy').onclick = () => { void copyUrl(); };
        document.getElementById('open').addEventListener('click', () => { void copyUrl(); });
        setTimeout(() => { void copyUrl().then(() => window.open(openHref, '_blank', 'noopener')); }, 400);
      </script>`);
    return c.html(html, 200, headers);
  });

  app.get('/connect/cursor', (c) => {
    const https = cursorHttps();
    const appLink = cursorApp();
    const html = page('Connect Cursor · Omer', `
      <div class="mark"><img src="/assets/logos/cursor.svg" alt=""></div>
      <h1>Connect Cursor</h1>
      <p>Opens Cursor’s MCP install for Omer (sign-in / Allow — no API key in the link). This page stays open if the install tab closes.</p>
      <ol>
        <li>Click <b>Open Cursor</b></li>
        <li>Confirm install in Cursor</li>
        <li>When Omer asks, press <b>Allow</b></li>
      </ol>
      <div class="row">
        <a class="btn primary" id="open" href="${appLink}">Open Cursor</a>
        <a class="btn" href="${https}" target="_blank" rel="noopener">Web install link</a>
      </div>
      <div class="row" style="margin-top:10px">
        <a class="btn" href="/">Back to Omer</a>
      </div>
      <p class="note" id="status">If the other tab closed before you clicked Allow, use <b>Open Cursor</b> again — this page won’t disappear.</p>
      <script>
        const appHref = ${JSON.stringify(appLink)};
        const webHref = ${JSON.stringify(https)};
        // Prefer the app protocol; fall back to the https handoff.
        setTimeout(() => {
          const a = document.createElement('a');
          a.href = appHref;
          a.click();
        }, 350);
        setTimeout(() => {
          // Secondary nudge via https if the protocol handler didn’t take focus.
          document.getElementById('status').textContent = 'Nothing opened? Click Open Cursor, or try Web install link.';
        }, 2500);
      </script>`);
    return c.html(html, 200, headers);
  });

  return app;
}
