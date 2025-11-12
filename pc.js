/* pc-smoke-1: ここが実行されるかだけ確認する最小版 */
(function () {
  const VER = 'pc-smoke-1';
  console.log('[SMOKE]', VER);
  window.__TANA_PC_VERSION = VER;

  // 編集画面だけで軽く痕跡を残す（UIに無害）
  try {
    if (location.href.includes('mode=edit')) {
      const b = document.createElement('div');
      b.id = 'smoke-banner';
      b.textContent = 'SMOKE OK: ' + VER;
      b.style.cssText = 'position:fixed;z-index:999999;right:8px;bottom:8px;background:#eef;border:1px solid #99f;padding:6px 8px;border-radius:6px;font-size:12px';
      document.body.appendChild(b);
    }
  } catch (e) {
    console.error('SMOKE init error', e);
  }
})();
