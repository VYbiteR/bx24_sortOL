(function () {
	try {
		/*console.log('[ANIT-CHATSORT/CS] content.js init', {
			href: location.href,
			inFrame: self !== top
		});*/
		const s = document.createElement('script');
		s.src = chrome.runtime.getURL('injected.js');
		s.async = false;
		(document.documentElement || document.head || document.body).appendChild(s);
		s.onload = s.onerror = () => setTimeout(() => s.remove(), 0);
	} catch (e) {
		console.warn('[ANIT-CHATSORT/CS] inject failed', e);
	}
})();
