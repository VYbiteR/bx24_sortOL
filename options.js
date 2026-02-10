const $ = (id) => document.getElementById(id);

function normHost(v) {
  return String(v || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

function normBase(v) {
  let s = String(v || '').trim();
  s = s.replace(/\/+$/, '');
  return s;
}

function setStatus(text, kind) {
  const el = $('status');
  el.className = 'status ' + (kind || '');
  el.textContent = text || '';
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent=''; }, 2500);
}

function loadPortals() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['portals'], (res) => resolve(res.portals || {}));
  });
}

function savePortals(portals) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ portals }, () => resolve());
  });
}

function renderRow(host, cfg) {
  const tr = document.createElement('tr');

  const tdHost = document.createElement('td');
  tdHost.textContent = host;

  const tdSrv = document.createElement('td');
  tdSrv.textContent = cfg.serverBase || '';

  const tdEn = document.createElement('td');
  tdEn.innerHTML = cfg.enabled ? '<span class="badge">on</span>' : '<span class="badge">off</span>';

  const tdAct = document.createElement('td');
  tdAct.style.textAlign = 'right';

  const btnToggle = document.createElement('button');
  btnToggle.textContent = cfg.enabled ? 'Выключить' : 'Включить';
  btnToggle.addEventListener('click', async () => {
    const portals = await loadPortals();
    if (!portals[host]) return;
    portals[host].enabled = !portals[host].enabled;
    await savePortals(portals);
    await render();
    setStatus('Сохранено', 'ok');
  });

  const btnDel = document.createElement('button');
  btnDel.textContent = 'Удалить';
  btnDel.className = 'danger';
  btnDel.style.marginLeft = '8px';
  btnDel.addEventListener('click', async () => {
    const portals = await loadPortals();
    delete portals[host];
    await savePortals(portals);
    await render();
    setStatus('Удалено', 'ok');
  });

  tdAct.appendChild(btnToggle);
  tdAct.appendChild(btnDel);

  tr.appendChild(tdHost);
  tr.appendChild(tdSrv);
  tr.appendChild(tdEn);
  tr.appendChild(tdAct);

  return tr;
}

async function render() {
  const portals = await loadPortals();
  const tbody = $('rows');
  tbody.innerHTML = '';

  const hosts = Object.keys(portals).sort();
  if (!hosts.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.color = 'rgba(255,255,255,.65)';
    td.textContent = 'Пока нет настроенных порталов.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const host of hosts) {
    tbody.appendChild(renderRow(host, portals[host]));
  }
}

$('addBtn').addEventListener('click', async () => {
  const host = normHost($('portalHost').value);
  const base = normBase($('serverBase').value);
  const enabled = !!$('enabled').checked;

  if (!host) return setStatus('Укажи портал (host)', 'err');
  if (!base || !/^https?:\/\//i.test(base)) return setStatus('Укажи serverBase (https://...)', 'err');

  const portals = await loadPortals();
  portals[host] = { enabled, serverBase: base };
  await savePortals(portals);

  $('portalHost').value = '';
  $('serverBase').value = '';
  $('enabled').checked = true;

  await render();
  setStatus('Сохранено', 'ok');
});

$('clearBtn').addEventListener('click', async () => {
  if (!confirm('Точно очистить все настройки порталов?')) return;
  await savePortals({});
  await render();
  setStatus('Очищено', 'ok');
});

// initial
render();

