(() => {
  const script = document.currentScript;
  const key = script?.dataset.site;
  if (!key || window.unfairweekend) return;
  const base = new URL(script.src);
  const installURL = new URL('/v1/collect/install', base);
  const eventURL = new URL('/v1/collect/event', base);
  const configURL = new URL(`/v1/collect/config?key=${encodeURIComponent(key)}`, base);
  const replayURL = new URL('/v1/collect/replay-chunks', base);
  const storeKey = `uw_vid_${key}`;
  const sessionKey = `uw_sid_${key}`;
  const sessionAtKey = `uw_sid_at_${key}`;
  const SESSION_GAP = 30 * 60_000;
  let consented = false;
  let installSent = false;
  let pageAt = 0;
  let path = '';
  let visitId = null;
  let cachedId;
  let replayOn = false;
  let stopReplay = null;
  let lastIdentifiedEmail = '';
  let emailCaptureBound = false;

  function visitorId() {
    try {
      let id = localStorage.getItem(storeKey);
      if (!id) {
        id = (cachedId && /^[A-Za-z0-9_-]{8,80}$/.test(cachedId))
          ? cachedId
          : ((crypto.randomUUID && crypto.randomUUID()) || `v_${Math.random().toString(36).slice(2)}_${Date.now()}`);
        localStorage.setItem(storeKey, id);
      }
      return (cachedId = id);
    } catch {
      if (cachedId) return cachedId;
      return (cachedId = `session_${Math.random().toString(36).slice(2)}_${Date.now()}`);
    }
  }

  function newId() {
    return (crypto.randomUUID && crypto.randomUUID()) || `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }

  function sessionId() {
    try {
      const now = Date.now();
      const last = Number(localStorage.getItem(sessionAtKey) || 0);
      let id = localStorage.getItem(sessionKey);
      if (!id || !last || now - last > SESSION_GAP) {
        id = newId();
        localStorage.setItem(sessionKey, id);
      }
      localStorage.setItem(sessionAtKey, String(now));
      return id;
    } catch {
      return newId();
    }
  }

  function deviceClass() {
    const ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'phone';
    return 'monitor';
  }

  function pagePath() {
    const value = location.pathname || '/';
    return value.length > 300 ? value.slice(0, 300) : value;
  }

  function slugSource(value) {
    const slug = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return slug || '';
  }

  // Prefer UTMs / click ids — many social apps strip document.referrer.
  function trafficSource() {
    try {
      const params = new URLSearchParams(location.search);
      const utm = slugSource(params.get('utm_source'));
      if (utm) return utm;
      if (params.get('gclid') || params.get('gbraid') || params.get('wbraid')) return 'google';
      if (params.get('fbclid')) return 'facebook.com';
      if (params.get('ttclid')) return 'tiktok.com';
      if (params.get('msclkid')) return 'bing.com';
      if (!document.referrer) return '(direct)';
      const host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, '');
      if (!host || host === location.hostname.replace(/^www\./, '')) return '(direct)';
      return host.slice(0, 120);
    } catch {
      return '(direct)';
    }
  }

  function basePayload(type) {
    return {
      key,
      type,
      vid: visitorId(),
      sid: sessionId(),
      device: deviceClass(),
      path: pagePath(),
    };
  }

  function post(body, { unload = false } = {}) {
    const raw = JSON.stringify(body);
    if (unload) {
      // text/plain avoids CORS preflight; fetch keepalive is the reliable backup.
      // Never trust sendBeacon alone cross-origin — it can return true and still drop.
      try {
        navigator.sendBeacon?.(eventURL, new Blob([raw], { type: 'text/plain;charset=UTF-8' }));
      } catch { /* ignore */ }
    }
    return fetch(eventURL, {
      method: 'POST',
      body: raw,
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => undefined);
  }

  function sendDwell(fromUnload = false) {
    if (!consented || !pageAt) return;
    const ms = Math.min(1_800_000, Math.max(0, Date.now() - pageAt));
    pageAt = 0;
    const payload = { ...basePayload('dwell'), path, ms };
    if (visitId) payload.visitId = visitId;
    void post(payload, { unload: fromUnload });
  }

  function sendPresence() {
    if (!consented || !path || document.visibilityState !== 'visible') return;
    void post({ ...basePayload('presence'), path });
  }

  function trackPage() {
    if (!consented || path === pagePath()) return;
    sendDwell();
    path = pagePath();
    pageAt = Date.now();
    visitId = null;
    void post({
      ...basePayload('pageview'),
      path,
      ref: trafficSource(),
      tz: timeZone(),
    });
    watchCommerce();
  }

  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
  }

  // ---------- commerce: products viewed (price, stock), the cart, discount codes tried
  // Read-only: product JSON the store already publishes, the cart, and the text the store shows
  // after a code is applied. Never card details, passwords or what people type elsewhere.
  const shopify = () => Boolean(window.Shopify && (window.Shopify.shop || window.Shopify.routes));
  const shopRoot = () => (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  const shopCurrency = () => (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || undefined;
  const sent = new Set();
  const sendOnce = (sig, payload) => {
    try {
      const k = `uw_sig_${key}`;
      const seen = JSON.parse(sessionStorage.getItem(k) || '[]');
      if (seen.includes(sig) || sent.has(sig)) return;
      sent.add(sig);
      sessionStorage.setItem(k, JSON.stringify([...seen.slice(-60), sig]));
    } catch {
      if (sent.has(sig)) return;
      sent.add(sig);
    }
    void post(payload);
  };

  function productFromLd() {
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(el.textContent || 'null');
        const list = Array.isArray(data) ? data : (data && data['@graph']) || [data];
        for (const item of list) {
          const type = item && item['@type'];
          if (type !== 'Product' && !(Array.isArray(type) && type.includes('Product'))) continue;
          const offer = Array.isArray(item.offers) ? item.offers[0] : (item.offers && (item.offers.offers ? item.offers.offers[0] : item.offers));
          const price = offer && Number(offer.price || offer.lowPrice);
          const avail = offer && String(offer.availability || '');
          return {
            name: String(item.name || '').slice(0, 120),
            cents: Number.isFinite(price) ? Math.round(price * 100) : undefined,
            currency: offer && offer.priceCurrency,
            available: avail ? !/OutOfStock|SoldOut|Discontinued/i.test(avail) : undefined,
            image: typeof item.image === 'string' ? item.image : Array.isArray(item.image) ? item.image[0] : undefined,
          };
        }
      } catch { /* not JSON */ }
    }
    return null;
  }

  function soldOutOnPage() {
    const buttons = document.querySelectorAll('button[name="add"], form[action*="/cart/add"] button, button[type="submit"], .product-form button');
    for (const b of buttons) {
      if (/sold\s*out|out of stock|unavailable/i.test(b.textContent || '') ) return true;
    }
    return undefined;
  }

  async function readProduct() {
    if (!consented) return;
    let product = null;
    if (shopify() && /\/products\/[^/]+/.test(location.pathname)) {
      try {
        const res = await fetch(`${location.pathname.replace(/\/$/, '')}.js`, { credentials: 'same-origin' });
        if (res.ok) {
          const p = await res.json();
          product = { name: p.title, cents: p.price, currency: shopCurrency(), available: p.available, image: p.featured_image && (String(p.featured_image).startsWith('//') ? `https:${p.featured_image}` : p.featured_image) };
        }
      } catch { /* fall back to page data */ }
    }
    if (!product) product = productFromLd();
    if (!product || !product.name) return;
    if (product.available === undefined) product.available = soldOutOnPage();
    const sig = `p|${location.pathname}|${product.cents}|${product.available}`;
    sendOnce(sig, { ...basePayload('product'), url: location.pathname, ...product });
  }

  let cartTimer = 0;
  async function readCart() {
    if (!consented || !shopify()) return;
    try {
      const res = await fetch(`${shopRoot()}cart.js`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const c = await res.json();
      const codes = (c.discount_codes || []).map((d) => ({ code: String(d.code || ''), ok: d.applicable !== false })).filter((d) => d.code);
      for (const d of codes) sendOnce(`c|${d.code}|${d.ok}`, { ...basePayload('code'), code: d.code, ok: d.ok });
      if (!c.item_count && !codes.length) return;
      const items = (c.items || []).slice(0, 10).map((i) => ({ name: String(i.product_title || i.title || '').slice(0, 80), cents: i.final_line_price, qty: i.quantity, path: i.url ? String(i.url).split('?')[0] : undefined }));
      const sig = `cart|${c.token}|${c.total_price}|${c.item_count}`;
      sendOnce(sig, { ...basePayload('cart'), total: c.total_price, currency: c.currency || shopCurrency(), count: c.item_count, items, codes });
    } catch { /* no cart */ }
  }
  const soonCart = () => { window.clearTimeout(cartTimer); cartTimer = window.setTimeout(readCart, 700); };

  // Codes on any store: remember a code typed in a discount field, then read what the page says back.
  const CODE_FIELD = /discount|coupon|promo|voucher|gift.?card|reduction|rabatt/i;
  const CODE_BAD = /(expired|not valid|isn['’]t valid|invalid|can['’]t be (used|applied)|cannot be (used|applied)|not applicable|unable to (apply|find)|doesn['’]t exist|does not exist|no longer (valid|available)|isn['’]t available|not available|couldn['’]t (find|apply))/i;
  const CODE_GOOD = /(applied|discount added|code added|you saved|successfully)/i;
  let pendingCode = '';
  function codeFieldValue(el) {
    if (!el || el.tagName !== 'INPUT' || /password|email|tel|number|hidden/i.test(el.type || '')) return '';
    const hint = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`;
    if (!CODE_FIELD.test(hint)) return '';
    const v = String(el.value || '').trim();
    return /^[A-Za-z0-9_\-%.]{2,40}$/.test(v) ? v.toUpperCase() : '';
  }
  function watchCodeResult(code) {
    let done = false;
    const finish = (ok, reason) => {
      if (done) return;
      done = true;
      observer.disconnect();
      sendOnce(`c|${code}|${ok}`, { ...basePayload('code'), code, ok, reason: reason ? reason.slice(0, 120) : undefined });
    };
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const nodes = r.type === 'characterData' ? [r.target] : [...r.addedNodes];
        for (const n of nodes) {
          const text = String(n.textContent || '').replace(/\s+/g, ' ').trim();
          if (!text || text.length > 300) continue;
          if (CODE_BAD.test(text) && /code|discount|coupon|promo|voucher/i.test(text)) return finish(false, text);
          if (CODE_GOOD.test(text) && /code|discount|coupon|promo|voucher|saved/i.test(text)) return finish(true);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setTimeout(() => { if (!done) { done = true; observer.disconnect(); if (shopify()) soonCart(); } }, 6000);
  }
  function codeAttempt(event) {
    if (!consented) return;
    const t = event.target;
    if (event.type === 'keydown' && event.key !== 'Enter') return;
    const field = t && t.tagName === 'INPUT' ? t : null;
    const fromField = codeFieldValue(field);
    if (fromField) pendingCode = fromField;
    const isApply = event.type === 'submit' || (event.type === 'keydown' && fromField)
      || (event.type === 'click' && t && t.closest && /apply|redeem|use code|submit/i.test((t.closest('button, input[type="submit"], a') || {}).textContent || (t.closest('input[type="submit"]') || {}).value || ''));
    if (!isApply) return;
    let code = pendingCode;
    if (!code) {
      const form = t && t.closest && t.closest('form, div, section');
      const input = form && [...form.querySelectorAll('input')].find((i) => codeFieldValue(i));
      code = codeFieldValue(input);
    }
    if (code) { pendingCode = ''; watchCodeResult(code); }
  }

  let commerceBound = false;
  function watchCommerce() {
    if (!consented) return;
    window.setTimeout(readProduct, 900);
    soonCart();
    if (commerceBound) return;
    commerceBound = true;
    document.addEventListener('change', codeAttempt, true);
    document.addEventListener('keydown', codeAttempt, true);
    document.addEventListener('click', codeAttempt, true);
    document.addEventListener('submit', codeAttempt, true);
    // Shopify themes add to the cart with fetch/XHR: read the cart right after.
    const cartCall = (url) => /\/cart\/(add|change|update|clear)|\/discount\//.test(String(url || ''));
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
      const p = realFetch.apply(this, arguments);
      try { if (cartCall(typeof input === 'string' ? input : input && input.url)) p.then(soonCart, () => {}); } catch { /* ignore */ }
      return p;
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { if (cartCall(url)) this.addEventListener('loadend', soonCart); } catch { /* ignore */ }
      return open.apply(this, arguments);
    };
  }

  /** For stores that aren't on Shopify: tell us what's in the cart. */
  function cart(input) {
    if (!consented || !input || typeof input !== 'object') return;
    const total = Number(input.total);
    if (!Number.isFinite(total) || total < 0) return;
    const items = Array.isArray(input.items) ? input.items.slice(0, 10).map((i) => ({
      name: String((i && i.name) || 'Product').slice(0, 80),
      cents: Number.isFinite(Number(i && i.price)) ? Math.round(Number(i.price) * 100) : undefined,
      qty: Number(i && i.qty) || 1,
      path: i && typeof i.url === 'string' ? i.url : undefined,
    })) : [];
    const codes = Array.isArray(input.codes) ? input.codes.slice(0, 5).map((c) => ({ code: String((c && c.code) || ''), ok: c && c.ok !== false })) : [];
    void post({ ...basePayload('cart'), total: Math.round(total * 100), currency: input.currency || 'usd', count: items.reduce((n, i) => n + i.qty, 0), items, codes });
  }

  async function refreshConfig() {
    try {
      const res = await fetch(configURL, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      replayOn = Boolean(data?.replay);
    } catch { /* ignore */ }
  }

  function onConsent(preferences) {
    if (preferences?.analytics !== true) {
      if (preferences?.analytics === false && consented) {
        consented = false;
        pageAt = 0;
        path = '';
        visitId = null;
        cachedId = undefined;
        stopReplay?.();
        stopReplay = null;
        lastIdentifiedEmail = '';
        try {
          localStorage.removeItem(storeKey);
          localStorage.removeItem(sessionKey);
          localStorage.removeItem(sessionAtKey);
        } catch { /* storage unavailable */ }
      }
      return;
    }
    if (consented) return;
    consented = true;
    // Ensure ids exist in storage before the first pageview / replay flush.
    visitorId();
    sessionId();
    if (!installSent) {
      installSent = true;
      void fetch(installURL, {
        method: 'POST',
        body: key,
        credentials: 'omit',
        keepalive: true,
      }).catch(() => undefined);
    }
    trackPage();
    bindEmailCapture();
    void refreshConfig().then(() => { if (replayOn) startReplay(); });
  }

  function identify(input) {
    if (!consented || !input || typeof input !== 'object') return;
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (email.toLowerCase() === lastIdentifiedEmail) return;
    lastIdentifiedEmail = email.toLowerCase();
    const payload = { ...basePayload('identify'), email: lastIdentifiedEmail };
    if (typeof input.name === 'string' && input.name.trim()) payload.name = input.name.trim().slice(0, 80);
    void post(payload);
  }

  function looksLikeEmailField(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const tag = (el.tagName || '').toUpperCase();
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    const type = String(el.type || 'text').toLowerCase();
    if (type === 'password' || type === 'hidden' || type === 'tel' || type === 'number' || type === 'card') return false;
    const hint = `${el.name || ''} ${el.id || ''} ${el.autocomplete || ''} ${el.placeholder || ''} ${el.getAttribute?.('aria-label') || ''}`.toLowerCase();
    if (/pass(word)?|card|cvv|cvc|ssn|secret|otp|pin/.test(hint)) return false;
    if (type === 'email' || el.autocomplete === 'email') return true;
    return /e-?mail|user(name)?/.test(hint) && !/user(name)?.*(pass|id\b)/.test(hint);
  }

  function captureEmailFromEvent(event) {
    if (!consented) return;
    const el = event.target;
    if (!looksLikeEmailField(el)) return;
    const email = String(el.value || '').trim();
    if (!email) return;
    identify({ email });
  }

  function bindEmailCapture() {
    if (emailCaptureBound) return;
    emailCaptureBound = true;
    // Blur/change only — never scrape keystrokes, passwords, or payment fields.
    document.addEventListener('focusout', captureEmailFromEvent, true);
    document.addEventListener('change', captureEmailFromEvent, true);
  }

  function purchase(input) {
    if (!consented || !input || typeof input !== 'object') return;
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return;
    const payload = {
      ...basePayload('purchase'),
      ref: trafficSource(),
      amount,
      currency: typeof input.currency === 'string' ? input.currency : 'usd',
    };
    if (typeof input.orderId === 'string' && input.orderId.trim()) payload.orderId = input.orderId.trim().slice(0, 120);
    if (typeof input.campaign === 'string' && input.campaign.trim()) payload.campaign = input.campaign.trim().slice(0, 120);
    if (Array.isArray(input.products)) {
      payload.products = input.products.slice(0, 20).map((item) => ({
        name: String(item?.name || 'Product').slice(0, 120),
        price: Number.isFinite(Number(item?.price)) ? Number(item.price) : undefined,
        qty: Number.isFinite(Number(item?.qty)) ? Math.max(1, Math.round(Number(item.qty))) : 1,
      }));
    }
    void post(payload);
  }

  function emailEvent(type, input) {
    if (!consented || (type !== 'email_open' && type !== 'email_click')) return;
    const payload = { ...basePayload(type) };
    if (input && typeof input === 'object') {
      if (typeof input.campaign === 'string' && input.campaign.trim()) payload.campaign = input.campaign.trim().slice(0, 120);
      if (typeof input.messageId === 'string' && input.messageId.trim()) payload.messageId = input.messageId.trim().slice(0, 120);
    }
    void post(payload);
  }

  function startReplay() {
    if (stopReplay || !consented || !replayOn) return;
    const blocked = /checkout|cart|payment|password|login|account\/login|account\/register/i;
    if (blocked.test(location.pathname)) return;

    let stopped = false;
    let events = [];
    let seq = 0;
    let bytes = 0;
    let started = Date.now();
    let hasFull = false;
    const phone = deviceClass() === 'phone';
    const tabId = (() => {
      try {
        const existing = sessionStorage.getItem(`uw_tab_${key}`);
        if (existing) return existing;
        const id = newId().slice(0, 16);
        sessionStorage.setItem(`uw_tab_${key}`, id);
        return id;
      } catch {
        return newId().slice(0, 16);
      }
    })();
    const MAX_MS = 5 * 60_000;
    const MAX_BYTES = 5 * 1024 * 1024;
    const FLUSH_BYTES = phone ? 100_000 : 180_000;
    const BATCH_EVENTS = 300;
    // Phones background tabs aggressively — upload the snapshot ASAP and flush often.
    const FLUSH_EVERY_MS = phone ? 1200 : 2000;
    const FIRST_FLUSH_DELAY_MS = phone ? 120 : 800;
    const KEEPALIVE_MAX = 60_000;
    let flushing = false;
    let firstFlushTimer = 0;
    let retries = 0;

    async function sendBatch(batch, { unload = false } = {}) {
      if (!batch.length) return 'ok';
      const eventsJson = JSON.stringify(batch);
      if (bytes + eventsJson.length > MAX_BYTES) return 'drop';
      const batchId = newId();
      const checksum = String(batchId.length + eventsJson.length + seq);
      const payload = JSON.stringify({
        key,
        vid: visitorId(),
        sid: sessionId(),
        tabId,
        seq,
        clientBatchId: batchId,
        checksum,
        hasFullSnapshot: hasFull || batch.some((e) => e?.type === 2),
        events: batch,
      });
      // Chromium caps keepalive at 64KiB. Use it only for small unload flushes (mobile leave).
      const useKeepalive = unload && payload.length <= KEEPALIVE_MAX;
      try {
        if (unload && !useKeepalive && typeof navigator.sendBeacon === 'function') {
          // Best-effort leave path when the snapshot is too big for keepalive.
          const ok = navigator.sendBeacon(replayURL, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
          if (ok) {
            seq += 1;
            bytes += eventsJson.length;
            hasFull = hasFull || batch.some((e) => e?.type === 2);
            return 'ok';
          }
        }
        const res = await fetch(replayURL, {
          method: 'POST',
          credentials: 'omit',
          keepalive: useKeepalive,
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        if (res.status === 400 || res.status === 413) return 'drop';
        if (!res.ok) return 'retry';
        seq += 1;
        bytes += eventsJson.length;
        hasFull = hasFull || batch.some((e) => e?.type === 2);
        retries = 0;
        return 'ok';
      } catch {
        return 'retry';
      }
    }

    async function flush(force, unload = false) {
      if (flushing || !events.length) return;
      const size = JSON.stringify(events).length;
      if (!force && !unload && events.length < BATCH_EVENTS && size < FLUSH_BYTES && Date.now() - started < MAX_MS) return;
      flushing = true;
      try {
        while (events.length) {
          // Take a fixed count up front. Never slice by BATCH_EVENTS after await —
          // events pushed during upload would be wiped (that produced 00:00 stills).
          const take = Math.min(events.length, BATCH_EVENTS);
          const batch = events.slice(0, take);
          const result = await sendBatch(batch, { unload });
          if (result === 'ok') {
            events.splice(0, take);
            continue;
          }
          if (result === 'drop') {
            events.splice(0, take);
            continue;
          }
          retries += 1;
          if (retries > 8) {
            // Avoid wedging forever on a poison/network failure — drop this batch and keep going.
            events.splice(0, take);
            retries = 0;
            continue;
          }
          break;
        }
      } finally {
        flushing = false;
      }
    }

    function begin(light = false) {
      const record = window.rrweb?.record;
      if (stopped || typeof record !== 'function' || stopReplay) return;
      let stop;
      try {
        stop = record({
          emit(event) {
            if (stopped) return;
            events.push(event);
            if (event?.type === 2) {
              hasFull = true;
              // Upload snapshot quickly so a phone backgrounding the tab still leaves a replay.
              if (!firstFlushTimer) {
                firstFlushTimer = window.setTimeout(() => {
                  firstFlushTimer = 0;
                  void flush(true);
                }, FIRST_FLUSH_DELAY_MS);
              }
              return;
            }
            if (events.length >= BATCH_EVENTS || JSON.stringify(events).length >= FLUSH_BYTES) void flush(true);
          },
          // Mask values in replay (asterisks) but record every keystroke so typing feels live.
          maskAllInputs: true,
          maskInputOptions: {
            password: true,
            email: true,
            text: true,
            textarea: true,
            tel: true,
            number: true,
            search: true,
            url: true,
            color: false,
            date: false,
            'datetime-local': false,
            month: false,
            range: false,
            time: false,
            week: false,
          },
          maskTextSelector: 'input, textarea, [data-uw-mask]',
          blockClass: 'uw-block',
          blockSelector: 'input[type=password], [data-uw-block], .checkout, #checkout',
          recordCanvas: false,
          // Inlining stylesheets blows up mobile payloads and often fails to upload on cellular.
          inlineStylesheet: !(phone || light),
          checkoutEveryNms: 30_000,
          sampling: {
            mousemove: phone ? 100 : 50,
            mouseInteraction: true,
            scroll: phone ? 200 : 150,
            input: 'all',
          },
        });
      } catch {
        if (!light) {
          begin(true);
          return;
        }
        return;
      }
      const timer = window.setInterval(() => void flush(true), FLUSH_EVERY_MS);
      const onHidden = () => { void flush(true); };
      const onPageHide = () => end(true);
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') onHidden();
      };
      function end(unload = false) {
        if (stopped) return;
        stopped = true;
        window.clearInterval(timer);
        if (firstFlushTimer) {
          window.clearTimeout(firstFlushTimer);
          firstFlushTimer = 0;
        }
        try { stop?.(); } catch { /* ignore */ }
        void flush(true, unload);
      }
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('freeze', onHidden);
      document.addEventListener('visibilitychange', onVisibility);
      window.setTimeout(() => end(false), MAX_MS);
      stopReplay = () => {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('freeze', onHidden);
        document.removeEventListener('visibilitychange', onVisibility);
        end(false);
        stopReplay = null;
      };
    }

    // Same host as the tracker so store CSPs that allow tryomer also allow rrweb.
    // Do not set crossOrigin — without ACAO on the static file the browser downloads
    // the script but will not execute it (common mobile miss → "No replay").
    if (window.rrweb?.record) {
      begin();
      return;
    }
    const existing = document.querySelector('script[data-uw-rrweb]');
    if (existing) {
      if (window.rrweb?.record) {
        begin();
        return;
      }
      if (existing.dataset.loaded === '1') {
        // Tag finished but global missing (failed/tainted load) — replace it.
        existing.remove();
      } else {
        existing.addEventListener('load', () => {
          existing.dataset.loaded = '1';
          if (window.rrweb?.record) begin();
        }, { once: true });
        existing.addEventListener('error', () => {
          existing.remove();
        }, { once: true });
        return;
      }
    }
    const scriptEl = document.createElement('script');
    scriptEl.src = new URL('/vendor/rrweb.min.js', base).href;
    scriptEl.async = true;
    scriptEl.dataset.uwRrweb = '1';
    scriptEl.onerror = () => { /* recorder unavailable */ };
    scriptEl.onload = () => {
      scriptEl.dataset.loaded = '1';
      begin();
    };
    document.head.appendChild(scriptEl);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDwell(true);
    else if (consented && !pageAt) {
      pageAt = Date.now();
      sendPresence();
    }
  });
  window.addEventListener('pagehide', () => sendDwell(true));
  window.addEventListener('pageshow', (event) => { if (event.persisted) sendPresence(); });
  window.setInterval(sendPresence, 15000);

  const push = history.pushState;
  const replace = history.replaceState;
  history.pushState = function (...args) {
    push.apply(this, args);
    if (consented) trackPage();
  };
  history.replaceState = function (...args) {
    replace.apply(this, args);
    if (consented) trackPage();
  };
  window.addEventListener('popstate', () => { if (consented) trackPage(); });

  window.unfairweekend = {
    consent: onConsent,
    identify,
    purchase,
    cart,
    emailOpen: (input) => emailEvent('email_open', input),
    emailClick: (input) => emailEvent('email_click', input),
  };
})();
