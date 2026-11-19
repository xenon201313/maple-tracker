'use strict';

async function initializePublicDemoAudit(context) {
  await context.addInitScript(() => {
    const local = window.localStorage, session = window.sessionStorage;
    const getItem = Storage.prototype.getItem;
    const entries = [
      [local, 'demo-ledger-fixture', '{"meso":"123456789"}'],
      [local, 'demo-recovery-fixture', '검증용 복구 기록'],
      [session, 'demo-auth-fixture', '검증용 세션']
    ];
    for (const [store, key, value] of entries) store.setItem(key, value);
    const snapshot = () => entries.map(([store, key]) => getItem.call(store, key));
    const before = snapshot(), calls = [];
    let themeReads = 0;
    function deny(name) {
      calls.push(name);
      throw new Error('공개 계산기에서 금지된 접근: ' + name);
    }

    // 테마 초기화의 getItem 한 종류만 허용합니다. 실제 저장소는 페이지에 노출하지 않습니다.
    const themeOnly = new Proxy(Object.create(null), {
      get(_, name) {
        if (name !== 'getItem') return deny('localStorage.' + String(name));
        return key => {
          if (key !== 'maple_ui_theme_v1') return deny('localStorage.getItem(' + String(key) + ')');
          themeReads++;
          return getItem.call(local, key);
        };
      },
      set: () => deny('localStorage 쓰기'),
      deleteProperty: () => deny('localStorage 삭제'),
      defineProperty: () => deny('localStorage 속성 변경'),
      has: () => deny('localStorage 키 확인'),
      ownKeys: () => deny('localStorage 키 열람'),
      getOwnPropertyDescriptor: () => deny('localStorage 속성 조회')
    });
    for (const method of ['getItem','setItem','removeItem','clear','key']) {
      Storage.prototype[method] = () => deny('Storage.' + method);
    }
    Object.defineProperty(window, 'localStorage', { get: () => themeOnly });
    for (const name of ['sessionStorage', 'db']) Object.defineProperty(window, name, { get: () => deny(name) });
    window.fetch = () => deny('fetch');
    XMLHttpRequest.prototype.open = () => deny('XMLHttpRequest');
    navigator.sendBeacon = () => deny('sendBeacon');
    window.WebSocket = function () { deny('WebSocket'); };
    window.__publicDemoAudit = () => ({ calls:[...calls], themeReads, before, after:snapshot() });
  });
}

module.exports = { initializePublicDemoAudit };
