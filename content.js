(function () {
  const LOGP = '[ANIT-CHATSORT/CS]';

  // 1) Инжект injected.js как и раньше
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.async = false;
    (document.documentElement || document.head || document.body).appendChild(s);
    s.onload = s.onerror = () => setTimeout(() => s.remove(), 0);
  } catch (e) {
    console.warn(LOGP, 'inject failed', e);
  }

  // 2) Маппинг грузим только в TOP (иначе all_frames размножит таймеры)
  if (self !== top) return;

  const INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 часа
  const AGENT_HEADER = { 'X-ANIT-AGENT': 'anitBXChatSorter' };

  function getPortalHost() {
    return location.host;
  }

  function getPortalsConfig() {
    return new Promise(resolve => {
      // структура: { portals: { "<host>": {enabled, serverBase} } }
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
      console.warn(LOGP, 'getPortalsConfig failed', e);
      return;
    }

    const cfg = portals[host];
    if (!cfg || !cfg.enabled || !cfg.serverBase) {
      // нет настроек — работаем как раньше, без маппинга
      return;
    }

    const serverBase = String(cfg.serverBase).replace(/\/$/, '');
    const url = `${serverBase}/mapping.php?portal=${encodeURIComponent(host)}`;

    const cache = await loadCache(host);
    const headers = { ...AGENT_HEADER };
    if (cache?.etag) headers['If-None-Match'] = cache.etag;

    let resp;
    try {
      resp = await fetch(url, { method: 'GET', headers, credentials: 'omit' });
    } catch (e) {
      console.warn(LOGP, 'mapping fetch failed', e);
      // если сеть упала — можем отдать старый bundle в injected (чтобы UI работал)
      if (cache?.bundle) postBundleToPage(host, serverBase, cache.bundle);
      return;
    }

    if (resp.status === 304) {
      // не изменилось
      return;
    }

    if (!resp.ok) {
      console.warn(LOGP, 'mapping bad status', resp.status);
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

  // 3) Первый запуск + каждые 2 часа
  fetchMappingOnce();
  setInterval(fetchMappingOnce, INTERVAL_MS);

  // 4) Если пользователь поменял настройки — подтянуть сразу
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!changes.portals) return;
    fetchMappingOnce();
  });
})();
