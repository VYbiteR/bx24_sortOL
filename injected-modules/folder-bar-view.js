(function () {
  const root = window.__ANIT_BXCS_MODULES__ = window.__ANIT_BXCS_MODULES__ || {};

  root.createFolderBarView = function createFolderBarView(deps) {
    let barHost = null;
    let dragState = null;
    let globalDragBound = false;
    let renderQueued = false;
    let lastStructureKey = '';
    let suppressClickUntil = 0;

    function escapeCss(value) {
      if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value);
      }
      return String(value).replace(/["\\]/g, '\\$&');
    }

    function cleanup() {
      if (barHost?.isConnected) {
        barHost.remove();
      }
      barHost = null;
      dragState = null;
      lastStructureKey = '';
      suppressClickUntil = 0;
    }

    function isDetached() {
      return !!barHost && !barHost.isConnected;
    }

    function ensureBar() {
      if (barHost?.isConnected) return barHost;

      let host = document.getElementById(deps.barId);
      if (!host) {
        host = document.createElement('div');
        host.id = deps.barId;
      }

      if (!host.querySelector('.anit-folder-strip') || !host.querySelector('.anit-folder-nav')) {
        host.innerHTML = `
          <style>
            #${deps.barId} {
              position: sticky;
              top: 0;
              z-index: 24;
              isolation: isolate;
              margin: 0;
              padding: 6px 8px 4px;
              background: var(--im-list-recent__background-color, var(--ui-color-background-primary, #fff));
              border-bottom: 1px solid var(--im-messenger__list_border-color, var(--ui-color-base-10, #edeef0));
              box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
            }
            #${deps.barId} .anit-folder-bar-inner {
              display: grid;
              grid-template-columns: 20px minmax(0, 1fr) 20px;
              align-items: center;
              gap: 2px;
              min-width: 0;
            }
            #${deps.barId} .anit-folder-strip {
              display: flex;
              align-items: center;
              gap: 4px;
              min-width: 0;
              overflow-x: auto;
              overflow-y: hidden;
              scrollbar-width: none;
              white-space: nowrap;
              user-select: none;
              cursor: grab;
              padding-bottom: 1px;
            }
            #${deps.barId} .anit-folder-strip::-webkit-scrollbar {
              display: none;
            }
            #${deps.barId} .anit-folder-strip.is-dragging {
              cursor: grabbing;
            }
            #${deps.barId} .anit-folder-nav {
              width: 20px;
              height: 24px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border: 0;
              border-radius: 6px;
              background: transparent;
              color: var(--ui-color-text-subtle, #000000);
              cursor: pointer;
              font: 16px / 1 var(--ui-font-family-primary, system-ui);
              opacity: .72;
              transition: background .15s ease, color .15s ease, opacity .15s ease;
            }
            #${deps.barId} .anit-folder-nav:hover {
              background: var(--ui-color-bg-state-hover-default, rgba(0, 0, 0, 0.03));
              color: var(--ui-color-text-primary, #333);
              opacity: 1;
            }
            #${deps.barId} .anit-folder-nav:disabled {
              opacity: .2;
              cursor: default;
              pointer-events: none;
            }
            #${deps.barId} .anit-folder-chip {
              position: relative;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              min-width: 0;
              max-width: 180px;
              height: 28px;
              padding: 0 10px;
              border: 1px solid transparent;
              border-radius: 999px;
              background: transparent;
              color: var(--ui-color-text-secondary, #525c69);
              font: var(--ui-typography-text-xs-font-weight, 400) var(--ui-font-size-xs, 12px) / var(--ui-font-line-height-sm, 1.35) var(--ui-font-family-primary, system-ui);
              cursor: pointer;
              flex: 0 0 auto;
            }
            #${deps.barId} .anit-folder-chip:hover {
              background: var(--ui-color-bg-state-hover-default, rgba(0, 0, 0, 0.03));
              color: var(--ui-color-text-primary, #333);
            }
            #${deps.barId} .anit-folder-chip.is-active {
              background: var(--ui-color-design-selection-bg, #edf7ff);
              border-color: var(--ui-color-design-selection-stroke, #c4e6ff);
              color: var(--ui-color-design-selection-content, #0075ff);
            }
            #${deps.barId} .anit-folder-chip-name {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            #${deps.barId} .anit-folder-chip-count {
              color: var(--ui-color-text-subtle, #828b95);
              font-size: 11px;
            }
            #${deps.barId} .anit-folder-chip.is-active .anit-folder-chip-count {
              color: inherit;
              opacity: .8;
            }
            #${deps.barId} .anit-folder-chip-unread {
              min-width: 16px;
              height: 16px;
              padding: 0 4px;
              border-radius: 999px;
              background: var(--ui-counter-current-bg-color, #f54819);
              color: var(--ui-color-on-primary, #fff);
              font-size: 10px;
              font-weight: 600;
              line-height: 16px;
              text-align: center;
            }
          </style>
          <div class="anit-folder-bar-inner">
            <button type="button" class="anit-folder-nav" data-folder-scroll="-1" aria-label="Прокрутить папки влево">‹</button>
            <div class="anit-folder-strip"></div>
            <button type="button" class="anit-folder-nav" data-folder-scroll="1" aria-label="Прокрутить папки вправо">›</button>
          </div>
        `;
        lastStructureKey = '';
      }

      barHost = host;
      return host;
    }

    function mount() {
      const container = deps.findContainer();
      if (!container || !container.parentNode) return null;

      const host = ensureBar();
      const parent = container.parentNode;
      if (host.parentNode !== parent) {
        parent.insertBefore(host, container);
      }
      host.style.width = '100%';
      if (!parent.style.position) {
        parent.style.position = 'relative';
      }
      return host.querySelector('.anit-folder-strip');
    }

    function bindGlobalDragListeners() {
      if (globalDragBound) return;
      globalDragBound = true;

      window.addEventListener('mousemove', (event) => {
        if (!dragState) return;
        const deltaX = event.clientX - dragState.startX;
        if (Math.abs(deltaX) > deps.dragStartThresholdPx) {
          dragState.moved = true;
          event.preventDefault();
        }
        dragState.strip.scrollLeft = dragState.startLeft - deltaX;
        updateNavState(dragState.strip);
      });

      window.addEventListener('mouseup', () => {
        if (!dragState) return;
        if (dragState.moved) {
          suppressClickUntil = Date.now() + deps.dragClickSuppressMs;
        }
        dragState.strip.classList.remove('is-dragging');
        dragState = null;
      });
    }

    function updateNavState(strip) {
      const host = strip?.closest(`#${deps.barId}`);
      if (!host) return;
      const left = host.querySelector('[data-folder-scroll="-1"]');
      const right = host.querySelector('[data-folder-scroll="1"]');
      const maxLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      if (left) left.disabled = strip.scrollLeft <= 1;
      if (right) right.disabled = strip.scrollLeft >= maxLeft - 1;
    }

    function scrollStrip(strip, direction) {
      const step = Math.max(120, Math.round(strip.clientWidth * 0.65));
      strip.scrollBy({ left: step * direction, behavior: 'smooth' });
      requestAnimationFrame(() => updateNavState(strip));
    }

    function bindInteractions(strip) {
      if (!strip || strip.dataset.bound === '1') return;
      strip.dataset.bound = '1';
      const host = strip.closest(`#${deps.barId}`);
      bindGlobalDragListeners();

      strip.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX) && !event.shiftKey) return;
        event.preventDefault();
        strip.scrollLeft += event.deltaY || event.deltaX;
        updateNavState(strip);
      }, { passive: false });

      strip.addEventListener('scroll', () => updateNavState(strip), { passive: true });

      strip.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        if (event.target.closest('[data-folder-scroll]')) return;
        dragState = { strip, startX: event.clientX, startLeft: strip.scrollLeft, moved: false };
        strip.classList.add('is-dragging');
      });

      host?.querySelectorAll('[data-folder-scroll]').forEach((button) => {
        button.addEventListener('click', () => {
          const direction = Number(button.getAttribute('data-folder-scroll') || 0);
          if (!direction) return;
          scrollStrip(strip, direction);
        });
      });
    }

    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        deps.renderAll();
      });
    }

    function renderChip(item) {
      return `
        <button type="button" class="anit-folder-chip" data-folder-bar="${deps.escapeHtml(item.id)}">
          <span class="anit-folder-chip-name">${deps.escapeHtml(item.name)}</span>
          <span class="anit-folder-chip-count"></span>
          <span class="anit-folder-chip-unread" hidden></span>
        </button>
      `;
    }

    function bindChipClicks(strip) {
      strip.querySelectorAll('[data-folder-bar]').forEach((button) => {
        if (button.dataset.clickBound === '1') return;
        button.dataset.clickBound = '1';
        button.addEventListener('click', (event) => {
          if (Date.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          deps.setSelectedFolderFilter(button.getAttribute('data-folder-bar') || deps.folderAllId);
        });
      });
    }

    function updateChips(strip, items, stats, activeFolderId) {
      const structureKey = items.map((item) => `${item.id}:${item.name}`).join('|');
      if (structureKey !== lastStructureKey || strip.children.length !== items.length) {
        strip.innerHTML = items.map(renderChip).join('');
        lastStructureKey = structureKey;
        bindChipClicks(strip);
      }

      items.forEach((item) => {
        const button = strip.querySelector(`[data-folder-bar="${escapeCss(item.id)}"]`);
        if (!button) return;
        const stat = stats.get(item.id) || { total: 0, unread: 0 };
        button.classList.toggle('is-active', activeFolderId === item.id);
        const count = button.querySelector('.anit-folder-chip-count');
        if (count) count.textContent = String(stat.total);
        const unread = button.querySelector('.anit-folder-chip-unread');
        if (unread) {
          unread.hidden = !stat.unread;
          unread.textContent = stat.unread ? String(stat.unread) : '';
        }
      });
    }

    function render() {
      if (!deps.isEnabled()) {
        cleanup();
        return;
      }

      const strip = mount();
      if (!strip) return;

      const folderState = deps.getFolderState();
      const stats = deps.computeStats();
      const activeFolderId = deps.getSelectedFolderFilter();
      const items = [
        { id: deps.folderAllId, name: 'Все' },
        ...folderState.folders.map((folder) => ({ id: folder.id, name: folder.name })),
        { id: deps.folderNoneId, name: 'Без папки' }
      ];

      updateChips(strip, items, stats, activeFolderId);
      bindInteractions(strip);
      updateNavState(strip);
    }

    return Object.freeze({ cleanup, isDetached, render, scheduleRender });
  };
})();
