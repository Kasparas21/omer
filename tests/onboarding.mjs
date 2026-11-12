import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const base = process.env.APP_URL ?? 'http://localhost:5173';
const demoOrigin = process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:5180';
let key;
const site = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<html><head><script src="${base}/tracker.js" data-site="${key}" defer></script></head><body><h1>Owned demo site</h1><button onclick="window.unfairweekend.consent({analytics:true})">Allow analytics</button></body></html>`);
}).listen(5180, '127.0.0.1');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  const config = await page.evaluate(async () => (await (await fetch('/api/config')).json()));
  if (config.googleAuth) {
    await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
  } else {
    assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
  }
  const email = `demo-${Date.now()}@example.com`;
  const password = 'Demo-only-passphrase-123!';
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Demo Operator');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('button', { name: 'Add a project', exact: true }).click();
  await page.getByLabel('Project name').fill('Demo Store');
  await page.getByLabel('Website address').fill(demoOrigin);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('heading', { name: 'Add this to your site' }).waitFor();
  const projects = await page.evaluate(async () => (await (await fetch('/api/projects')).json()).projects);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].firstEventAt, null);
  key = projects[0].writeKey;
  await page.getByRole('button', { name: 'Copy install prompt', exact: true }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(prompt.includes(key));
  assert.ok(prompt.includes('analytics: true'));
  await page.getByRole('button', { name: 'Installation guide', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Installation guide' }).waitFor();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('heading', { name: 'Add this to your site' }).waitFor();
  const outsider = await browser.newContext();
  const other = await outsider.request.get(`${base}/api/projects`);
  assert.equal(other.status(), 401);
  const signed = await outsider.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email, password } });
  assert.equal(signed.status(), 200);
  const restored = await outsider.request.get(`${base}/api/projects`);
  assert.equal((await restored.json()).projects[0].writeKey, key);
  await outsider.request.post(`${base}/api/auth/sign-out`, { headers: { Origin: base }, data: {} });
  const separate = await outsider.request.post(`${base}/api/auth/sign-up/email`, {
    headers: { Origin: base },
    data: { name: 'Second operator', email: `other-${Date.now()}@example.com`, password },
  });
  assert.equal(separate.status(), 200);
  assert.deepEqual((await (await outsider.request.get(`${base}/api/projects`)).json()).projects, []);
  const wrong = await fetch(`${base}/v1/collect/install`, { method: 'POST', headers: { Origin: 'https://wrong.example' }, body: key });
  assert.equal(wrong.status, 403);
  const oversized = await fetch(`${base}/v1/collect/install`, { method: 'POST', headers: { Origin: demoOrigin }, body: key + 'x' });
  assert.equal(oversized.status, 400);
  const visitor = await outsider.newPage();
  let captures = 0;
  visitor.on('request', (r) => { if (r.url().includes('/v1/collect/install')) captures++; });
  if (process.env.DEMO_ORIGIN) {
    await visitor.route(`${demoOrigin}/**`, (route) => route.fulfill({
      contentType: 'text/html',
      body: `<html><head><script src="${base}/tracker.js" data-site="${key}" defer></script></head><body><button onclick="window.unfairweekend.consent({analytics:true})">Allow analytics</button></body></html>`,
    }));
  }
  await visitor.goto(demoOrigin);
  await visitor.waitForFunction(() => Boolean(window.unfairweekend));
  assert.equal(captures, 0);
  await visitor.evaluate(() => window.unfairweekend.consent({ analytics: false }));
  assert.equal(captures, 0);
  const receipt = visitor.waitForResponse((r) => r.url().includes('/v1/collect/install'));
  await visitor.getByRole('button', { name: 'Allow analytics' }).click();
  assert.equal((await receipt).status(), 204);
  const checkInstall = page.getByRole('button', { name: 'Check installation' });
  if (await checkInstall.count()) {
    await checkInstall.first().click();
    const waiting = page.getByRole('heading', { name: 'Waiting for events' });
    if (await waiting.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Check installation' }).click();
    }
  }
  await page.getByRole('heading', { name: /First event received|Watching / }).waitFor();
  const before = await page.evaluate(async () => (await (await fetch('/api/projects')).json()).projects[0].firstEventAt);
  await fetch(`${base}/v1/collect/install`, { method: 'POST', headers: { Origin: demoOrigin }, body: key });
  const after = await page.evaluate(async () => (await (await fetch('/api/projects')).json()).projects[0].firstEventAt);
  assert.equal(before, after);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  assert.deepEqual(errors, []);
  console.log('PASS: account registration, google button config, cross-browser sign-in, sign-out, account isolation, project creation, setup wizard, reload persistence, prompt clipboard, guide, browser isolation, origin/size rejection, consent gating, real receipt, duplicate receipt, mobile overflow, no browser errors');
} finally {
  await browser.close();
  site.close();
}
