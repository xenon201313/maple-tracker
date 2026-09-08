/* 공개 계산 가이드 전용. 장부·인증·저장소에는 접근하지 않는다. */
(() => {
  'use strict';
  const config = window.MESOBOOK_ADS || {};
  const eligiblePaths = new Set([
    '/guide/hunt-income/',
    '/guide/boss-settlement/',
    '/guide/profit-expense/'
  ]);
  const pagePath = location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
  const publicHost = ['maple-trackers.com', 'www.maple-trackers.com'].includes(location.hostname);
  const native = document.documentElement.classList.contains('native-android') || window.Capacitor?.isNativePlatform?.();
  const client = String(config.client || '').trim();
  const slot = String(config.slot || '').trim();
  const shell = document.querySelector('[data-content-ad]');
  if (config.enabled !== true || !publicHost || location.protocol !== 'https:' || native || !eligiblePaths.has(pagePath)) return;
  if (!/^ca-pub-\d{16}$/.test(client) || !/^\d+$/.test(slot) || !shell || shell.dataset.initialized) return;
  const ad = shell.querySelector('.adsbygoogle');
  if (!ad) return;
  shell.dataset.initialized = 'true';
  ad.dataset.adClient = client;
  ad.dataset.adSlot = slot;
  // 요청 시에는 실제 너비가 있어야 한다. 미송출 확인 후 접는다.
  shell.hidden = false;
  const observer = new MutationObserver(updateStatus);
  let timeout;
  function armTimeout() {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (ad.getAttribute('data-ad-status') !== 'filled') shell.hidden = true;
    }, 15000);
  }
  armTimeout();
  function updateStatus() {
    const status = ad.getAttribute('data-ad-status');
    if (status === 'filled' || status === 'unfilled' || status === 'unfill-optimized') {
      clearTimeout(timeout);
      shell.hidden = status !== 'filled';
      // 지연 응답과 이후 상태 변경도 반영한다.
    }
  }
  function fail() {
    clearTimeout(timeout);
    observer.disconnect();
    shell.hidden = true;
  }
  observer.observe(ad, { attributes:true, attributeFilter:['data-ad-status'] });
  let requested = false;
  function requestAd() {
    if (requested) return;
    requested = true;
    // 로더가 늦게 도착해 영역이 접혔어도 요청 순간에는 너비를 확보한다.
    shell.hidden = false;
    armTimeout();
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
    catch { fail(); }
  }
  const existing = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
  if (existing) {
    if (window.adsbygoogle) requestAd();
    else existing.addEventListener('load', requestAd, { once:true });
    existing.addEventListener('error', fail, { once:true });
    return;
  }
  const loader = document.createElement('script');
  loader.async = true;
  loader.crossOrigin = 'anonymous';
  loader.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
  loader.addEventListener('load', requestAd, { once:true });
  loader.addEventListener('error', fail, { once:true });
  document.head.appendChild(loader);
})();
