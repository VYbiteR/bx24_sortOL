(function () {
  const LOGP = '[ANIT-CHATSORT/CS]';
  const UPDATE_STORAGE_KEY = 'anit_update_info';
  const CHAT_FOLDERS_STORAGE_KEY = 'anit_chat_folders_v1';
  const DEFAULT_FOLDER_COLORS = ['#5d8cff', '#2fbf71', '#ff8a4c', '#a66bff', '#e05383', '#00a7b7'];


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
      .then(() => injectScript('injected-folders.js'))
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

  function createRequestId(prefix) {
    return `${String(prefix || 'anit')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizePortalHost(host) {
    return String(host || '').trim().toLowerCase();
  }

  function normalizeChatId(chatId) {
    const value = String(chatId || '').trim();
    if (!value) return '';
    return value;
  }

  function normalizeFolderId(folderId) {
    return String(folderId || '').trim();
  }

  function normalizeFolderMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    if (value === 'ol') return 'ol';
    return 'internal';
  }

  function sanitizeFolderName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 64);
  }

  function pickFolderColor(index) {
    return DEFAULT_FOLDER_COLORS[index % DEFAULT_FOLDER_COLORS.length];
  }

  function normalizeFolderRecord(folder, index) {
    const name = sanitizeFolderName(folder?.name);
    const id = normalizeFolderId(folder?.id) || `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      name: name || `Folder ${index + 1}`,
      color: String(folder?.color || pickFolderColor(index)).trim() || pickFolderColor(index),
      createdAt: Number(folder?.createdAt || Date.now())
    };
  }

  function normalizePortalFoldersState(state) {
    const foldersInput = Array.isArray(state?.folders) ? state.folders : [];
    const folders = [];
    const seenFolderIds = new Set();
    foldersInput.forEach((folder, index) => {
      const normalized = normalizeFolderRecord(folder, index);
      if (seenFolderIds.has(normalized.id)) return;
      seenFolderIds.add(normalized.id);
      folders.push(normalized);
    });

    const validFolderIds = new Set(folders.map((folder) => folder.id));
    const chatFolders = {};
    const rawChatFolders = state?.chatFolders && typeof state.chatFolders === 'object' ? state.chatFolders : {};
    Object.entries(rawChatFolders).forEach(([chatId, folderValue]) => {
      const normalizedChatId = normalizeChatId(chatId);
      if (!normalizedChatId) return;

      const rawFolderIds = Array.isArray(folderValue) ? folderValue : [folderValue];
      const normalizedFolderIds = Array.from(new Set(
        rawFolderIds
          .map(normalizeFolderId)
          .filter((folderId) => folderId && validFolderIds.has(folderId))
      ));

      if (!normalizedFolderIds.length) return;
      chatFolders[normalizedChatId] = normalizedFolderIds;
    });

    return {
      folders,
      chatFolders,
      updatedAt: Number(state?.updatedAt || 0)
    };
  }

  function normalizeChatFoldersStore(store) {
    const byPortal = {};
    const input = store?.byPortal && typeof store.byPortal === 'object' ? store.byPortal : {};
    Object.entries(input).forEach(([host, state]) => {
      const normalizedHost = normalizePortalHost(host);
      if (!normalizedHost) return;
      byPortal[normalizedHost] = {
        ol: normalizePortalFoldersState(state?.ol || {}),
        internal: normalizePortalFoldersState(state?.internal || state || {})
      };
    });
    return {
      version: 1,
      byPortal
    };
  }

  async function getChatFoldersStore() {
    return await storageGetSafe('local', [CHAT_FOLDERS_STORAGE_KEY], { version: 1, byPortal: {} }, (res) => {
      return normalizeChatFoldersStore(res?.[CHAT_FOLDERS_STORAGE_KEY] || { version: 1, byPortal: {} });
    });
  }

  async function saveChatFoldersStore(store) {
    return await storageSetSafe('local', {
      [CHAT_FOLDERS_STORAGE_KEY]: normalizeChatFoldersStore(store)
    });
  }

  async function getPortalFoldersState(host, mode) {
    const normalizedHost = normalizePortalHost(host);
    const normalizedMode = normalizeFolderMode(mode);
    const store = await getChatFoldersStore();
    return normalizePortalFoldersState(store.byPortal?.[normalizedHost]?.[normalizedMode] || {});
  }

  function postFoldersStateToPage(host, mode, state) {
    postToPage({
      type: 'ANIT_BXCS_CHAT_FOLDERS_STATE',
      host: normalizePortalHost(host),
      mode: normalizeFolderMode(mode),
      state: normalizePortalFoldersState(state)
    });
  }

  async function updatePortalFoldersState(host, mode, updater) {
    const normalizedHost = normalizePortalHost(host);
    const normalizedMode = normalizeFolderMode(mode);
    if (!normalizedHost) {
      return { ok: false, error: 'host_required' };
    }

    const store = await getChatFoldersStore();
    const portalEntry = store.byPortal?.[normalizedHost] || { ol: {}, internal: {} };
    const currentState = normalizePortalFoldersState(portalEntry?.[normalizedMode] || {});
    const nextStateRaw = typeof updater === 'function' ? await updater(currentState) : currentState;
    const nextState = normalizePortalFoldersState({
      ...(nextStateRaw || currentState),
      updatedAt: Date.now()
    });

    store.byPortal[normalizedHost] = {
      ol: normalizePortalFoldersState(portalEntry?.ol || {}),
      internal: normalizePortalFoldersState(portalEntry?.internal || {})
    };
    store.byPortal[normalizedHost][normalizedMode] = nextState;
    const persisted = await saveChatFoldersStore(store);
    if (!persisted) {
      console.warn(LOGP, 'chat folders persist failed', { host: normalizedHost, mode: normalizedMode });
      return { ok: false, error: 'storage_persist_failed' };
    }
    postFoldersStateToPage(normalizedHost, normalizedMode, nextState);
    return { ok: true, state: nextState };
  }

  async function upsertPortalFolder(host, mode, folder) {
    const normalizedFolderId = normalizeFolderId(folder?.id);
    const nextFolderName = sanitizeFolderName(folder?.name);
    if (!nextFolderName) {
      return { ok: false, error: 'folder_name_required' };
    }

    let createdFolder = null;
    const result = await updatePortalFoldersState(host, mode, (currentState) => {
      const folders = currentState.folders.slice();
      const existingIndex = normalizedFolderId ? folders.findIndex((item) => item.id === normalizedFolderId) : -1;

      if (existingIndex >= 0) {
        folders[existingIndex] = {
          ...folders[existingIndex],
          name: nextFolderName,
          color: String(folder?.color || folders[existingIndex].color || pickFolderColor(existingIndex)).trim() || pickFolderColor(existingIndex)
        };
        createdFolder = folders[existingIndex];
      } else {
        createdFolder = normalizeFolderRecord({
          id: normalizedFolderId || undefined,
          name: nextFolderName,
          color: folder?.color
        }, folders.length);
        folders.push(createdFolder);
      }

      return {
        ...currentState,
        folders
      };
    });

    return {
      ...result,
      folder: createdFolder
    };
  }

  async function deletePortalFolder(host, mode, folderId) {
    const normalizedFolderId = normalizeFolderId(folderId);
    if (!normalizedFolderId) {
      return { ok: false, error: 'folder_id_required' };
    }

    return await updatePortalFoldersState(host, mode, (currentState) => {
      const folders = currentState.folders.filter((folder) => folder.id !== normalizedFolderId);
      const chatFolders = {};
      Object.entries(currentState.chatFolders).forEach(([chatId, mappedFolderIds]) => {
        const nextFolderIds = (Array.isArray(mappedFolderIds) ? mappedFolderIds : [mappedFolderIds])
          .map(normalizeFolderId)
          .filter((folderId) => folderId && folderId !== normalizedFolderId);
        if (nextFolderIds.length) {
          chatFolders[chatId] = Array.from(new Set(nextFolderIds));
        }
      });
      return {
        ...currentState,
        folders,
        chatFolders
      };
    });
  }

  async function assignChatsToFolder(host, mode, chatIds, folderId, options = {}) {
    const normalizedChatIds = Array.isArray(chatIds)
      ? Array.from(new Set(chatIds.map(normalizeChatId).filter(Boolean)))
      : [];
    const normalizedFolderIds = Array.isArray(options.folderIds)
      ? Array.from(new Set(options.folderIds.map(normalizeFolderId).filter(Boolean)))
      : Array.from(new Set((Array.isArray(folderId) ? folderId : [folderId]).map(normalizeFolderId).filter(Boolean)));
    const operation = String(options.operation || 'replace').trim().toLowerCase();

    return await updatePortalFoldersState(host, mode, (currentState) => {
      const validFolderIds = new Set(currentState.folders.map((folder) => folder.id));
      const chatFolders = { ...currentState.chatFolders };
      normalizedChatIds.forEach((chatId) => {
        const currentFolderIds = Array.isArray(chatFolders[chatId]) ? chatFolders[chatId] : [];
        const nextFolderIds = normalizedFolderIds.filter((id) => validFolderIds.has(id));

        if (operation === 'clear' || (!nextFolderIds.length && operation === 'replace')) {
          delete chatFolders[chatId];
          return;
        }

        if (operation === 'add') {
          const merged = Array.from(new Set([...currentFolderIds, ...nextFolderIds]));
          if (merged.length) chatFolders[chatId] = merged;
          return;
        }

        if (operation === 'remove') {
          const filtered = currentFolderIds.filter((id) => !nextFolderIds.includes(id));
          if (filtered.length) chatFolders[chatId] = filtered;
          else delete chatFolders[chatId];
          return;
        }

        if (nextFolderIds.length) {
          chatFolders[chatId] = nextFolderIds;
        }
      });
      return {
        ...currentState,
        chatFolders
      };
    });
  }

  async function exportPortalFolders(host, mode) {
    const normalizedHost = normalizePortalHost(host);
    const normalizedMode = normalizeFolderMode(mode);
    const state = await getPortalFoldersState(normalizedHost, normalizedMode);
    return {
      version: 1,
      host: normalizedHost,
      mode: normalizedMode,
      exportedAt: new Date().toISOString(),
      portal: state
    };
  }

  async function importPortalFolders(host, mode, payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const nextHost = normalizePortalHost(source.host || host);
    const nextMode = normalizeFolderMode(source.mode || mode);
    if (!nextHost) {
      return { ok: false, error: 'host_required' };
    }

    const state = normalizePortalFoldersState(source.portal || source.state || source);
    const result = await updatePortalFoldersState(nextHost, nextMode, () => state);
    return {
      ...result,
      host: nextHost,
      mode: nextMode
    };
  }

  function isOlFrameDom() {
    return !!document.querySelector('.bx-messenger-recent-wrap.bx-messenger-recent-lines-wrap .bx-messenger-cl-item');
  }

  function isTasksChatDom() {
    return !!(
      document.querySelector('.bx-im-list-container-task__elements .bx-im-list-recent-item__wrap')
      || document.querySelector('.bx-im-list-task__scroll-container .bx-im-list-recent-item__wrap')
    );
  }

  function isInternalChatDom() {
    return !!(
      document.querySelector('.bx-im-list-container-recent__elements .bx-im-list-recent-item__wrap')
      || document.querySelector('.bx-im-list-container-task__elements .bx-im-list-recent-item__wrap')
      || document.querySelector('.bx-im-list-recent__scroll-container .bx-im-list-recent-item__wrap')
    );
  }

  function detectChatMode() {
    if (isOlFrameDom()) return 'ol';
    if (isTasksChatDom()) return 'tasks';
    if (isInternalChatDom()) return 'internal';
    return 'none';
  }

  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function getCurrentChatsSnapshot() {
    const mode = detectChatMode();
    if (mode === 'none') {
      return { mode, chats: [] };
    }

    if (mode === 'ol') {
      const chats = Array.from(document.querySelectorAll('.bx-messenger-recent-wrap.bx-messenger-recent-lines-wrap .bx-messenger-cl-item')).map((el) => {
        const id = normalizeChatId(el.getAttribute('data-userid') || el.dataset.userid);
        const title = normalizeText(el.querySelector('.bx-messenger-cl-user-title')?.textContent);
        const lastText = normalizeText(el.querySelector('.bx-messenger-cl-user-desc')?.textContent);
        const status = normalizeText(el.getAttribute('data-status') || el.dataset.status);
        const className = String(el.className || '');
        const channel = /-wz_whatsapp_/i.test(className) ? 'whatsapp' : /-wz_telegram_/i.test(className) ? 'telegram' : '';
        return {
          id,
          title,
          lastText,
          hasUnread: !!el.querySelector('.bx-messenger-cl-count-digit'),
          status,
          channel
        };
      }).filter((chat) => chat.id && chat.title);
      return { mode, chats };
    }

    const chats = Array.from(document.querySelectorAll('.bx-im-list-recent-item__wrap')).map((el) => {
      const id = normalizeChatId(
        el.getAttribute('data-id')
        || el.dataset.id
        || el.querySelector('[data-id]')?.getAttribute('data-id')
      );
      const title = normalizeText(
        el.querySelector('.bx-im-chat-title__text')?.getAttribute('title')
        || el.querySelector('.bx-im-chat-title__text')?.textContent
      );
      const lastText = normalizeText(el.querySelector('.bx-im-list-recent-item__message_text')?.textContent);
      const unreadText = normalizeText(
        el.querySelector('.bx-im-list-recent-item__counter_number')?.textContent
        || el.querySelector('.bx-im-list-recent-item__counters')?.textContent
      );
      return {
        id,
        title,
        lastText,
        hasUnread: /\d/.test(unreadText),
        status: '',
        channel: ''
      };
    }).filter((chat) => chat.id && chat.title);

    return { mode, chats };
  }

  async function buildPopupState(host) {
    const normalizedHost = normalizePortalHost(host || location.host);
    const mode = normalizeFolderMode(detectChatMode());
    const portalState = await getPortalFoldersState(normalizedHost, mode);
    const snapshot = getCurrentChatsSnapshot();
    const folderMap = portalState.chatFolders || {};
    const folderLookup = new Map((portalState.folders || []).map((folder) => [folder.id, folder]));
    const chats = snapshot.chats.map((chat) => {
      const folderIds = Array.isArray(folderMap[chat.id]) ? folderMap[chat.id] : [];
      const folders = folderIds.map((folderId) => folderLookup.get(folderId)).filter(Boolean);
      return {
        ...chat,
        folderIds,
        folderNames: folders.map((folder) => folder.name),
        folderColors: folders.map((folder) => folder.color)
      };
    });

    return {
      ok: true,
      host: normalizedHost,
      mode,
      folders: portalState.folders,
      chatFolders: portalState.chatFolders,
      chats
    };
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
      return;
    }

    if (d.type === 'ANIT_BXCS_CHAT_FOLDERS_REQUEST') {
      const action = String(d.action || '').trim();
      const payload = d.payload && typeof d.payload === 'object' ? d.payload : {};
      const mode = normalizeFolderMode(d.mode || payload.mode || detectChatMode());
      let response = { ok: false, error: 'unknown_action' };

      if (action === 'GET_STATE') {
        response = {
          ok: true,
          state: await getPortalFoldersState(host, mode)
        };
      } else if (action === 'UPSERT_FOLDER') {
        response = await upsertPortalFolder(host, mode, payload.folder || {});
      } else if (action === 'DELETE_FOLDER') {
        response = await deletePortalFolder(host, mode, payload.folderId);
      } else if (action === 'ASSIGN_CHATS') {
        response = await assignChatsToFolder(host, mode, payload.chatIds, payload.folderId, payload);
      } else if (action === 'EXPORT_PORTAL') {
        response = {
          ok: true,
          data: await exportPortalFolders(host, mode)
        };
      } else if (action === 'IMPORT_PORTAL') {
        response = await importPortalFolders(host, mode, payload.data);
      }

      postToPage({
        type: 'ANIT_BXCS_CHAT_FOLDERS_RESPONSE',
        requestId: reqId,
        host,
        mode,
        action,
        ...response
      });
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

    const requestedMode = String(msg?.targetMode || '').trim();
    const currentMode = detectChatMode();
    const shouldHandleMode = !requestedMode || requestedMode === currentMode;

    if (msg?.type === 'ANIT_BXCS_POPUP_GET_STATE') {
      if (currentMode === 'none' || !shouldHandleMode) return false;
      buildPopupState(msg.host || location.host)
        .then((state) => sendResponse?.(state))
        .catch((error) => sendResponse?.({ ok: false, error: String(error?.message || error || 'popup_state_failed') }));
      return true;
    }

    if (msg?.type === 'ANIT_BXCS_POPUP_ASSIGN_FOLDER') {
      if (!shouldHandleMode) return false;
      assignChatsToFolder(msg.host || location.host, normalizeFolderMode(msg.targetMode || currentMode), msg.chatIds, msg.folderId)
        .then(async (result) => {
          const state = await buildPopupState(msg.host || location.host);
          sendResponse?.({ ...state, ok: !!result.ok });
        })
        .catch((error) => sendResponse?.({ ok: false, error: String(error?.message || error || 'assign_failed') }));
      return true;
    }

    if (msg?.type === 'ANIT_BXCS_POPUP_UPSERT_FOLDER') {
      if (!shouldHandleMode) return false;
      upsertPortalFolder(msg.host || location.host, normalizeFolderMode(msg.targetMode || currentMode), msg.folder || {})
        .then(async (result) => {
          const state = await buildPopupState(msg.host || location.host);
          sendResponse?.({ ...state, ok: !!result.ok, folder: result.folder || null });
        })
        .catch((error) => sendResponse?.({ ok: false, error: String(error?.message || error || 'upsert_failed') }));
      return true;
    }

    if (msg?.type === 'ANIT_BXCS_POPUP_DELETE_FOLDER') {
      if (!shouldHandleMode) return false;
      deletePortalFolder(msg.host || location.host, normalizeFolderMode(msg.targetMode || currentMode), msg.folderId)
        .then(async (result) => {
          const state = await buildPopupState(msg.host || location.host);
          sendResponse?.({ ...state, ok: !!result.ok });
        })
        .catch((error) => sendResponse?.({ ok: false, error: String(error?.message || error || 'delete_failed') }));
      return true;
    }

    if (msg?.type === 'ANIT_BXCS_POPUP_EXPORT_FOLDERS') {
      exportPortalFolders(msg.host || location.host, normalizeFolderMode(msg.targetMode || currentMode))
        .then((data) => sendResponse?.({ ok: true, data }))
        .catch((error) => sendResponse?.({ ok: false, error: String(error?.message || error || 'export_failed') }));
      return true;
    }

    if (msg?.type === 'ANIT_BXCS_POPUP_IMPORT_FOLDERS') {
      importPortalFolders(msg.host || location.host, normalizeFolderMode(msg.targetMode || currentMode), msg.data)
        .then(async (result) => {
          const state = await buildPopupState(result.host || msg.host || location.host);
          sendResponse?.({ ...state, ok: !!result.ok });
        })
        .catch((error) => sendResponse?.({ ok: false, error: String(error?.message || error || 'import_failed') }));
      return true;
    }
  });
})();

