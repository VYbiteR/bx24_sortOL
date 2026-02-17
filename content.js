(function () {
  const LOGP = '[ANIT-CHATSORT/CS]';


  if (self === top && typeof location !== 'undefined' && /\/marketplace\//.test(location.pathname || '')) {
    return;
  }


  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.async = false;
    (document.documentElement || document.head || document.body).appendChild(s);
    s.onload = s.onerror = () => setTimeout(() => s.remove(), 0);
  } catch (e) {
    console.warn(LOGP, 'inject failed', e);
  }


  function openOptionsPageSafe() {
    try { chrome.runtime.sendMessage({ type: 'ANIT_BXCS_OPEN_OPTIONS' }).catch?.(() => {}); } catch (_) {}
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.type !== 'ANIT_BXCS_OPEN_OPTIONS') return;
    openOptionsPageSafe();
  });

  function postToPage(payload) {
    try { window.postMessage(payload, '*'); } catch (_) {}
  }

  async function getPortals() {
    return await new Promise(resolve => {
      try {
        chrome.storage.sync.get(['portals'], res => resolve(res?.portals || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  async function setPortals(portals) {
    return await new Promise(resolve => {
      try {
        chrome.storage.sync.set({ portals }, () => resolve(true));
      } catch (_) {
        resolve(false);
      }
    });
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    const reqId = d.requestId;
    const host = String(d.host || '').trim().toLowerCase();
    if (!reqId || !host) return;

    if (d.type === 'ANIT_BXCS_GET_PORTAL_CFG') {
      const portals = await getPortals();
      const cfg = portals[host] || { enabled: false, apiKey: '' };
      postToPage({ type: 'ANIT_BXCS_PORTAL_CFG', requestId: reqId, host, cfg });
      return;
    }

    if (d.type === 'ANIT_BXCS_SET_PORTAL_CFG') {
      const nextCfg = d.cfg || {};
      const enabled = !!nextCfg.enabled;
      const apiKey = String(nextCfg.apiKey || '').trim();
      const portals = await getPortals();
      portals[host] = { enabled, apiKey };
      const ok = await setPortals(portals);
      postToPage({ type: 'ANIT_BXCS_PORTAL_CFG_SAVED', requestId: reqId, host, ok: !!ok });
    }
  });


  if (self !== top) return;

  const INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 часа
  const AGENT_HEADER = { 'X-ANIT-AGENT': 'anitBXChatSorter' };
  const SERVER_BASE = ['https://anitconf.ru', 'apps_bxmp', 'chat_sorter_srv', 'public'].join('/');

  function getPortalHost() {
    return location.host;
  }

  function getPortalsConfig() {
    return new Promise(resolve => {
      // структура: { portals: { "<host>": {enabled, apiKey} } }
      chrome.storage.sync.get(['portals'], res => resolve(res.portals || {}));
    });
  }

  function getCacheKey(host) {
    return `anit_bxcs_mapcache_${host}`;
  }

  function loadCache(host) {
    const k = getCacheKey(host);
    return new Promise(resolve => {
      chrome.storage.local.get([k], res => resolve(res[k] || null));
    });
  }

  function saveCache(host, cacheObj) {
    const k = getCacheKey(host);
    return new Promise(resolve => {
      chrome.storage.local.set({ [k]: cacheObj }, () => resolve());
    });
  }

  function postBundleToPage(host, serverBase, bundle) {
    window.postMessage(
      {
        type: 'ANIT_BXCS_MAPPING',
        host,
        serverBase,
        bundle
      },
      '*'
    );
  }

  async function fetchMappingOnce() {
    const host = getPortalHost();
    let portals;
    try {
      portals = await getPortalsConfig();
    } catch (e) {
      if (e && String(e.message || '').includes('invalidated')) return;
      console.warn(LOGP, 'getPortalsConfig failed', e);
      return;
    }

    const cfg = portals[host];
    if (!cfg || !cfg.enabled || !cfg.apiKey) {
      return;
    }

    const serverBase = SERVER_BASE;
    const apiKey = String(cfg.apiKey || '').trim();
    const url = `${serverBase}/mapping.php?key=${encodeURIComponent(apiKey)}`;

    const cache = await loadCache(host);
    const headers = {};
    if (cache?.etag) {
      headers['If-None-Match'] = '"' + cache.etag + '"';
    }

    let resp;
    try {
      resp = await fetch(url, { method: 'GET', credentials: 'omit', headers });
    } catch (e) {
      console.warn(LOGP, 'mapping fetch failed', e);

      if (cache?.bundle) postBundleToPage(host, serverBase, cache.bundle);
      return;
    }

    if (resp.status === 304) {
      if (cache?.bundle) postBundleToPage(host, serverBase, cache.bundle);
      return;
    }

    if (!resp.ok) {
      if (resp.status !== 304) console.warn(LOGP, 'mapping status', resp.status);
      if (cache?.bundle) postBundleToPage(host, serverBase, cache.bundle);
      return;
    }

    let bundle;
    try {
      bundle = await resp.json();
    } catch (e) {
      console.warn(LOGP, 'mapping json parse failed', e);
      return;
    }

    const etag = (resp.headers.get('ETag') || '').replace(/"/g, '').trim() || null;

    await saveCache(host, {
      etag,
      bundle,
      ts: Date.now(),
      serverBase
    });

    postBundleToPage(host, serverBase, bundle);
  }


  fetchMappingOnce();
  setInterval(fetchMappingOnce, INTERVAL_MS);


  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!changes.portals) return;
    fetchMappingOnce();
  });


  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'anit-refetch-mapping') {
      fetchMappingOnce().then(() => sendResponse?.()).catch(() => sendResponse?.());
      return true;
    }
  });
})();
