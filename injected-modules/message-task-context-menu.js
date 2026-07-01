(function () {
  if (window.__ANIT_BXCS_MESSAGE_TASK_CONTEXT_MENU__) return;
  window.__ANIT_BXCS_MESSAGE_TASK_CONTEXT_MENU__ = true;

  const LOGP = '[ANIT-CHATSORT/TASK-MENU]';
  const MENU_ID = 'bx-im-message-context-menu';
  const ACTION_ATTR = 'data-anit-create-task-for-message';
  const LABEL = '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u0434\u0430\u0447\u0443';
  const MESSAGE_WRAP_SELECTOR = '.bx-im-message-base__wrap, .bx-messenger-content-item';
  const MESSAGE_NODE_SELECTOR = [
    MESSAGE_WRAP_SELECTOR,
    '[data-message-id]',
    '[data-messageid]',
    '[data-message]',
    '.bx-im-message-default-content__container',
    '.bx-im-dialog-chat__message',
    '.bx-im-message-context-menu__button'
  ].join(',');

  let lastMessageTarget = null;

  function warn(...args) {
    try { console.warn(LOGP, ...args); } catch (_) {}
  }

  function toPositiveInt(value) {
    const match = String(value == null ? '' : value).match(/\d+/);
    if (!match) return null;
    const number = parseInt(match[0], 10);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function getAttributeInt(el, names) {
    if (!el || el.nodeType !== 1) return null;
    for (const name of names) {
      const parsed = toPositiveInt(el.getAttribute?.(name));
      if (parsed) return parsed;
    }
    return null;
  }

  function findMessageTarget(target) {
    const el = target?.nodeType === 1 ? target : target?.parentElement;
    if (!el) return null;
    return el.closest?.(MESSAGE_WRAP_SELECTOR) || el.closest?.(MESSAGE_NODE_SELECTOR) || null;
  }

  function rememberTarget(target) {
    const messageTarget = findMessageTarget(target);
    if (messageTarget) lastMessageTarget = messageTarget;
    return messageTarget;
  }

  function getMessageIdFromDom(target) {
    const node = findMessageTarget(target);
    if (!node) return null;

    for (let el = node; el && el !== document.documentElement; el = el.parentElement) {
      const direct = getAttributeInt(el, [
        'data-message-id', 'data-messageid', 'data-message', 'message-id', 'messageId', 'messageid'
      ]);
      if (direct) return direct;

      const dataset = el.dataset || {};
      const fromDataset = toPositiveInt(dataset.messageId || dataset.messageid || dataset.message);
      if (fromDataset) return fromDataset;

      if (el.matches?.(MESSAGE_WRAP_SELECTOR)) {
        const wrapId = toPositiveInt(el.getAttribute?.('data-id') || dataset.id);
        if (wrapId) return wrapId;
      }

      const idMatch = String(el.id || '').match(/(?:message|msg)[_-]?(\d{3,})/i);
      if (idMatch) return toPositiveInt(idMatch[1]);

      const classMatch = String(el.className || '').match(/(?:message|msg)[_-]?(\d{3,})/i);
      if (classMatch) return toPositiveInt(classMatch[1]);
    }

    return null;
  }

  function getChatIdFromDom(target) {
    const node = findMessageTarget(target);
    if (!node) return null;

    for (let el = node; el && el !== document.documentElement; el = el.parentElement) {
      const direct = getAttributeInt(el, [
        'data-chat-id', 'data-chatid', 'data-entity-id', 'data-entityid',
        'chat-id', 'chatId', 'chatid', 'entity-id', 'entityId', 'entityid'
      ]);
      if (direct) return direct;

      const dataset = el.dataset || {};
      const fromDataset = toPositiveInt(dataset.chatId || dataset.chatid || dataset.entityId || dataset.entityid);
      if (fromDataset) return fromDataset;

      const dialogValue = el.getAttribute?.('data-dialog-id') || el.id || '';
      const match = String(dialogValue).match(/chat(\d+)/i);
      if (match) return toPositiveInt(match[1]);
    }

    return null;
  }

  function getStore() {
    const app = window.BX?.Messenger?.v2?.Application?.getInstance?.();
    return app?.getCore?.()?.getStore?.() || app?.store || null;
  }

  function readStorePath(store, path) {
    try {
      return path.split('.').reduce((acc, key) => acc?.[key], store?.state);
    } catch (_) {
      return null;
    }
  }

  function getMapValue(collection, key) {
    if (!collection) return null;
    try {
      if (typeof collection.get === 'function') return collection.get(key) || collection.get(String(key)) || collection.get(Number(key));
    } catch (_) {}
    return collection[key] || collection[String(key)] || collection[Number(key)] || null;
  }

  function pickChatId(value) {
    if (!value || typeof value !== 'object') return null;
    const chatId = toPositiveInt(value.chatId ?? value.chat_id ?? value.entityId ?? value.entity_id);
    if (chatId) return chatId;
    const dialogMatch = String(value.dialogId ?? value.dialog_id ?? value.id ?? '').match(/chat(\d+)/i);
    return dialogMatch ? toPositiveInt(dialogMatch[1]) : null;
  }

  function findMessageInObject(root, messageId) {
    if (!root || !messageId) return null;
    const seen = new Set();
    const queue = [{ value: root, depth: 0 }];
    let budget = 0;

    while (queue.length && budget < 3000) {
      budget += 1;
      const { value, depth } = queue.shift();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);

      const id = toPositiveInt(value.id ?? value.messageId ?? value.message_id);
      if (id === messageId) return value;
      if (depth >= 5) continue;

      if (value instanceof Map) {
        value.forEach((child) => queue.push({ value: child, depth: depth + 1 }));
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((child) => queue.push({ value: child, depth: depth + 1 }));
        continue;
      }

      Object.keys(value).slice(0, 120).forEach((key) => {
        queue.push({ value: value[key], depth: depth + 1 });
      });
    }

    return null;
  }

  function getMessageFromStore(messageId) {
    const store = getStore();
    if (!store || !messageId) return null;

    const getterNames = ['messages/get', 'messagesModel/getById', 'messagesModel/get'];
    for (const getterName of getterNames) {
      try {
        const getter = store.getters?.[getterName];
        const item = typeof getter === 'function' ? getter(messageId) || getter(String(messageId)) : null;
        if (item) return item;
      } catch (_) {}
    }

    const collections = [
      readStorePath(store, 'messages.collection'),
      readStorePath(store, 'messagesModel.collection'),
      readStorePath(store, 'messages.chatCollection'),
      readStorePath(store, 'messages')
    ];

    for (const collection of collections) {
      const direct = getMapValue(collection, messageId);
      if (direct) return direct;
      const found = findMessageInObject(collection, messageId);
      if (found) return found;
    }

    return null;
  }

  function findCurrentDialogId() {
    const candidates = [];
    try { candidates.push(new URLSearchParams(location.search || '').get('IM_DIALOG')); } catch (_) {}
    try { candidates.push(new URLSearchParams(location.search || '').get('dialogId')); } catch (_) {}
    try { candidates.push(String(location.hash || '').match(/(?:IM_DIALOG|dialogId|dialog)=([^&/?#]+)/i)?.[1]); } catch (_) {}
    try { candidates.push(String(location.href || '').match(/chat\d+/i)?.[0]); } catch (_) {}

    const store = getStore();
    candidates.push(
      readStorePath(store, 'application.dialog.dialogId'),
      readStorePath(store, 'application.dialogId'),
      readStorePath(store, 'recent.selectedId'),
      readStorePath(store, 'sidebar.dialogId')
    );

    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
  }

  function getChatIdFromCurrentDialog() {
    const dialogId = findCurrentDialogId();
    const direct = String(dialogId || '').match(/chat(\d+)/i);
    if (direct) return toPositiveInt(direct[1]);

    const store = getStore();
    if (!store || !dialogId) return null;

    const getterNames = ['chats/get', 'dialogues/get', 'recent/get'];
    for (const getterName of getterNames) {
      try {
        const getter = store.getters?.[getterName];
        const item = typeof getter === 'function' ? getter(dialogId) : null;
        const chatId = pickChatId(item);
        if (chatId) return chatId;
      } catch (_) {}
    }

    return null;
  }

  function getChatIdFromMessage(messageId) {
    const message = getMessageFromStore(messageId);
    const direct = pickChatId(message);
    if (direct) return direct;

    const store = getStore();
    const dialogId = String(message?.dialogId ?? message?.dialog_id ?? '').trim();
    if (!store || !dialogId) return null;

    for (const getterName of ['chats/get', 'dialogues/get', 'recent/get']) {
      try {
        const getter = store.getters?.[getterName];
        const item = typeof getter === 'function' ? getter(dialogId) : null;
        const chatId = pickChatId(item);
        if (chatId) return chatId;
      } catch (_) {}
    }

    return null;
  }

  function resolvePayload() {
    const messageId = getMessageIdFromDom(lastMessageTarget);
    const chatId = getChatIdFromDom(lastMessageTarget) || getChatIdFromMessage(messageId) || getChatIdFromCurrentDialog();
    return { chatId, messageId, target: lastMessageTarget };
  }

  function createMenuItem() {
    const item = document.createElement('div');
    item.className = 'ui-popup-menu-item';
    item.setAttribute(ACTION_ATTR, '1');

    const button = document.createElement('button');
    button.className = 'ui-popup-menu-item-action';
    button.type = 'button';
    button.title = LABEL;
    button.innerHTML = [
      '<div class="ui-popup-menu-item-header">',
      '<div class="ui-popup-menu-item-title">',
      `<div class="ui-popup-menu-item-title-text">${LABEL}</div>`,
      '</div>',
      '</div>',
      '<div class="ui-popup-menu-item-buttons">',
      '<div class="ui-popup-menu-item-icon">',
      '<div class="ui-icon-set --o-task"></div>',
      '</div>',
      '</div>'
    ].join('');

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const EntityCreator = window.BX?.Messenger?.v2?.Lib?.EntityCreator;
      if (typeof EntityCreator !== 'function') {
        warn('BX.Messenger.v2.Lib.EntityCreator is unavailable');
        return;
      }

      const { chatId, messageId, target } = resolvePayload();
      if (!messageId) {
        warn('Cannot resolve messageId', { chatId, messageId, target });
        return;
      }

      try {
        const creator = new EntityCreator(chatId);
        creator.createTaskForMessage(messageId);
      } catch (error) {
        warn('createTaskForMessage failed', error);
      }
    }, true);

    item.appendChild(button);
    return item;
  }

  function enhanceMenu(menu) {
    if (!menu || menu.querySelector(`[${ACTION_ATTR}="1"]`)) return;
    const items = menu.querySelector('.ui-popup-menu-items');
    if (!items) return;
    items.appendChild(createMenuItem());
  }

  function scanMenus(root) {
    const scope = root?.querySelectorAll ? root : document;
    if (scope.id === MENU_ID) enhanceMenu(scope);
    scope.querySelectorAll?.(`#${MENU_ID}`).forEach(enhanceMenu);
  }

  ['pointerdown', 'mousedown', 'click', 'contextmenu', 'mouseover', 'focusin'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      rememberTarget(event.target);
    }, true);
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes?.forEach((node) => {
        if (node?.nodeType === 1) scanMenus(node);
      });
    });
    scanMenus(document);
  });

  function arm() {
    scanMenus(document);
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  window.__ANIT_BXCS_DEBUG_TASK_MENU__ = function debugTaskMenu(target) {
    if (target) rememberTarget(target);
    return resolvePayload();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm, { once: true });
  } else {
    arm();
  }
})();