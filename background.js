(function () {
  const GITHUB_LATEST = 'https://api.github.com/repos/VYbiteR/bx24_sortOL/releases/latest';
  const STORAGE_KEY = 'anit_update_info';


  chrome.runtime.onMessage.addListener((msg, sender, _sendResponse) => {
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
  });

  chrome.runtime.onStartup.addListener(() => {
    checkVersion();
  });

  checkVersion();
  setInterval(checkVersion, 24 * 60 * 60 * 1000);
})();
