(function () {
  const root = window.__ANIT_BXCS_MODULES__ = window.__ANIT_BXCS_MODULES__ || {};

  root.createFolderManagerView = function createFolderManagerView(deps) {
  const EMOJI_GROUPS = [
    { id: 'recent', icon: '🕘', title: 'Частые', items: ['📁', '⭐', '🔥', '📌', '💬', '🚀', '✅', '💼', '📞', '💡', '📝', '📦'] },
    { id: 'smileys', icon: '😀', title: 'Смайлы', items: ['😀', '🙂', '😉', '😊', '😎', '🤓', '🥳', '🤩', '😇', '😌', '🫡', '🤝'] },
    { id: 'work', icon: '💼', title: 'Работа', items: ['💼', '📁', '🗂️', '📌', '📎', '📝', '📊', '📞', '📨', '🤝', '💳', '🏢'] },
    { id: 'status', icon: '🚦', title: 'Статусы', items: ['🔥', '⚡', '✅', '❗', '⏳', '🚦', '📍', '🔒', '🕐', '🛎️', '🧭', '🚫'] },
    { id: 'channels', icon: '💬', title: 'Коммуникации', items: ['💬', '📞', '📱', '📧', '📣', '🎧', '📡', '🤖', '🌐', '📲', '🛰️', '🔔'] },
    { id: 'objects', icon: '🧩', title: 'Объекты', items: ['🧩', '🛠️', '📦', '🧠', '🏷️', '🔑', '🎯', '🪄', '🗃️', '🧰', '🔍', '🪙'] }
  ];

  let managerHost = null;
  let editFolderId = '';
  let activeEmojiGroup = 'recent';

  function getAllEmojis() {
    return EMOJI_GROUPS.flatMap((group) => group.items);
  }

  function extractLeadingEmoji(value) {
    const match = String(value || '').trim().match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?/u);
    return match ? match[0] : '';
  }

  function canUseCurrentDocument() {
    const container = deps.findContainer?.();
    if (!container || container.ownerDocument !== document) return false;
    if (document.designMode === 'on') return false;
    if (document.body?.isContentEditable) return false;
    return true;
  }

  function ensureManager() {
    if (!canUseCurrentDocument()) return null;
    if (managerHost?.isConnected) return managerHost;

    const host = document.createElement('div');
    host.id = deps.managerId;
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
    if (!host) return {};
    return {
      host,
      subtitle: deps.one(host, '.anit-folder-subtitle'),
      saveButton: deps.one(host, '[data-save-folder="1"]'),
      nameInput: deps.one(host, '#anit-folder-name-input'),
      emojiTrigger: deps.one(host, '[data-emoji-trigger="1"]'),
      emojiPicker: deps.one(host, '#anit-folder-emoji-picker'),
      emojiSearch: deps.one(host, '#anit-folder-emoji-search'),
      emojiTabs: deps.one(host, '#anit-folder-emoji-tabs'),
      emojiGrid: deps.one(host, '#anit-folder-emoji-grid'),
      emojiEmpty: deps.one(host, '#anit-folder-emoji-empty'),
      list: deps.one(host, '#anit-folder-list'),
      ioPanel: deps.one(host, '#anit-folder-io-panel'),
      ioTextarea: deps.one(host, '#anit-folder-io-textarea'),
      ioHint: deps.one(host, '#anit-folder-io-hint')
    };
  }

  function closeManager() {
    const host = ensureManager();
    if (!host) return;
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
    const response = await deps.api().upsertFolder({ id: editFolderId || undefined, name });
    if (response?.ok && response?.state) {
      await deps.api().refreshFolderState();
      setFormState(null);
      deps.renderAll();
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
      const response = await deps.api().exportFolders();
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
      const response = await deps.api().importFolders(parsed);
      if (response?.ok && response?.state) {
        await deps.api().refreshFolderState();
        deps.renderAll();
        return;
      }
      showFolderError(response, 'Не удалось импортировать папки.');
    } catch (_) {
      showFolderError(null, 'JSON папок имеет неверный формат.');
    }
  }

  async function renderManager() {
    const { subtitle, list, saveButton, nameInput, ioPanel, ioTextarea } = getManagerElements();
    const folderState = deps.getFolderState();
    const stats = deps.computeStats();

    subtitle.textContent = deps.api()?.isOlMode?.() ? 'Набор папок для открытых линий' : 'Независимый набор папок для чатов';
    if (!editFolderId && !nameInput.value) {
      saveButton.textContent = 'Создать';
    }

    list.innerHTML = folderState.folders.map((folder) => {
      const stat = stats.get(folder.id) || { total: 0, unread: 0 };
      return `
        <div class="anit-folder-row" data-folder-row="${folder.id}">
          <div class="anit-folder-row-main">
            <div class="anit-folder-row-name">${deps.escapeHtml(folder.name)}</div>
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
        const response = await deps.api().deleteFolder(folderId);
        if (response?.ok && response?.state) {
          await deps.api().refreshFolderState();
          if (editFolderId === folderId) setFormState(null);
          deps.renderAll();
          return;
        }
        showFolderError(response, 'Не удалось удалить папку.');
      });
    });

    bindEmojiPicker();
    ioPanel.classList.remove('is-open');
    ioTextarea.value = ioTextarea.value || '';
  }


  function cleanup() {
    if (managerHost?.isConnected) {
      managerHost.remove();
    }
    managerHost = null;
    editFolderId = '';
  }

  function isOpen() {
    return managerHost?.style.display === 'block';
  }

  function openManager() {
    if (!deps.isEnabled()) return;
    const host = ensureManager();
    if (!host) return;
    host.style.display = 'block';
    bindEvents();
    setFormState(null);
    renderManager();
  }

  function bindEvents() {
    const { host } = getManagerElements();
    if (!host) return;
    if (host.dataset.actionsBound === '1') return;
    host.dataset.actionsBound = '1';

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
  }

  return Object.freeze({
    bindEvents,
    cleanup,
    isOpen,
    open: openManager,
    close: closeManager,
    render: renderManager
  });
  };
})();
