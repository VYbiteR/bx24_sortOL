(function () {
  if (self !== top) return;

  const ROOT_ID = 'anit-bxcs-bootstrap-banner';
  const BX_HOST_RE = /(^|\.)bitrix24\./i;
  const ONBOARDING_PATH_RE = /^\/add\/ext_bx24sortol\/?$/i;

  function normHost(v) {
    return String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }

  function maskKey(key) {
    const s = String(key || '');
    if (!s) return '—';
    if (s.length <= 8) return '***' + s;
    return s.slice(0, 3) + '***' + s.slice(-5);
  }

  function isValidHost(host) {
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(host || ''));
  }

  function isCustomHost(host) {
    return !!host && !BX_HOST_RE.test(String(host || ''));
  }

  function isOnOnboardingPage() {
    return ONBOARDING_PATH_RE.test(String(location.pathname || ''));
  }

  function loadPortals() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['portals'], (res) => resolve(res?.portals || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  function savePortals(portals) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.set({ portals }, () => resolve(true));
      } catch (_) {
        resolve(false);
      }
    });
  }

  function syncDynamicContentScripts() {
    try {
      return chrome.runtime.sendMessage({ type: 'ANIT_SYNC_CONTENT_SCRIPTS' }).then(() => true, () => false);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function notifyTabsToRefetch(host) {
    try {
      chrome.tabs.query({ url: `*://${host}/*` }, (tabs) => {
        (tabs || []).forEach((tab) => {
          if (tab?.id != null) {
            chrome.tabs.sendMessage(tab.id, { type: 'anit-refetch-mapping' }).catch(() => {});
          }
        });
      });
    } catch (_) {}
  }

  function requestHostPermissionViaBackground(host) {
    try {
      return chrome.runtime.sendMessage({ type: 'ANIT_REQUEST_HOST_PERMISSION', host }).then(
        (res) => res || { ok: false, granted: false, hasPermission: false, apiAvailable: false },
        () => ({ ok: false, granted: false, hasPermission: false, apiAvailable: false })
      );
    } catch (_) {
      return Promise.resolve({ ok: false, granted: false, hasPermission: false, apiAvailable: false });
    }
  }

  function checkHostPermissionViaBackground(host) {
    try {
      return chrome.runtime.sendMessage({ type: 'ANIT_CHECK_HOST_PERMISSION', host }).then(
        (res) => res || { ok: false, hasPermission: false, apiAvailable: false },
        () => ({ ok: false, hasPermission: false, apiAvailable: false })
      );
    } catch (_) {
      return Promise.resolve({ ok: false, hasPermission: false, apiAvailable: false });
    }
  }

  function removeBanner() {
    const node = document.getElementById(ROOT_ID);
    if (node) node.remove();
  }

  function createBannerRoot() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'status');
    root.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'width:min(920px, calc(100vw - 24px))',
      'max-height:min(86vh, 860px)',
      'overflow:auto',
      'background:#ffffff',
      'border:1px solid #dce3ee',
      'border-radius:12px',
      'box-shadow:0 10px 30px rgba(20,33,61,.18)',
      'font:13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      'color:#1f2733',
      'padding:12px'
    ].join(';');
    document.documentElement.appendChild(root);
  }

  function getBannerRoot() {
    createBannerRoot();
    return document.getElementById(ROOT_ID);
  }

  function createOnboardingBanner() {
    const root = getBannerRoot();
    if (!root) return;
    const currentHost = normHost(location.host);
    const state = {
      statusText: 'Откройте чат/мессенджер после изменения и обновите страницу',
      statusKind: 'info'
    };

    const setStatus = (text, kind) => {
      state.statusText = String(text || '');
      state.statusKind = kind || 'info';
    };

    const setStatusAndRefresh = async (text, kind) => {
      setStatus(text, kind);
      await renderPanel();
    };

    const createButton = (text, style) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = text;
      btn.style.cssText = style;
      return btn;
    };

    const createHeader = () => {
      const title = document.createElement('div');
      title.textContent = 'ANIT Chat Sorter — управление порталами';
      title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:6px;';

      const text = document.createElement('div');
      text.textContent = 'Текущий портал: ' + currentHost;
      text.style.cssText = 'color:#4d5b70;margin-bottom:10px;word-break:break-all;';

      const status = document.createElement('div');
      status.style.cssText = 'min-height:18px;font-size:12px;margin-bottom:10px;color:#6f7b8c;';
      status.textContent = state.statusText;
      status.style.color = state.statusKind === 'err' ? '#a73a3a' : state.statusKind === 'ok' ? '#158f4d' : '#6f7b8c';
      return { title, text, status };
    };

    const buildForm = (portals, onSave) => {
      const form = document.createElement('div');
      form.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:end;margin-bottom:10px;';

      const hostWrap = document.createElement('label');
      hostWrap.style.cssText = 'display:block;';
      hostWrap.innerHTML = '<div style="font-size:12px;color:#4d5b70;margin-bottom:4px">Портал (host)</div>';
      const hostInput = document.createElement('input');
      hostInput.type = 'text';
      hostInput.value = currentHost;
      hostInput.placeholder = 'например: crm.company.ru';
      hostInput.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #c8d3e2;border-radius:9px;padding:8px 10px;';
      hostWrap.appendChild(hostInput);

      const keyWrap = document.createElement('label');
      keyWrap.style.cssText = 'display:block;';
      keyWrap.innerHTML = '<div style="font-size:12px;color:#4d5b70;margin-bottom:4px">API-ключ</div>';
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.value = String(portals[currentHost]?.apiKey || '1');
      keyInput.placeholder = 'например: 1';
      keyInput.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #c8d3e2;border-radius:9px;padding:8px 10px;';
      keyWrap.appendChild(keyInput);

      const enabledWrap = document.createElement('label');
      enabledWrap.style.cssText = 'display:flex;align-items:center;gap:6px;border:1px solid #dce3ee;border-radius:9px;padding:8px 10px;';
      const enabledInput = document.createElement('input');
      enabledInput.type = 'checkbox';
      enabledInput.checked = (typeof portals[currentHost]?.enabled === 'boolean') ? portals[currentHost].enabled : true;
      const enabledText = document.createElement('span');
      enabledText.textContent = 'Активен';
      enabledWrap.appendChild(enabledInput);
      enabledWrap.appendChild(enabledText);

      const saveBtn = createButton(
        'Сохранить',
        'border:1px solid #2b7fff;background:#2b7fff;color:#fff;border-radius:9px;padding:8px 12px;cursor:pointer;font-weight:600;'
      );
      saveBtn.addEventListener('click', () => onSave(hostInput, keyInput, enabledInput));

      form.appendChild(hostWrap);
      form.appendChild(keyWrap);
      form.appendChild(enabledWrap);
      form.appendChild(saveBtn);
      return form;
    };

    const buildToolbar = (onSync, onClear) => {
      const topActions = document.createElement('div');
      topActions.style.cssText = 'display:flex;gap:8px;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;';
      const leftActs = document.createElement('div');
      leftActs.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      const rightActs = document.createElement('div');
      rightActs.style.cssText = 'display:flex;gap:8px;';

      const syncBtn = createButton(
        'Синхронизировать',
        'border:1px solid #c8d3e2;background:#fff;color:#3d4a5f;border-radius:9px;padding:7px 10px;cursor:pointer;'
      );
      syncBtn.addEventListener('click', onSync);

      const clearBtn = createButton(
        'Очистить все',
        'border:1px solid #f1cccc;background:#fff8f8;color:#ab3d3d;border-radius:9px;padding:7px 10px;cursor:pointer;'
      );
      clearBtn.addEventListener('click', onClear);

      const closeBtn = createButton(
        'Скрыть',
        'border:1px solid #c8d3e2;background:#fff;color:#3d4a5f;border-radius:9px;padding:7px 10px;cursor:pointer;'
      );
      closeBtn.addEventListener('click', () => removeBanner());

      leftActs.appendChild(syncBtn);
      leftActs.appendChild(clearBtn);
      rightActs.appendChild(closeBtn);
      topActions.appendChild(leftActs);
      topActions.appendChild(rightActs);
      return topActions;
    };

    const buildTable = (portals, hosts, onToggle, onDelete) => {
      const tableWrap = document.createElement('div');
      tableWrap.style.cssText = 'border:1px solid #dce3ee;border-radius:10px;overflow:hidden;';
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr style="background:#f7f9fc;color:#728199"><th style="text-align:left;padding:8px;border-bottom:1px solid #edf1f7">Портал</th><th style="text-align:left;padding:8px;border-bottom:1px solid #edf1f7">API ключ</th><th style="text-align:left;padding:8px;border-bottom:1px solid #edf1f7">Статус</th><th style="text-align:left;padding:8px;border-bottom:1px solid #edf1f7">Действия</th></tr>';
      const tbody = document.createElement('tbody');

      if (!hosts.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" style="padding:10px;color:#6f7b8c;text-align:center">Порталы не добавлены</td>';
        tbody.appendChild(tr);
      } else {
        hosts.forEach((host) => {
          const cfg = portals[host] || {};
          const tr = document.createElement('tr');
          tr.innerHTML = '<td style="padding:8px;border-bottom:1px solid #edf1f7;word-break:break-all"></td><td style="padding:8px;border-bottom:1px solid #edf1f7"></td><td style="padding:8px;border-bottom:1px solid #edf1f7"></td><td style="padding:8px;border-bottom:1px solid #edf1f7"></td>';
          tr.children[0].textContent = host;
          tr.children[1].textContent = maskKey(cfg.apiKey);
          tr.children[2].textContent = cfg.enabled ? 'Активен' : 'Отключен';

          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
          const toggleBtn = createButton(
            cfg.enabled ? 'Отключить' : 'Включить',
            'border:1px solid #c8d3e2;background:#fff;color:#3d4a5f;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:12px;'
          );
          const delBtn = createButton(
            'Удалить',
            'border:1px solid #f1cccc;background:#fff8f8;color:#ab3d3d;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:12px;'
          );

          toggleBtn.addEventListener('click', () => onToggle(host));
          delBtn.addEventListener('click', () => onDelete(host));
          actions.appendChild(toggleBtn);
          actions.appendChild(delBtn);
          tr.children[3].appendChild(actions);
          tbody.appendChild(tr);
        });
      }

      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      return tableWrap;
    };

    async function handleSave(hostInput, keyInput, enabledInput) {
      const host = normHost(hostInput.value);
      const apiKey = String(keyInput.value || '').trim() || '1';
      const enabled = !!enabledInput.checked;
      if (!isValidHost(host)) {
        return setStatusAndRefresh('Введите корректный host портала', 'err');
      }

      const permRequest = await requestHostPermissionViaBackground(host);
      const next = await loadPortals();
      next[host] = { enabled, apiKey };
      const saved = await savePortals(next);
      await syncDynamicContentScripts();
      notifyTabsToRefetch(host);
      const verify = await loadPortals();
      const permAfter = await checkHostPermissionViaBackground(host);

      if (!saved) return setStatusAndRefresh(`Не удалось сохранить ${host}`, 'err');
      if (!verify[host]) return setStatusAndRefresh(`Сохранение прошло, но ${host} не найден в хранилище`, 'err');
      if ((permAfter?.apiAvailable || permRequest?.apiAvailable) && !permAfter?.hasPermission) {
        return setStatusAndRefresh(`Портал ${host} сохранен, но доступ к домену не выдан`, 'err');
      }
      return setStatusAndRefresh(`Портал ${host} сохранен`, 'ok');
    }

    async function handleToggle(host) {
      const next = await loadPortals();
      if (!next[host]) return;
      next[host].enabled = !next[host].enabled;
      await savePortals(next);
      await syncDynamicContentScripts();
      notifyTabsToRefetch(host);
      return setStatusAndRefresh(next[host].enabled ? `Портал ${host} включен` : `Портал ${host} отключен`, 'ok');
    }

    async function handleDelete(host) {
      if (!confirm(`Удалить портал ${host}?`)) return;
      const next = await loadPortals();
      delete next[host];
      await savePortals(next);
      await syncDynamicContentScripts();
      notifyTabsToRefetch(host);
      return setStatusAndRefresh(`Портал ${host} удален`, 'ok');
    }
    async function handleSync() {
      const ok = await syncDynamicContentScripts();
      return setStatusAndRefresh(ok ? 'Синхронизация выполнена' : 'Синхронизация не выполнена', ok ? 'ok' : 'err');
    }

    async function handleClear() {
      const portals = await loadPortals();
      if (!confirm('Удалить все порталы из настроек?')) return;
      await savePortals({});
      Object.keys(portals).forEach(notifyTabsToRefetch);
      await syncDynamicContentScripts();
      return setStatusAndRefresh('Все порталы удалены', 'ok');
    }

    async function renderPanel() {
      const portals = await loadPortals();
      const hosts = Object.keys(portals).sort();
      root.innerHTML = '';

      const header = createHeader();
      const form = buildForm(portals, handleSave);
      const toolbar = buildToolbar(handleSync, handleClear);
      const table = buildTable(portals, hosts, handleToggle, handleDelete);

      root.appendChild(header.title);
      root.appendChild(header.text);
      root.appendChild(header.status);
      root.appendChild(form);
      root.appendChild(toolbar);
      root.appendChild(table);
    }

    renderPanel();
  }

  async function init() {
    if (!isOnOnboardingPage()) return;
    const currentHost = normHost(location.host);
    if (!isValidHost(currentHost) || !isCustomHost(currentHost)) {
      return;
    }
    createOnboardingBanner();
  }

  init();
})();
