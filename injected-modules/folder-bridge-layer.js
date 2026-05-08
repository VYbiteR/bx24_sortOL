(function () {
  const root = window.__ANIT_BXCS_MODULES__ = window.__ANIT_BXCS_MODULES__ || {};

  root.createFolderBridgeLayer = function createFolderBridgeLayer(deps) {
    const requestBridge = deps.requestBridge;

    return Object.freeze({
      getState: () => deps.getState(),
      refreshState: () => deps.refreshState(),
      assignChats: (chatIds, folderIds, operation = 'replace') => requestBridge('ASSIGN_CHATS', { chatIds, folderIds, operation }),
      upsertFolder: (folder) => requestBridge('UPSERT_FOLDER', { folder }),
      deleteFolder: (folderId) => requestBridge('DELETE_FOLDER', { folderId }),
      exportPortal: () => requestBridge('EXPORT_PORTAL'),
      importPortal: (data) => requestBridge('IMPORT_PORTAL', { data })
    });
  };
})();
