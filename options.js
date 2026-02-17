const $ = (id) => document.getElementById(id);

const SERVER_BASE = 'https://anitconf.ru/apps_bxmp/chat_sorter_srv/public';

function isDebugEnabled() {
  try {
    return localStorage.getItem("anit_bx_chs_debug") === "1";
  } catch {
    return false;
  }
}

function debugHowToText() {
  return 'Пересборка доступна только в debug. В консоли на этой странице выполните: localStorage.setItem("anit_bx_chs_debug","1"); location.reload();';
}

function normHost(v) {
  return String(v || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function isValidHost(host) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host);
}

function maskKey(key) {
  const s = String(key || "");
  if (!s) return "—";
  if (s.length <= 8) return "***" + s;
  return s.slice(0, 3) + "***" + s.slice(-5);
}

function setStatus(text, kind, ttlMs = 4500) {
  const el = $("status");
  if (!el) return;
  el.className = "status-line " + (kind || "");
  el.textContent = text || "";
  if (text && ttlMs > 0) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, ttlMs);
}

function showToast(text, kind = "", ttlMs = 3500) {
  const t = $("toast");
  if (!t) return;
  t.className = "toast show " + (kind || "");
  t.textContent = text || "";
  setTimeout(() => {
    if (t.textContent === text) t.className = "toast";
  }, ttlMs);
}

function setFieldError(fieldId, hintId, message) {
  const field = $(fieldId);
  const hint = $(hintId);
  if (!field || !hint) return;
  if (!message) {
    field.classList.remove("invalid");
    return;
  }
  field.classList.add("invalid");
  hint.textContent = message;
}

function clearValidationHints() {
  $("portalField")?.classList.remove("invalid");
  $("keyField")?.classList.remove("invalid");
  const ph = $("portalHint");
  const kh = $("keyHint");
  if (ph) ph.textContent = "Формат: только host, без https:// и без пути";
  if (kh) kh.textContent = "Ключ можно получить в админке приложения";
}

let modalResolver = null;
function openConfirmModal(title, text, confirmText = "Подтвердить") {
  const wrap = $("modalWrap");
  if (!wrap) return Promise.resolve(false);
  $("modalTitle") && ($("modalTitle").textContent = title);
  $("modalText") && ($("modalText").textContent = text);
  $("modalConfirm") && ($("modalConfirm").textContent = confirmText);
  wrap.classList.add("show");
  return new Promise((resolve) => { modalResolver = resolve; });
}

function closeConfirmModal(result) {
  $("modalWrap")?.classList.remove("show");
  if (modalResolver) modalResolver(result);
  modalResolver = null;
}

function loadPortals() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["portals"], (res) => resolve(res.portals || {}));
  });
}

function savePortals(portals) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ portals }, () => resolve());
  });
}

function notifyTabsToRefetch(host) {
  try {
    chrome.tabs.query({ url: `*://${host}/*` }, (tabs) => {
      (tabs || []).forEach((tab) => {
        if (tab?.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: "anit-refetch-mapping" }).catch(() => {});
        }
      });
    });
  } catch (_) {}
}

function createButton(text, cls = "icon-btn") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = cls;
  btn.textContent = text;
  return btn;
}

function renderRow(host, cfg) {
  const tr = document.createElement("tr");

  const tdHost = document.createElement("td");
  tdHost.textContent = host;

  const tdKey = document.createElement("td");
  tdKey.textContent = maskKey(cfg.apiKey);
  if (cfg.apiKey) {
    const copyBtn = createButton("Копировать");
    copyBtn.style.marginLeft = "8px";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(cfg.apiKey || ""));
        showToast("API-ключ скопирован", "ok");
      } catch {
        showToast("Не удалось скопировать ключ", "err");
      }
    });
    tdKey.appendChild(copyBtn);
  }

  const tdEn = document.createElement("td");
  tdEn.innerHTML = cfg.enabled
    ? '<span class="badge ok">Активен</span>'
    : '<span class="badge">Отключен</span>';

  const tdAct = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "row-actions";



  const btnToggle = createButton(cfg.enabled ? "Отключить" : "Включить");
  btnToggle.addEventListener("click", async () => {
    const portals = await loadPortals();
    if (!portals[host]) return;
    portals[host].enabled = !portals[host].enabled;
    await savePortals(portals);
    await render();
    showToast(portals[host].enabled ? "Портал включен" : "Портал отключен", "ok");
  });

  const btnDel = createButton("Удалить", "icon-btn danger");
  btnDel.addEventListener("click", async () => {
    const ok = await openConfirmModal(
      "Удалить портал?",
      `Будут удалены настройки портала ${host}.`,
      "Удалить"
    );
    if (!ok) return;
    const portals = await loadPortals();
    delete portals[host];
    await savePortals(portals);
    await render();
    showToast("Портал удален", "ok");
  });

  actions.appendChild(btnToggle);
  actions.appendChild(btnDel);
  tdAct.appendChild(actions);

  tr.appendChild(tdHost);
  tr.appendChild(tdKey);
  tr.appendChild(tdEn);
  tr.appendChild(tdAct);

  return tr;
}

