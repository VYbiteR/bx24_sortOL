(function () {
  const GITHUB_LATEST = 'https://api.github.com/repos/VYbiteR/bx24_sortOL/releases/latest';
  const STORAGE_KEY = 'anit_update_info';
  const LAST_CHECK_STORAGE_KEY = 'anit_update_checked_at';
  const UPDATE_ALARM = 'anit-check-version';
  const UPDATE_INTERVAL_MINUTES = 24 * 60;
  const DYNAMIC_CS_ID_PREFIX = 'anit-cs-';
  const BITRIX24_RU_RE = /^[a-z0-9.-]+\.bitrix24\.ru$/i;
  let syncQueue = Promise.resolve();
  const LOGP = '[ANIT-CHATSORT/BG]';

  function storageLocalGet(key, fallbackValue) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (res) => resolve(res?.[key] ?? fallbackValue));
      } catch (_) {
        resolve(fallbackValue);
      }
    });
  }

  function storageLocalSet(payload) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(payload, () => resolve());
      } catch (_) {
        resolve();
      }
    });
  }

  function isCustomHost(host) {
    const h = String(host || '').trim().toLowerCase();
    if (!h) return false;
    return !BITRIX24_RU_RE.test(h);
  }

  function hostToScriptId(host) {
    return DYNAMIC_CS_ID_PREFIX + host.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
  }

  function getCustomHostOrigins(host) {
    const h = host.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    return ['https://' + h + '/*', 'http://' + h + '/*'];
  }

  function requestHostPermission(host) {
    const origins = getCustomHostOrigins(host);
    if (!chrome.permissions || !chrome.permissions.request) {
      console.warn(LOGP, 'permissions.request unavailable', { host, origins });
      return Promise.resolve({ granted: false, available: false });
    }
    return chrome.permissions.request({ origins })
      .then((granted) => {
        console.info(LOGP, 'permissions.request result', { host, origins, granted: !!granted });
        return { granted: !!granted, available: true };
      })
      .catch((e) => {
        console.warn(LOGP, 'permissions.request failed', { host, origins, error: String(e?.message || e) });
        return { granted: false, available: true, error: String(e?.message || e) };
      });
  }

  function containsHostPermission(host) {
    const origins = getCustomHostOrigins(host);
    if (!chrome.permissions || !chrome.permissions.contains) {
      return Promise.resolve({ hasPermission: false, available: false });
    }
    return chrome.permissions.contains({ origins })
      .then((hasPermission) => ({ hasPermission: !!hasPermission, available: true }))
      .catch((e) => ({ hasPermission: false, available: true, error: String(e?.message || e) }));
  }

  function runSyncContentScriptsForPortals(portals) {
    if (!chrome.scripting || !chrome.scripting.getRegisteredContentScripts) return Promise.resolve();
    const customHosts = Object.keys(portals || {}).filter(isCustomHost);
    return chrome.scripting.getRegisteredContentScripts()
      .then((registered) => {
        const our = (registered || []).filter((r) => r.id && r.id.startsWith(DYNAMIC_CS_ID_PREFIX));
        const toRemove = our.filter((r) => !customHosts.some((h) => hostToScriptId(h) === r.id));
        const toAdd = customHosts.filter((h) => !our.some((r) => r.id === hostToScriptId(h)));
        let p = Promise.resolve();
        toRemove.forEach((r) => {
          p = p.then(() =>
            chrome.scripting.unregisterContentScripts({ ids: [r.id] }).catch((e) => {
              console.warn('[ANIT-CHATSORT/BG] unregisterContentScripts failed', r?.id, e);
            })
          );
        });
        toAdd.forEach((host) => {
          const id = hostToScriptId(host);
          const origins = getCustomHostOrigins(host);
          p = p.then(() =>
            chrome.scripting.registerContentScripts([{
              id,
              matches: origins,
              js: ['content.js'],
              runAt: 'document_start',
              allFrames: true,
            }]).catch((e) => {
              // Возможна гонка между несколькими sync-вызовами: дубликат id не критичен.
              if (String(e?.message || '').includes('Duplicate script ID')) return;
              console.warn('[ANIT-CHATSORT/BG] registerContentScripts failed', host, origins, e);
            })
          );
        });
        return p;
      })
      .catch((e) => {
        console.warn('[ANIT-CHATSORT/BG] syncContentScriptsForPortals failed', e);
      });
  }

  function syncContentScriptsForPortals(portals) {
    syncQueue = syncQueue
      .catch(() => {})
      .then(() => runSyncContentScriptsForPortals(portals));
    return syncQueue;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'ANIT_SYNC_CONTENT_SCRIPTS') {
      chrome.storage.sync.get(['portals'], (res) => {
        syncContentScriptsForPortals(res?.portals || {}).then(() => sendResponse?.({ ok: true }));
      });
      return true;
    }
    if (msg?.type === 'ANIT_REQUEST_HOST_PERMISSION' && msg.host) {
      const host = String(msg.host).trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
      if (!host) { sendResponse?.({ ok: false, granted: false }); return true; }
      requestHostPermission(host).then(async (req) => {
        const contains = await containsHostPermission(host);
        sendResponse?.({
          ok: true,
          granted: !!req.granted,
          apiAvailable: !!req.available,
          hasPermission: !!contains.hasPermission,
          error: req.error || contains.error || ''
        });
      });
      return true;
    }
    if (msg?.type === 'ANIT_CHECK_HOST_PERMISSION' && msg.host) {
      const host = String(msg.host).trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
      if (!host) { sendResponse?.({ ok: false, hasPermission: false }); return true; }
      containsHostPermission(host).then((res) => {
        sendResponse?.({
          ok: true,
          hasPermission: !!res.hasPermission,
          apiAvailable: !!res.available,
          error: res.error || ''
        });
      });
      return true;
    }
    if (msg?.type !== 'ANIT_BXCS_OPEN_OPTIONS') return;
    const url = chrome.runtime.getURL('options.html');
    try {
      if (typeof chrome.runtime.openOptionsPage === 'function') {
        chrome.runtime.openOptionsPage();
        return;
      }
    } catch (_) {}
    try {
      if (chrome.tabs && typeof chrome.tabs.create === 'function') {
        chrome.tabs.create({ url });
        return;
      }
    } catch (_) {}
    try {
      const tabId = sender?.tab?.id;
      if (tabId != null && chrome.tabs && typeof chrome.tabs.update === 'function') {
        chrome.tabs.update(tabId, { url });
      }
    } catch (_) {}
  });

  function parseVersion(s) {
    const v = String(s || '').replace(/^v/i, '').trim();
    const parts = v.split('.').map(n => parseInt(n, 10) || 0);
    return parts;
  }

  function isNewer(latestParts, currentParts) {
    const len = Math.max(latestParts.length, currentParts.length);
    for (let i = 0; i < len; i++) {
      const a = latestParts[i] || 0;
      const b = currentParts[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return false;
  }

  function setBadge(hasUpdate) {
    try {
      if (typeof chrome.action === 'undefined') return;
      if (hasUpdate) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#e6a800' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    } catch (_) {}
  }

  function ensureVersionAlarm() {
    if (!chrome.alarms?.create) return;
    chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: UPDATE_INTERVAL_MINUTES });
  }

  async function checkVersion({ force = false } = {}) {
    const now = Date.now();
    const lastCheckedAt = await storageLocalGet(LAST_CHECK_STORAGE_KEY, 0);
    if (!force && lastCheckedAt && (now - Number(lastCheckedAt)) < (UPDATE_INTERVAL_MINUTES * 60 * 1000)) {
      return;
    }
    await storageLocalSet({ [LAST_CHECK_STORAGE_KEY]: now });

    const manifest = chrome.runtime.getManifest();
    const currentVer = (manifest && manifest.version) || '0';
    const currentParts = parseVersion(currentVer);

    return fetch(GITHUB_LATEST, { method: 'GET', credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error(`github_status_${r.status}`);
        return r.json();
      })
      .then(data => {
        const tag = (data.tag_name || '').trim();
        const latestVer = tag.replace(/^v/i, '');
        const latestParts = parseVersion(latestVer);
        const url = data.html_url || `https://github.com/VYbiteR/bx24_sortOL/releases/tag/${tag}`;

        if (isNewer(latestParts, currentParts)) {
          return storageLocalSet({
            [STORAGE_KEY]: { version: latestVer, tag, url, hasUpdate: true }
          }).then(() => setBadge(true));
        }
        return storageLocalSet({
          [STORAGE_KEY]: { hasUpdate: false, currentVer }
        }).then(() => setBadge(false));
      })
      .catch((e) => {
        console.warn(LOGP, 'checkVersion failed', String(e?.message || e));
        setBadge(false);
      });
  }

  chrome.runtime.onInstalled.addListener(() => {
    ensureVersionAlarm();
    checkVersion({ force: true });
    chrome.storage.sync.get(['portals'], (res) => {
      syncContentScriptsForPortals(res?.portals || {}).catch(() => {});
    });
  });

  chrome.runtime.onStartup.addListener(() => {
    ensureVersionAlarm();
    checkVersion();
    chrome.storage.sync.get(['portals'], (res) => {
      syncContentScriptsForPortals(res?.portals || {}).catch(() => {});
    });
  });

  chrome.alarms?.onAlarm.addListener((alarm) => {
    if (alarm?.name !== UPDATE_ALARM) return;
    checkVersion({ force: true }).catch(() => {});
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.portals) return;
    const portals = changes.portals?.newValue ?? {};
    syncContentScriptsForPortals(portals).catch(() => {});
  });

  ensureVersionAlarm();
})();
