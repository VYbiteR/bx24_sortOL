(function () {
  const STORAGE_KEY = 'anit_update_info';

  function openOptionsPageSafe() {
    try {
      if (chrome?.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        setTimeout(() => window.close(), 0);
        return;
      }
    } catch (_) {}
    try {
      const url = chrome.runtime.getURL('options.html');
      if (chrome?.tabs?.create) chrome.tabs.create({ url });
      setTimeout(() => window.close(), 0);
    } catch (_) {}
  }

  const optionsLink = document.getElementById('optionsLink');
  if (optionsLink) {
    optionsLink.href = chrome.runtime.getURL('options.html');
    optionsLink.addEventListener('click', (e) => {
      e.preventDefault();
      openOptionsPageSafe();
    });
  }

  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const info = res[STORAGE_KEY];
    const updateBlock = document.getElementById('updateBlock');
    const updateText = document.getElementById('updateText');
    const updateLink = document.getElementById('updateLink');
    const currentBlock = document.getElementById('currentBlock');
    const currentText = document.getElementById('currentText');

    const manifest = chrome.runtime.getManifest();
    const currentVer = (manifest && manifest.version) || '';

    if (info && info.hasUpdate && info.url) {
      updateBlock.style.display = 'block';
      updateText.textContent = 'Вышла новая версия ' + (info.tag || info.version || '') + '.';
      updateLink.href = info.url;
      currentBlock.style.display = 'none';
    } else {
      updateBlock.style.display = 'none';
      currentText.textContent = 'Версия ' + currentVer + ' — актуальна';
    }
  });
})();
