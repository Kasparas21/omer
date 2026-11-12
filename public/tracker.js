(() => {
  const script = document.currentScript;
  const key = script?.dataset.site;
  if (!key || window.unfairweekend) return;
  const endpoint = new URL('/v1/collect/install', script.src);
  let pending = false;
  let sent = false;

  window.unfairweekend = {
    consent(preferences) {
      if (preferences?.analytics !== true || pending || sent) return;
      pending = true;
      // This first slice sends only the public write key as the page-view signal.
      fetch(endpoint, { method: 'POST', body: key, credentials: 'omit', keepalive: true })
        .then((response) => { sent = response.ok; })
        .catch(() => {})
        .finally(() => { pending = false; });
    },
  };
})();
