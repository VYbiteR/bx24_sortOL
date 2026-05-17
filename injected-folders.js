(function () {
  if (window.__ANIT_BXCS_FOLDERS_UI__) return;
  window.__ANIT_BXCS_FOLDERS_UI__ = true;

  const COLLAPSE_KEY = 'anit.folders.filters.collapsed.v2';
  const BAR_ID = 'anit-folder-native-bar';
  const MANAGER_ID = 'anit-folder-manager';
  const FOLDER_ALL_ID = 'all';
  const FOLDER_NONE_ID = '__none__';
  const DRAG_CLICK_SUPPRESS_MS = 250;
  const DRAG_START_THRESHOLD_PX = 4;

  let api = null;
  let containerObserver = null;
  let rootObserver = null;
  let observedContainer = null;
  let foldersUiActivated = false;

  function isFoldersEnabled() {
    return !api?.isTasksMode?.();
  }

  function hasSafeChatContainer() {
    const container = api?.findContainer?.();
    return !!container && container.ownerDocument === document;
  }

  function waitForSafeChatContainer(timeoutMs = 5000) {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (hasSafeChatContainer()) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  function cleanupFoldersUi() {
    if (containerObserver) {
      containerObserver.disconnect();
      containerObserver = null;
    }
    observedContainer = null;
    FolderBarView.cleanup();
    FolderManagerView.cleanup();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const Dom = Object.freeze({
    one: (root, selector) => root?.querySelector?.(selector) || null,
    escape: escapeHtml
  });

  const FoldersState = Object.freeze({
    get: () => getFolderState(),
    getChatElements: () => getChatElements(),
    computeStats: () => computeFolderStats()
  });

  function getFolderState() {
    return api ? api.getFolderState() : { folders: [], chatFolders: {} };
  }

  function getChatElements() {
    const container = api?.findContainer?.();
    if (!container) return [];
    return api.isOlMode()
      ? Array.from(container.querySelectorAll('.bx-messenger-cl-item'))
      : Array.from(container.querySelectorAll('.bx-im-list-recent-item__wrap'));
  }

  function getFolderIds(meta) {
    return Array.isArray(meta?.folderIds) ? meta.folderIds : [];
  }

  function computeFolderStats() {
    const folderState = FoldersState.get();
    const stats = new Map();
    stats.set('all', { total: 0, unread: 0 });
    stats.set('__none__', { total: 0, unread: 0 });
    folderState.folders.forEach((folder) => {
      stats.set(folder.id, { total: 0, unread: 0, folder });
    });

    getChatElements().forEach((el) => {
      const meta = api.getItemMeta(el);
      if (!meta?.id) return;
      const folderIds = getFolderIds(meta);
      const hasUnread = !!meta.hasUnread;

      stats.get('all').total += 1;
      if (hasUnread) stats.get('all').unread += 1;

      if (!folderIds.length) {
        stats.get('__none__').total += 1;
        if (hasUnread) stats.get('__none__').unread += 1;
        return;
      }

      folderIds.forEach((folderId) => {
        if (!stats.has(folderId)) return;
        stats.get(folderId).total += 1;
        if (hasUnread) stats.get(folderId).unread += 1;
      });
    });

    return stats;
  }


  const FolderBarView = window.__ANIT_BXCS_MODULES__.createFolderBarView({
    barId: BAR_ID,
    folderAllId: FOLDER_ALL_ID,
    folderNoneId: FOLDER_NONE_ID,
    dragClickSuppressMs: DRAG_CLICK_SUPPRESS_MS,
    dragStartThresholdPx: DRAG_START_THRESHOLD_PX,
    escapeHtml,
    isEnabled: isFoldersEnabled,
    findContainer: () => api?.findContainer?.() || null,
    getFolderState: () => FoldersState.get(),
    computeStats: () => FoldersState.computeStats(),
    getSelectedFolderFilter: () => api.getSelectedFolderFilter(),
    setSelectedFolderFilter: (folderId) => api.setSelectedFolderFilter(folderId),
    renderAll: () => renderAll()
  });


  const FolderManagerView = window.__ANIT_BXCS_MODULES__.createFolderManagerView({
    managerId: MANAGER_ID,
    one: Dom.one,
    escapeHtml,
    isEnabled: isFoldersEnabled,
    api: () => api,
    findContainer: () => api?.findContainer?.() || null,
    getFolderState: () => FoldersState.get(),
    computeStats: () => FoldersState.computeStats(),
    renderAll: () => renderAll()
  });

  const FolderFilterSection = window.__ANIT_BXCS_MODULES__.createFolderFilterSection({
    collapseKey: COLLAPSE_KEY,
    isEnabled: isFoldersEnabled,
    openManager: FolderManagerView.open
  });

  function bindContainerObserver() {
    if (!isFoldersEnabled()) {
      if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
      }
      observedContainer = null;
      return;
    }
    const container = api?.findContainer?.();
    if (!container) {
      if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
      }
      observedContainer = null;
      return;
    }
    if (observedContainer === container && containerObserver) return;
    if (containerObserver) containerObserver.disconnect();
    observedContainer = container;
    containerObserver = new MutationObserver(() => FolderBarView.scheduleRender());
    containerObserver.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  function bindRootObserver() {
    if (rootObserver) return;
    const root = document.body || document.documentElement;
    if (!root) return;
    rootObserver = new MutationObserver(() => {
      if (!foldersUiActivated && hasSafeChatContainer()) {
        activateFoldersUi().catch(() => {});
        return;
      }
      const nextContainer = api?.findContainer?.() || null;
      const needsRebind = nextContainer !== observedContainer;
      const barDetached = FolderBarView.isDetached();
      if (!needsRebind && !barDetached) return;
      bindContainerObserver();
      FolderBarView.scheduleRender();
    });
    rootObserver.observe(root, { childList: true, subtree: true });
  }

  function renderAll() {
    if (!isFoldersEnabled()) {
      cleanupFoldersUi();
      return;
    }
    bindContainerObserver();
    FolderBarView.render();
    FolderFilterSection.enhance();
    if (FolderManagerView.isOpen()) {
      FolderManagerView.render();
    }
  }

  function waitForApi() {
    return new Promise((resolve) => {
      const tick = () => {
        if (window.__ANIT_BXCS_FOLDERS_API__) {
          resolve(window.__ANIT_BXCS_FOLDERS_API__);
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  async function activateFoldersUi() {
    if (foldersUiActivated || !hasSafeChatContainer()) return;
    foldersUiActivated = true;
    await api.refreshFolderState();
    renderAll();
    bindContainerObserver();
    FolderManagerView.bindEvents();

    window.addEventListener('ANIT_BXCS_FOLDERS_UPDATED', FolderBarView.scheduleRender);
    window.addEventListener('ANIT_BXCS_OPEN_FOLDER_MANAGER', FolderManagerView.open);
  }

  async function boot() {
    api = await waitForApi();
    bindRootObserver();
    if (await waitForSafeChatContainer()) {
      await activateFoldersUi();
    }
  }

  boot().catch(() => {});
})();
