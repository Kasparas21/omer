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
    });
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
    void refreshConfig().then(() => { if (replayOn) startReplay(); });
  }

  function identify(input) {
    if (!consented || !input || typeof input !== 'object') return;
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email) return;
    const payload = { ...basePayload('identify'), email };
    if (typeof input.name === 'string' && input.name.trim()) payload.name = input.name.trim().slice(0, 80);
    void post(payload);
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
          maskAllInputs: true,
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
            input: 'last',
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
    if (window.rrweb?.record) {
      begin();
      return;
    }
    const existing = document.querySelector('script[data-uw-rrweb]');
    if (existing) {
      // Cached/already-loaded script will not fire "load" again — don't miss begin() on mobile.
      if (existing.dataset.loaded === '1' || window.rrweb?.record) begin();
      else {
        existing.addEventListener('load', () => {
          existing.dataset.loaded = '1';
          begin();
        }, { once: true });
        existing.addEventListener('error', () => { /* recorder unavailable */ }, { once: true });
      }
      return;
    }
    const scriptEl = document.createElement('script');
    scriptEl.src = new URL('/vendor/rrweb.min.js', base).href;
    scriptEl.async = true;
    scriptEl.dataset.uwRrweb = '1';
    scriptEl.crossOrigin = 'anonymous';
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
    emailOpen: (input) => emailEvent('email_open', input),
    emailClick: (input) => emailEvent('email_click', input),
  };
})();