async function render() {
  const portals = await loadPortals();
  const tbody = $("rows");
  if (!tbody) return;
  tbody.innerHTML = "";

  const hosts = Object.keys(portals).sort();
  if (!hosts.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty";
    td.textContent = "Пока нет настроенных порталов.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const host of hosts) {
    tbody.appendChild(renderRow(host, portals[host]));
  }
}

function validateForm(host, apiKey) {
  clearValidationHints();
  let ok = true;
  if (!host) {
    setFieldError("portalField", "portalHint", "Укажите host портала");
    ok = false;
  } else if (!isValidHost(host)) {
    setFieldError("portalField", "portalHint", "Неверный host. Пример: anit.bitrix24.ru");
    ok = false;
  }
  if (!apiKey) {
    setFieldError("keyField", "keyHint", "Укажите API-ключ");
    ok = false;
  }
  return ok;
}

async function copyKeyFromForm() {
  const apiKey = String($("apiKey").value || "").trim();
  if (!apiKey) {
    setStatus("Нет ключа для копирования", "err", 2200);
    return;
  }
  try {
    await navigator.clipboard.writeText(apiKey);
    showToast("Ключ скопирован", "ok");
  } catch {
    showToast("Не удалось скопировать ключ", "err");
  }
}

$("saveBtn")?.addEventListener("click", async () => {
  const host = normHost($("portalHost").value);
  const apiKey = String($("apiKey").value || "").trim();
  const enabled = !!$("enabled").checked;

  if (!validateForm(host, apiKey)) {
    setStatus("Проверьте поля формы", "err", 3500);
    showToast("Ошибка: заполните форму корректно", "err");
    return;
  }

  const portals = await loadPortals();
  const existed = !!portals[host];
  portals[host] = { enabled, apiKey };
  await savePortals(portals);

  $("portalHost").value = "";
  $("apiKey").value = "";
  $("enabled").checked = true;
  clearValidationHints();

  await render();
  const msg = existed ? "Портал обновлен" : "Портал добавлен";
  setStatus(msg, "ok");
  showToast(msg, "ok");
});

$("clearBtn")?.addEventListener("click", async () => {
  const ok = await openConfirmModal(
    "Очистить все настройки?",
    "Будут удалены все порталы и API-ключи из настроек расширения.",
    "Очистить"
  );
  if (!ok) return;
  await savePortals({});
  await render();
  setStatus("Все настройки очищены", "ok");
  showToast("Все настройки очищены", "ok");
});

$("toggleKeyBtn")?.addEventListener("click", () => {
  const inp = $("apiKey");
  if (inp) inp.type = inp.type === "password" ? "text" : "password";
});

$("copyKeyBtn")?.addEventListener("click", () => copyKeyFromForm());
$("modalCancel")?.addEventListener("click", () => closeConfirmModal(false));
$("modalConfirm")?.addEventListener("click", () => closeConfirmModal(true));
$("modalWrap")?.addEventListener("click", (e) => {
  if (e.target === $("modalWrap")) closeConfirmModal(false);
});

$("portalHost")?.addEventListener("input", () => setFieldError("portalField", "portalHint", ""));
$("apiKey")?.addEventListener("input", () => setFieldError("keyField", "keyHint", ""));

if ($("rows")) render();
