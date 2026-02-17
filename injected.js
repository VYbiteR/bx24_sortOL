

	(function () {

	if (window.__ANITREC_RUNNING__) { return; }
	window.__ANITREC_RUNNING__ = '1.16.0';

	const VER = '1.16.0';
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

	function getCurrentPortalHost() {
		return window.location.host;
	}

	function extractChatIdNumber(el) {
		const id = (el?.dataset?.id || el?.getAttribute?.('data-id') || el?.querySelector?.('[data-id]')?.getAttribute?.('data-id') || '').toString();
		if (!id.startsWith('chat')) return null;
		const n = parseInt(id.slice(4), 10);
		return Number.isFinite(n) ? n : null;
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
	hideCompletedTasks: false,
	hideSystemMessages: false,
	projectIndexes: [],
	responsibleIndexes: [],
	sortMode: 'native',
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


		let counterValue = 0;
		const getUnread = () => {

			const numEl = el.querySelector('.bx-im-list-recent-item__counter_number');
			if (numEl) {
				const n = parseInt((numEl.textContent || '').replace(/\D+/g, ''), 10);
				counterValue = Number.isFinite(n) ? n : 0;
				return Number.isFinite(n) && n > 0;
			}

			const cntWrap = el.querySelector('.bx-im-list-recent-item__counters');
			if (cntWrap) {
				const n = parseInt((cntWrap.textContent || '').replace(/\D+/g, ''), 10);
				counterValue = Number.isFinite(n) ? n : 0;
				return Number.isFinite(n) && n > 0;
			}
			counterValue = 0;
			return false;
		};
		const hasUnread = getUnread();
		const hasSelfAuthor = !!el.querySelector('.bx-im-list-recent-item__self_author-icon');
		const msgText = el.querySelector('.bx-im-list-recent-item__message_text');
		const hasAuthorAvatar = !!(msgText && msgText.querySelector('.bx-im-list-recent-item__author-avatar'));
		// Системное = нет ни стрелочки, ни аватарки (для фильтра «Скрыть системные» — скрывать все такие)
		const isSystemMessage = !hasSelfAuthor && !hasAuthorAvatar;
		// Только если 1 непрочитанное и оно системное — не показывать в «Непрочитанные»; если >1 — показываем
		const isSystemUnreadOnly = hasUnread && counterValue === 1 && isSystemMessage;
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

	const meta = { id, hasUnread, lastText, title, hasAttach, type: itemType, status: 0, isWhatsApp: false, isTelegram: false, isSystemMessage, isSystemUnreadOnly };

	// project mapping only in "task chats" mode
	if (isTasksChatsModeNow() && window.__anitProjectLookup?.chatToProject) {
		const chatId = extractChatIdNumber(el);
		if (chatId !== null) {
			const chatToProject = window.__anitProjectLookup.chatToProject;
			const map = chatToProject instanceof Map ? chatToProject : new Map(chatToProject || []);
			const pIdx = map.get(chatId);
			if (pIdx !== undefined) {
				const p = (window.__anitProjectLookup.projects || [])[pIdx];
				meta.projectIndex = pIdx;
				meta.projectName = (p && p[1]) ? p[1] : 'Без проекта';
			} else {
				meta.projectIndex = -1;
				meta.projectName = 'Без проекта';
			}
		}
	}

	// responsible mapping only in "task chats" mode
	if (isTasksChatsModeNow() && window.__anitProjectLookup?.chatToResponsible) {
		const chatId = extractChatIdNumber(el);
		if (chatId !== null) {
			const chatToResponsible = window.__anitProjectLookup.chatToResponsible;
			const map = chatToResponsible instanceof Map ? chatToResponsible : new Map(chatToResponsible || []);
			const rIdx = map.get(chatId);
			if (rIdx !== undefined) {
				const u = (window.__anitProjectLookup.users || [])[rIdx];
				meta.responsibleIndex = rIdx;
				meta.responsibleName = (u && u[1]) ? u[1] : 'Без исполнителя';
			} else {
				meta.responsibleIndex = 0;
				meta.responsibleName = 'Без исполнителя';
			}
		}
	}

	return meta;
}

	function getItemMeta(el) {
	if (IS_OL_FRAME) return getItemMetaOL(el);
	return getItemMetaInternal(el);
}

	function isTasksChatsModeNow() {
		// В разных версиях интерфейса Bitrix24 селекторы отличаются.
		// Нам важно лишь понять, что открыт список "чаты задач".
		return !!(
			document.querySelector('.bx-im-list-container-task__elements .bx-im-list-recent-item__wrap') ||
			document.querySelector('.bx-im-list-container-task__elements') ||
			document.querySelector('.bx-im-list-task__scroll-container .bx-im-list-recent-item__wrap') ||
			document.querySelector('.bx-im-list-task__scroll-container')
		);
	}

	function isTaskCompletedByLastMessage(meta) {
		const t = (meta?.lastText || '').toLowerCase();
		return t.includes('завершил задачу') || t.includes('принял задачу');
	}

	function matchByFilters(meta) {
	if (filters.unreadOnly && !meta.hasUnread) return false;
	// Системные сообщения и «Скрыть системные» — только в режиме «Чаты задач»
	if (isTasksChatsModeNow()) {
		if (filters.unreadOnly && meta.hasUnread && meta.isSystemUnreadOnly) return false; // в «Непрочитанные» не показывать только если 1 сообщение и оно системное
		if (filters.hideSystemMessages && meta.isSystemMessage) return false; // скрыть все без стрелочки или аватарки
	}
	if (filters.withAttach && !meta.hasAttach) return false;
	if (!IS_OL_FRAME && filters.hideCompletedTasks && isTasksChatsModeNow()) {
		if (isTaskCompletedByLastMessage(meta)) return false;
	}
	if (IS_OL_FRAME) {
	if (filters.onlyWhatsApp && !meta.isWhatsApp) return false;
	if (filters.onlyTelegram && !meta.isTelegram) return false;
	// Статус: «В работе» = 20 и 25, «Отвеченные» = 40
	if (filters.status !== 'any') {
		const s = String(meta.status || '');
		if (filters.status === '20' && s !== '20' && s !== '25') return false;
		if (filters.status === '40' && s !== '40') return false;
	}
} else {
	const sel = Array.isArray(filters.typesSelected) ? filters.typesSelected : [];
	if (sel.length && !sel.includes(meta.type)) return false;
}
	const q = (filters.query || '').trim().toLowerCase();
	if (q) {
	const haystack = [meta.title, meta.lastText, meta.projectName, meta.responsibleName].filter(Boolean).join(' ').toLowerCase();
	if (!haystack.includes(q)) return false;
}
	// project filter only in "task chats" mode
	if (!IS_OL_FRAME && isTasksChatsModeNow()) {
		const pSel = Array.isArray(filters.projectIndexes) ? filters.projectIndexes : [];
		if (pSel.length) {
			const pi = (typeof meta.projectIndex === 'number') ? meta.projectIndex : -1;
			if (!pSel.includes(pi)) return false;
		}
	}
	// responsible filter only in "task chats" mode
	if (!IS_OL_FRAME && isTasksChatsModeNow()) {
		const rSel = Array.isArray(filters.responsibleIndexes) ? filters.responsibleIndexes : [];
		if (rSel.length) {
			const ri = (typeof meta.responsibleIndex === 'number') ? meta.responsibleIndex : 0;
			if (!rSel.includes(ri)) return false;
		}
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
	if (!IS_OL_FRAME && !isTasksChatsModeNow() && window.__anitProjectLookup && (filters.sortMode === 'project' || filters.sortMode === 'projectName')) {
		const visible = items.filter(el => el.style.display !== 'none');
		const hidden = items.filter(el => el.style.display === 'none');
		const withMeta = visible.map(el => ({ el, meta: getItemMeta(el) }));
		withMeta.sort((a, b) => {
			const pa = a.meta.projectIndex ?? -2;
			const pb = b.meta.projectIndex ?? -2;
			if (pa !== pb) return pa - pb;
			if (filters.sortMode === 'projectName') {
				const ta = (a.meta.title || '').toLowerCase();
				const tb = (b.meta.title || '').toLowerCase();
				return ta.localeCompare(tb);
			}
			return 0;
		});
		const frag = document.createDocumentFragment();
		withMeta.forEach(({ el }) => frag.appendChild(el));
		hidden.forEach(el => frag.appendChild(el));
		container.appendChild(frag);
	}
	if (IS_OL_FRAME) rebuildDateGroups(tsMapOnce || new Map());
}


	const POS_LS_KEY = (mode) => `anit.filters.pos.${mode}`; // 'ol' | 'internal'
	const CAT_COLLAPSED_KEY = 'anit.filters.categories.collapsed';
	function getPanelModeKey() {
		if (IS_OL_FRAME) return 'ol';
		return isTasksChatsModeNow() ? 'tasks' : 'internal';
	}
	function updateTypeChipsUI(host) {
		const sel = new Set(Array.isArray(filters.typesSelected) ? filters.typesSelected : []);
		host.querySelectorAll('#anit_types .anit-type-chip').forEach((btn) => {
			const v = String(btn.getAttribute('data-type') || '');
			btn.classList.toggle('is-selected', sel.has(v));
			btn.setAttribute('aria-pressed', sel.has(v) ? 'true' : 'false');
		});
	}
	function readTypesFromUI(host) {
		const chosen = [];
		host.querySelectorAll('#anit_types .anit-type-chip.is-selected').forEach((btn) => {
			const v = String(btn.getAttribute('data-type') || '');
			if (v) chosen.push(v);
		});
		return chosen;
	}

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
			const hc = host.querySelector('#anit_hide_completed');
			if (hc) hc.checked = !!filters.hideCompletedTasks;
			const hs = host.querySelector('#anit_hide_system');
			if (hs) hs.checked = !!filters.hideSystemMessages;
			if (IS_OL_FRAME) {
				const wa = host.querySelector('#anit_wa'),
					tg = host.querySelector('#anit_tg'),
					st = host.querySelector('#anit_status');
				if (wa) wa.checked = !!filters.onlyWhatsApp;
				if (tg) tg.checked = !!filters.onlyTelegram;
				if (st) st.value = (filters.status === '25' || filters.status === '20') ? '20' : String(filters.status || 'any');
			} else {
				updateTypeChipsUI(host);
			}
			if (host.querySelector('#anit_project_input')) {
				try { syncProjectInputFromFilters?.(); } catch {}
			}
			if (host.querySelector('#anit_responsible_input')) {
				try { syncResponsibleInputFromFilters?.(); } catch {}
			}
		}

		function filtersFromUI(host){
			filters.unreadOnly = host.querySelector('#anit_unread').checked;
			filters.withAttach = host.querySelector('#anit_attach').checked;
			filters.query      = host.querySelector('#anit_query').value;
			filters.hideCompletedTasks = host.querySelector('#anit_hide_completed')?.checked || false;
			filters.hideSystemMessages = isTasksChatsModeNow() ? (host.querySelector('#anit_hide_system')?.checked || false) : false;
			if (IS_OL_FRAME) {
				filters.onlyWhatsApp = host.querySelector('#anit_wa')?.checked || false;
				filters.onlyTelegram = host.querySelector('#anit_tg')?.checked || false;
				filters.status       = host.querySelector('#anit_status')?.value || 'any';
			} else {
				filters.typesSelected = readTypesFromUI(host);
			}
			const pInp = host.querySelector('#anit_project_input');
			if (pInp) {
				const v = String(pInp.value || '').trim();
				if (v === '') filters.projectIndexes = [];
			}
			const rInp = host.querySelector('#anit_responsible_input');
			if (rInp) {
				const v = String(rInp.value || '').trim();
				if (v === '') filters.responsibleIndexes = [];
			}
			if (isTasksChatsModeNow()) filters.sortMode = 'native';
		}

		function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

	function makeDraggable(host, mode) {
	const handles = [host.querySelector('.header'), host.querySelector('#anit_mini_toggle'), host].filter(Boolean);
	let dragging = false, moved = false, startX=0, startY=0, startLeft=0, startTop=0;

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
	if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
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
	const t = e.target;
	const fromMini = !!t?.closest?.('#anit_mini_toggle');
	const fromHeader = !!t?.closest?.('.header');
	if (!fromMini && !fromHeader) return;
	if (!fromMini && t && (t.closest?.('button, input, select, textarea, a, #anit_project_suggest') || t.isContentEditable)) return;
	dragging = true;
	moved = false;
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
	if (moved) host.dataset.lastDragTs = String(Date.now());
};

	handles.forEach((h) => {
		h.addEventListener('mousedown', onPointerDown);
		h.addEventListener('touchstart', onPointerDown, {passive:false});
	});


	(host.querySelector('.header') || host).addEventListener('dblclick', () => {
	const listCol = IS_OL_FRAME
	? findContainerOL()
	: document.querySelector('.bx-im-list-container-recent__elements')?.closest('.bx-im-list-container-recent__container')
	|| document.querySelector('.bx-im-list-container-recent__elements');

	const vr = document.documentElement.getBoundingClientRect();
	const rr = listCol?.getBoundingClientRect();
	const currentLeft = parseInt(host.style.left || '0', 10) || 0;
	let top = 8, left = (vr.width - host.offsetWidth - 10);
	if (rr) {
	top  = Math.max(8, rr.top + 8);
	left = Math.min(vr.width - host.offsetWidth - 10, rr.right - host.offsetWidth - 10);
}
	const maxLeft = Math.max(0, vr.width - host.offsetWidth);
	if (left < 8) left = currentLeft > 8 ? currentLeft : 8;
	host.style.left  = `${clamp(left, 8, maxLeft)}px`;
	host.style.top   = `${Math.max(0, top)}px`;
	try { localStorage.removeItem(POS_LS_KEY(mode)); } catch{}
});


		function hotkeyHandler(e){
			// Ctrl+Alt+F — показать/скрыть панель
			if (e.ctrlKey && e.altKey && e.code === 'KeyF') {
				const pane = document.getElementById('anit-filters');
				if (!pane) return;
				const mini = pane.querySelector('#anit_mini_toggle');
				const full = pane.querySelector('#anit_toggle_btn');
				(mini || full)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

				e.stopImmediatePropagation();
				e.preventDefault();
				return;
			}

			// Ctrl+Q — в диалоге (чаты задач): обрамить выделенный текст линиями
			if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyQ') {
				if (!isTasksChatsModeNow()) return;

				const active = document.activeElement;
				if (!active) return;
				// не мешаем вводу в поиске по чатам/панели
				if (active.id === 'anit_query') return;

				const line = '------------------------------------------------------';
				const wrap = (s) => `${line}\n${s}\n${line}`;

				// textarea / input
				if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && (active.type || '').toLowerCase() === 'text')) {
					const start = active.selectionStart ?? 0;
					const end = active.selectionEnd ?? 0;
					if (end <= start) return;
					const v = active.value || '';
					const selText = v.slice(start, end);
					const next = v.slice(0, start) + wrap(selText) + v.slice(end);
					active.value = next;
					const newEnd = start + wrap(selText).length;
					active.selectionStart = start;
					active.selectionEnd = newEnd;
					active.dispatchEvent(new Event('input', { bubbles: true }));

					e.stopImmediatePropagation();
					e.preventDefault();
					return;
				}

				// contenteditable
				const isCE = active instanceof HTMLElement && (active.isContentEditable || active.getAttribute('contenteditable') === 'true');
				if (isCE) {
					const sel = window.getSelection?.();
					if (!sel || sel.rangeCount === 0) return;
					if (sel.isCollapsed) return;
					const range = sel.getRangeAt(0);
					// ограничим замену выделения только если оно внутри active
					const anc = sel.anchorNode;
					if (anc && active.contains(anc)) {
						const txt = sel.toString();
						range.deleteContents();
						range.insertNode(document.createTextNode(wrap(txt)));
						sel.removeAllRanges();
						const r2 = document.createRange();
						r2.selectNodeContents(active);
						r2.collapse(false);
						sel.addRange(r2);
						active.dispatchEvent(new Event('input', { bubbles: true }));

						e.stopImmediatePropagation();
						e.preventDefault();
					}
				}
			}
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
	const isTasksMode = isTasksChatsModeNow();
	const host = document.createElement('div');
	host.id = 'anit-filters';
	host.innerHTML = `
<style>
#anit-filters{position:fixed;top:8px;left:8px;z-index:9999; max-width: 400px;}
#anit-filters.anit-hidden{max-width:none !important;width:24px !important;height:24px !important}
#anit-filters.anit-hidden .pane{display:none !important}
#anit-filters .mini-toggle{display:none;width:24px;height:24px;border:1px solid rgba(255,255,255,.25);border-radius:6px;background:#0f1115;color:#fff;align-items:center;justify-content:center;cursor:move;box-shadow:0 8px 24px rgba(0,0,0,.35)}
#anit-filters.anit-hidden .mini-toggle{display:inline-flex}
#anit-filters .mini-toggle svg{width:12px;height:12px;display:block;fill:#ffffff}
#anit-filters .pane{background:#1f232b;color:#fff;border:1px solid rgba(255,255,255,.15);
  border-radius:12px;padding:10px 12px;font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial;
  box-shadow:0 8px 24px rgba(0,0,0,.35)}
#anit-filters .header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px 0;cursor:move}
#anit-filters .header-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto;position:relative}
#anit-filters .icon-btn{width:22px;height:22px;border:1px solid rgba(255,255,255,.25);border-radius:6px;background:#0f1115;color:#fff;cursor:pointer;line-height:1;display:inline-flex;align-items:center;justify-content:center;padding:0}
#anit-filters .icon-btn svg{width:14px;height:14px;display:block;fill:#ffffff;opacity:.92}
#anit-filters .icon-btn:hover{border-color:rgba(255,255,255,.45)}
#anit-filters .opts-pop{display:none;position:absolute;top:26px;right:0;width:292px;max-width:calc(100vw - 24px);background:#1f232b;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:10px;box-shadow:0 12px 34px rgba(0,0,0,.45);z-index:10001}
#anit-filters .opts-pop.show{display:block}
#anit-filters .opts-title{font-size:12px;font-weight:700;margin:0 0 6px 0}
#anit-filters .opts-host{font-size:11px;opacity:.8;margin:0 0 8px 0;word-break:break-word}
#anit-filters .opts-line{display:flex;align-items:center;gap:8px;margin:6px 0}
#anit-filters .opts-field{margin:8px 0}
#anit-filters .opts-field input{width:90%}
#anit-filters .opts-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
#anit-filters .opts-status{margin-top:6px;min-height:14px}
#anit-filters .brand{display:flex;align-items:center;gap:8px;min-width:0}
#anit-filters .brand-icon{width:20px;height:20px;display:inline-flex;flex:0 0 20px}
#anit-filters .brand-title{font-size:12px;font-weight:700;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#anit-filters .brand-sub{font-size:11px;opacity:.75}
#anit-filters .group{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1)}
#anit-filters .group-title{font-size:11px;font-weight:700;letter-spacing:.2px;text-transform:uppercase;opacity:.78;margin:0 0 6px 0}
#anit-filters .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:4px 0}
#anit-filters label{display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer}
#anit-filters input[type="checkbox"]{
  -webkit-appearance:none;appearance:none;
  width:14px;height:14px;min-width:14px;
  margin:0;
  border:1px solid rgba(255,255,255,.95);
  border-radius:3px;
  background:#0f1115;
  display:inline-grid;place-content:center;
  cursor:pointer;
}
#anit-filters input[type="checkbox"]::before{
  content:"";
  width:4px;height:8px;
  border:solid #ffffff;
  border-width:0 2px 2px 0;
  transform:rotate(45deg) scale(0);
  transform-origin:center;
  transition:transform .12s ease;
}
#anit-filters input[type="checkbox"]:checked::before{transform:rotate(45deg) scale(1)}
#anit-filters input[type="text"]{padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff;outline:none}
#anit-filters #anit_query{width:100%}
#anit-filters #anit_project_input,#anit-filters #anit_responsible_input{width:90%}
#anit-filters .project-wrap{position:relative;flex:1 1 220px;min-width:0;max-width:100%}
#anit-filters #anit_projects_row{align-items:center}
#anit-filters #anit_projects_row .muted{flex:0 0 auto}
#anit-filters #anit_projects_row #anit_project_suggest{top:34px;left:0;right:0;max-width:100%;box-sizing:border-box}
#anit-filters #anit_responsibles_row{align-items:center}
#anit-filters #anit_responsibles_row .muted{flex:0 0 auto}
#anit-filters #anit_responsibles_row #anit_responsible_suggest{top:34px;left:0;right:0;max-width:100%;box-sizing:border-box}
#anit-filters select{padding:3px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff}
#anit-filters .muted{opacity:.75}
#anit-filters .actions{display:flex;gap:8px;margin-top:2px;flex-wrap:wrap}
#anit-filters button{padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:#0f1115;color:#fff;cursor:pointer}
#anit-filters .anit-toggle,#anit-filters .category-toggle{padding:0 !important;line-height:1;box-sizing:border-box}
#anit-filters .btn-primary{background:#2b7fff;border-color:#2b7fff;color:#fff}
#anit-filters .btn-secondary{background:#2a2f38;border-color:rgba(255,255,255,.25);color:#fff}
#anit-filters .btn-tertiary{background:transparent;border-color:rgba(255,255,255,.3);color:#d6dce5}
#anit-filters .kbd{padding:1px 4px;border:1px solid rgba(255,255,255,.3);border-radius:4px;font-family:monospace;font-size:11px}
#anit-filters .chips{display:flex;flex-wrap:wrap;gap:6px}
#anit-filters .chip{display:inline-flex;gap:6px;align-items:center;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px 8px;background:#0f1115}
#anit-filters .chip input{accent-color:#5dc}
#anit-filters .type-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;width:100%}
#anit-filters .anit-type-chip{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:5px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:#0f1115;color:#dce4ef;cursor:pointer;text-align:center}
#anit-filters .anit-type-chip.is-selected{background:rgba(21,135,250,.22);border-color:#1587fa;color:#fff}
#anit-filters .group-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
#anit-filters .category-toggle{width:20px;height:20px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#b8c1cf;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
#anit-filters .category-toggle .chev{width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .15s ease}
#anit-filters .group.is-collapsed .category-toggle .chev{transform:rotate(-45deg)}
#anit-filters .group.is-collapsed .group-body{display:none}
.anit-multi-selected {background: rgba(93, 220, 200, 0.15) !important;}
.anit-multi-selected::before {content: '✓';position: absolute;left: 6px;top: 50%;transform: translateY(-50%);font-size: 12px;color: #5dc;z-index: 2;}
.bx-im-list-recent-item__wrap.anit-multi-selected, .bx-messenger-cl-item.anit-multi-selected {position: relative;}
</style>
<div class="pane">
  <div class="header">
    <div class="brand">
      <span class="brand-icon" aria-hidden="true">
        <svg viewBox="0 0 160 160" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
          <path d="M137.143 160H22.8572C10.2753 160 0 149.725 0 137.143V22.857C0 10.275 10.2753 0 22.8572 0H137.143C149.725 0 160 10.275 160 22.857V137.143C160 149.725 149.725 160 137.143 160Z" fill="#D1030A"/>
          <path d="M136.925 79.7284C136.925 48.2733 111.342 22.6904 79.8875 22.6904C58.4978 22.6904 39.8347 34.4332 30.1886 51.8381C28.9304 54.145 30.608 57.0808 33.1244 57.0808H51.7874C53.2556 57.0808 54.7232 56.4518 55.5619 55.6126C61.853 49.3221 70.2412 45.5476 79.6773 45.5476C98.5505 45.5476 113.858 60.8553 113.858 79.7284V79.9381V80.5671C113.649 99.0203 98.5504 113.909 79.8875 113.909C70.6605 113.909 62.0626 110.135 55.9818 104.053C54.9329 103.004 53.6749 102.585 52.2072 102.585H33.3341C30.608 102.585 28.9304 105.521 30.3983 107.828C40.2541 125.233 58.7074 136.766 79.8875 136.766C92.6787 136.766 104.632 132.572 114.068 125.233V131.104C114.068 134.25 116.584 136.766 119.73 136.766H131.054C134.199 136.766 136.716 134.25 136.716 131.104L136.925 79.7284Z" fill="white"/>
          <path d="M79.8896 68.4056H22.8514C19.7059 68.4056 17.1895 70.9221 17.1895 74.0676V85.6008C17.1895 88.7463 19.7059 91.2628 22.8514 91.2628H79.8896C83.0351 91.2628 85.5512 88.7463 85.5512 85.6008V74.0676C85.5512 70.9221 83.0351 68.4056 79.8896 68.4056Z" fill="white"/>
        </svg>
      </span>
      <div>
        <div class="brand-title">ANIT Chat Sorter</div>
        <div class="brand-sub">${IS_OL_FRAME ? 'Контакт-центр' : (isTasksMode ? 'Чаты задач' : 'Чаты')}</div>
      </div>
    </div>
    <div class="header-actions">
      <button id="anit_options_btn" class="icon-btn" type="button" title="Настройки (Shift+клик — открыть страницу настроек)">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.4.12-.61l-1.92-3.32c-.11-.2-.35-.28-.57-.2l-2.39.96c-.5-.38-1.04-.69-1.63-.94l-.36-2.54A.49.49 0 0 0 13.95 1h-3.9a.49.49 0 0 0-.48.41l-.36 2.54c-.59.25-1.13.56-1.63.94l-2.39-.96c-.22-.09-.46 0-.57.2L2.7 7.45c-.11.2-.06.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.61l1.92 3.32c.11.2.35.28.57.2l2.39-.96c.5.38 1.04.69 1.63.94l.36 2.54c.04.24.24.41.48.41h3.9c.24 0 .44-.17.48-.41l.36-2.54c.59-.25 1.13-.56 1.63-.94l2.39.96c.22.09.46 0 .57-.2l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/>
        </svg>
      </button>
      <button id="anit_toggle_btn" class="anit-toggle icon-btn" type="button" title="Скрыть/показать (Ctrl+Alt+F)">-</button>
      <div id="anit_opts_pop" class="opts-pop" role="dialog" aria-label="Настройки портала">
        <div class="opts-title">Настройки портала</div>
        <div class="opts-host" id="anit_opts_host"></div>
        <div class="opts-field">
          <div class="muted" style="margin-bottom:4px">API-ключ</div>
          <input type="text" id="anit_opts_key" placeholder="Вставьте API-ключ">
        </div>
        <div class="opts-actions">
          <button type="button" id="anit_opts_save" class="btn-primary">Сохранить</button>
          <button type="button" id="anit_opts_close" class="btn-secondary">Закрыть</button>
        </div>
        <div class="opts-actions" style="margin-top:6px">
          <button type="button" id="anit_opts_full" class="btn-tertiary" title="Пробуем открыть options.html (может быть недоступно в desktop-клиенте)">Открыть страницу настроек</button>
        </div>
        <div class="opts-status muted" id="anit_opts_status"></div>
      </div>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Быстрые фильтры</div>
    <div class="row">
    <label><input type="checkbox" id="anit_unread"> Непрочитанные</label>
    <label><input type="checkbox" id="anit_attach"> С вложениями</label>
	${isTasksMode ? `
	  <label><input type="checkbox" id="anit_hide_completed"> Скрыть завершённые</label>
	  <label><input type="checkbox" id="anit_hide_system"> Скрыть системные</label>
	` : ``}
    </div>
    ${IS_OL_FRAME ? `<div class="row">
      <label><input type="checkbox" id="anit_wa"> WhatsApp</label>
      <label><input type="checkbox" id="anit_tg"> Telegram</label>
      <label class="muted">Статус:
        <select id="anit_status">
          <option value="any">Любой</option>
          <option value="20">В работе</option>
          <option value="40">Отвеченные</option>
        </select>
      </label>
    </div>` : ``}
  </div>

  ${IS_OL_FRAME ? '' : `
  <div class="group" id="anit_categories_group">
    <div class="group-head">
      <div class="group-title">Категории</div>
      ${(!isTasksMode) ? '<button type="button" id="anit_categories_toggle" class="category-toggle" title="Свернуть/развернуть категории"><span class="chev"></span></button>' : ''}
    </div>
    <div class="group-body">
    ${(!isTasksMode) ?  `
      <div class="row">
      <div class="type-grid" id="anit_types">
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
	].map(([v,t]) => `<button type="button" class="anit-type-chip" data-type="${v}" aria-pressed="false">${t}</button>`).join('')}
      </div>
      </div>
    ` : ``}
    ${isTasksMode ? `
    <div class="row" id="anit_projects_row" style="display:none; position:relative">
      <span class="muted">Проект:</span>
      <div class="project-wrap">
        <input type="text" id="anit_project_input" placeholder="Все проекты / вводи для поиска">
        <div id="anit_project_suggest" style="display:none; position:absolute; top:34px; left:0; right:0; max-height:240px; overflow:auto; z-index:10000; background:#1f232b; border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:6px"></div>
      </div>
    </div>` : ``}
    ${isTasksMode ? `
    <div class="row" id="anit_responsibles_row" style="display:none; position:relative">
      <span class="muted">Исполнитель:</span>
      <div class="project-wrap">
        <input type="text" id="anit_responsible_input" placeholder="Все исполнители / вводи для поиска">
        <div id="anit_responsible_suggest" style="display:none; position:absolute; top:34px; left:0; right:0; max-height:240px; overflow:auto; z-index:10000; background:#1f232b; border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:6px"></div>
      </div>
    </div>` : ``}
    </div>
  </div>
  `}

  <div class="group">
    <div class="group-title">Поиск</div>
    <div class="row">
      <input type="text" id="anit_query" placeholder="Поиск по имени/последнему сообщению">
    </div>
  </div>

  <div class="group">
    <div class="group-title">Действия</div>
    <div class="actions">
      <button id="anit_apply" class="btn-primary">Применить</button>
      <button id="anit_reset" class="btn-secondary">Сброс</button>
      ${IS_OL_FRAME ? '' : '<button id="anit_prefetch" class="btn-tertiary">Загрузить все чаты</button>'}
    </div>
    <div class="row">
      <span class="muted">(<span class="kbd">Ctrl</span>+<span class="kbd">Alt</span>+<span class="kbd">F</span> — показать/скрыть)</span>
    </div>
  </div>
</div>
<div id="anit_mini_toggle" class="mini-toggle" title="Показать панель (Ctrl+Alt+F)">
  <svg viewBox="0 0 402.577 402.577" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path d="M400.858,11.427c-3.241-7.421-8.85-11.132-16.854-11.136H18.564c-7.993,0-13.61,3.715-16.846,11.136 c-3.234,7.801-1.903,14.467,3.999,19.985l140.757,140.753v138.755c0,4.955,1.809,9.232,5.424,12.854l73.085,73.083 c3.429,3.614,7.71,5.428,12.851,5.428c2.282,0,4.66-0.479,7.135-1.43c7.426-3.238,11.14-8.851,11.14-16.845V172.166L396.861,31.413 C402.765,25.895,404.093,19.231,400.858,11.427z"/>
  </svg>
</div>`;
	document.body.appendChild(host);
	filtersHost = host;
	host.dataset.mode = getPanelModeKey();

	// Встроенные настройки портала
	{
		const portalHost = (typeof location !== 'undefined' && location.host) ? String(location.host) : '';
		const btn = host.querySelector('#anit_options_btn');
		const pop = host.querySelector('#anit_opts_pop');
		const hostEl = host.querySelector('#anit_opts_host');
		const keyEl = host.querySelector('#anit_opts_key');
		const saveBtn = host.querySelector('#anit_opts_save');
		const closeBtn = host.querySelector('#anit_opts_close');
		const fullBtn = host.querySelector('#anit_opts_full');
		const statusEl = host.querySelector('#anit_opts_status');
		const genId = () => `anit_${Math.random().toString(36).slice(2)}_${Date.now()}`;
		let reqCfgId = null;
		let saveCfgId = null;

		const setStatus = (t) => { if (statusEl) statusEl.textContent = String(t || ''); };
		const showPop = () => {
			if (!pop) return;
			pop.classList.add('show');
			if (hostEl) hostEl.textContent = portalHost ? portalHost : '—';
			setStatus('Загрузка…');
			reqCfgId = genId();
			try { window.postMessage({ type: 'ANIT_BXCS_GET_PORTAL_CFG', requestId: reqCfgId, host: portalHost }, '*'); } catch {}
		};
		const hidePop = () => { if (pop) pop.classList.remove('show'); };
		const togglePop = () => { if (!pop) return; pop.classList.contains('show') ? hidePop() : showPop(); };

		btn?.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Shift+клик — попытка открыть страницу options.html (в desktop может не поддерживаться)
			if (e.shiftKey) {
				try { window.postMessage({ type: 'ANIT_BXCS_OPEN_OPTIONS' }, '*'); } catch {}
				return;
			}
			togglePop();
		});
		closeBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hidePop(); });
		fullBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); try { window.postMessage({ type: 'ANIT_BXCS_OPEN_OPTIONS' }, '*'); } catch {} });
		saveBtn?.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const apiKey = String(keyEl?.value || '').trim();
			// Если вставлен ключ — портал включаем автоматически (чекбокс убран, лишний клик не нужен)
			const enabled = apiKey.length > 0;
			setStatus('Сохранение…');
			saveCfgId = genId();
			try { window.postMessage({ type: 'ANIT_BXCS_SET_PORTAL_CFG', requestId: saveCfgId, host: portalHost, cfg: { enabled, apiKey } }, '*'); } catch {}
		});

		// Закрытие по клику вне окна / Esc
		document.addEventListener('click', (e) => {
			if (!pop || !pop.classList.contains('show')) return;
			const t = e.target;
			if (t && (pop.contains(t) || btn?.contains(t))) return;
			hidePop();
		}, true);
		document.addEventListener('keydown', (e) => {
			if (!pop || !pop.classList.contains('show')) return;
			if (e.key === 'Escape') hidePop();
		}, true);

		// Ответы от content.js
		window.addEventListener('message', (e) => {
			const d = e.data;
			if (!d || typeof d !== 'object') return;
			if (d.type === 'ANIT_BXCS_PORTAL_CFG' && d.requestId && d.requestId === reqCfgId) {
				const cfg = d.cfg || {};
				if (keyEl) keyEl.value = String(cfg.apiKey || '');
				setStatus('');
			}
			if (d.type === 'ANIT_BXCS_PORTAL_CFG_SAVED' && d.requestId && d.requestId === saveCfgId) {
				setStatus(d.ok ? 'Сохранено' : 'Ошибка сохранения');
				if (d.ok) setTimeout(() => { if (pop?.classList.contains('show')) setStatus(''); }, 1200);
			}
		}, true);
	}

		function getProjectsSafe() {
			const p = window.__anitProjectLookup?.projects;
			return Array.isArray(p) ? p : null;
		}

		function getUsedProjectIndexes() {
			const chatToProject = window.__anitProjectLookup?.chatToProject;
			const map = chatToProject instanceof Map ? chatToProject : new Map(chatToProject || []);
			const used = new Set();
			for (const idx of map.values()) {
				const n = Number(idx);
				if (Number.isFinite(n) && n >= 0) used.add(n);
			}
			return used;
		}

		function getSelectedProjectIndexes() {
			const arr = Array.isArray(filters.projectIndexes) ? filters.projectIndexes : [];
			return arr.filter(n => Number.isFinite(n));
		}

		function setSelectedProjectIndex(v) {
			if (v === '' || v === null || v === undefined) {
				filters.projectIndexes = [];
				return;
			}
			const n = parseInt(String(v), 10);
			filters.projectIndexes = Number.isFinite(n) ? [n] : [];
		}

		function getProjectLabelByIndex(idx) {
			if (idx === -1) return 'Без проекта';
			const projects = getProjectsSafe();
			if (!projects) return '';
			const p = projects[idx];
			return (p && p[1]) ? String(p[1]) : '';
		}

		function syncProjectInputFromFilters() {
			const inp = host.querySelector('#anit_project_input');
			if (!inp) return;
			const chosen = getSelectedProjectIndexes();
			if (!chosen.length) { inp.value = ''; return; }
			inp.value = getProjectLabelByIndex(chosen[0]) || '';
		}

		function closeProjectSuggest() {
			const box = host.querySelector('#anit_project_suggest');
			if (box) box.style.display = 'none';
		}

		function renderProjectSuggest(qRaw = '') {
			const box = host.querySelector('#anit_project_suggest');
			if (!box) return;
			const projects = getProjectsSafe();
			const usedIndexes = getUsedProjectIndexes();
			const q = String(qRaw || '').trim().toLowerCase();
			let hasNoProjectTasks = false;
			if (projects) {
				for (let i = 0; i < projects.length; i++) {
					const p = projects[i];
					const name = (p && p[1]) ? String(p[1]) : '';
					if (name.trim().toLowerCase() === 'без проекта' && usedIndexes.has(i)) {
						hasNoProjectTasks = true;
						break;
					}
				}
			}

			const items = [];
			if (!q || 'все'.includes(q)) items.push({ idx: '', label: 'Все проекты' });
			if (hasNoProjectTasks && (!q || 'без проекта'.includes(q) || 'без'.includes(q))) {
				items.push({ idx: -1, label: 'Без проекта' });
			}
			if (projects) {
				for (let i = 0; i < projects.length; i++) {
					// Показываем только проекты, у которых есть задачи (есть связи в dmap)
					if (!usedIndexes.has(i)) continue;
					const p = projects[i];
					const name = (p && p[1]) ? String(p[1]) : '';
					if (!name) continue;
					// "Без проекта" показываем только один раз (как системный вариант idx=-1)
					if (name.trim().toLowerCase() === 'без проекта') continue;
					if (q && !name.toLowerCase().includes(q)) continue;
					items.push({ idx: i, label: name });
				}
			}

			box.innerHTML = '';
			if (!items.length) {
				box.innerHTML = '<div class="muted">Ничего не найдено</div>';
				box.style.display = 'block';
				return;
			}

			for (const it of items.slice(0, 100)) {
				const row = document.createElement('button');
				row.type = 'button';
				row.textContent = it.label;
				row.style.display = 'block';
				row.style.width = '100%';
				row.style.textAlign = 'left';
				row.style.margin = '2px 0';
				row.style.padding = '6px 8px';
				row.addEventListener('click', (e) => {
					e.preventDefault();
					setSelectedProjectIndex(it.idx);
					syncProjectInputFromFilters();
					closeProjectSuggest();
					saveFilters();
					applyFilters();
				});
				box.appendChild(row);
			}
			box.style.display = 'block';
		}

		function getUsersSafe() {
			const u = window.__anitProjectLookup?.users;
			return Array.isArray(u) ? u : null;
		}

		function getUsedResponsibleIndexes() {
			const chatToResponsible = window.__anitProjectLookup?.chatToResponsible;
			const map = chatToResponsible instanceof Map ? chatToResponsible : new Map(chatToResponsible || []);
			const used = new Set();
			for (const idx of map.values()) {
				const n = Number(idx);
				if (Number.isFinite(n) && n >= 0) used.add(n);
			}
			return used;
		}

		function getSelectedResponsibleIndexes() {
			const arr = Array.isArray(filters.responsibleIndexes) ? filters.responsibleIndexes : [];
			return arr.filter(n => Number.isFinite(n));
		}

		function setSelectedResponsibleIndex(v) {
			if (v === '' || v === null || v === undefined) {
				filters.responsibleIndexes = [];
				return;
			}
			const n = parseInt(String(v), 10);
			filters.responsibleIndexes = Number.isFinite(n) ? [n] : [];
		}

		function getResponsibleLabelByIndex(idx) {
			const users = getUsersSafe();
			if (!users) return '';
			const u = users[idx];
			return (u && u[1]) ? String(u[1]) : '';
		}

		function syncResponsibleInputFromFilters() {
			const inp = host.querySelector('#anit_responsible_input');
			if (!inp) return;
			const chosen = getSelectedResponsibleIndexes();
			if (!chosen.length) { inp.value = ''; return; }
			inp.value = getResponsibleLabelByIndex(chosen[0]) || '';
		}

		function closeResponsibleSuggest() {
			const box = host.querySelector('#anit_responsible_suggest');
			if (box) box.style.display = 'none';
		}

		function renderResponsibleSuggest(qRaw = '') {
			const box = host.querySelector('#anit_responsible_suggest');
			if (!box) return;
			const users = getUsersSafe();
			const usedIndexes = getUsedResponsibleIndexes();
			const q = String(qRaw || '').trim().toLowerCase();

			let noIdx = -1;
			let hasNoResponsible = false;
			if (users) {
				for (let i = 0; i < users.length; i++) {
					const u = users[i];
					const uid = (u && u[0]) ? Number(u[0]) : 0;
					if (uid === 0) { noIdx = i; break; }
				}
				if (noIdx >= 0 && usedIndexes.has(noIdx)) hasNoResponsible = true;
			}

			const items = [];
			if (!q || 'все'.includes(q)) items.push({ idx: '', label: 'Все исполнители' });
			if (hasNoResponsible && (!q || 'без исполнителя'.includes(q) || 'без'.includes(q))) {
				items.push({ idx: noIdx, label: 'Без исполнителя' });
			}
			if (users) {
				for (let i = 0; i < users.length; i++) {
					if (!usedIndexes.has(i)) continue;
					const u = users[i];
					const uid = (u && u[0]) ? Number(u[0]) : 0;
					const label = (u && u[1]) ? String(u[1]) : '';
					if (!label) continue;
					if (uid === 0) continue; // "Без исполнителя" выводим отдельной системной строкой
					if (q && !label.toLowerCase().includes(q)) continue;
					items.push({ idx: i, label });
				}
			}

			box.innerHTML = '';
			if (!items.length) {
				box.innerHTML = '<div class="muted">Ничего не найдено</div>';
				box.style.display = 'block';
				return;
			}

			for (const it of items.slice(0, 100)) {
				const row = document.createElement('button');
				row.type = 'button';
				row.textContent = it.label;
				row.style.display = 'block';
				row.style.width = '100%';
				row.style.textAlign = 'left';
				row.style.margin = '2px 0';
				row.style.padding = '6px 8px';
				row.addEventListener('click', (e) => {
					e.preventDefault();
					setSelectedResponsibleIndex(it.idx);
					syncResponsibleInputFromFilters();
					closeResponsibleSuggest();
					saveFilters();
					applyFilters();
				});
				box.appendChild(row);
			}
			box.style.display = 'block';
		}

		(function initProjectPicker() {
			const row = host.querySelector('#anit_projects_row');
			if (!row) return;


			if (!isTasksChatsModeNow()) {
				row.style.display = 'none';
				return;
			}

			// По умолчанию фильтр проекта всегда пустой
			if (Array.isArray(filters.projectIndexes) && filters.projectIndexes.length) {
				filters.projectIndexes = [];
				saveFilters();
			}

			row.style.display = 'flex';
			syncProjectInputFromFilters();
			const inp = host.querySelector('#anit_project_input');
			const wrap = inp?.parentElement;
			if (inp) {
				inp.addEventListener('focus', () => renderProjectSuggest(inp.value || ''));
				inp.addEventListener('input', () => {
					// живой поиск: подстраиваем список снизу
					renderProjectSuggest(inp.value || '');
					const v = String(inp.value || '').trim();
					if (v === '') {
						setSelectedProjectIndex('');
						saveFilters();
						applyFilters();
					}
				});
				inp.addEventListener('keydown', (e) => {
					if (e.key === 'Escape') closeProjectSuggest();
				});
			}
			document.addEventListener('mousedown', (e) => {
				if (wrap && !wrap.contains(e.target)) closeProjectSuggest();
				const rInp = host.querySelector('#anit_responsible_input');
				const rWrap = rInp?.parentElement;
				if (rWrap && !rWrap.contains(e.target)) closeResponsibleSuggest();
			}, true);
		})();

		(function initResponsiblePicker() {
			const row = host.querySelector('#anit_responsibles_row');
			if (!row) return;


			if (!isTasksChatsModeNow()) {
				row.style.display = 'none';
				return;
			}


			if (Array.isArray(filters.responsibleIndexes) && filters.responsibleIndexes.length) {
				filters.responsibleIndexes = [];
				saveFilters();
			}

			row.style.display = 'flex';
			syncResponsibleInputFromFilters();
			const inp = host.querySelector('#anit_responsible_input');
			if (inp) {
				inp.addEventListener('focus', () => renderResponsibleSuggest(inp.value || ''));
				inp.addEventListener('input', () => {
					// живой поиск: подстраиваем список снизу
					renderResponsibleSuggest(inp.value || '');
					const v = String(inp.value || '').trim();
					if (v === '') {
						setSelectedResponsibleIndex('');
						saveFilters();
						applyFilters();
					}
				});
				inp.addEventListener('keydown', (e) => {
					if (e.key === 'Escape') closeResponsibleSuggest();
				});
			}
		})();

		const HIDE_LS_KEY = 'anit.filters.hidden';
		function setHidden(hidden) {
			if (hidden) host.classList.add('anit-hidden');
			else host.classList.remove('anit-hidden');
			const mini = host.querySelector('#anit_mini_toggle');
			const full = host.querySelector('#anit_toggle_btn');
			if (mini) mini.title = hidden ? 'Показать панель (Ctrl+Alt+F)' : 'Скрыть панель (Ctrl+Alt+F)';
			if (full) full.textContent = hidden ? '+' : '-';
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
			const ts = Number(host.dataset.lastDragTs || 0);
			if (ts && (Date.now() - ts) < 250) return;
			togglePanel();
		});
		host.querySelector('#anit_mini_toggle')?.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const ts = Number(host.dataset.lastDragTs || 0);
			if (ts && (Date.now() - ts) < 250) return;
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
	const hc = host.querySelector('#anit_hide_completed');
	if (hc) hc.checked = !!filters.hideCompletedTasks;
	const hs = host.querySelector('#anit_hide_system');
	if (hs) hs.checked = !!filters.hideSystemMessages;

	if (IS_OL_FRAME) {
	const wa = host.querySelector('#anit_wa'), tg = host.querySelector('#anit_tg'), st = host.querySelector('#anit_status');
	if (wa) wa.checked = !!filters.onlyWhatsApp;
	if (tg) tg.checked = !!filters.onlyTelegram;
	if (st) st.value = (filters.status === '25' || filters.status === '20') ? '20' : String(filters.status || 'any');
} else if (!isTasksMode) {
		updateTypeChipsUI(host);
	}
	if (host.querySelector('#anit_project_input')) {
		try { syncProjectInputFromFilters?.(); } catch {}
	}

	function readAndApply() {
	filters.unreadOnly = host.querySelector('#anit_unread').checked;
	filters.withAttach = host.querySelector('#anit_attach').checked;
	filters.query      = host.querySelector('#anit_query').value;
	filters.hideCompletedTasks = host.querySelector('#anit_hide_completed')?.checked || false;
	filters.hideSystemMessages = isTasksChatsModeNow() ? (host.querySelector('#anit_hide_system')?.checked || false) : false;

	if (IS_OL_FRAME) {
	filters.onlyWhatsApp = host.querySelector('#anit_wa')?.checked || false;
	filters.onlyTelegram = host.querySelector('#anit_tg')?.checked || false;
	filters.status       = host.querySelector('#anit_status')?.value || 'any';
	} else if (!isTasksMode){
	filters.typesSelected = readTypesFromUI(host);
	} else {
		filters.typesSelected = [];
	}
	const pInp = host.querySelector('#anit_project_input');
	if (pInp) {
		const v = String(pInp.value || '').trim();
		if (v === '') {
			filters.projectIndexes = [];
		} else {
			// если вручную введено значение, но не выбрано из списка — не меняем текущее состояние
			const chosen = Array.isArray(filters.projectIndexes) ? filters.projectIndexes : [];
			filters.projectIndexes = chosen.filter(n => Number.isFinite(n)).slice(0, 1);
		}
	}
	const rInp = host.querySelector('#anit_responsible_input');
	if (rInp) {
		const v = String(rInp.value || '').trim();
		if (v === '') {
			filters.responsibleIndexes = [];
		} else {
			// если вручную введено значение, но не выбрано из списка — не меняем текущее состояние
			const chosen = Array.isArray(filters.responsibleIndexes) ? filters.responsibleIndexes : [];
			filters.responsibleIndexes = chosen.filter(n => Number.isFinite(n)).slice(0, 1);
		}
	}
	if (isTasksChatsModeNow()) filters.sortMode = 'native';
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
	const hc = host.querySelector('#anit_hide_completed');
	if (hc) hc.checked = false;
	const hs = host.querySelector('#anit_hide_system');
	if (hs) hs.checked = false;
	host.querySelector('#anit_query').value = '';
	if (wasOL) {
	const st = host.querySelector('#anit_status');
	if (st) st.value = 'any';
	const wa = host.querySelector('#anit_wa'), tg = host.querySelector('#anit_tg');
	if (wa) wa.checked = false; if (tg) tg.checked = false;
	} else if (!isTasksMode) {
		host.querySelectorAll('#anit_types input[type=checkbox]').forEach(cb => cb.checked = false);
	}
	const pInpReset = host.querySelector('#anit_project_input');
	if (pInpReset) pInpReset.value = '';
	const rInpReset = host.querySelector('#anit_responsible_input');
	if (rInpReset) rInpReset.value = '';
	filters.sortMode = 'native';
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

		host.querySelectorAll('#anit_types .anit-type-chip').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				btn.classList.toggle('is-selected');
				readAndApply();
			});
		});

		const categoriesGroup = host.querySelector('#anit_categories_group');
		const categoriesToggle = host.querySelector('#anit_categories_toggle');
		if (categoriesGroup && categoriesToggle && !isTasksMode) {
			const applyCategoryCollapsed = (collapsed) => {
				categoriesGroup.classList.toggle('is-collapsed', !!collapsed);
				try { localStorage.setItem(CAT_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
			};
			try { applyCategoryCollapsed(localStorage.getItem(CAT_COLLAPSED_KEY) === '1'); } catch {}
			categoriesToggle.addEventListener('click', (e) => {
				e.preventDefault();
				const next = !categoriesGroup.classList.contains('is-collapsed');
				applyCategoryCollapsed(next);
			});
		}




	makeDraggable(host, mode);
}


	let obs;
	let rebuildScheduled = false;

	async function rebuildList(reason, opts = {}) {
	const container = findContainer();
	if (!container) { warn('rebuild: контейнер не найден'); return; }

	if (!IS_OL_FRAME) {
		const pane = document.getElementById('anit-filters');
		const needMode = getPanelModeKey();
		if (pane && pane.dataset.mode !== needMode) {
			pane.remove();
			filtersHost = null;
			await buildFiltersPanel().catch(() => {});
		}
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
} else if (onChats && havePanel) {
	const pane = document.getElementById('anit-filters');
	const needMode = getPanelModeKey();
	if (pane && pane.dataset.mode !== needMode) {
		pane.remove();
		filtersHost = null;
		buildFiltersPanel().then(applyFilters);
	}
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

		window.addEventListener('message', (e) => {
			if (!e.data || e.data.type !== 'anit-mapping-updated') return;
			if (!e.data.projects && !e.data.users) return;
			window.__anitProjectLookup = {
				projects: Array.isArray(e.data.projects) ? e.data.projects : (window.__anitProjectLookup?.projects || []),
				chatToProject: new Map(Array.isArray(e.data.chatToProject) ? e.data.chatToProject : (window.__anitProjectLookup?.chatToProject || [])),
				users: Array.isArray(e.data.users) ? e.data.users : (window.__anitProjectLookup?.users || []),
				chatToResponsible: new Map(Array.isArray(e.data.chatToResponsible) ? e.data.chatToResponsible : (window.__anitProjectLookup?.chatToResponsible || []))
			};
			try { applyFilters(); } catch (err) {}
			try {
				if (filtersHost) {
					document.getElementById('anit-filters')?.remove();
					filtersHost = null;
					buildFiltersPanel().then(() => applyFilters());
				}
			} catch {}
		});

		armObserver();
		armMultiSelectHandlers();
	log('boot завершён');
}

	function decodeDeltaMap(dmap) {
		const map = new Map();
		if (!Array.isArray(dmap) || dmap.length < 2) return map;

		let chatId = Number(dmap[0]);
		let idx = Number(dmap[1]);
		if (Number.isFinite(chatId) && Number.isFinite(idx)) map.set(chatId, idx);

		for (let i = 2; i < dmap.length; i += 2) {
			const delta = Number(dmap[i]);
			const nextIdx = Number(dmap[i + 1]);
			if (!Number.isFinite(delta) || !Number.isFinite(nextIdx)) continue;
			chatId += delta;
			map.set(chatId, nextIdx);
		}
		return map;
	}

	window.addEventListener('message', (e) => {
		const d = e.data;
		if (!d || d.type !== 'ANIT_BXCS_MAPPING' || !d.bundle) return;

		const bundle = d.bundle;
		const projects = Array.isArray(bundle.projects) ? bundle.projects : null;
		const dmapArr = Array.isArray(bundle.dmap) ? bundle.dmap : null;
		if (!projects || !dmapArr) return;
		const users = Array.isArray(bundle.users) ? bundle.users : null;
		const dmapUArr = Array.isArray(bundle.dmapu) ? bundle.dmapu : null;

		window.__anitProjectLookup = {
			projects,
			chatToProject: decodeDeltaMap(dmapArr),
			users: users || [],
			chatToResponsible: decodeDeltaMap(dmapUArr),
			ts: bundle.ts || Date.now(),
			portal: bundle.portal || d.host || ''
		};

		try { if (typeof applyFilters === 'function') applyFilters(); } catch (_) {}


		try {
			if (!filtersHost) return;
			if (!isTasksChatsModeNow()) return;

			const row = filtersHost.querySelector('#anit_projects_row');
			const hasMapping = !!window.__anitProjectLookup?.projects;


			if (row && row.style.display === 'none' && hasMapping) {
				document.getElementById('anit-filters')?.remove();
				filtersHost = null;
				buildFiltersPanel().then(() => applyFilters());
				return;
			}


			try { uiFromFilters(filtersHost); } catch {}
		} catch {}
	}, true);

	try { boot().catch(e => err('fatal', e)); } catch (e) { err('fatal', e); }
})();

