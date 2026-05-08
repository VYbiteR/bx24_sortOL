(function () {
  const root = window.__ANIT_BXCS_MODULES__ = window.__ANIT_BXCS_MODULES__ || {};

  root.createFolderDomain = function createFolderDomain(deps) {
    const FOLDER_FILTER_ALL = 'all';
    const FOLDER_FILTER_NONE = '__none__';
    const waiters = new Map();
    let folderState = { folders: [], chatFolders: {}, updatedAt: 0 };

    function normalizeFolderId(folderId) {
      return String(folderId || '').trim();
    }

    function normalizeFolderName(name) {
      return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 64);
    }

    function normalizeChatIdValue(chatId) {
      return String(chatId || '').trim();
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function normalizeFolderState(state) {
      const foldersInput = Array.isArray(state?.folders) ? state.folders : [];
      const folders = [];
      const seenFolderIds = new Set();
      foldersInput.forEach((folder, index) => {
        const id = normalizeFolderId(folder?.id) || `folder_${index}`;
        if (seenFolderIds.has(id)) return;
        seenFolderIds.add(id);
        folders.push({
          id,
          name: normalizeFolderName(folder?.name) || `Folder ${index + 1}`,
          color: String(folder?.color || '').trim() || '#5d8cff',
          createdAt: Number(folder?.createdAt || Date.now())
        });
      });

      const validFolderIds = new Set(folders.map((folder) => folder.id));
      const chatFolders = {};
      const rawChatFolders = state?.chatFolders && typeof state.chatFolders === 'object' ? state.chatFolders : {};
      Object.entries(rawChatFolders).forEach(([chatId, folderValue]) => {
        const normalizedChatId = normalizeChatIdValue(chatId);
        if (!normalizedChatId) return;
        const normalizedFolderIds = Array.from(new Set(
          (Array.isArray(folderValue) ? folderValue : [folderValue])
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

    function setFolderState(nextState) {
      folderState = normalizeFolderState(nextState);
      try {
        window.dispatchEvent(new CustomEvent('ANIT_BXCS_FOLDERS_UPDATED', {
          detail: {
            mode: deps.getMode(),
            state: folderState
          }
        }));
      } catch (_) {}
    }

    function getFolderById(folderId) {
      const normalizedFolderId = normalizeFolderId(folderId);
      if (!normalizedFolderId) return null;
      return folderState.folders.find((folder) => folder.id === normalizedFolderId) || null;
    }

    function getAssignedFolderIds(chatId) {
      const normalizedChatId = normalizeChatIdValue(chatId);
      return normalizedChatId && Array.isArray(folderState.chatFolders?.[normalizedChatId])
        ? folderState.chatFolders[normalizedChatId].slice()
        : [];
    }

    function enrichMetaWithFolder(meta) {
      if (!meta || !meta.id) return meta;
      meta.folderIds = getAssignedFolderIds(meta.id);
      return meta;
    }

    function syncFolderFilterValue() {
      const filters = deps.getFilters();
      if (!filters) return;
      const activeFolderId = String(filters.folderId || FOLDER_FILTER_ALL);
      if (activeFolderId === FOLDER_FILTER_ALL || activeFolderId === FOLDER_FILTER_NONE) return;
      if (!getFolderById(activeFolderId)) {
        filters.folderId = FOLDER_FILTER_ALL;
      }
    }

    function renderFolderFilterTabs(host) {
      const rootNode = host?.querySelector?.('#anit_folder_tabs');
      if (!rootNode) return;

      syncFolderFilterValue();
      const filters = deps.getFilters();
      const activeFolderId = String(filters?.folderId || FOLDER_FILTER_ALL);
      const items = [
        { id: FOLDER_FILTER_ALL, name: 'Все' },
        ...folderState.folders.map((folder) => ({ id: folder.id, name: folder.name, color: folder.color })),
        { id: FOLDER_FILTER_NONE, name: 'Без папки' }
      ];

      rootNode.innerHTML = items.map((item) => {
        const safeColor = String(item.color || '').replace(/"/g, '');
        const isActive = activeFolderId === item.id;
        const style = safeColor ? ` style="--folder-chip-color:${safeColor}"` : '';
        return `<button type="button" class="anit-folder-chip${isActive ? ' is-selected' : ''}" data-folder-filter="${escapeHtml(item.id)}"${style}>${escapeHtml(item.name)}</button>`;
      }).join('');
    }

    function requestBridge(action, payload = {}) {
      return new Promise((resolve) => {
        const requestId = deps.createRequestId(`folder_${action.toLowerCase()}`);
        waiters.set(requestId, resolve);
        try {
          window.postMessage({
            type: 'ANIT_BXCS_CHAT_FOLDERS_REQUEST',
            requestId,
            host: deps.getPortalHost(),
            mode: deps.getMode(),
            action,
            payload
          }, '*');
        } catch (_) {
          waiters.delete(requestId);
          resolve({ ok: false, error: 'bridge_post_failed' });
        }
        setTimeout(() => {
          if (!waiters.has(requestId)) return;
          waiters.delete(requestId);
          resolve({ ok: false, error: 'bridge_timeout' });
        }, 5000);
      });
    }

    async function refreshState() {
      const response = await requestBridge('GET_STATE');
      if (response?.state) {
        setFolderState(response.state);
      }
      return response;
    }

    function resolveBridgeResponse(data) {
      if (!data || data.type !== 'ANIT_BXCS_CHAT_FOLDERS_RESPONSE' || !data.requestId) return false;
      const resolve = waiters.get(data.requestId);
      if (!resolve) return true;
      waiters.delete(data.requestId);
      resolve(data);
      return true;
    }

    function showBridgeError(response, fallbackMessage) {
      const errorCode = String(response?.error || '').trim();
      const message = errorCode === 'storage_persist_failed'
        ? 'Не удалось сохранить папки в хранилище браузера. Повторите действие после перезагрузки расширения.'
        : fallbackMessage;
      if (!message) return;
      try { window.alert(message); } catch (_) {}
    }

    const bridgeLayer = root.createFolderBridgeLayer({
      getState: () => normalizeFolderState(folderState),
      refreshState,
      requestBridge
    });

    return Object.freeze({
      constants: { FOLDER_FILTER_ALL, FOLDER_FILTER_NONE },
      normalizeFolderId,
      escapeHtml,
      normalizeFolderState,
      getState: () => normalizeFolderState(folderState),
      setState: setFolderState,
      getAssignedFolderIds,
      enrichMetaWithFolder,
      renderFilterTabs: renderFolderFilterTabs,
      refreshState,
      resolveBridgeResponse,
      showBridgeError,
      bridgeLayer
    });
  };
})();
