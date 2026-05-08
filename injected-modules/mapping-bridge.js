(function () {
  const root = window.__ANIT_BXCS_MODULES__ = window.__ANIT_BXCS_MODULES__ || {};

  root.createMappingBridge = function createMappingBridge(deps) {
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

    function handleMappingMessage(event) {
      const data = event.data;
      if (!data || data.type !== 'ANIT_BXCS_MAPPING' || !data.bundle) return;

      const bundle = data.bundle;
      const projects = Array.isArray(bundle.projects) ? deps.normalizeLookupPairs(bundle.projects) : null;
      const dmapArr = Array.isArray(bundle.dmap) ? bundle.dmap : null;
      if (!projects || !dmapArr) return;

      const users = Array.isArray(bundle.users) ? deps.normalizeLookupPairs(bundle.users) : null;
      const dmapUArr = Array.isArray(bundle.dmapu) ? bundle.dmapu : null;
      const statuses = Array.isArray(bundle.statuses) ? deps.normalizeLookupPairs(bundle.statuses) : null;
      const dmapStatusArr = Array.isArray(bundle.dmapStatus) ? bundle.dmapStatus : null;

      window.__anitProjectLookup = {
        projects,
        chatToProject: decodeDeltaMap(dmapArr),
        users: users || [],
        chatToResponsible: decodeDeltaMap(dmapUArr),
        statuses: statuses || [],
        chatToStatus: decodeDeltaMap(dmapStatusArr),
        ts: bundle.ts || Date.now(),
        portal: bundle.portal || data.host || ''
      };

      deps.applyFiltersSafe();
      deps.refreshTaskFilterPanelSafe();
    }

    function arm() {
      window.addEventListener('message', handleMappingMessage, true);
    }

    return Object.freeze({ arm });
  };
})();
