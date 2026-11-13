(() => {
  const script = document.currentScript;
  const key = script?.dataset.site;
  if (!key || window.unfairweekend) return;
  const base = new URL(script.src);
  const installURL = new URL('/v1/collect/install', base);
  const eventURL = new URL('/v1/collect/event', base);
  const storeKey = `uw_vid_${key}`;
  let consented = false;
  let installSent = false;
  let pageAt = 0;
  let path = '';
  let cachedId;

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

  function post(body) {
    return fetch(eventURL, {
      method: 'POST',
      body: JSON.stringify(body),
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => undefined);
  }

  function sendDwell() {
    if (!consented || !pageAt) return;
    const ms = Math.min(1_800_000, Math.max(0, Date.now() - pageAt));
    pageAt = 0;
    if (ms < 1000) return;
    void post({ key, type: 'dwell', vid: visitorId(), path, ms });
  }

  function sendPresence() {
    if (!consented || !path || document.visibilityState !== 'visible') return;
    void post({ key, type: 'presence', vid: visitorId(), path });
  }

  function trackPage() {
    if (!consented || path === pagePath()) return;
    sendDwell();
    path = pagePath();
    pageAt = Date.now();
    void post({
      key,
      type: 'pageview',
      vid: visitorId(),
      path,
      ref: referrerHost(),
    });
  }

  function onConsent(preferences) {
    if (preferences?.analytics !== true) {
      if (preferences?.analytics === false && consented) {
        consented = false;
        pageAt = 0;
        path = '';
        cachedId = undefined;
        try { localStorage.removeItem(storeKey); } catch { /* storage unavailable */ }
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
  }

  function identify(input) {
    if (!consented || !input || typeof input !== 'object') return;
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email) return;
    const payload = { key, type: 'identify', vid: visitorId(), path: pagePath(), email };
    if (typeof input.name === 'string' && input.name.trim()) payload.name = input.name.trim().slice(0, 80);
    void post(payload);
  }

  function purchase(input) {
    if (!consented || !input || typeof input !== 'object') return;
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return;
    const payload = {
      key,
      type: 'purchase',
      vid: visitorId(),
      path: pagePath(),
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
    const payload = { key, type, vid: visitorId(), path: pagePath() };
    if (input && typeof input === 'object') {
      if (typeof input.campaign === 'string' && input.campaign.trim()) payload.campaign = input.campaign.trim().slice(0, 120);
      if (typeof input.messageId === 'string' && input.messageId.trim()) payload.messageId = input.messageId.trim().slice(0, 120);
    }
    void post(payload);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDwell();
    else if (consented && !pageAt) {
      pageAt = Date.now();
      sendPresence();
    }
  });
  window.addEventListener('pagehide', sendDwell);
  window.addEventListener('pageshow', (event) => { if (event.persisted) sendPresence(); });
  window.setInterval(sendPresence, 45000);

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
