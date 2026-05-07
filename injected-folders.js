(function () {
  if (window.__ANIT_BXCS_FOLDERS_UI__) return;
  window.__ANIT_BXCS_FOLDERS_UI__ = true;

  const COLLAPSE_KEY = 'anit.folders.filters.collapsed.v2';
  const EMOJI_GROUPS = [
    { id: 'recent', icon: '🕘', title: 'Частые', items: ['📁', '⭐', '🔥', '📌', '💬', '🚀', '✅', '💼', '📞', '💡', '📝', '📦'] },
    { id: 'smileys', icon: '😀', title: 'Смайлы', items: ['😀', '🙂', '😉', '😊', '😎', '🤓', '🥳', '🤩', '😇', '😌', '🫡', '🤝'] },
    { id: 'work', icon: '💼', title: 'Работа', items: ['💼', '📁', '🗂️', '📌', '📎', '📝', '📊', '📞', '📨', '🤝', '💳', '🏢'] },
    { id: 'status', icon: '🚦', title: 'Статусы', items: ['🔥', '⚡', '✅', '❗', '⏳', '🚦', '📍', '🔒', '🕐', '🛎️', '🧭', '🚫'] },
    { id: 'channels', icon: '💬', title: 'Коммуникации', items: ['💬', '📞', '📱', '📧', '📣', '🎧', '📡', '🤖', '🌐', '📲', '🛰️', '🔔'] },
    { id: 'objects', icon: '🧩', title: 'Объекты', items: ['🧩', '🛠️', '📦', '🧠', '🏷️', '🔑', '🎯', '🪄', '🗃️', '🧰', '🔍', '🪙'] }
  ];

  let api = null;
  let barHost = null;
  let managerHost = null;
  let containerObserver = null;
  let rootObserver = null;
  let observedContainer = null;
  let dragState = null;
  let editFolderId = '';
  let activeEmojiGroup = 'recent';
  let renderQueued = false;
  let lastBarStructureKey = '';
  let suppressFolderClickUntil = 0;

  function isFoldersEnabled() {
    return !api?.isTasksMode?.();
  }

  function cleanupFoldersUi() {
    if (containerObserver) {
      containerObserver.disconnect();
      containerObserver = null;
    }
    observedContainer = null;
    if (barHost?.isConnected) {
      barHost.remove();
    }
    if (managerHost?.isConnected) {
      managerHost.remove();
    }
    barHost = null;
    managerHost = null;
    lastBarStructureKey = '';
  }

  function getAllEmojis() {
    return EMOJI_GROUPS.flatMap((group) => group.items);
  }

  function extractLeadingEmoji(value) {
    const match = String(value || '').trim().match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?/u);
    return match ? match[0] : '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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
    const folderState = getFolderState();
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

  function ensureBar() {
    if (barHost?.isConnected) return barHost;

    let host = document.getElementById('anit-folder-native-bar');
    if (!host) {
      host = document.createElement('div');
      host.id = 'anit-folder-native-bar';
    }

    if (!host.querySelector('.anit-folder-strip') || !host.querySelector('.anit-folder-nav')) {
      host.innerHTML = `
      <style>
        #anit-folder-native-bar {
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
        #anit-folder-native-bar .anit-folder-bar-inner {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr) 20px;
          align-items: center;
          gap: 2px;
          min-width: 0;
        }
        #anit-folder-native-bar .anit-folder-strip {
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
        #anit-folder-native-bar .anit-folder-strip::-webkit-scrollbar {
          display: none;
        }
        #anit-folder-native-bar .anit-folder-strip.is-dragging {
          cursor: grabbing;
        }
        #anit-folder-native-bar .anit-folder-nav {
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
        #anit-folder-native-bar .anit-folder-nav:hover {
          background: var(--ui-color-bg-state-hover-default, rgba(0, 0, 0, 0.03));
          color: var(--ui-color-text-primary, #333);
          opacity: 1;
        }
        #anit-folder-native-bar .anit-folder-nav:disabled {
          opacity: .2;
          cursor: default;
          pointer-events: none;
        }
        #anit-folder-native-bar .anit-folder-chip {
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
        #anit-folder-native-bar .anit-folder-chip:hover {
          background: var(--ui-color-bg-state-hover-default, rgba(0, 0, 0, 0.03));
          color: var(--ui-color-text-primary, #333);
        }
        #anit-folder-native-bar .anit-folder-chip.is-active {
          background: var(--ui-color-design-selection-bg, #edf7ff);
          border-color: var(--ui-color-design-selection-stroke, #c4e6ff);
          color: var(--ui-color-design-selection-content, #0075ff);
        }
        #anit-folder-native-bar .anit-folder-chip-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        #anit-folder-native-bar .anit-folder-chip-count {
          color: var(--ui-color-text-subtle, #828b95);
          font-size: 11px;
        }
        #anit-folder-native-bar .anit-folder-chip.is-active .anit-folder-chip-count {
          color: inherit;
          opacity: .8;
        }
        #anit-folder-native-bar .anit-folder-chip-unread {
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
      lastBarStructureKey = '';
    }
    barHost = host;
    return host;
  }

  function ensureManager() {
    if (managerHost?.isConnected) return managerHost;

    const host = document.createElement('div');
    host.id = 'anit-folder-manager';
    host.style.cssText = 'position:fixed;inset:0;z-index:10020;display:none;background:rgba(9,12,18,.54);';
    host.innerHTML = `
      <div class="anit-folder-manager-dialog">
        <style>
          #anit-folder-manager .anit-folder-manager-dialog,
          #anit-folder-manager .anit-folder-manager-dialog * {
            box-sizing: border-box;
          }
          #anit-folder-manager .anit-folder-manager-dialog {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: min(640px, calc(100vw - 32px));
            max-height: min(84vh, 820px);
            min-width: 0;
            overflow-x: hidden;
            overflow-y: auto;
            padding: 14px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,.12);
            background: #151922;
            color: #eef2f6;
            box-shadow: 0 20px 60px rgba(0,0,0,.45);
            font: 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
          }
          #anit-folder-manager .anit-folder-manager-dialog::-webkit-scrollbar {
            width: 10px;
          }
          #anit-folder-manager .anit-folder-manager-dialog::-webkit-scrollbar-thumb {
            border: 2px solid transparent;
            border-radius: 999px;
            background: rgba(255,255,255,.18);
            background-clip: padding-box;
          }
          #anit-folder-manager .anit-folder-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 16px;
            min-width: 0;
          }
          #anit-folder-manager .anit-folder-head > div {
            min-width: 0;
            flex: 1 1 auto;
          }
          #anit-folder-manager .anit-folder-title {
            font-size: 15px;
            font-weight: 700;
            line-height: 1.3;
          }
          #anit-folder-manager .anit-folder-subtitle {
            margin-top: 3px;
            color: rgba(255,255,255,.68);
            font-size: 12px;
          }
          #anit-folder-manager .anit-folder-close,
          #anit-folder-manager .anit-folder-action,
          #anit-folder-manager .anit-folder-mini {
            height: 32px;
            padding: 0 12px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 10px;
            background: #232a36;
            color: #fff;
            cursor: pointer;
            font: inherit;
            max-width: 100%;
            white-space: nowrap;
          }
          #anit-folder-manager .anit-folder-action-primary {
            border-color: transparent;
            background: #5d8cff;
            color: #fff;
          }
          #anit-folder-manager .anit-folder-form {
            display: grid;
            grid-template-columns: 32px minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
            margin-bottom: 14px;
            min-width: 0;
          }
          #anit-folder-manager .anit-folder-emoji-trigger,
          #anit-folder-manager .anit-folder-emoji-item {
            width: 32px;
            height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 10px;
            background: #202633;
            cursor: pointer;
            font-size: 16px;
            color: #fff;
          }
          #anit-folder-manager .anit-folder-input-wrap {
            position: relative;
            min-width: 0;
            width: 100%;
          }
          #anit-folder-manager .anit-folder-input {
            width: 100%;
            min-width: 0;
            height: 36px;
            padding: 0 12px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 10px;
            background: #202633;
            color: #fff;
            outline: none;
            font: inherit;
          }
          #anit-folder-manager .anit-folder-input::placeholder {
            color: rgba(255,255,255,.44);
          }
          #anit-folder-manager .anit-folder-input:focus {
            border-color: #5d8cff;
          }
          #anit-folder-manager .anit-folder-emoji-picker {
            position: absolute;
            top: 40px;
            left: 0;
            right: auto;
            z-index: 4;
            display: none;
            width: min(360px, calc(100vw - 72px), calc(100vw - 32px));
            max-width: calc(100vw - 32px);
            padding: 10px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px;
            background: #1b202b;
            box-shadow: 0 12px 30px rgba(0,0,0,.38);
            overflow: hidden;
          }
          #anit-folder-manager .anit-folder-emoji-picker.is-open {
            display: block;
          }
          #anit-folder-manager .anit-folder-emoji-search {
            width: 100%;
            height: 34px;
            margin-bottom: 8px;
            padding: 0 10px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 10px;
            background: #202633;
            color: #fff;
            outline: none;
            font: inherit;
          }
          #anit-folder-manager .anit-folder-emoji-search::placeholder {
            color: rgba(255,255,255,.44);
          }
          #anit-folder-manager .anit-folder-emoji-tabs {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            scrollbar-width: none;
            margin-bottom: 8px;
            padding-bottom: 2px;
          }
          #anit-folder-manager .anit-folder-emoji-tabs::-webkit-scrollbar {
            display: none;
          }
          #anit-folder-manager .anit-folder-emoji-tab {
            width: 30px;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 9px;
            background: #202633;
            color: #fff;
            cursor: pointer;
            flex: 0 0 auto;
          }
          #anit-folder-manager .anit-folder-emoji-tab.is-active {
            border-color: #5d8cff;
            background: rgba(93,140,255,.18);
          }
          #anit-folder-manager .anit-folder-emoji-grid {
            display: grid;
            grid-template-columns: repeat(8, minmax(0, 1fr));
            gap: 6px;
            width: 100%;
          }
          #anit-folder-manager .anit-folder-emoji-empty {
            padding: 10px 4px 4px;
            color: rgba(255,255,255,.58);
            font-size: 12px;
          }
          #anit-folder-manager .anit-folder-list {
            display: grid;
            gap: 8px;
          }
          #anit-folder-manager .anit-folder-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            padding: 10px 12px;
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 12px;
            background: #1b202b;
            min-width: 0;
          }
          #anit-folder-manager .anit-folder-row-main {
            min-width: 0;
          }
          #anit-folder-manager .anit-folder-row-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 700;
            color: #fff;
          }
          #anit-folder-manager .anit-folder-row-meta {
            margin-top: 3px;
            color: rgba(255,255,255,.68);
            font-size: 12px;
          }
          #anit-folder-manager .anit-folder-row-actions {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            justify-content: flex-end;
            min-width: 0;
          }
          #anit-folder-manager .anit-folder-io-bar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 14px;
            min-width: 0;
          }
          #anit-folder-manager .anit-folder-io-panel {
            display: none;
            margin-top: 10px;
          }
          #anit-folder-manager .anit-folder-io-panel.is-open {
            display: block;
          }
          #anit-folder-manager .anit-folder-io-textarea {
            width: 100%;
            min-height: 150px;
            max-width: 100%;
            padding: 10px 12px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 12px;
            background: #202633;
            color: #fff;
            resize: vertical;
            outline: none;
            font: 12px/1.45 ui-monospace,Consolas,monospace;
          }
          #anit-folder-manager .anit-folder-io-hint {
            margin-top: 6px;
            color: rgba(255,255,255,.58);
            font-size: 12px;
          }
          @media (max-width: 640px) {
            #anit-folder-manager .anit-folder-head {
              flex-direction: column;
              align-items: stretch;
            }
            #anit-folder-manager .anit-folder-close {
              align-self: flex-end;
            }
            #anit-folder-manager .anit-folder-form {
              grid-template-columns: 32px minmax(0, 1fr);
            }
            #anit-folder-manager .anit-folder-form .anit-folder-action-primary {
              grid-column: 1 / -1;
            }
            #anit-folder-manager .anit-folder-emoji-picker {
              left: 0;
              right: auto;
              width: min(100%, calc(100vw - 32px));
            }
            #anit-folder-manager .anit-folder-row {
              grid-template-columns: 1fr;
            }
            #anit-folder-manager .anit-folder-row-actions {
              justify-content: flex-start;
            }
          }
          @media (max-width: 460px) {
            #anit-folder-manager .anit-folder-manager-dialog {
              width: calc(100vw - 20px);
              padding: 12px;
            }
            #anit-folder-manager .anit-folder-emoji-grid {
              grid-template-columns: repeat(6, minmax(0, 1fr));
            }
          }
        </style>
        <div class="anit-folder-head">
          <div>
            <div class="anit-folder-title">Папки чатов</div>
            <div class="anit-folder-subtitle"></div>
          </div>
          <button type="button" class="anit-folder-close" data-close="1">Закрыть</button>
        </div>
        <div class="anit-folder-form">
          <button type="button" class="anit-folder-emoji-trigger" data-emoji-trigger="1">📁</button>
          <div class="anit-folder-input-wrap">
            <input class="anit-folder-input" id="anit-folder-name-input" type="text" maxlength="64" placeholder="Название папки">
            <div class="anit-folder-emoji-picker" id="anit-folder-emoji-picker">
              <input class="anit-folder-emoji-search" id="anit-folder-emoji-search" type="text" placeholder="Найти смайлик">
              <div class="anit-folder-emoji-tabs" id="anit-folder-emoji-tabs"></div>
              <div class="anit-folder-emoji-grid" id="anit-folder-emoji-grid"></div>
              <div class="anit-folder-emoji-empty" id="anit-folder-emoji-empty" style="display:none">Ничего не найдено</div>
            </div>
          </div>
          <button type="button" class="anit-folder-action anit-folder-action-primary" data-save-folder="1">Создать</button>
        </div>
        <div class="anit-folder-list" id="anit-folder-list"></div>
        <div class="anit-folder-io-bar">
          <button type="button" class="anit-folder-action" data-toggle-io="export">Экспорт</button>
          <button type="button" class="anit-folder-action" data-toggle-io="import">Импорт</button>
          <button type="button" class="anit-folder-action" data-copy-io="1">Копировать</button>
          <button type="button" class="anit-folder-action" data-apply-io="1">Применить JSON</button>
        </div>
        <div class="anit-folder-io-panel" id="anit-folder-io-panel">
          <textarea class="anit-folder-io-textarea" id="anit-folder-io-textarea"></textarea>
          <div class="anit-folder-io-hint" id="anit-folder-io-hint">Панель JSON скрыта до действия “Экспорт” или “Импорт”.</div>
        </div>
      </div>
    `;

    host.addEventListener('click', (event) => {
      if (event.target === host || event.target?.getAttribute?.('data-close') === '1') {
        closeManager();
      }
    });

    document.body.appendChild(host);
    managerHost = host;
    return host;
  }

  function getManagerElements() {
    const host = ensureManager();
    return {
      host,
      subtitle: host.querySelector('.anit-folder-subtitle'),
      saveButton: host.querySelector('[data-save-folder="1"]'),
      nameInput: host.querySelector('#anit-folder-name-input'),
      emojiTrigger: host.querySelector('[data-emoji-trigger="1"]'),
      emojiPicker: host.querySelector('#anit-folder-emoji-picker'),
      emojiSearch: host.querySelector('#anit-folder-emoji-search'),
      emojiTabs: host.querySelector('#anit-folder-emoji-tabs'),
      emojiGrid: host.querySelector('#anit-folder-emoji-grid'),
      emojiEmpty: host.querySelector('#anit-folder-emoji-empty'),
      list: host.querySelector('#anit-folder-list'),
      ioPanel: host.querySelector('#anit-folder-io-panel'),
      ioTextarea: host.querySelector('#anit-folder-io-textarea'),
      ioHint: host.querySelector('#anit-folder-io-hint')
    };
  }

  function closeManager() {
    const host = ensureManager();
    host.style.display = 'none';
    editFolderId = '';
    const { emojiPicker, emojiSearch } = getManagerElements();
    emojiPicker.classList.remove('is-open');
    if (emojiSearch) emojiSearch.value = '';
  }

  function showFolderError(response, fallbackMessage) {
    const errorCode = String(response?.error || '').trim();
    const message = errorCode === 'storage_persist_failed'
      ? 'Не удалось сохранить папки в хранилище браузера. Проверьте состояние расширения и повторите действие.'
      : fallbackMessage;
    if (!message) return;
    try { window.alert(message); } catch (_) {}
  }

  function setFormState(folder) {
    const { nameInput, saveButton, emojiTrigger } = getManagerElements();
    editFolderId = folder?.id || '';
    nameInput.value = folder?.name || '';
    saveButton.textContent = editFolderId ? 'Сохранить' : 'Создать';
    emojiTrigger.textContent = extractLeadingEmoji(folder?.name) || '📁';
  }

  function insertEmoji(emoji) {
    const { nameInput, emojiTrigger } = getManagerElements();
    const raw = String(nameInput.value || '').trim();
    const cleaned = raw.replace(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?\s*/u, '');
    nameInput.value = cleaned ? `${emoji} ${cleaned}` : `${emoji} `;
    emojiTrigger.textContent = emoji;
    nameInput.focus();
  }

  function renderEmojiGrid() {
    const { emojiSearch, emojiTabs, emojiGrid, emojiEmpty } = getManagerElements();
    const query = String(emojiSearch?.value || '').trim();
    const activeGroup = EMOJI_GROUPS.find((group) => group.id === activeEmojiGroup) || EMOJI_GROUPS[0];
    const source = query ? getAllEmojis() : activeGroup.items;
    const items = source.filter((emoji) => !query || emoji.includes(query));

    emojiTabs.innerHTML = EMOJI_GROUPS.map((group) => `
      <button type="button" class="anit-folder-emoji-tab${group.id === activeEmojiGroup ? ' is-active' : ''}" data-emoji-group="${group.id}" title="${group.title}">
        ${group.icon}
      </button>
    `).join('');

    emojiGrid.innerHTML = items.map((emoji) => `
      <button type="button" class="anit-folder-emoji-item" data-emoji="${emoji}">${emoji}</button>
    `).join('');

    emojiEmpty.style.display = items.length ? 'none' : '';

    emojiTabs.querySelectorAll('[data-emoji-group]').forEach((button) => {
      button.addEventListener('click', () => {
        activeEmojiGroup = button.getAttribute('data-emoji-group') || 'recent';
        if (emojiSearch) emojiSearch.value = '';
        renderEmojiGrid();
      });
    });

    emojiGrid.querySelectorAll('[data-emoji]').forEach((button) => {
      button.addEventListener('click', () => {
        insertEmoji(button.getAttribute('data-emoji') || '📁');
        getManagerElements().emojiPicker.classList.remove('is-open');
      });
    });
  }

  function bindEmojiPicker() {
    const { emojiPicker, emojiTrigger, emojiSearch } = getManagerElements();
    if (emojiPicker.dataset.bound === '1') return;
    emojiPicker.dataset.bound = '1';
    renderEmojiGrid();

    emojiTrigger.addEventListener('click', () => {
      emojiPicker.classList.toggle('is-open');
      if (emojiPicker.classList.contains('is-open')) {
        renderEmojiGrid();
        requestAnimationFrame(() => {
          try {
            const pickerRect = emojiPicker.getBoundingClientRect();
            const overflowRight = pickerRect.right - (window.innerWidth - 12);
            if (overflowRight > 0) {
              emojiPicker.style.left = `${Math.max(0, -overflowRight)}px`;
            } else {
              emojiPicker.style.left = '0px';
            }
          } catch (_) {}
        });
        emojiSearch?.focus();
      }
    });

    emojiSearch?.addEventListener('input', renderEmojiGrid);
  }

  async function saveFolderFromForm() {
    const { nameInput } = getManagerElements();
    const name = String(nameInput.value || '').trim();
    if (!name) return;
    const response = await api.upsertFolder({ id: editFolderId || undefined, name });
    if (response?.ok && response?.state) {
      await api.refreshFolderState();
      setFormState(null);
      renderAll();
      return;
    }
    showFolderError(response, 'Не удалось сохранить папку.');
  }

  async function openIoPanel(mode) {
    const { ioPanel, ioTextarea, ioHint } = getManagerElements();
    ioPanel.classList.add('is-open');
    ioHint.textContent = mode === 'export'
      ? 'Можно копировать JSON или править перед импортом.'
      : 'Вставьте JSON экспорта и нажмите “Применить JSON”.';
    if (mode === 'export') {
      const response = await api.exportFolders();
      if (response?.ok && response?.data) {
        ioTextarea.value = JSON.stringify(response.data, null, 2);
        return;
      }
      showFolderError(response, 'Не удалось выгрузить папки.');
    }
  }

  async function applyIoImport() {
    const { ioTextarea } = getManagerElements();
    const raw = String(ioTextarea.value || '').trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const response = await api.importFolders(parsed);
      if (response?.ok && response?.state) {
        await api.refreshFolderState();
        renderAll();
        return;
      }
      showFolderError(response, 'Не удалось импортировать папки.');
    } catch (_) {
      showFolderError(null, 'JSON папок имеет неверный формат.');
    }
  }

  async function renderManager() {
    const { subtitle, list, saveButton, nameInput, ioPanel, ioTextarea } = getManagerElements();
    const folderState = getFolderState();
    const stats = computeFolderStats();

    subtitle.textContent = api?.isOlMode?.() ? 'Набор папок для открытых линий' : 'Независимый набор папок для чатов';
    if (!editFolderId && !nameInput.value) {
      saveButton.textContent = 'Создать';
    }

    list.innerHTML = folderState.folders.map((folder) => {
      const stat = stats.get(folder.id) || { total: 0, unread: 0 };
      return `
        <div class="anit-folder-row" data-folder-row="${folder.id}">
          <div class="anit-folder-row-main">
            <div class="anit-folder-row-name">${escapeHtml(folder.name)}</div>
            <div class="anit-folder-row-meta">${stat.total} чатов${stat.unread ? `, ${stat.unread} непрочитанных` : ''}</div>
          </div>
          <div class="anit-folder-row-actions">
            <button type="button" class="anit-folder-mini" data-edit-folder="${folder.id}">Изменить</button>
            <button type="button" class="anit-folder-mini" data-delete-folder="${folder.id}">Удалить</button>
          </div>
        </div>
      `;
    }).join('') || `
      <div class="anit-folder-row">
        <div class="anit-folder-row-main">
          <div class="anit-folder-row-name">Папок пока нет</div>
          <div class="anit-folder-row-meta">Создайте первую папку для этого режима.</div>
        </div>
      </div>
    `;

    list.querySelectorAll('[data-edit-folder]').forEach((button) => {
      button.addEventListener('click', () => {
        const folderId = button.getAttribute('data-edit-folder') || '';
        const folder = folderState.folders.find((item) => item.id === folderId) || null;
        setFormState(folder);
      });
    });

    list.querySelectorAll('[data-delete-folder]').forEach((button) => {
      button.addEventListener('click', async () => {
        const folderId = button.getAttribute('data-delete-folder') || '';
        if (!window.confirm('Удалить папку?')) return;
        const response = await api.deleteFolder(folderId);
        if (response?.ok && response?.state) {
          await api.refreshFolderState();
          if (editFolderId === folderId) setFormState(null);
          renderAll();
          return;
        }
        showFolderError(response, 'Не удалось удалить папку.');
      });
    });

    bindEmojiPicker();
    ioPanel.classList.remove('is-open');
    ioTextarea.value = ioTextarea.value || '';
  }

  function mountBar() {
    const container = api?.findContainer?.();
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

  function updateFolderNavState(strip) {
    const host = strip?.closest('#anit-folder-native-bar');
    if (!host) return;
    const left = host.querySelector('[data-folder-scroll="-1"]');
    const right = host.querySelector('[data-folder-scroll="1"]');
    const maxLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    if (left) left.disabled = strip.scrollLeft <= 1;
    if (right) right.disabled = strip.scrollLeft >= maxLeft - 1;
  }

  function scrollFolderStrip(strip, direction) {
    const step = Math.max(120, Math.round(strip.clientWidth * 0.65));
    strip.scrollBy({ left: step * direction, behavior: 'smooth' });
    requestAnimationFrame(() => updateFolderNavState(strip));
  }

  function bindStripInteractions(strip) {
    if (!strip || strip.dataset.bound === '1') return;
    strip.dataset.bound = '1';
    const host = strip.closest('#anit-folder-native-bar');

    strip.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX) && !event.shiftKey) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY || event.deltaX;
      updateFolderNavState(strip);
    }, { passive: false });

    strip.addEventListener('scroll', () => updateFolderNavState(strip), { passive: true });

    strip.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('[data-folder-scroll]')) return;
      dragState = { strip, startX: event.clientX, startLeft: strip.scrollLeft, moved: false };
      strip.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (event) => {
      if (!dragState) return;
      const deltaX = event.clientX - dragState.startX;
      if (Math.abs(deltaX) > 4) {
        dragState.moved = true;
        event.preventDefault();
      }
      dragState.strip.scrollLeft = dragState.startLeft - deltaX;
      updateFolderNavState(dragState.strip);
    });

    window.addEventListener('mouseup', () => {
      if (dragState?.moved) {
        suppressFolderClickUntil = Date.now() + 250;
      }
      const activeStrip = dragState?.strip || strip;
      dragState = null;
      activeStrip.classList.remove('is-dragging');
    });

    host?.querySelectorAll('[data-folder-scroll]').forEach((button) => {
      button.addEventListener('click', () => {
        const direction = Number(button.getAttribute('data-folder-scroll') || 0);
        if (!direction) return;
        scrollFolderStrip(strip, direction);
      });
    });
  }

  function scheduleRenderAll() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderAll();
    });
  }

  function renderFolderChip(item) {
    return `
        <button type="button" class="anit-folder-chip" data-folder-bar="${escapeHtml(item.id)}">
          <span class="anit-folder-chip-name">${escapeHtml(item.name)}</span>
          <span class="anit-folder-chip-count"></span>
          <span class="anit-folder-chip-unread" hidden></span>
        </button>
      `;
  }

  function bindFolderChipClicks(strip) {
    strip.querySelectorAll('[data-folder-bar]').forEach((button) => {
      if (button.dataset.clickBound === '1') return;
      button.dataset.clickBound = '1';
      button.addEventListener('click', (event) => {
        if (Date.now() < suppressFolderClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        api.setSelectedFolderFilter(button.getAttribute('data-folder-bar') || 'all');
      });
    });
  }

  function updateFolderChips(strip, items, stats, activeFolderId) {
    const structureKey = items.map((item) => `${item.id}:${item.name}`).join('|');
    if (structureKey !== lastBarStructureKey || strip.children.length !== items.length) {
      strip.innerHTML = items.map(renderFolderChip).join('');
      lastBarStructureKey = structureKey;
      bindFolderChipClicks(strip);
    }

    items.forEach((item) => {
      const button = strip.querySelector(`[data-folder-bar="${CSS.escape(item.id)}"]`);
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

  function renderBar() {
    if (!isFoldersEnabled()) {
      if (barHost?.isConnected) barHost.remove();
      barHost = null;
      lastBarStructureKey = '';
      return;
    }
    const strip = mountBar();
    if (!strip) return;

    const folderState = getFolderState();
    const stats = computeFolderStats();
    const activeFolderId = api.getSelectedFolderFilter();
    const items = [
      { id: 'all', name: 'Все' },
      ...folderState.folders.map((folder) => ({ id: folder.id, name: folder.name })),
      { id: '__none__', name: 'Без папки' }
    ];

    updateFolderChips(strip, items, stats, activeFolderId);
    bindStripInteractions(strip);
    updateFolderNavState(strip);
  }

  function openManager() {
    if (!isFoldersEnabled()) return;
    const host = ensureManager();
    host.style.display = 'block';
    setFormState(null);
    renderManager();
  }

  function enhanceFiltersSection() {
    if (!isFoldersEnabled()) return;
    const tabs = document.getElementById('anit_folder_tabs');
    if (!tabs) return;
    const group = tabs.closest('.group');
    if (!group) return;

    if (group.dataset.foldersEnhanced !== '1') {
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
      tabs.parentNode.insertBefore(body, tabs);
      body.appendChild(tabs);

      const firstChild = group.firstElementChild;
      if (firstChild) group.insertBefore(head, firstChild);
      else group.appendChild(head);

      const applyCollapsed = (collapsed) => group.classList.toggle('is-collapsed', !!collapsed);
      applyCollapsed(localStorage.getItem(COLLAPSE_KEY) !== '0');

      head.querySelector('[data-folder-collapse="1"]')?.addEventListener('click', () => {
        const collapsed = !group.classList.contains('is-collapsed');
        applyCollapsed(collapsed);
        try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (_) {}
      });

      head.querySelector('[data-folder-manage="1"]')?.addEventListener('click', openManager);
    }
  }

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
    containerObserver = new MutationObserver(() => scheduleRenderAll());
    containerObserver.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  function bindRootObserver() {
    if (rootObserver) return;
    const root = document.body || document.documentElement;
    if (!root) return;
    rootObserver = new MutationObserver(() => {
      const nextContainer = api?.findContainer?.() || null;
      const needsRebind = nextContainer !== observedContainer;
      const barDetached = !!barHost && !barHost.isConnected;
      if (!needsRebind && !barDetached) return;
      bindContainerObserver();
      scheduleRenderAll();
    });
    rootObserver.observe(root, { childList: true, subtree: true });
  }

  function renderAll() {
    if (!isFoldersEnabled()) {
      cleanupFoldersUi();
      return;
    }
    bindContainerObserver();
    renderBar();
    enhanceFiltersSection();
    if (managerHost?.style.display === 'block') {
      renderManager();
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

  async function boot() {
    api = await waitForApi();
    await api.refreshFolderState();
    renderAll();
    bindContainerObserver();
    bindRootObserver();

    const { host } = getManagerElements();
    host.querySelector('[data-save-folder="1"]')?.addEventListener('click', saveFolderFromForm);
    host.querySelector('[data-toggle-io="export"]')?.addEventListener('click', () => openIoPanel('export'));
    host.querySelector('[data-toggle-io="import"]')?.addEventListener('click', () => openIoPanel('import'));
    host.querySelector('[data-copy-io="1"]')?.addEventListener('click', async () => {
      const { ioTextarea } = getManagerElements();
      if (!String(ioTextarea.value || '').trim()) return;
      try { await navigator.clipboard.writeText(ioTextarea.value); } catch (_) {}
    });
    host.querySelector('[data-apply-io="1"]')?.addEventListener('click', applyIoImport);
    host.querySelector('#anit-folder-name-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveFolderFromForm();
      }
    });

    window.addEventListener('ANIT_BXCS_FOLDERS_UPDATED', scheduleRenderAll);
    window.addEventListener('ANIT_BXCS_OPEN_FOLDER_MANAGER', openManager);
  }

  boot().catch(() => {});
})();
