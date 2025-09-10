/* eslint-disable no-console */
(function () {
	const VER = '1.8.1';
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

	// hook fetch/xhr — только открываем ворота
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

	// ==== REST tsMap (делаем ОДИН раз) ====
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
				const dialogId =
					String(
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

	// ==== Заморозка порядка ====
	let rankMap = new Map();     // dialogId -> rank (0..N-1) после ПЕРВОГО успешного rebuild
	let frozenSetSig = '';       // подпись множества (без порядка), чтобы понять менялся ли состав
	let tsMapOnce = null;        // кэш tsMap первого раза
	let lastOrderSig = '';       // подпись текущего порядка, чтобы не дёргать DOM зря

	function currentSetSignature(ids) {
		// подпись множества (без порядка)
		return Array.from(new Set(ids)).sort().join('#');
	}
	function currentOrderSignature(ids) {
		return ids.join('|');
	}

	async function rebuildList(reason, opts = {}) {
		const container = findContainer();
		if (!container) { warn('rebuild: контейнер не найден'); return; }

		// чистим заголовки (даты/категории), чтобы сделать плоский список
		container.querySelectorAll('.bx-messenger-recent-group').forEach(n => n.remove());

		const items = Array.from(container.querySelectorAll('.bx-messenger-cl-item'));
		if (!items.length) return;

		const ids = items.map(el => normId(el.getAttribute('data-userid') || el.dataset.userid));
		const setSig = currentSetSignature(ids);

		// если состав Тот же — просто восстановим зафиксированный порядок (если он уже есть)
		if (rankMap.size && setSig === frozenSetSig) {
			const orderSigNow = currentOrderSignature(ids);
			// если порядок и так как надо — молчим
			const shouldBe = Array.from(ids).sort((a, b) => (rankMap.get(a) ?? 1e9) - (rankMap.get(b) ?? 1e9));
			const wantedSig = currentOrderSignature(shouldBe);
			if (orderSigNow === wantedSig) return; // уже всё ок

			const mapById = new Map(items.map(el => [normId(el.getAttribute('data-userid') || el.dataset.userid), el]));
			const frag = document.createDocumentFragment();
			for (const id of shouldBe) {
				const el = mapById.get(id);
				if (el) frag.appendChild(el);
			}
			container.appendChild(frag);
			lastOrderSig = wantedSig;
			log('reapply frozen order.', { total: items.length, reason });
			return;
		}

		// состав изменился (или это первый раз): готовим сортировку
		const tsMap = opts.tsMap || tsMapOnce || new Map();
		const currentIndex = new Map(items.map((el, i) => [el, i]));

		// ключ сортировки: сперва по замороженному рангу (если есть), потом по ts (DESC), потом по текущему индексу
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
		if (newOrderSig === lastOrderSig) return;

		const frag = document.createDocumentFragment();
		for (const el of items) frag.appendChild(el);
		container.appendChild(frag);
		lastOrderSig = newOrderSig;

		// если это первый rebuild — зафиксируем ранги; если состав поменялся — обновим ранги аккуратно
		rankMap = new Map(newIds.map((id, i) => [id, i]));
		frozenSetSig = currentSetSignature(newIds);

		log('rebuild ok.', { total: items.length, source: tsMap.size ? 'rest' : 'dom', reason });
	}

	// ==== Observer — реагирует только на реальные childList изменения ====
	let obs;
	let rebuildScheduled = false;

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
				await rebuildList('observer'); // ВОССТАНАВЛИВАЕМ ЗАМОРОЖЕННЫЙ ПОРЯДОК
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

		tsMapOnce = await getRecentTsMap().catch(() => new Map());

		await rebuildList('boot', { tsMap: tsMapOnce });  // первая и единственная реальная сортировка
		armObserver();                                     // дальше — только «восстановление»
		log('boot завершён');
	}

	try { boot().catch(e => err('fatal', e)); } catch (e) { err('fatal', e); }
})();
