'use strict';

// Google 광고를 호출하지 않고 DOM/이벤트/타이머를 가짜로 구성하는 회귀 검사.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const project = process.argv[2] || path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(project, 'assets/site-ads.js'), 'utf8');

function environment(options = {}) {
  const observers = [];
  const timers = new Map();
  const createdScripts = [];
  const ads = [];
  let nextTimer = 0;
  class Element {
    constructor() { this.dataset = {}; this.hidden = true; this.attributes = new Map(); this.listeners = new Map(); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(name, callback, opts = {}) {
      const handlers = this.listeners.get(name) || [];
      handlers.push({ callback, once: opts.once });
      this.listeners.set(name, handlers);
    }
    dispatch(name) {
      const handlers = this.listeners.get(name) || [];
      this.listeners.set(name, handlers.filter(item => !item.once));
      for (const item of handlers) item.callback();
    }
  }
  class FakeObserver {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe(target, opts) { this.target = target; this.options = opts; this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const ad = new Element();
  const shell = new Element();
  shell.querySelector = selector => selector === '.adsbygoogle' && !options.noAd ? ad : null;
  const existingScript = options.existingScript ? new Element() : null;
  const window = {
    MESOBOOK_ADS: { enabled: true, client: 'ca-pub-1234567890123456', slot: '1234567890', ...options.config }
  };
  if (options.noConfig) delete window.MESOBOOK_ADS;
  if (options.nativeCapacitor) window.Capacitor = { isNativePlatform: () => true };
  if (options.preloadedQueue) window.adsbygoogle = { push(value) { ads.push(value); } };
  if (options.throwingQueue) window.adsbygoogle = { push() { throw new Error('의도한 큐 오류'); } };
  const forbidden = () => { throw new Error('외부 통신·장부 저장소 접근 금지'); };
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get: forbidden });
  window.fetch = forbidden;
  const location = {
    hostname: options.hostname || 'maple-trackers.com',
    pathname: options.pathname || '/guide/hunt-income/',
    protocol: options.protocol || 'https:'
  };
  const document = {
    documentElement: { classList: { contains: name => name === 'native-android' && !!options.nativeClass } },
    querySelector(selector) {
      if (selector === '[data-content-ad]') return options.noShell ? null : shell;
      if (selector.includes('pagead2.googlesyndication.com')) return existingScript || createdScripts[0] || null;
      throw new Error('예상하지 않은 셀렉터: ' + selector);
    },
    createElement(tag) { assert.equal(tag, 'script'); return new Element(); },
    head: { appendChild(node) { createdScripts.push(node); } }
  };
  const sandbox = {
    window, location, document, MutationObserver: FakeObserver,
    setTimeout(callback, delay) { assert.equal(delay, 15000); const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }, fetch: forbidden,
  };
  for (const key of ['localStorage', 'sessionStorage', 'XMLHttpRequest', 'WebSocket']) Object.defineProperty(sandbox, key, { get: forbidden });
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  function run() { vm.runInContext(source, context, { filename: 'site-ads.js', timeout: 1000 }); }
  function setStatus(status) {
    ad.attributes.set('data-ad-status', status);
    for (const observer of observers) if (observer.connected && observer.target === ad) observer.callback();
  }
  function fireTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } }
  function requestCount() { return ads.length + (Array.isArray(window.adsbygoogle) ? window.adsbygoogle.length : 0); }
  return { run, setStatus, fireTimers, requestCount, shell, ad, window, observers, timers, createdScripts, existingScript };
}

