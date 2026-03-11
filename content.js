(function () {
  const LOGP = '[ANIT-CHATSORT/CS]';
  const UPDATE_STORAGE_KEY = 'anit_update_info';


  if (self === top && typeof location !== 'undefined' && /\/marketplace\//.test(location.pathname || '')) {
    return;
  }


  try {
    const root = document.documentElement || document.head || document.body;
    const injectStyle = (resourcePath, id) => {
      if (!root || document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(resourcePath);
      root.appendChild(link);
    };
    const injectScript = (resourcePath) => new Promise(resolve => {
      if (!root) return resolve();
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(resourcePath);
      s.async = false;
      s.onload = s.onerror = () => setTimeout(() => {
        try { s.remove(); } catch (_) {}
        resolve();
      }, 0);
      root.appendChild(s);
    });

    injectStyle('vendor/flatpickr/flatpickr-dark.css', 'anit-flatpickr-dark');
    injectScript('vendor/flatpickr/flatpickr.min.js')
      .then(() => injectScript('vendor/flatpickr/flatpickr-ru.js'))
      .then(() => injectScript('injected.js'))
      .catch(e => console.warn(LOGP, 'inject pipeline failed', e));
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

  function storageGetSafe(area, keys, fallbackValue, pick) {
    return new Promise(resolve => {
      try {
        const storageArea = chrome?.storage?.[area];
        if (!chrome?.runtime?.id || !storageArea?.get) {
          resolve(fallbackValue);
          return;
        }
        storageArea.get(keys, res => {
          try {
            if (chrome?.runtime?.lastError) {
              console.warn(LOGP, `storage.${area}.get failed`, chrome.runtime.lastError.message);
              resolve(fallbackValue);
              return;
            }
            resolve(typeof pick === 'function' ? pick(res || {}) : (res || fallbackValue));
          } catch (_) {
            resolve(fallbackValue);
          }
        });
      } catch (e) {
        console.warn(LOGP, `storage.${area}.get failed`, e);
        resolve(fallbackValue);
      }
    });
  }

  function storageSetSafe(area, payload) {
    return new Promise(resolve => {
      try {
        const storageArea = chrome?.storage?.[area];
        if (!chrome?.runtime?.id || !storageArea?.set) {
          resolve(false);
          return;
        }
        storageArea.set(payload, () => {
          if (chrome?.runtime?.lastError) {
            console.warn(LOGP, `storage.${area}.set failed`, chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (e) {
        console.warn(LOGP, `storage.${area}.set failed`, e);
        resolve(false);
      }
    });
  }

  async function getPortals() {
    return await storageGetSafe('sync', ['portals'], {}, res => res?.portals || {});
  }

  async function setPortals(portals) {
    return await storageSetSafe('sync', { portals });
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

    if (d.type === 'ANIT_BXCS_GET_PORTAL_HEALTH') {
      const health = await loadMappingHealth(host);
      postToPage({ type: 'ANIT_BXCS_PORTAL_HEALTH', requestId: reqId, host, health });
      return;
    }

    if (d.type === 'ANIT_BXCS_GET_UPDATE_INFO') {
      const update = await storageGetSafe('local', [UPDATE_STORAGE_KEY], null, res => res?.[UPDATE_STORAGE_KEY] || null);
      postToPage({
        type: 'ANIT_BXCS_UPDATE_INFO',
        requestId: reqId,
        host,
        update
      });
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
  const HEALTH_FAIL_THRESHOLD = 3;

  function getPortalHost() {
    return location.host;
  }

  function hasChatsContainer() {
    return !!(
      document.querySelector('.bx-im-list-container-task__elements')
      || document.querySelector('.bx-im-list-container-recent__elements')
      || document.querySelector('.bx-im-list-task__scroll-container')
      || document.querySelector('.bx-im-list-recent__scroll-container')
    );
  }
  let chatsGateOpened = false;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.type !== 'ANIT_BXCS_CHAT_GATE_OPEN') return;
    chatsGateOpened = true;
    fetchMappingOnce().catch(() => {});
  });

  function getPortalsConfig() {
    return storageGetSafe('sync', ['portals'], {}, res => res?.portals || {});
  }

  function getCacheKey(host) {
    return `anit_bxcs_mapcache_${host}`;
  }

  function loadCache(host) {
    const k = getCacheKey(host);
    return storageGetSafe('local', [k], null, res => res?.[k] || null);
  }

  function saveCache(host, cacheObj) {
    const k = getCacheKey(host);
    return storageSetSafe('local', { [k]: cacheObj });
  }

  function getHealthKey(host) {
    return `anit_bxcs_maphealth_${host}`;
  }

  function loadMappingHealth(host) {
    const k = getHealthKey(host);
    return storageGetSafe('local', [k], { failCount: 0, reason: '', lastFailureAt: 0 }, res => {
      const val = res?.[k];
      if (!val || typeof val !== 'object') {
        return { failCount: 0, reason: '', lastFailureAt: 0 };
      }
      return {
        failCount: Number.isFinite(Number(val.failCount)) ? Number(val.failCount) : 0,
        reason: String(val.reason || ''),
        lastFailureAt: Number.isFinite(Number(val.lastFailureAt)) ? Number(val.lastFailureAt) : 0
      };
    });
  }

  function saveMappingHealth(host, health) {
    const k = getHealthKey(host);
    return storageSetSafe('local', {
      [k]: {
        failCount: Number(health?.failCount || 0),
        reason: String(health?.reason || ''),
        lastFailureAt: Number(health?.lastFailureAt || 0)
      }
    });
  }

  function postMappingHealthToPage(host, health) {
    window.postMessage({
      type: 'ANIT_BXCS_MAPPING_HEALTH',
      host,
      health: {
        failCount: Number(health?.failCount || 0),
        reason: String(health?.reason || ''),
        lastFailureAt: Number(health?.lastFailureAt || 0),
        threshold: HEALTH_FAIL_THRESHOLD
      }
    }, '*');
  }

  function shouldCountAsPortalKeyFailure(status, bodyText) {
    const code = Number(status || 0);
    if (code === 401 || code === 403) return true;
    if (code >= 500) return false;
    const text = String(bodyText || '').toLowerCase();
    if (!text) return false;
    return text.includes('api key required')
      || text.includes('bad api key')
      || text.includes('api key revoked')
      || text.includes('bad api key payload');
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
    if (!chatsGateOpened && !hasChatsContainer()) return;

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
      let bodyText = '';
      try { bodyText = await resp.text(); } catch (_) {}
      if (shouldCountAsPortalKeyFailure(resp.status, bodyText)) {
        const prev = await loadMappingHealth(host);
        const next = {
          failCount: Number(prev.failCount || 0) + 1,
          reason: 'possible_bad_api_key',
          lastFailureAt: Date.now()
        };
        await saveMappingHealth(host, next);
        postMappingHealthToPage(host, next);
      }
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

    const health = await loadMappingHealth(host);
    if ((health.failCount || 0) > 0) {
      const reset = { failCount: 0, reason: '', lastFailureAt: 0 };
      await saveMappingHealth(host, reset);
      postMappingHealthToPage(host, reset);
    }

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

