(function () {
  const GITHUB_LATEST = 'https://api.github.com/repos/VYbiteR/bx24_sortOL/releases/latest';
  const STORAGE_KEY = 'anit_update_info';
  const DYNAMIC_CS_ID_PREFIX = 'anit-cs-';
  const BITRIX24_RU_RE = /^[a-z0-9.-]+\.bitrix24\.ru$/i;
  let syncQueue = Promise.resolve();

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
    if (msg?.type === 'ANIT_REGISTER_HOST' && msg.host) {
      const host = String(msg.host).trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
      if (!host) { sendResponse?.({ ok: false }); return true; }
      chrome.storage.sync.get(['portals'], (res) => {
        const portals = res?.portals || {};
        if (!portals[host]) { sendResponse?.({ ok: false }); return; }
        syncContentScriptsForPortals(portals).then(() => sendResponse?.({ ok: true }));
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

  function checkVersion() {
    const manifest = chrome.runtime.getManifest();
    const currentVer = (manifest && manifest.version) || '0';
    const currentParts = parseVersion(currentVer);

    fetch(GITHUB_LATEST, { method: 'GET', credentials: 'omit' })
      .then(r => r.json())
      .then(data => {
        const tag = (data.tag_name || '').trim();
        const latestVer = tag.replace(/^v/i, '');
        const latestParts = parseVersion(latestVer);
        const url = data.html_url || `https://github.com/VYbiteR/bx24_sortOL/releases/tag/${tag}`;

        if (isNewer(latestParts, currentParts)) {
          chrome.storage.local.set({
            [STORAGE_KEY]: { version: latestVer, tag, url, hasUpdate: true }
          }, () => setBadge(true));
        } else {
          chrome.storage.local.set({
            [STORAGE_KEY]: { hasUpdate: false, currentVer }
          }, () => setBadge(false));
        }
      })
      .catch(() => {
        setBadge(false);
      });
  }

  chrome.runtime.onInstalled.addListener(() => {
    checkVersion();
    chrome.storage.sync.get(['portals'], (res) => {
      syncContentScriptsForPortals(res?.portals || {}).catch(() => {});
    });
  });

  chrome.runtime.onStartup.addListener(() => {
    checkVersion();
    chrome.storage.sync.get(['portals'], (res) => {
      syncContentScriptsForPortals(res?.portals || {}).catch(() => {});
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.portals) return;
    const portals = changes.portals?.newValue ?? {};
    syncContentScriptsForPortals(portals).catch(() => {});
  });

  checkVersion();
  setInterval(checkVersion, 24 * 60 * 60 * 1000);
})();
