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

  function visitorId() {
    try {
      let id = localStorage.getItem(storeKey);
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) || `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        localStorage.setItem(storeKey, id);
      }
      return id;
    } catch {
      return `session_${Math.random().toString(36).slice(2)}`;
    }
  }

  function pagePath() {
    const value = `${location.pathname || '/'}${location.search || ''}`;
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

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      body,
      credentials: 'omit',
      keepalive: true,
      headers: typeof body === 'string' && body.startsWith('{') ? { 'Content-Type': 'application/json' } : undefined,
    }).catch(() => undefined);
  }

  function sendDwell() {
    if (!consented || !pageAt) return;
    const ms = Math.min(1_800_000, Math.max(0, Date.now() - pageAt));
    pageAt = 0;
    if (ms < 1000) return;
    void post(eventURL, JSON.stringify({ key, type: 'dwell', vid: visitorId(), path, ms }));
  }

  function trackPage() {
    if (!consented) return;
    sendDwell();
    path = pagePath();
    pageAt = Date.now();
    void post(eventURL, JSON.stringify({
      key,
      type: 'pageview',
      vid: visitorId(),
      path,
      ref: referrerHost(),
    }));
  }

  function onConsent(preferences) {
    if (preferences?.analytics !== true) {
      if (preferences?.analytics === false) {
        consented = false;
        sendDwell();
      }
      return;
    }
    if (consented) return;
    consented = true;
    if (!installSent) {
      installSent = true;
      void post(installURL, key);
    }
    trackPage();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendDwell();
    else if (consented && !pageAt) pageAt = Date.now();
  });
  window.addEventListener('pagehide', sendDwell);

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

  window.unfairweekend = { consent: onConsent };
})();
