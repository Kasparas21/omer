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
    if (cachedId) return cachedId;
    try {
      let id = localStorage.getItem(storeKey);
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) || `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        localStorage.setItem(storeKey, id);
      }
      return (cachedId = id);
    } catch {
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

  function referrerHost() {
    try {
      if (!document.referrer) return '(direct)';
      const host = new URL(document.referrer).hostname.toLowerCase();
      if (!host || host === location.hostname) return '(direct)';
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
      ref: referrerHost(),
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
      ref: referrerHost(),
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
    const tabId = sessionStorage.getItem(`uw_tab_${key}`) || (() => {
      const id = newId().slice(0, 16);
      try { sessionStorage.setItem(`uw_tab_${key}`, id); } catch { /* ignore */ }
      return id;
    })();
    const MAX_MS = 5 * 60_000;
    const MAX_BYTES = 5 * 1024 * 1024;
    const FLUSH_BYTES = 180_000;

    const BATCH_EVENTS = 300;
    let flushing = false;
    async function sendBatch(batch) {
      if (!batch.length) return true;
      const body = JSON.stringify(batch);
      if (bytes + body.length > MAX_BYTES) return false;
      const batchId = newId();
      const checksum = String(batchId.length + body.length + seq);
      try {
        const res = await fetch(replayURL, {
          method: 'POST',
          credentials: 'omit',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            vid: visitorId(),
            sid: sessionId(),
            tabId,
            seq,
            clientBatchId: batchId,
            checksum,
            hasFullSnapshot: hasFull || batch.some((e) => e?.type === 2),
            events: batch,
          }),
        });
        if (!res.ok) return false;
        seq += 1;
        bytes += body.length;
        hasFull = hasFull || batch.some((e) => e?.type === 2);
        return true;
      } catch {
        return false;
      }
    }
    async function flush(force) {
      if (flushing || !events.length) return;
      const size = JSON.stringify(events).length;
      if (!force && events.length < BATCH_EVENTS && size < FLUSH_BYTES && Date.now() - started < MAX_MS) return;
      flushing = true;
      try {
        while (events.length) {
          const batch = events.slice(0, BATCH_EVENTS);
          const ok = await sendBatch(batch);
          if (!ok) {
            // keep unsent events for a later retry
            break;
          }
          events = events.slice(BATCH_EVENTS);
        }
      } finally {
        flushing = false;
      }
    }

    // Same host as the tracker so store CSPs that allow tryomer also allow rrweb.
    const scriptEl = document.createElement('script');
    scriptEl.src = new URL('/vendor/rrweb.min.js', base).href;
    scriptEl.async = true;
    scriptEl.onerror = () => { /* recorder unavailable */ };
    scriptEl.onload = () => {
      const record = window.rrweb?.record;
      if (stopped || typeof record !== 'function') return;
      const stop = record({
        emit(event) {
          if (stopped) return;
          events.push(event);
          if (event?.type === 2) {
            hasFull = true;
            void flush(true);
            return;
          }
          if (events.length >= BATCH_EVENTS || JSON.stringify(events).length >= FLUSH_BYTES) void flush(true);
        },
        maskAllInputs: true,
        maskTextSelector: 'input, textarea, [data-uw-mask]',
        blockClass: 'uw-block',
        blockSelector: 'input[type=password], [data-uw-block], .checkout, #checkout',
        recordCanvas: false,
        inlineStylesheet: true,
        checkoutEveryNms: 30_000,
      });
      const timer = window.setInterval(() => void flush(true), 4000);
      const end = () => {
        if (stopped) return;
        stopped = true;
        window.clearInterval(timer);
        try { stop?.(); } catch { /* ignore */ }
        void flush(true);
      };
      window.addEventListener('pagehide', end);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flush(true);
      });
      window.setTimeout(end, MAX_MS);
      stopReplay = () => {
        window.removeEventListener('pagehide', end);
        end();
        stopReplay = null;
      };
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
