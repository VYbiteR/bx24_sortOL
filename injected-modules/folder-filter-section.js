(function () {
  const root = window.__ANIT_BXCS_MODULES__ = window.__ANIT_BXCS_MODULES__ || {};

  root.createFolderFilterSection = function createFolderFilterSection(deps) {
    function enhance() {
      if (!deps.isEnabled()) return;

      const tabs = document.getElementById('anit_folder_tabs');
      if (!tabs) return;
      const group = tabs.closest('.group');
      if (!group) return;

      if (group.dataset.foldersEnhanced === '1') return;

      group.dataset.foldersEnhanced = '1';
      group.classList.add('anit-folders-group');

      const head = document.createElement('div');
      head.className = 'group-head';
      head.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%">
          <div class="group-title">Папки</div>
          <div style="display:flex;align-items:center;gap:6px">
            <button type="button" class="category-toggle" data-folder-manage="1" style="width:auto;padding:0 10px;min-width:0">Настроить папки</button>
            <button type="button" class="category-toggle" data-folder-collapse="1"><span class="chev"></span></button>
          </div>
        </div>
      `;

      const body = document.createElement('div');
      body.className = 'group-body';
      const legacyTitle = group.querySelector(':scope > .group-title');
      if (legacyTitle) legacyTitle.remove();

      while (group.firstChild) {
        body.appendChild(group.firstChild);
      }
      group.appendChild(head);
      group.appendChild(body);

      const applyCollapsed = (collapsed) => {
        group.classList.toggle('is-collapsed', collapsed);
        body.style.display = collapsed ? 'none' : '';
      };

      applyCollapsed(localStorage.getItem(deps.collapseKey) === '1');

      head.querySelector('[data-folder-collapse="1"]')?.addEventListener('click', () => {
        const collapsed = !group.classList.contains('is-collapsed');
        applyCollapsed(collapsed);
        try {
          localStorage.setItem(deps.collapseKey, collapsed ? '1' : '0');
        } catch (_) {}
      });

      head.querySelector('[data-folder-manage="1"]')?.addEventListener('click', deps.openManager);
    }

    return Object.freeze({ enhance });
  };
})();