let passed = 0;
function test(name, fn) { fn(); passed += 1; process.stdout.write('PASS ' + name + '\n'); }
function expectBlocked(options) {
  const env = environment(options); env.run(); env.run();
  assert.equal(env.shell.hidden, true);
  assert.equal(env.createdScripts.length, 0);
  assert.equal(env.requestCount(), 0);
  assert.equal(env.observers.length, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(env.shell.dataset.initialized, undefined);
}

const blocked = [
  ['광고 비활성화', { config: { enabled: false } }],
  ['설정 누락', { noConfig: true }],
  ['enabled 문자열 차단', { config: { enabled: 'true' } }],
  ['빈 슬롯 차단', { config: { slot: '' } }],
  ['잘못된 슬롯 차단', { config: { slot: 'slot-123' } }],
  ['잘못된 게시자 번호 차단', { config: { client: 'ca-pub-123' } }],
  ['localhost 차단', { hostname: 'localhost' }],
  ['127.0.0.1 차단', { hostname: '127.0.0.1' }],
  ['IPv6 로컬 호스트 차단', { hostname: '[::1]' }],
  ['제3자 호스트 차단', { hostname: 'example.com' }],
  ['HTTP 차단', { protocol: 'http:' }],
  ['파일 실행 차단', { protocol: 'file:' }],
  ['Android 클래스 차단', { nativeClass: true }],
  ['Capacitor 네이티브 차단', { nativeCapacitor: true }],
  ['개인 장부 루트 차단', { pathname: '/' }],
  ['개인 장부 index 차단', { pathname: '/index.html' }],
  ['개인정보 페이지 차단', { pathname: '/privacy.html' }],
  ['사용 가이드 허브 차단', { pathname: '/guide/' }],
  ['API 안내 차단', { pathname: '/api/' }],
  ['사이트 소개 차단', { pathname: '/about/' }],
  ['유사 경로 차단', { pathname: '/guide/hunt-income/extra/' }],
  ['광고 영역 누락', { noShell: true }],
  ['광고 ins 누락', { noAd: true }],
];
for (const [name, options] of blocked) test(name, () => expectBlocked(options));

for (const pathname of ['/guide/hunt-income/', '/guide/boss-settlement/', '/guide/profit-expense/', '/guide/hunt-income/index.html', '/guide/hunt-income']) {
  test('허용 경로 + 로더·광고 요청·초기화 중복 방지 ' + pathname, () => {
    const env = environment({ pathname }); env.run(); env.run();
    assert.equal(env.shell.hidden, false);
    assert.equal(env.shell.dataset.initialized, 'true');
    assert.equal(env.createdScripts.length, 1);
    const script = env.createdScripts[0];
    assert.equal(script.async, true);
    assert.equal(script.crossOrigin, 'anonymous');
    assert.equal(script.src, 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456');
    assert.equal(env.ad.dataset.adClient, 'ca-pub-1234567890123456');
    assert.equal(env.ad.dataset.adSlot, '1234567890');
    assert.equal(env.requestCount(), 0);
    script.dispatch('load'); script.dispatch('load'); env.run();
    assert.equal(env.requestCount(), 1);
    assert.equal(env.createdScripts.length, 1);
    assert.equal(env.observers.length, 1);
  });
}

test('www 공식 호스트 허용', () => { const env = environment({ hostname: 'www.maple-trackers.com' }); env.run(); assert.equal(env.createdScripts.length, 1); });
test('공백이 있는 설정 정리', () => { const env = environment({ config: { client: ' ca-pub-1234567890123456 ', slot: ' 1234567890 ' } }); env.run(); assert.equal(env.ad.dataset.adSlot, '1234567890'); });
test('filled 표시 및 타이머 정리', () => {
  const env = environment(); env.run(); env.createdScripts[0].dispatch('load'); env.setStatus('filled');
  assert.equal(env.shell.hidden, false); assert.equal(env.timers.size, 0); env.fireTimers(); assert.equal(env.shell.hidden, false);
});
for (const status of ['unfilled', 'unfill-optimized']) test(status + ' 접기 및 이후 filled 복구', () => {
  const env = environment(); env.run(); env.createdScripts[0].dispatch('load'); env.setStatus(status);
  assert.equal(env.shell.hidden, true); assert.equal(env.timers.size, 0);
  env.setStatus('filled'); assert.equal(env.shell.hidden, false); assert.equal(env.requestCount(), 1);
});
test('응답 타임아웃 뒤 late filled 복구', () => {
  const env = environment(); env.run(); env.createdScripts[0].dispatch('load'); env.fireTimers();
  assert.equal(env.shell.hidden, true); assert.equal(env.observers[0].connected, true);
  env.setStatus('filled'); assert.equal(env.shell.hidden, false); assert.equal(env.requestCount(), 1);
});
test('filled 이후 unfilled 상태 변화 접기', () => {
  const env = environment(); env.run(); env.setStatus('filled'); env.setStatus('unfilled'); assert.equal(env.shell.hidden, true);
});
test('스크립트 오류면 영역·타이머·관찰자 정리', () => {
  const env = environment(); env.run(); env.createdScripts[0].dispatch('error');
  assert.equal(env.shell.hidden, true); assert.equal(env.timers.size, 0); assert.equal(env.observers[0].connected, false); assert.equal(env.requestCount(), 0);
});
test('큐 요청 오류면 영역 접기', () => {
  const env = environment({ throwingQueue: true }); env.run(); env.createdScripts[0].dispatch('load');
  assert.equal(env.shell.hidden, true); assert.equal(env.timers.size, 0); assert.equal(env.observers[0].connected, false);
});
test('기존 로딩 중 스크립트 재사용', () => {
  const env = environment({ existingScript: true }); env.run(); env.run(); env.existingScript.dispatch('load'); env.existingScript.dispatch('load');
  assert.equal(env.createdScripts.length, 0); assert.equal(env.requestCount(), 1);
});
test('기존 로드된 스크립트·큐 재사용', () => {
  const env = environment({ existingScript: true, preloadedQueue: true }); env.run(); env.run(); env.existingScript.dispatch('load');
  assert.equal(env.createdScripts.length, 0); assert.equal(env.requestCount(), 1);
});
test('Google 스크립트 로드 자체가 늦어도 요청 시 광고 너비 확보', () => {
  const env = environment(); env.run(); env.fireTimers();
  assert.equal(env.shell.hidden, true);
  const requestVisibility = [];
  env.window.adsbygoogle = { push() { requestVisibility.push(env.shell.hidden); } };
  env.createdScripts[0].dispatch('load');
  assert.deepEqual(requestVisibility, [false], '광고 push 시 영역이 숨겨져 있으면 실제 너비를 확보할 수 없습니다.');
});
process.stdout.write(`\n총 ${passed}개 검사 통과. 외부 네트워크·실제 광고 요청·장부 저장소 접근 없음.\n`);
