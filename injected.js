/* eslint-disable no-console */
(function () {
	const VER = '1.9.1';
	const log  = (...a) => console.log('[KX-REC]', ...a);
	const warn = (...a) => console.warn('[KX-REC]', ...a);
	const err  = (...a) => console.error('[KX-REC]', ...a);

	const IS_FRAME = self !== top;
	const qs = new URLSearchParams(location.search || '');
	const IS_OL_FRAME =
		IS_FRAME &&
		/\/desktop_app\/\?/i.test(location.href) &&
		(qs.get('IM_LINES') === 'Y' || /IM_LINES=Y/i.test(location.href));

	const OL_URL_RX =
		/(\/rest\/.*im\.recent\.(list|get|pin)|\/bitrix\/services\/main\/ajax\.php\?[^#]*action=im\.recent\.(list|get|pin))/i;

	let gateOpened = false;
	let openGateResolve;
	const gatePromise = new Promise(r => (openGateResolve = r));
	function openGate(reason, url) {
		if (gateOpened) return;
		gateOpened = true;
		log('GATE OPEN', { reason, url });
		openGateResolve();
	}
	function maybeOpenGate(from, url) {
		if (!gateOpened && OL_URL_RX.test(String(url || ''))) openGate(from, url);
	}

	// --- hook fetch/xhr: только открываем ворота
	(function hookFetch() {
		const orig = window.fetch && window.fetch.bind(window);
		if (!orig) return;
		window.fetch = function (input, init) {
			try { maybeOpenGate('fetch', typeof input === 'string' ? input : input?.url); } catch {}
			return orig(input, init);
		};
	})();
	(function hookXHR() {
		const XO = window.XMLHttpRequest;
		if (!XO) return;
		const _open = XO.prototype.open;
		const _send = XO.prototype.send;
		XO.prototype.open = function (m, url, ...rest) { this.__kx_url = url; return _open.call(this, m, url, ...rest); };
		XO.prototype.send = function (body) { try { maybeOpenGate('xhr', this.__kx_url || ''); } catch {} return _send.call(this, body); };
	})();

	function findContainer() {
		return document.querySelector('.bx-messenger-recent-wrap.bx-messenger-recent-lines-wrap');
	}

	// --- помощники ожиданий ---
	function waitForBody(timeout = 5000) {
		return new Promise((resolve, reject) => {
			if (document.body) return resolve(document.body);
			const done = () => { if (document.body) { cleanup(); resolve(document.body); } };
			const cleanup = () => { clearInterval(t); document.removeEventListener('DOMContentLoaded', done); };
			const t = setInterval(done, 50);
			document.addEventListener('DOMContentLoaded', done);
			setTimeout(() => { cleanup(); document.body ? resolve(document.body) : reject(new Error('body-timeout')); }, timeout);
		});
	}
	function waitForContainer(timeout = 5000) {
		return new Promise((resolve, reject) => {
			const ok = () => { const c = findContainer(); if (c) { clearInterval(t); resolve(c); } };
			const t = setInterval(ok, 80);
			ok();
			setTimeout(() => { clearInterval(t); const c = findContainer(); c ? resolve(c) : reject(new Error('container-timeout')); }, timeout);
		});
	}

	function armDomRetroGate() {
		const c = findContainer();
		if (c && c.querySelector('.bx-messenger-cl-item')) openGate('dom-retro', location.href);
		requestAnimationFrame(() => {
			const cc = findContainer();
			if (cc && cc.querySelector('.bx-messenger-cl-item')) openGate('dom-retro-rAF', location.href);
			else setTimeout(() => {
				const ccc = findContainer();
				if (ccc && ccc.querySelector('.bx-messenger-cl-item')) openGate('dom-retro-timeout', location.href);
			}, 250);
		});
	}

	// ==== REST tsMap (один раз) ====
	async function getRecentTsMap() {
		const map = new Map();
		const BXNS = window.BX;
		if (!BXNS?.rest?.callMethod) {
			warn('BX.rest недоступен — работаю без tsMap');
			return map;
		}
		try {
			const data = await new Promise((resolve, reject) => {
				BXNS.rest.callMethod('im.recent.list', { ONLY_OPENLINES: 'Y' }, (res) => {
					if (typeof res?.data !== 'function') return reject(new Error('unexpected BX.rest response'));
					resolve(res.data());
				});
			});
			const items = data?.items || data || [];
			for (const it of items) {
				const dialogId = String(
					it.dialogId ??
					it.id ??
					(it.chat_id != null ? 'chat' + it.chat_id : it.user_id != null ? it.user_id : '')
				).toLowerCase();
				let dateStr = it?.message?.date || it?.date_update || it?.date || it?.message?.DATE || '';
				if (typeof dateStr === 'string') dateStr = dateStr.replace(' ', 'T');
				const ts = Date.parse(dateStr) || 0;
				if (dialogId) map.set(dialogId, ts);
			}
			log('REST tsMap size', map.size);
			return map;
		} catch (e) {
			warn('REST error, без tsMap', e);
			return map;
		}
	}

	const normId = (raw) => {
		if (!raw) return '';
		const s = String(raw).toLowerCase();
		if (/^chat\d+/.test(s)) return s;
		if (/^\d+$/.test(s)) return 'chat' + s;
		return s;
	};

	// ==== «заморозка» порядка ====
	let rankMap = new Map();
	let frozenSetSig = '';
	let tsMapOnce = null;
	let lastOrderSig = '';

	const currentSetSignature = (ids) => Array.from(new Set(ids)).sort().join('#');
	const currentOrderSignature = (ids) => ids.join('|');

	// ====== ФИЛЬТРЫ ======
	const LS_KEY = 'kxrec.filters.v1';
	const defaultFilters = () => ({
		unreadOnly: false,
		withAttach: false,
		onlyWhatsApp: false,
		onlyTelegram: false,
		status: 'any',
		query: ''
	});
	let filters = loadFilters();
	function loadFilters() {
		try { return { ...defaultFilters(), ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) }; }
		catch { return defaultFilters(); }
	}
	function saveFilters() { try { localStorage.setItem(LS_KEY, JSON.stringify(filters)); } catch {} }

	function getItemMeta(el) {
		const id = normId(el.getAttribute('data-userid') || el.dataset.userid);
		const status = parseInt(el.getAttribute('data-status') || el.dataset.status || '0', 10) || 0;
		const hasUnread = !!el.querySelector('.bx-messenger-cl-count-digit');
		const lastText = (el.querySelector('.bx-messenger-cl-user-desc')?.textContent || '').trim().toLowerCase();
		const title = (el.querySelector('.bx-messenger-cl-user-title')?.textContent || '').trim().toLowerCase();
		const cls = el.className || '';
		const isWhatsApp = /-wz_whatsapp_/i.test(cls);
		const isTelegram = /-wz_telegram_/i.test(cls);
		const hasAttach = /\[(вложение|файл)\]/i.test(lastText);
		return { id, status, hasUnread, lastText, title, isWhatsApp, isTelegram, hasAttach };
	}
	function matchByFilters(meta) {
		if (filters.unreadOnly && !meta.hasUnread) return false;
		if (filters.withAttach && !meta.hasAttach) return false;
		if (filters.onlyWhatsApp && !meta.isWhatsApp) return false;
		if (filters.onlyTelegram && !meta.isTelegram) return false;
		if (filters.status !== 'any' && String(meta.status) !== filters.status) return false;
		const q = (filters.query || '').trim().toLowerCase();
		if (q) {
			const hay = meta.title + ' ' + meta.lastText;
			if (!hay.includes(q)) return false;
		}
		return true;
	}
	function applyFilters() {
		const container = findContainer();
		if (!container) return;
		container.querySelectorAll('.bx-messenger-recent-group').forEach(n => n.remove());
		const items = Array.from(container.querySelectorAll('.bx-messenger-cl-item'));
		for (const el of items) {
			const meta = getItemMeta(el);
			el.style.display = matchByFilters(meta) ? '' : 'none';
		}
	}

	// безопасная сборка панели (ждём body; не дублируем)
	async function buildFiltersPanel() {
		if (document.getElementById('kxrec-filters')) return; // уже есть
		await waitForBody(5000);

		const host = document.createElement('div');
		host.id = 'kxrec-filters';
		host.innerHTML = `
<style>
#kxrec-filters{position:fixed;top:10px;right:12px;z-index:99999;background:#1f232b;color:#fff;
  border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px 12px;font:12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Arial;box-shadow:0 8px 24px rgba(0,0,0,.35)}
#kxrec-filters h4{margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:.2px}
#kxrec-filters .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0}
#kxrec-filters label{display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer}
#kxrec-filters input[type="text"]{width:180px;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff;outline:none}
#kxrec-filters select{padding:3px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff}
#kxrec-filters .muted{opacity:.75}
#kxrec-filters .actions{display:flex;gap:8px;margin-top:6px}
#kxrec-filters button{padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff;cursor:pointer}
#kxrec-filters .kbd{padding:1px 4px;border:1px solid rgba(255,255,255,.3);border-radius:4px;font-family:monospace;font-size:11px}
</style>
<div class="pane">
  <h4>Фильтры (KX-REC)</h4>
  <div class="row">
    <label><input type="checkbox" id="kx_unread"> Непрочитанные</label>
    <label><input type="checkbox" id="kx_attach"> С вложениями</label>
    <label><input type="checkbox" id="kx_wa"> WhatsApp</label>
    <label><input type="checkbox" id="kx_tg"> Telegram</label>
    <label class="muted">Статус:
      <select id="kx_status">
        <option value="any">Любой</option>
        <option value="20">20</option>
        <option value="25">25</option>
        <option value="40">40</option>
      </select>
    </label>
  </div>
  <div class="row">
    <input type="text" id="kx_query" placeholder="Поиск по имени/последнему сообщению">
  </div>
  <div class="actions">
    <button id="kx_apply">Применить</button>
    <button id="kx_reset">Сброс</button>
    <span class="muted">(<span class="kbd">Ctrl</span>+<span class="kbd">Alt</span>+<span class="kbd">F</span> — показать/скрыть)</span>
  </div>
</div>`;
		document.body.appendChild(host);

		// init values
		host.querySelector('#kx_unread').checked = !!filters.unreadOnly;
		host.querySelector('#kx_attach').checked = !!filters.withAttach;
		host.querySelector('#kx_wa').checked = !!filters.onlyWhatsApp;
		host.querySelector('#kx_tg').checked = !!filters.onlyTelegram;
		host.querySelector('#kx_status').value = String(filters.status || 'any');
		host.querySelector('#kx_query').value = String(filters.query || '');

		function readAndApply() {
			filters.unreadOnly   = host.querySelector('#kx_unread').checked;
			filters.withAttach   = host.querySelector('#kx_attach').checked;
			filters.onlyWhatsApp = host.querySelector('#kx_wa').checked;
			filters.onlyTelegram = host.querySelector('#kx_tg').checked;
			filters.status       = host.querySelector('#kx_status').value;
			filters.query        = host.querySelector('#kx_query').value;
			saveFilters();
			applyFilters();
		}
		host.querySelector('#kx_apply').addEventListener('click', readAndApply);
		host.querySelector('#kx_reset').addEventListener('click', () => {
			filters = defaultFilters();
			saveFilters();
			host.querySelector('#kx_unread').checked = false;
			host.querySelector('#kx_attach').checked = false;
			host.querySelector('#kx_wa').checked = false;
			host.querySelector('#kx_tg').checked = false;
			host.querySelector('#kx_status').value = 'any';
			host.querySelector('#kx_query').value = '';
			applyFilters();
		});
		host.querySelectorAll('input,select').forEach(el => {
			el.addEventListener('change', readAndApply);
			if (el.id === 'kx_query') el.addEventListener('keydown', (e) => { if (e.key === 'Enter') readAndApply(); });
		});
		document.addEventListener('keydown', (e) => {
			if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'f') {
				host.style.display = (host.style.display === 'none' ? '' : 'none');
			}
		});
	}

	// ==== rebuild + observer ====
	let obs;
	let rebuildScheduled = false;

	async function rebuildList(reason, opts = {}) {
		const container = findContainer();
		if (!container) { warn('rebuild: контейнер не найден'); return; }

		// плоский список
		container.querySelectorAll('.bx-messenger-recent-group').forEach(n => n.remove());

		const items = Array.from(container.querySelectorAll('.bx-messenger-cl-item'));
		if (!items.length) { applyFilters(); return; }

		const ids = items.map(el => normId(el.getAttribute('data-userid') || el.dataset.userid));
		const setSig = currentSetSignature(ids);

		// тот же состав — просто восстановим зафиксированный порядок
		if (rankMap.size && setSig === frozenSetSig) {
			const orderSigNow = currentOrderSignature(ids);
			const shouldBe = Array.from(ids).sort((a, b) => (rankMap.get(a) ?? 1e9) - (rankMap.get(b) ?? 1e9));
			const wantedSig = currentOrderSignature(shouldBe);
			if (orderSigNow !== wantedSig) {
				const mapById = new Map(items.map(el => [normId(el.getAttribute('data-userid') || el.dataset.userid), el]));
				const frag = document.createDocumentFragment();
				for (const id of shouldBe) { const el = mapById.get(id); if (el) frag.appendChild(el); }
				container.appendChild(frag);
				lastOrderSig = wantedSig;
				log('reapply frozen order.', { total: items.length, reason });
			}
			applyFilters();
			return;
		}

		// первый раз / состав изменился
		const tsMap = opts.tsMap || tsMapOnce || new Map();
		const currentIndex = new Map(items.map((el, i) => [el, i]));

		items.sort((a, b) => {
			const aId = normId(a.getAttribute('data-userid') || a.dataset.userid);
			const bId = normId(b.getAttribute('data-userid') || b.dataset.userid);
			const ra = rankMap.has(aId) ? rankMap.get(aId) : 1e9;
			const rb = rankMap.has(bId) ? rankMap.get(bId) : 1e9;
			if (ra !== rb) return ra - rb;
			const ta = tsMap.get(aId) ?? -1;
			const tb = tsMap.get(bId) ?? -1;
			if (ta !== tb) return tb - ta;
			return (currentIndex.get(a) ?? 0) - (currentIndex.get(b) ?? 0);
		});

		const newIds = items.map(el => normId(el.getAttribute('data-userid') || el.dataset.userid));
		const newOrderSig = currentOrderSignature(newIds);
		if (newOrderSig !== lastOrderSig) {
			const frag = document.createDocumentFragment();
			for (const el of items) frag.appendChild(el);
			container.appendChild(frag);
			lastOrderSig = newOrderSig;
		}

		rankMap = new Map(newIds.map((id, i) => [id, i]));
		frozenSetSig = currentSetSignature(newIds);

		log('rebuild ok.', { total: items.length, source: tsMap.size ? 'rest' : 'dom', reason });
		applyFilters();
	}

	function armObserver() {
		const container = findContainer();
		if (!container) return;
		if (obs) obs.disconnect();

		obs = new MutationObserver((mutations) => {
			let need = false;
			for (const m of mutations) {
				if (m.type === 'childList') {
					if ([...m.addedNodes, ...m.removedNodes].some(n =>
						n.nodeType === 1 &&
						(n.matches?.('.bx-messenger-cl-item, .bx-messenger-recent-group') ||
							n.querySelector?.('.bx-messenger-cl-item, .bx-messenger-recent-group'))
					)) { need = true; break; }
				}
			}
			if (!need) return;
			if (rebuildScheduled) return;
			rebuildScheduled = true;
			setTimeout(async () => {
				rebuildScheduled = false;
				await rebuildList('observer');
			}, 80);
		});

		obs.observe(container, { childList: true, subtree: true });
		log('observeContainer: подписан на DOM изменения');
	}

	async function boot() {
		if (!IS_OL_FRAME) return;
		log('start', { ver: VER, href: location.href, inFrame: true, isOL: true });

		armDomRetroGate();
		await gatePromise;

		// ждём, пока реально появится контейнер списков (и body, если нужно)
		await waitForBody(5000).catch(() => {});
		await waitForContainer(5000).catch(() => {});

		// только теперь создаём панель фильтров (иначе body может быть ещё null)
		try { await buildFiltersPanel(); } catch (e) { warn('filters panel build skipped:', e?.message || e); }

		tsMapOnce = await getRecentTsMap().catch(() => new Map());

		await rebuildList('boot', { tsMap: tsMapOnce });
		armObserver();
		log('boot завершён');
	}

	try { boot().catch(e => err('fatal', e)); } catch (e) { err('fatal', e); }
})();
