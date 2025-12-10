

	(function () {

	if (window.__ANITREC_RUNNING__) { return; }
	window.__ANITREC_RUNNING__ = '1.15.0';

	const VER = '1.15.0';
	const TAG = 'ANIT: CHAT SORTER';
	const LBL = `%c[${TAG}]`;
	const CSS_LOG  = 'background:#000;color:#fff;padding:1px 4px;border-radius:3px';
	const CSS_WARN = 'background:#8B5E00;color:#fff;padding:1px 4px;border-radius:3px';
	const CSS_ERR  = 'background:#7F1D1D;color:#fff;padding:1px 4px;border-radius:3px';

	const log  = (...a) => console.log(LBL, CSS_LOG, ...a);
	const warn = (...a) => console.log(LBL, CSS_WARN, ...a);
	const err  = (...a) => console.error(LBL, CSS_ERR, ...a);

	const IS_FRAME = self !== top;
	const qs = new URLSearchParams(location.search || '');
	const IS_OL_FRAME =
	IS_FRAME &&
	/\/desktop_app\/\?/i.test(location.href) &&
	(qs.get('IM_LINES') === 'Y' || /IM_LINES=Y/i.test(location.href));
	let multiSelectMode = false;
	let multiSelectedIds = new Set();
	let multiRmbTimer = null;
	let multiRmbTargetEl = null;
	let multiPanelHost = null;
	let multiEnteredViaRmb = false;
	function isInternalRecentDOM() {
		return !!document.querySelector('.bx-im-list-container-recent__elements .bx-im-list-recent-item__wrap');
	}

	function isInternalTaskDOM() {
		return !!document.querySelector('.bx-im-list-container-task__elements .bx-im-list-recent-item__wrap');
	}

	function isInternalChatsDOM() {
		return isInternalRecentDOM() || isInternalTaskDOM();
	}

	function findContainerInternal() {

		const taskList = document.querySelector('.bx-im-list-container-task__elements');
		if (taskList) return taskList;
		return document.querySelector('.bx-im-list-container-recent__elements');
	}



	function findContainerOL() {
	return document.querySelector('.bx-messenger-recent-wrap.bx-messenger-recent-lines-wrap');
}

	function findContainer() {
	if (IS_OL_FRAME) return findContainerOL();
	if (isInternalChatsDOM()) return findContainerInternal();
	return null;
}


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
	XO.prototype.open = function (m, url, ...rest) { this.__anit_url = url; return _open.call(this, m, url, ...rest); };
	XO.prototype.send = function (body) { try { maybeOpenGate('xhr', this.__anit_url || ''); } catch {} return _send.call(this, body); };
})();

	function armDomRetroGate() {
	if (!IS_OL_FRAME) return;
	const c = findContainerOL();
	if (c && c.querySelector('.bx-messenger-cl-item')) openGate('dom-retro', location.href);
	requestAnimationFrame(() => {
	const cc = findContainerOL();
	if (cc && cc.querySelector('.bx-messenger-cl-item')) openGate('dom-retro-rAF', location.href);
	else setTimeout(() => {
	const ccc = findContainerOL();
	if (ccc && ccc.querySelector('.bx-messenger-cl-item')) openGate('dom-retro-timeout', location.href);
}, 250);
});
}

		async function waitForEl(locator, {timeout=8000, interval=100} = {}) {
			const isFn = typeof locator === 'function';
			const t0 = performance.now();
			while (performance.now() - t0 < timeout) {
				const el = isFn ? locator() : document.querySelector(locator);
				if (el) return el;
				await new Promise(r => setTimeout(r, interval));
			}
			return null;
		}


		function findInternalScrollContainer() {
			const list =
				document.querySelector('.bx-im-list-container-task__elements') ||
				document.querySelector('.bx-im-list-container-recent__elements');
			if (!list) return null;


			let n = list;
			for (let i = 0; i < 6 && n; i++) {
				if (n.classList && n.classList.contains('bx-im-list-recent__scroll-container')) return n;
				n = n.parentElement;
			}


			const direct =
				document.querySelector('.bx-im-list-task__scroll-container') ||
				document.querySelector('.bx-im-list-recent__scroll-container');
			if (direct) return direct;


			n = list.parentElement;
			while (n) {
				const st = getComputedStyle(n);
				if (/(auto|scroll)/i.test(st.overflowY)) return n;
				n = n.parentElement;
			}
			return null;
		}
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


		function autoScrollWithObserver(
			{ scrollEl = null, observeEl = null, tick = 250, idleLimit = 1500, maxTime = 60000 } = {}
		) {
			return new Promise(async (resolve) => {

				if (!scrollEl) {
					scrollEl = await waitForEl(findInternalScrollContainer, {timeout: 10000, interval: 100});
				}
				if (!observeEl) {
					observeEl = await waitForEl('.bx-im-list-container-recent__elements', {timeout: 10000, interval: 100});
				}
				if (!scrollEl) { console.warn('[ANIT-CHATSORTER] autoScroll: не найден scroll container'); return resolve(); }
				if (!observeEl) observeEl = scrollEl;

				let changed = false, idle = 0, t0 = performance.now();

				const scrollDown = () => {

					scrollEl.scrollTop = scrollEl.scrollHeight;
				};

				const obs = new MutationObserver(() => { changed = true; });
				obs.observe(observeEl, { childList: true, subtree: true });

				const id = setInterval(() => {
					const before = scrollEl.scrollTop;
					scrollDown();

					if (changed) { changed = false; idle = 0; }
					else {
						const atBottom =
							Math.abs((scrollEl.scrollTop + scrollEl.clientHeight) - scrollEl.scrollHeight) < 2 ||
							scrollEl.scrollTop === before;
						if (atBottom) idle += tick;
					}

					const timedOut = (performance.now() - t0) > maxTime;
					if (idle >= idleLimit || timedOut) {
						clearInterval(id);
						obs.disconnect();
						console.log('[ANIT-CHATSORTER] Автоскролл остановлен. idle =', idle, 'ms, timedOut =', timedOut);
						resolve();
					}
				}, tick);
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
	it.dialogId ?? it.id ?? (it.chat_id != null ? 'chat' + it.chat_id : it.user_id != null ? it.user_id : '')
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

		function getChatItemElement(target) {
			if (!target) return null;

			if (IS_OL_FRAME) {
				const el = target.closest?.('.bx-messenger-cl-item');
				if (el) return el;
			}

			// Внутренние чаты / чаты задач
			const el2 = target.closest?.('.bx-im-list-recent-item__wrap');
			if (el2) return el2;

			return null;
		}

		function getChatIdFromElement(el) {
			if (!el) return '';

			if (IS_OL_FRAME) {

				return normId(el.getAttribute('data-userid') || el.dataset.userid);
			}


			return normId(
				el.getAttribute('data-id') ||
				el.dataset.id ||
				el.querySelector('[data-id]')?.getAttribute('data-id')
			);
		}

	let rankMap = new Map();
	let frozenSetSig = '';
	let tsMapOnce = null;
	let lastOrderSig = '';
	const currentSetSignature = (ids) => Array.from(new Set(ids)).sort().join('#');
	const currentOrderSignature = (ids) => ids.join('|');

	const RU_DAYS_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
	const RU_MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
	function dateKey(ts) {
	if (!ts || ts <= 0) return 'nodate';
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
	function formatGroupTitleFromTS(ts) {
	if (!ts || ts <= 0) return 'Без даты';
	const d = new Date(ts);
	const now = new Date();
	const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diffDays = Math.round((dayStart - d0)/86400000);
	if (diffDays === 0) return 'сегодня';
	if (diffDays === -1) return 'вчера';
	const w = RU_DAYS_SHORT[d.getDay()];
	return `${w}, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`;
}
	function rebuildDateGroups(tsMap) {
	if (!IS_OL_FRAME) return;
	const container = findContainerOL();
	if (!container) return;
	container.querySelectorAll('.bx-messenger-recent-group').forEach(n => n.remove());
	const items = Array.from(container.querySelectorAll('.bx-messenger-cl-item'))
	.filter(el => el.style.display !== 'none');
	let lastKey = null;
	for (const el of items) {
	const id = (el.getAttribute('data-userid') || el.dataset.userid || '').toLowerCase();
	const ts = tsMap?.get?.(id) ?? -1;
	const key = dateKey(ts);
	if (key !== lastKey) {
	const div = document.createElement('div');
	div.className = 'bx-messenger-recent-group';
	const span = document.createElement('span');
	span.className = 'bx-messenger-recent-group-title';
	span.textContent = formatGroupTitleFromTS(ts);
	div.appendChild(span);
	container.insertBefore(div, el);
	lastKey = key;
}
}
}


	const LS_KEY = 'anit.filters.v2';
	const defaultFilters = () => ({
	unreadOnly: false,
	withAttach: false,
	status: 'any',
	query: '',
	onlyWhatsApp: false,
	onlyTelegram: false,
	typesSelected: [],
});
	let filters = loadFilters();
	function loadFilters() {
	try { return { ...defaultFilters(), ...(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) }; }
	catch { return defaultFilters(); }
}
	function saveFilters() { try { localStorage.setItem(LS_KEY, JSON.stringify(filters)); } catch {} }
		function ensureMultiPanel() {
			if (multiPanelHost) return multiPanelHost;

			const host = document.createElement('div');
			host.id = 'anit-multi-panel';
			host.style.cssText = [
				'position:fixed',
				'top:8px',
				'left:50%',
				'transform:translateX(-50%)',
				'z-index:9999',
				'background:#1f232b',
				'color:#fff',
				'border-radius:10px',
				'padding:6px 10px',
				'font:12px system-ui,-apple-system,Segoe UI,Roboto,Arial',
				'display:none',
				'box-shadow:0 8px 24px rgba(0,0,0,.35)'
			].join(';');

			host.innerHTML = `
	  <span id="anit-multi-count">0</span> выбрано
	  <span style="margin:0 8px;color:rgba(255,255,255,.4)">|</span>
	  <button data-act="later">Посмотреть позже</button>
	  <button data-act="pin">Закрепить</button>
	  <button data-act="unpin">Открепить</button>
	  <button data-act="mute">Выключить звук</button>
	  <button data-act="unmute">Включить звук</button>
	  <button data-act="hide">Скрыть</button>
	  <button data-act="leave">Выйти</button>
	  <span style="margin:0 8px;color:rgba(255,255,255,.4)">|</span>
	  <button data-act="cancel">Отмена</button>
	`;
			host.querySelectorAll('button').forEach(btn => {
				btn.style.cssText = [
					'background:#0f1115',
					'border:1px solid rgba(255,255,255,.25)',
					'border-radius:6px',
					'padding:2px 6px',
					'color:#fff',
					'cursor:pointer',
					'font-size:11px',
					'margin-right:4px'
				].join(';');
				btn.addEventListener('click', () => {
					const act = btn.getAttribute('data-act');
					if (act === 'cancel') { exitMultiSelectMode(); }
					else { applyMultiAction(act); }
				});
			});

			document.body.appendChild(host);
			multiPanelHost = host;
			return host;
		}

		function updateMultiPanel() {
			const host = ensureMultiPanel();
			const cnt = multiSelectedIds.size;
			const cntSpan = host.querySelector('#anit-multi-count');
			if (cntSpan) cntSpan.textContent = String(cnt);
			host.style.display = cnt > 0 ? 'block' : 'none';
			if (!cnt) exitMultiSelectMode();
		}

		function enterMultiSelectMode(firstEl) {
			if (multiSelectMode) return;
			multiSelectMode = true;
			multiSelectedIds.clear();

			const id = getChatIdFromElement(firstEl);
			if (id) {
				multiSelectedIds.add(id);
				firstEl.classList.add('anit-multi-selected');
			}
			updateMultiPanel();
			log('multi-select: ON', { first: id });
		}

		function exitMultiSelectMode() {
			if (!multiSelectMode) return;
			multiSelectMode = false;
			multiSelectedIds.clear();
			document.querySelectorAll('.anit-multi-selected').forEach(el => el.classList.remove('anit-multi-selected'));
			if (multiPanelHost) multiPanelHost.style.display = 'none';
			multiEnteredViaRmb = false;
			log('multi-select: OFF');
		}

		function toggleChatSelectionFromElement(el) {
			if (!el) return;
			const id = getChatIdFromElement(el);
			if (!id) return;
			if (multiSelectedIds.has(id)) {
				multiSelectedIds.delete(id);
				el.classList.remove('anit-multi-selected');
			} else {
				multiSelectedIds.add(id);
				el.classList.add('anit-multi-selected');
			}
			updateMultiPanel();
		}
		function applyMultiAction(kind) {
			const ids = Array.from(multiSelectedIds);
			if (!ids.length) return;

			const BXNS = window.BX || {};

			log('multiAction', { kind, ids, count: ids.length });

			const tasks = [];

			ids.forEach((dialogId) => {

				if (kind === 'pin') {
					// /bitrix/services/main/ajax.php?action=im.v2.Chat.pin
					if (!BXNS.ajax?.runAction) return;
					tasks.push(
						BXNS.ajax.runAction('im.v2.Chat.pin', {
							data: { dialogId }
						})
					);
				}
				else if (kind === 'unpin') {
					// /bitrix/services/main/ajax.php?action=im.v2.Chat.unpin
					if (!BXNS.ajax?.runAction) return;
					tasks.push(
						BXNS.ajax.runAction('im.v2.Chat.unpin', {
							data: { dialogId }
						}).catch(() => {})
					);
				}
				else if (kind === 'later') {

					// /rest/im.v2.Chat.unread.json
					if (!BXNS.rest?.callMethod) return;
					tasks.push(
						new Promise((resolve) => {
							BXNS.rest.callMethod(
								'im.v2.Chat.unread',
								{ dialogId },
								() => resolve()
							);
						})
					);
				}
				else if (kind === 'mute') {
					// /rest/im.chat.mute.json  action=Y
					if (!BXNS.rest?.callMethod) return;
					tasks.push(
						new Promise((resolve) => {
							BXNS.rest.callMethod(
								'im.chat.mute',
								{ dialog_id: dialogId, action: 'Y' },
								() => resolve()
							);
						})
					);
				}
				else if (kind === 'unmute') {
					// /rest/im.chat.mute.json  action=N
					if (!BXNS.rest?.callMethod) return;
					tasks.push(
						new Promise((resolve) => {
							BXNS.rest.callMethod(
								'im.chat.mute',
								{ dialog_id: dialogId, action: 'N' },
								() => resolve()
							);
						})
					);
				}
				else if (kind === 'hide') {
					// /rest/im.recent.hide.json
					if (!BXNS.rest?.callMethod) return;
					tasks.push(
						new Promise((resolve) => {
							BXNS.rest.callMethod(
								'im.recent.hide',
								{ DIALOG_ID: dialogId },
								() => resolve()
							);
						})
					);
				}
				else if (kind === 'leave') {

					if (!BXNS.rest?.callMethod) return;
					tasks.push(
						new Promise((resolve) => {
							BXNS.rest.callMethod(
								'im.chat.leave',
								{ DIALOG_ID: dialogId },
								() => resolve()
							);
						})
					);
				}
			});


			Promise.allSettled(tasks).finally(() => {
				exitMultiSelectMode();
				setTimeout(() => {
					try { applyFilters(); } catch (e) {}
				}, 300);
			});
		}

		function getItemMetaOL(el) {
	const id = normId(el.getAttribute('data-userid') || el.dataset.userid);
	const status = parseInt(el.getAttribute('data-status') || el.dataset.status || '0', 10) || 0;
	const hasUnread = !!el.querySelector('.bx-messenger-cl-count-digit');
	const lastText = (el.querySelector('.bx-messenger-cl-user-desc')?.textContent || '').trim().toLowerCase();
	const title = (el.querySelector('.bx-messenger-cl-user-title')?.textContent || '').trim().toLowerCase();
	const cls = el.className || '';
	const isWhatsApp = /-wz_whatsapp_/i.test(cls);
	const isTelegram = /-wz_telegram_/i.test(cls);
	const hasAttach = /\[(вложение|файл)\]/i.test(lastText);
	return { id, status, hasUnread, lastText, title, isWhatsApp, isTelegram, hasAttach, type: 'ol' };
}

	function getItemMetaInternal(el) {
	const id = normId(el.getAttribute('data-id') || el.dataset.id || el.querySelector('[data-id]')?.getAttribute('data-id'));
		const title = (
			el.querySelector('.bx-im-chat-title__text')?.getAttribute('title') ||
			el.querySelector('.bx-im-chat-title__text')?.textContent || ''
		).trim().toLowerCase();
		const lastText = (
			el.querySelector('.bx-im-list-recent-item__message_text')?.textContent || ''
		).trim().toLowerCase();


		const getUnread = () => {

			const numEl = el.querySelector('.bx-im-list-recent-item__counter_number');
			if (numEl) {
				const n = parseInt((numEl.textContent || '').replace(/\D+/g, ''), 10);
				return Number.isFinite(n) && n > 0;
			}

			const cntWrap = el.querySelector('.bx-im-list-recent-item__counters');
			if (cntWrap) {
				const n = parseInt((cntWrap.textContent || '').replace(/\D+/g, ''), 10);
				return Number.isFinite(n) && n > 0;
			}
			return false;
		};
		const hasUnread = getUnread();
	const avatar = el.querySelector('.bx-im-avatar__container') || el;
	const cl = (avatar?.className || '') + ' ' + (el.querySelector('.bx-im-chat-title__icon')?.className || '');
	const has = (rx) => rx.test(cl) || rx.test(title) /*|| rx.test(lastText)*/;

	let itemType = 'other';
	if (has(/--user\b/)) itemType = 'dialog';
	if (has(/--chat\b/)) itemType = 'chat';
	if (has(/--crm\b/)) itemType = 'deal';
	if (has(/--videoconf\b/)) itemType = 'videoconf';
	if (has(/--support24|--support24Question/)) itemType = 'support';
	if (has(/--sonetGroup\b/) || !!el.querySelector('.ui-avatar.--hexagon')) itemType = 'group';
	if (has(/--general\b/)) itemType = 'general';
	if (has(/--network\b/)) itemType = 'network';
	if (has(/--tasks\b/)) itemType = 'tasks';
	if (has(/--call\b/)) itemType = 'phone';
	if (has(/--calendar\b/)) itemType = 'calendar';
	if (has(/--extranet|--guest/)) itemType = 'guests';

	const hasAttach = /\[(вложение|файл)\]/i.test(lastText);

	return { id, hasUnread, lastText, title, hasAttach, type: itemType, status: 0, isWhatsApp: false, isTelegram: false };
}

	function getItemMeta(el) {
	if (IS_OL_FRAME) return getItemMetaOL(el);
	return getItemMetaInternal(el);
}

	function matchByFilters(meta) {
	if (filters.unreadOnly && !meta.hasUnread) return false;
	if (filters.withAttach && !meta.hasAttach) return false;
	if (IS_OL_FRAME) {
	if (filters.onlyWhatsApp && !meta.isWhatsApp) return false;
	if (filters.onlyTelegram && !meta.isTelegram) return false;
	if (filters.status !== 'any' && String(meta.status) !== filters.status) return false;
} else {
	const sel = Array.isArray(filters.typesSelected) ? filters.typesSelected : [];
	if (sel.length && !sel.includes(meta.type)) return false;
}
	const q = (filters.query || '').trim().toLowerCase();
	if (q) {
	const hay = (meta.title || '') + ' ' + (meta.lastText || '');
	if (!hay.includes(q)) return false;
}
	return true;
}

	function applyFilters() {
	const container = findContainer();
	if (!container) return;

	if (IS_OL_FRAME) container.querySelectorAll('.bx-messenger-recent-group').forEach(n => n.remove());

	const items = IS_OL_FRAME
	? Array.from(container.querySelectorAll('.bx-messenger-cl-item'))
	: Array.from(container.querySelectorAll('.bx-im-list-recent-item__wrap'));

	for (const el of items) {
	const meta = getItemMeta(el);
	el.style.display = matchByFilters(meta) ? '' : 'none';
}
	if (IS_OL_FRAME) rebuildDateGroups(tsMapOnce || new Map());
}


	const POS_LS_KEY = (mode) => `anit.filters.pos.${mode}`; // 'ol' | 'internal'

	function restorePosition(host, mode) {
	try {
	const raw = localStorage.getItem(POS_LS_KEY(mode));
	if (!raw) return false;
	const pos = JSON.parse(raw);
	if (!pos) return false;
	host.style.left  = (pos.left ?? 0) + 'px';
	host.style.top   = (pos.top  ?? 0) + 'px';
	return true;
} catch { return false; }
}
		function uiFromFilters(host){
			host.querySelector('#anit_unread').checked = !!filters.unreadOnly;
			host.querySelector('#anit_attach').checked = !!filters.withAttach;
			host.querySelector('#anit_query').value = String(filters.query || '');
			if (IS_OL_FRAME) {
				const wa = host.querySelector('#anit_wa'),
					tg = host.querySelector('#anit_tg'),
					st = host.querySelector('#anit_status');
				if (wa) wa.checked = !!filters.onlyWhatsApp;
				if (tg) tg.checked = !!filters.onlyTelegram;
				if (st) st.value   = String(filters.status || 'any');
			} else {
				const sel = new Set(Array.isArray(filters.typesSelected) ? filters.typesSelected : []);
				host.querySelectorAll('#anit_types input[type=checkbox]').forEach(cb => { cb.checked = sel.has(cb.value); });
			}
		}

		function filtersFromUI(host){
			filters.unreadOnly = host.querySelector('#anit_unread').checked;
			filters.withAttach = host.querySelector('#anit_attach').checked;
			filters.query      = host.querySelector('#anit_query').value;
			if (IS_OL_FRAME) {
				filters.onlyWhatsApp = host.querySelector('#anit_wa')?.checked || false;
				filters.onlyTelegram = host.querySelector('#anit_tg')?.checked || false;
				filters.status       = host.querySelector('#anit_status')?.value || 'any';
			} else {
				const chosen = [];
				host.querySelectorAll('#anit_types input[type=checkbox]:checked').forEach(cb => chosen.push(cb.value));
				filters.typesSelected = chosen;
			}
		}

		function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

	function makeDraggable(host, mode) {
	const handle = host.querySelector('h4') || host;
	let dragging = false, startX=0, startY=0, startLeft=0, startTop=0;

	const keepInsideViewport = () => {
	const r = host.getBoundingClientRect();
	let left = parseInt(host.style.left || '0', 10) || 0;
	let top  = parseInt(host.style.top  || '0', 10) || 0;
	const maxLeft = Math.max(0, window.innerWidth  - r.width);
	const maxTop  = Math.max(0, window.innerHeight - r.height);
	host.style.left = clamp(left, 0, maxLeft) + 'px';
	host.style.top  = clamp(top,  0, maxTop)  + 'px';
};

	const onMove = (clientX, clientY) => {
	const dx = clientX - startX;
	const dy = clientY - startY;
	const r  = host.getBoundingClientRect();
	const maxLeft = Math.max(0, window.innerWidth  - r.width);
	const maxTop  = Math.max(0, window.innerHeight - r.height);
	const left = clamp(startLeft + dx, 0, maxLeft);
	const top  = clamp(startTop  + dy, 0, maxTop);
	host.style.left  = left + 'px';
	host.style.top   = top  + 'px';
};

	const onPointerDown = (e) => {
	if (e.type === 'mousedown' && e.button !== 0) return;
	dragging = true;
	startLeft = parseInt(host.style.left || (window.innerWidth - host.offsetWidth - 10) + '', 10) || 0;
	startTop  = parseInt(host.style.top  || '8', 10) || 0;
	startX = (e.touches?.[0]?.clientX ?? e.clientX ?? 0);
	startY = (e.touches?.[0]?.clientY ?? e.clientY ?? 0);

	document.addEventListener('mousemove', onMouseMove);
	document.addEventListener('mouseup', onPointerUp);
	document.addEventListener('touchmove', onTouchMove, {passive:false});
	document.addEventListener('touchend', onPointerUp);
	e.preventDefault();
};
	const onMouseMove = (e) => { if (!dragging) return; onMove(e.clientX, e.clientY); };
	const onTouchMove = (e) => { if (!dragging) return; onMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); };
	const onPointerUp  = () => {
	if (!dragging) return;
	dragging = false;
	document.removeEventListener('mousemove', onMouseMove);
	document.removeEventListener('mouseup', onPointerUp);
	document.removeEventListener('touchmove', onTouchMove);
	document.removeEventListener('touchend', onPointerUp);
	try {
	localStorage.setItem(POS_LS_KEY(mode), JSON.stringify({
	left: parseInt(host.style.left || '0', 10) || 0,
	top:  parseInt(host.style.top  || '0', 10) || 0,
}));
} catch {}
};

	handle.addEventListener('mousedown', onPointerDown);
	handle.addEventListener('touchstart', onPointerDown, {passive:false});


	handle.addEventListener('dblclick', () => {
	const listCol = IS_OL_FRAME
	? findContainerOL()
	: document.querySelector('.bx-im-list-container-recent__elements')?.closest('.bx-im-list-container-recent__container')
	|| document.querySelector('.bx-im-list-container-recent__elements');

	const vr = document.documentElement.getBoundingClientRect();
	const rr = listCol?.getBoundingClientRect();
	let top = 8, left = (vr.width - host.offsetWidth - 10);
	if (rr) {
	top  = Math.max(8, rr.top + 8);
	left = Math.min(vr.width - host.offsetWidth - 10, rr.right - host.offsetWidth - 10);
}
	host.style.left  = `${Math.max(0, left)}px`;
	host.style.top   = `${Math.max(0, top)}px`;
	try { localStorage.removeItem(POS_LS_KEY(mode)); } catch{}
});


		function hotkeyHandler(e){

			if (!e.ctrlKey || !e.altKey) return;
			if (e.code !== 'KeyF') return;

			const pane = document.getElementById('anit-filters');
			if (!pane) return;


			const nowHidden = pane.classList.contains('anit-hidden');
			if (nowHidden) pane.classList.remove('anit-hidden');
			else pane.classList.add('anit-hidden');

			try { localStorage.setItem('anit.filters.hidden', pane.classList.contains('anit-hidden') ? '1' : '0'); } catch {}


			e.stopImmediatePropagation();
			e.preventDefault();
		}


		document.addEventListener('keydown', hotkeyHandler, true);
		window.addEventListener('keydown', hotkeyHandler, true);


	keepInsideViewport();
	window.addEventListener('resize', keepInsideViewport);
}


	let filtersHost = null;

	function nukeDuplicatePanels() {
	document.querySelectorAll('#anit-filters').forEach((n, i) => { if (i === 0) return; n.remove(); });
}

	async function buildFiltersPanel() {

	if (!(IS_OL_FRAME || isInternalChatsDOM())) return;

	await waitForBody(5000);


	if (document.getElementById('anit-filters')) { nukeDuplicatePanels(); return; }

	nukeDuplicatePanels();
	const isTasksMode = !!document.querySelector('.bx-im-list-container-task__elements');
	const host = document.createElement('div');
	host.id = 'anit-filters';
	host.innerHTML = `
<style>
#anit-filters{position:fixed;top:8px;left:8px;z-index:9999; max-width: 400px;}
#anit-filters.anit-hidden{ display:none !important; }
#anit-filters .pane{background:#1f232b;color:#fff;border:1px solid rgba(255,255,255,.15);
  border-radius:10px;padding:10px 12px;font:12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Arial;
  box-shadow:0 8px 24px rgba(0,0,0,.35)}
#anit-filters h4{margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:.2px;cursor:move;}
#anit-filters .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0}
#anit-filters label{display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer}
#anit-filters input[type="text"]{width:300px;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff;outline:none}
#anit-filters select{padding:3px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff}
#anit-filters .muted{opacity:.75}
#anit-filters .actions{display:flex;gap:8px;margin-top:6px}
#anit-filters button{padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff;cursor:pointer}
#anit-filters .kbd{padding:1px 4px;border:1px solid rgba(255,255,255,.3);border-radius:4px;font-family:monospace;font-size:11px}
#anit-filters .chips{display:flex;flex-wrap:wrap;gap:6px}
#anit-filters .chip{display:inline-flex;gap:6px;align-items:center;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px 8px;background:#0f1115}
#anit-filters .chip input{accent-color:#5dc}
.anit-multi-selected {background: rgba(93, 220, 200, 0.15) !important;}
.anit-multi-selected::before {content: '✓';position: absolute;left: 6px;top: 50%;transform: translateY(-50%);font-size: 12px;color: #5dc;z-index: 2;}
.bx-im-list-recent-item__wrap.anit-multi-selected, .bx-messenger-cl-item.anit-multi-selected {position: relative;}
</style>
<div class="pane">
  <h4 style="position:relative;padding-right:28px;">
     ANIT - CHAT SORTER · ${IS_OL_FRAME ? 'Контакт-центр' : (isTasksMode ? 'Чаты задач' : 'Чаты')}
    <button id="anit_toggle_btn" class="anit-toggle" title="Скрыть/показать (Ctrl+Alt+F)"
      style="position:absolute;right:0;top:-2px;width:22px;height:22px;border:1px solid rgba(255,255,255,.25);
             border-radius:6px;background:#0f1115;color:#fff;cursor:pointer;line-height:20px;text-align:center;">
      -
    </button>
  </h4>
  <div class="row">
    <label><input type="checkbox" id="anit_unread"> Непрочитанные</label>
    <label><input type="checkbox" id="anit_attach"> С вложениями</label>
    ${IS_OL_FRAME ? `
      <label><input type="checkbox" id="anit_wa"> WhatsApp</label>
      <label><input type="checkbox" id="anit_tg"> Telegram</label>
      <label class="muted">Статус:
        <select id="anit_status">
          <option value="any">Любой</option>
          <option value="20">В работе</option>
          <option value="25">25</option>
          <option value="40">Отвеченные</option>
        </select>
      </label>
    ` : (!isTasksMode ?  `
      <div class="muted"></div>
      <div class="chips" id="anit_types">
        ${[
	['dialog','Диалоги'],
	['chat','Чаты'],
	['deal','Сделка'],
	['videoconf','Видеоконф.'],
	['support','Техподдержка'],
	['group','Группы/Коллабы'],
	['phone','Телефон'],
	['calendar','Календарь'],
	['general','Общий чат'],
	['network','Внешние чаты'],
	['guests', 'Гости'],
	['tasks','Задачи'],
	['other','Остальные'],
	].map(([v,t]) => `<label class="chip"><input type="checkbox" value="${v}"> ${t}</label>`).join('')}
      </div>
    ` : ``)}
  </div>
  <div class="row">
    <input type="text" id="anit_query" placeholder="Поиск по имени/последнему сообщению">
  </div>
  <div class="actions">
    <button id="anit_apply">Применить</button>
    <button id="anit_reset">Сброс</button>
     ${IS_OL_FRAME ? '' : '<button id="anit_prefetch">Загрузить все чаты</button>'}
    <span class="muted">(<span class="kbd">Ctrl</span>+<span class="kbd">Alt</span>+<span class="kbd">F</span> — показать/скрыть)</span>
  </div>
</div>`;
	document.body.appendChild(host);
	filtersHost = host;
		const HIDE_LS_KEY = 'anit.filters.hidden';
		function setHidden(hidden) {
			if (hidden) host.classList.add('anit-hidden');
			else host.classList.remove('anit-hidden');
			try { localStorage.setItem(HIDE_LS_KEY, hidden ? '1' : '0'); } catch {}
		}
		function togglePanel() {
			const nowHidden = host.classList.contains('anit-hidden');
			setHidden(!nowHidden);
		}


		try { setHidden(localStorage.getItem(HIDE_LS_KEY) === '1'); } catch {}


		host.querySelector('#anit_toggle_btn')?.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			togglePanel();
		});
	const mode = IS_OL_FRAME ? 'ol' : 'internal';


	const listCol = IS_OL_FRAME
	? findContainerOL()
	: document.querySelector('.bx-im-list-container-recent__elements')?.closest('.bx-im-list-container-recent__container')
	|| document.querySelector('.bx-im-list-container-recent__elements');

	if (!restorePosition(host, mode)) {
	const vr = document.documentElement.getBoundingClientRect();
	const rr = listCol?.getBoundingClientRect();
	let top = 8, left = (vr.width - host.offsetWidth - 10);
	if (rr) {
	top  = Math.max(8, rr.top + 8);
	left = Math.min(vr.width - host.offsetWidth - 10, rr.right - host.offsetWidth - 10);
}
	host.style.left  = `${Math.max(0, left)}px`;
	host.style.top   = `${Math.max(0, top)}px`;
}


	host.querySelector('#anit_unread').checked = !!filters.unreadOnly;
	host.querySelector('#anit_attach').checked = !!filters.withAttach;
	host.querySelector('#anit_query').value = String(filters.query || '');

	if (IS_OL_FRAME) {
	const wa = host.querySelector('#anit_wa'), tg = host.querySelector('#anit_tg'), st = host.querySelector('#anit_status');
	if (wa) wa.checked = !!filters.onlyWhatsApp;
	if (tg) tg.checked = !!filters.onlyTelegram;
	if (st) st.value = String(filters.status || 'any');
} else if (!isTasksMode) {
		const sel = new Set(Array.isArray(filters.typesSelected) ? filters.typesSelected : []);
		host.querySelectorAll('#anit_types input[type=checkbox]').forEach(cb => { cb.checked = sel.has(cb.value); });
	}

	function readAndApply() {
	filters.unreadOnly = host.querySelector('#anit_unread').checked;
	filters.withAttach = host.querySelector('#anit_attach').checked;
	filters.query      = host.querySelector('#anit_query').value;

	if (IS_OL_FRAME) {
	filters.onlyWhatsApp = host.querySelector('#anit_wa')?.checked || false;
	filters.onlyTelegram = host.querySelector('#anit_tg')?.checked || false;
	filters.status       = host.querySelector('#anit_status')?.value || 'any';
	} else if (!isTasksMode){
	const chosen = [];
	host.querySelectorAll('#anit_types input[type=checkbox]:checked').forEach(cb => chosen.push(cb.value));
	filters.typesSelected = chosen;
	} else {
		filters.typesSelected = [];
	}
	saveFilters();
	applyFilters();
}

	host.querySelector('#anit_apply').addEventListener('click', readAndApply);
	host.querySelector('#anit_reset').addEventListener('click', () => {
	const wasOL = IS_OL_FRAME;
	filters = defaultFilters();
	saveFilters();
	host.querySelector('#anit_unread').checked = false;
	host.querySelector('#anit_attach').checked = false;
	host.querySelector('#anit_query').value = '';
	if (wasOL) {
	const st = host.querySelector('#anit_status');
	if (st) st.value = 'any';
	const wa = host.querySelector('#anit_wa'), tg = host.querySelector('#anit_tg');
	if (wa) wa.checked = false; if (tg) tg.checked = false;
	} else if (!isTasksMode) {
		host.querySelectorAll('#anit_types input[type=checkbox]').forEach(cb => cb.checked = false);
	}
	applyFilters();
});
		host.querySelector('#anit_prefetch')?.addEventListener('click', async () => {
			try {

				if (IS_OL_FRAME) {
					console.warn('[ANIT-CHATSORTER] Prefetch: в OL-кадре пропускаем');
					return;
				}

				const btn = host.querySelector('#anit_prefetch');
				const origText = btn.textContent;
				btn.disabled = true;
				btn.textContent = 'Загружаю…';


				const saved = JSON.parse(JSON.stringify(filters));


				filters = defaultFilters();
				saveFilters();
				uiFromFilters(host);
				applyFilters();


				await autoScrollWithObserver({ tick: 200, idleLimit: 1500, maxTime: 60000 });


				filters = saved;
				saveFilters();
				uiFromFilters(host);
				applyFilters();

				btn.textContent = origText;
				btn.disabled = false;
			} catch (e) {
				console.error('[ANIT-CHATSORTER] Prefetch error', e);
				const btn = host.querySelector('#anit_prefetch');
				if (btn) { btn.disabled = false; btn.textContent = 'Загрузить все чаты'; }
			}
		});


		let queryTimer = null;
		function scheduleQueryApply() {
			if (queryTimer) clearTimeout(queryTimer);
			queryTimer = setTimeout(() => {
				readAndApply();
			}, 200);
		}

		host.querySelectorAll('input,select').forEach(el => {

			if (el.id !== 'anit_query') {
				el.addEventListener('change', readAndApply);
				return;
			}


			const qInput = el;


			qInput.addEventListener('input', () => {
				scheduleQueryApply();
			});


			qInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					if (queryTimer) clearTimeout(queryTimer);
					readAndApply();
				}
			});
		});




	makeDraggable(host, mode);
}


	let obs;
	let rebuildScheduled = false;

	async function rebuildList(reason, opts = {}) {
	const container = findContainer();
	if (!container) { warn('rebuild: контейнер не найден'); return; }

	if (!IS_OL_FRAME) {
		applyFilters();
		return;
	}

	const tsMapLocal = opts.tsMap || tsMapOnce || new Map();
	container.querySelectorAll('.bx-messenger-recent-group').forEach(n => n.remove());

	const items = Array.from(container.querySelectorAll('.bx-messenger-cl-item'));
	if (!items.length) { applyFilters(); return; }

	const ids = items.map(el => normId(el.getAttribute('data-userid') || el.dataset.userid));
	const setSig = currentSetSignature(ids);

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
		rebuildDateGroups(tsMapLocal);
		return;
}

	const currentIndex = new Map(items.map((el, i) => [el, i]));
	items.sort((a, b) => {
		const aId = normId(a.getAttribute('data-userid') || a.dataset.userid);
		const bId = normId(b.getAttribute('data-userid') || b.dataset.userid);
		const ra = rankMap.has(aId) ? rankMap.get(aId) : 1e9;
		const rb = rankMap.has(bId) ? rankMap.get(bId) : 1e9;
		if (ra !== rb) return ra - rb;
		const ta = tsMapLocal.get(aId) ?? -1;
		const tb = tsMapLocal.get(bId) ?? -1;
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

	log('rebuild ok.', { total: items.length, source: tsMapLocal.size ? 'rest' : 'dom', reason });
	applyFilters();
	rebuildDateGroups(tsMapLocal);
	}

	function armObserver() {
		const container = findContainer();
		if (!container) return;
		if (obs) obs.disconnect();

		const itemSel = IS_OL_FRAME ? '.bx-messenger-cl-item, .bx-messenger-recent-group' : '.bx-im-list-recent-item__wrap';

		obs = new MutationObserver((mutations) => {

		const stillInternal = isInternalChatsDOM();
		if (!IS_OL_FRAME && !stillInternal) {
		document.getElementById('anit-filters')?.remove();
		filtersHost = null;
		return;
	}

	let need = false;
	for (const m of mutations) {
		if (m.type === 'childList') {
		if ([...m.addedNodes, ...m.removedNodes].some(n =>
			n.nodeType === 1 &&
			(n.matches?.(itemSel) || n.querySelector?.(itemSel))
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


	let routeObs = null;
	function armRouteObserverIfNeeded() {
	if (IS_OL_FRAME) return;
	if (routeObs) return;
	routeObs = new MutationObserver(() => {
	const onChats = isInternalChatsDOM();
	const havePanel = !!document.getElementById('anit-filters');
	if (onChats && !havePanel) {
	buildFiltersPanel().then(applyFilters);
} else if (!onChats && havePanel) {
	document.getElementById('anit-filters')?.remove();
	filtersHost = null;
}
});
	routeObs.observe(document.documentElement, { childList: true, subtree: true });
}


	async function boot() {
	log('start', { ver: VER, href: location.href, inFrame: IS_FRAME, isOL: IS_OL_FRAME, internal: !IS_OL_FRAME && isInternalChatsDOM() });

	armDomRetroGate();
	if (IS_OL_FRAME) await gatePromise;

	await waitForBody(5000).catch(() => {});

	await waitForContainer(5000).catch(() => {});

	if (IS_OL_FRAME) {
	try { await buildFiltersPanel(); } catch (e) { warn('filters panel build skipped:', e?.message || e); }
} else {
	armRouteObserverIfNeeded();
	try { await buildFiltersPanel(); } catch {}
}

	if (IS_OL_FRAME) tsMapOnce = await getRecentTsMap().catch(() => new Map());

	await rebuildList('boot', { tsMap: tsMapOnce });
	/*if (isInternalChatsDOM){
	autoScrollWithObserver({

			tick: 250,
			idleLimit: 1500,
			maxTime: 60000
	});


	}*/

		function armMultiSelectHandlers() {

			document.addEventListener('mousedown', (e) => {
				if (e.button !== 2) return;
				const el = getChatItemElement(e.target);
				if (!el) return;


				if (multiSelectMode) return;

				multiRmbTargetEl = el;
				if (multiRmbTimer) clearTimeout(multiRmbTimer);
				multiRmbTimer = setTimeout(() => {
					multiRmbTimer = null;

					enterMultiSelectMode(multiRmbTargetEl);
					multiEnteredViaRmb = true;
				}, 600); // длительность клика ПКМ
			}, true);


			document.addEventListener('mouseup', (e) => {
				if (e.button === 2 && multiRmbTimer) {
					clearTimeout(multiRmbTimer);
					multiRmbTimer = null;
				}

			}, true);

			document.addEventListener('mouseleave', () => {
				if (multiRmbTimer) {
					clearTimeout(multiRmbTimer);
					multiRmbTimer = null;
				}
			}, true);


			document.addEventListener('contextmenu', (e) => {
				if (!multiSelectMode) return;
				const el = getChatItemElement(e.target);
				if (!el) return;

				e.preventDefault();
				e.stopPropagation();
				const id = getChatIdFromElement(el);
				if (
					multiEnteredViaRmb &&
					id &&
					multiSelectedIds.size === 1 &&
					multiSelectedIds.has(id)
				) {
					multiEnteredViaRmb = false;
					return;
				}

				multiEnteredViaRmb = false;
				toggleChatSelectionFromElement(el);
			}, true);


			document.addEventListener('click', (e) => {
				if (!multiSelectMode) return;
				const el = getChatItemElement(e.target);
				if (!el) return;

				e.preventDefault();
				e.stopPropagation();
				toggleChatSelectionFromElement(el);
			}, true);


			document.addEventListener('keydown', (e) => {
				if (!multiSelectMode) return;
				if (e.key === 'Escape') {
					exitMultiSelectMode();
				}
			}, true);
		}

		armObserver();
		armMultiSelectHandlers();
	log('boot завершён');
}

	try { boot().catch(e => err('fatal', e)); } catch (e) { err('fatal', e); }
})();

