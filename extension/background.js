chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html#/app') });
});

function collectHeaders(headers) {
  const out = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function forwardRequest(payload) {
  const method = String(payload.method || 'GET').toUpperCase();
  const init = {
    method,
    headers: payload.headers || {},
    redirect: 'follow',
  };
  if (payload.body && method !== 'GET' && method !== 'HEAD') {
    if (payload.body.kind === 'form') {
      const fd = new FormData();
      for (const [key, value] of payload.body.entries) fd.append(key, value);
      init.body = fd;
    } else {
      init.body = payload.body.value;
    }
  }
  const start = Date.now();
  const res = await fetch(payload.url, init);
  const body = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: collectHeaders(res.headers),
    body,
    durationMs: Date.now() - start,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;
  if (message.type === 'curly.ping') {
    sendResponse({ type: 'curly.pong', version: chrome.runtime.getManifest().version });
    return false;
  }
  if (message.type === 'curly.request') {
    forwardRequest(message.payload)
      .then((response) => sendResponse({ ok: true, response }))
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }
  return false;
});
