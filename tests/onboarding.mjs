import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const base=process.env.APP_URL ?? 'http://localhost:5173';
let key;
const site=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<html><head><script src="${base}/tracker.js" data-site="${key}" defer></script></head><body><h1>Owned demo site</h1><button onclick="window.unfairweekend.consent({analytics:true})">Allow analytics</button></body></html>`)}).listen(5180,'127.0.0.1');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base);
await page.getByRole('button',{name:'Add a project',exact:true}).click();
await page.getByLabel('Project name').fill('Demo Store');
await page.getByLabel('Website address').fill('http://127.0.0.1:5180');
await page.getByRole('button',{name:'Create project',exact:true}).click();
await page.getByRole('heading',{name:'Waiting for events'}).waitFor();
const projects=await page.evaluate(async()=> (await (await fetch('/api/projects')).json()).projects);
assert.equal(projects.length,1);assert.equal(projects[0].firstEventAt,null);key=projects[0].writeKey;
await page.getByRole('button',{name:'Copy install prompt',exact:true}).click();
const prompt=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(prompt.includes(key));assert.ok(prompt.includes('analytics: true'));
await page.getByRole('button',{name:'Installation guide',exact:true}).first().click();await page.getByRole('heading',{name:'Installation guide'}).waitFor();await page.keyboard.press('Escape');
await page.reload();await page.getByRole('heading',{name:'Waiting for events'}).waitFor();
const outsider=await browser.newContext();const other=await outsider.request.get(`${base}/api/projects`);assert.deepEqual((await other.json()).projects,[]);
const wrong=await fetch(`${base}/v1/collect/install`,{method:'POST',headers:{Origin:'https://wrong.example'},body:key});assert.equal(wrong.status,403);
const oversized=await fetch(`${base}/v1/collect/install`,{method:'POST',headers:{Origin:'http://127.0.0.1:5180'},body:key+'x'});assert.equal(oversized.status,400);
const visitor=await outsider.newPage();let captures=0;visitor.on('request',r=>{if(r.url().includes('/v1/collect/install')) captures++});
await visitor.goto('http://127.0.0.1:5180');await visitor.waitForFunction(()=>Boolean(window.unfairweekend));assert.equal(captures,0);
await visitor.evaluate(()=>window.unfairweekend.consent({analytics:false}));assert.equal(captures,0);
const receipt=visitor.waitForResponse(r=>r.url().includes('/v1/collect/install'));await visitor.getByRole('button',{name:'Allow analytics'}).click();assert.equal((await receipt).status(),204);
await page.getByRole('button',{name:'Check installation'}).click();await page.getByRole('heading',{name:'First event received'}).waitFor();
const before=await page.evaluate(async()=> (await (await fetch('/api/projects')).json()).projects[0].firstEventAt);
await fetch(`${base}/v1/collect/install`,{method:'POST',headers:{Origin:'http://127.0.0.1:5180'},body:key});
const after=await page.evaluate(async()=> (await (await fetch('/api/projects')).json()).projects[0].firstEventAt);assert.equal(before,after);
for(const width of [390,320]) {await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));}
assert.deepEqual(errors,[]);console.log('PASS: project creation, reload persistence, prompt clipboard, guide, browser isolation, origin/size rejection, consent gating, real receipt, duplicate receipt, mobile overflow, no browser errors');
} finally {await browser.close();site.close();}
