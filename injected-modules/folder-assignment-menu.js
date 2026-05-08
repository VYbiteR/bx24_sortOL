(function () {
  const root = window.__ANIT_BXCS_MODULES__ = window.__ANIT_BXCS_MODULES__ || {};

  root.createFolderAssignmentMenu = function createFolderAssignmentMenu(deps) {
    let menuHost = null;

    const buttonStyle = [
      'padding:8px 10px',
      'border-radius:10px',
      'border:1px solid rgba(255,255,255,.16)',
      'background:rgba(255,255,255,.04)',
      'color:#fff',
      'text-align:left',
      'cursor:pointer'
    ].join(';');

    function hide() {
      if (menuHost) {
        menuHost.style.display = 'none';
      }
    }

    function ensure() {
      if (menuHost) return menuHost;

      const menu = document.createElement('div');
      menu.id = 'anit-folder-menu';
      menu.style.cssText = [
        'position:fixed',
        'top:46px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:10000',
        'display:none',
        'min-width:220px',
        'max-width:min(320px, calc(100vw - 24px))',
        'padding:8px',
        'background:#1f232b',
        'border:1px solid rgba(255,255,255,.14)',
        'border-radius:12px',
        'box-shadow:0 12px 30px rgba(0,0,0,.38)'
      ].join(';');
      document.body.appendChild(menu);
      menuHost = menu;
      return menu;
    }

    function afterMutation() {
      deps.exitMultiSelectMode();
      deps.applyFiltersSafe();
      deps.renderFolderFilterTabsSafe();
    }

    function openManager() {
      hide();
      try {
        window.dispatchEvent(new CustomEvent('ANIT_BXCS_OPEN_FOLDER_MANAGER'));
      } catch (_) {}
    }

    function getSelectedFolderIds(menu) {
      return Array.from(menu.querySelectorAll('[data-folder-checkbox]:checked'))
        .map((node) => deps.normalizeFolderId(node.getAttribute('data-folder-checkbox')))
        .filter(Boolean);
    }

    function renderOption(folder, selectedChats) {
      const activeCount = selectedChats.filter((chat) => chat.folderIds.includes(folder.id)).length;
      const isAll = selectedChats.length > 0 && activeCount === selectedChats.length;
      const isSome = activeCount > 0 && !isAll;
      const border = isSome ? 'rgba(93,140,255,.55)' : 'rgba(255,255,255,.16)';
      const partiallySelected = isSome ? '<span style="opacity:.72;font-size:11px">частично</span>' : '';

      return `<label data-folder-option="${deps.escapeHtml(folder.id)}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid ${border};background:rgba(255,255,255,.04);color:#fff;cursor:pointer"><input type="checkbox" data-folder-checkbox="${deps.escapeHtml(folder.id)}" ${isAll ? 'checked' : ''}><span style="flex:1">${deps.escapeHtml(folder.name)}</span>${partiallySelected}</label>`;
    }

    async function assignSelectedChatsToFolders(selectedChatIds, folderIds, operation) {
      hide();
      const response = await deps.folderBridge.assignChats(selectedChatIds, folderIds, operation);
      if (response?.ok && response?.state) {
        deps.setFolderState(response.state);
      } else {
        deps.showFolderBridgeError(response, 'Не удалось обновить папки чатов.');
      }
      afterMutation();
    }

    function render() {
      const menu = ensure();
      const selectedChatIds = deps.getSelectedChatIds();
      const selectedChats = selectedChatIds.map((chatId) => ({ chatId, folderIds: deps.getAssignedFolderIds(chatId) }));
      const folderButtons = deps.getFolders().map((folder) => renderOption(folder, selectedChats)).join('');

      menu.innerHTML = `
        <div style="font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#fff">
          <div style="margin:0 0 8px 0;font-weight:700">В папки</div>
          <div style="display:grid;gap:6px">
            ${folderButtons || '<div style="opacity:.72;padding:6px 2px">Папок пока нет</div>'}
            <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:4px">
              <button type="button" data-clear-folders="1">Убрать из всех</button>
              <button type="button" data-create-folder="1">+ Новая папка</button>
              <button type="button" data-apply-folders="1" style="margin-left:auto">Применить</button>
            </div>
          </div>
        </div>
      `;
      menu.querySelectorAll('button').forEach((btn) => {
        btn.style.cssText = buttonStyle;
      });
      menu.querySelector('[data-clear-folders="1"]')?.addEventListener('click', () => {
        assignSelectedChatsToFolders(selectedChatIds, [], 'clear');
      });
      menu.querySelector('[data-create-folder="1"]')?.addEventListener('click', openManager);
      menu.querySelector('[data-apply-folders="1"]')?.addEventListener('click', () => {
        assignSelectedChatsToFolders(selectedChatIds, getSelectedFolderIds(menu), 'replace');
      });
      return menu;
    }

    function toggle() {
      const menu = render();
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }

    return Object.freeze({ hide, render, toggle });
  };
})();
