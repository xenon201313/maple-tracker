'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// 격리된 Chrome에만 검증용 저장값을 넣습니다. 사용자 브라우저와 외부 API는 사용하지 않습니다.
const root = path.resolve(__dirname, '..');
const output = process.env.PUBLIC_DEMO_OUTPUT_DIR || path.join(root, '.tools', 'public-demo-review');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.ttf':'font/ttf' };
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
});
const digits = text => text.replace(/[^\d-]/g, '');
let checks = 0;
function pass(label) { checks++; process.stdout.write('PASS ' + label + '\n'); }

async function initializeAudit(context) {
  await context.addInitScript(() => {
    const local = window.localStorage, session = window.sessionStorage;
    const getItem = Storage.prototype.getItem;
    local.setItem('demo-ledger-fixture', '{"records":[{"meso":"123456789"}]}');
    local.setItem('demo-recovery-fixture', '기존 복구 기록');
    session.setItem('demo-auth-fixture', '실제 인증값이 아닌 검사 문자열');
    const entries = [[local,'demo-ledger-fixture'],[local,'demo-recovery-fixture'],[session,'demo-auth-fixture']];
    const before = entries.map(([store,key]) => getItem.call(store,key));
    const calls = [];
    const forbidden = name => () => { calls.push(name); throw new Error('공개 계산기에서 금지된 접근: ' + name); };
    for (const name of ['getItem','setItem','removeItem','clear','key']) Storage.prototype[name] = forbidden('Storage.' + name);
    for (const name of ['localStorage','sessionStorage']) Object.defineProperty(window,name,{get:forbidden(name)});
    window.fetch = forbidden('fetch');
    XMLHttpRequest.prototype.open = forbidden('XMLHttpRequest');
    navigator.sendBeacon = forbidden('sendBeacon');
    window.WebSocket = forbidden('WebSocket');
    Object.defineProperty(window,'db',{get:forbidden('db')});
    window.__publicDemoAudit = () => ({ calls: [...calls], before, after:entries.map(([store,key]) => getItem.call(store,key)) });
  });
}

async function checkLayout(page, width, mode) {
  await page.setViewportSize({ width, height:900 });
  await page.locator('[data-demo-mode="' + mode + '"]').click();
  await page.locator('[data-demo-form="' + mode + '"] [type="reset"]').click();
  await page.locator('#try-calculator').scrollIntoViewIfNeeded();
  const state = await page.locator('#try-calculator').evaluate(root => {
    const bounds = root.getBoundingClientRect();
    const bad = [...root.querySelectorAll('button,input,select,dd,[data-demo-formula]')].filter(node => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && (r.left < bounds.left - 1 || r.right > bounds.right + 1);
    }).map(node => node.outerHTML.slice(0,140));
    return { bad, horizontalOverflow:root.scrollWidth > root.clientWidth + 1, pageOverflow:document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.deepEqual(state.bad, [], width + 'px ' + mode + ' 컨트롤이 체험 영역을 벗어났습니다.');
  assert(!state.horizontalOverflow && !state.pageOverflow, width + 'px ' + mode + ' 가로 넘침');
  await page.locator('#try-calculator').screenshot({ path:path.join(output, 'demo-' + width + '-' + mode + '.png') });
}

(async () => {
  fs.mkdirSync(output, { recursive:true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    const context = await browser.newContext({ viewport:{width:1440,height:1000}, reducedMotion:'reduce' });
    await initializeAudit(context);
    const external = [];
    const route = async request => {
      const url = request.request().url();
      if (url.startsWith(origin) || url.startsWith('data:')) return request.continue();
      external.push(url);
      return request.abort();
    };
    await context.route('**/*', route);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/guide/profit-expense/');
    await page.evaluate(() => document.fonts.ready);
    const form = mode => page.locator('[data-demo-form="' + mode + '"]');
    const amount = async (mode, kind) => digits(await form(mode).locator('[data-demo-' + kind + ']').innerText());
    const reset = async mode => {
      await form(mode).locator('[type="reset"]').click();
      const expected = {profit:'300000000',soul:'1600000000',ability:'165000000'}[mode];
      await page.waitForFunction(({mode,expected}) => document.querySelector('[data-demo-form="' + mode + '"] [data-demo-cost]').textContent.replace(/[^\d-]/g,'') === expected, {mode,expected});
    };
    const activate = mode => page.locator('[data-demo-mode="' + mode + '"]').click();
    assert.equal(await amount('profit','cost'), '300000000');
    assert.equal(await amount('profit','revenue'), '339500000');
    assert.equal(await amount('profit','net'), '39500000');
    pass('초기 판매 예제 3억 비용·3억 3,950만 실수령·3,950만 손익');

    await form('profit').locator('[name="sold"]').uncheck();
    assert.equal(await amount('profit','revenue'), '0');
    assert.equal(await amount('profit','net'), '-300000000');
    await form('profit').locator('[name="sold"]').check();
    await form('profit').locator('[name="sale"]').fill('101');
    await form('profit').locator('[name="cost"]').fill('0');
    await form('profit').locator('[name="fee"]').selectOption('5');
    assert.equal(await amount('profit','revenue'), '95');
    pass('미판매 수입 제외·5% 수수료·1메소 미만 버림');

    const largeCost = 9007199254740993n, largeSale = 999999999999999999n;
    await form('profit').locator('[name="cost"]').fill(largeCost.toLocaleString('ko-KR'));
    await form('profit').locator('[name="sale"]').fill(String(largeSale));
    const expectedRevenue = largeSale * 95n / 100n;
    assert.equal(await amount('profit','revenue'), String(expectedRevenue));
    assert.equal(await amount('profit','net'), String(expectedRevenue-largeCost));
    pass('안전 정수 범위를 넘는 판매 금액도 BigInt로 정확히 계산');

    for (const bad of ['', '-1', '1.5', '1e9', '1,00', '<img>', '  ']) {
      await form('profit').locator('[name="cost"]').fill(bad);
      assert.equal(await form('profit').locator('[data-demo-cost]').innerText(), '—');
      assert.equal(await form('profit').locator('[data-demo-revenue]').innerText(), '—');
      assert.equal(await form('profit').locator('[data-demo-net]').innerText(), '—');
      assert.match(await form('profit').locator('[data-demo-error]').innerText(), /정수/);
      assert.equal(await form('profit').locator('[name="cost"]').getAttribute('aria-invalid'), 'true');
    }
    await reset('profit');
    assert.equal(await form('profit').locator('[data-demo-error]').innerText(), '');
    assert.equal(await form('profit').locator('[name="cost"]').getAttribute('aria-invalid'), null);
    pass('빈칸·음수·소수·지수·잘못된 쉼표 오류와 초기화');

    await activate('soul');
    assert.equal(await amount('soul','cost'), '1600000000');
    await form('soul').locator('[name="price"]').fill('0');
    assert.equal(await amount('soul','cost'), '1540000000');
    await form('soul').locator('[name="price"]').fill('9,007,199,254,740,993');
    assert.equal(await amount('soul','cost'), String(largeCost*3n+1540000000n));
    await form('soul').locator('[name="count"]').fill('1,000,000');
    assert.equal(await amount('soul','cost'), String(largeCost*1000000n+1540000000n));
    await form('soul').locator('[name="count"]').fill('1000001');
    assert.equal(await form('soul').locator('[data-demo-cost]').innerText(), '—');
    assert.match(await form('soul').locator('[data-demo-error]').innerText(), /1,000,000/);
    await reset('soul');
    pass('소울 3종 비용 합산·무료 재료·큰 정수 곱셈·수량 한도');

    await form('soul').locator('[name="count"]').fill('0');
    await form('soul').locator('[name="resets"]').fill('0');
    await form('soul').locator('[name="attempts"]').fill('2');
    for (const [stage, unit] of [['stage1',500000000n],['stage2',1000000000n],['stage3',1750000000n],['stage4',2750000000n]]) {
      await form('soul').locator('[name="stage"]').selectOption(stage);
      assert.equal(await amount('soul','cost'), String(unit*2n));
      assert.equal(await amount('soul','direct'), String(unit*2n));
    }
    await form('soul').locator('[name="attempts"]').fill('0');
    await form('soul').locator('[name="resets"]').fill('3');
    for (const [grade, unit] of [['rare',20000000n],['epic',40000000n],['unique',65000000n],['legendary',88000000n]]) {
      await form('soul').locator('[name="grade"]').selectOption(grade);
      assert.equal(await amount('soul','cost'), String(unit*3n));
      assert.equal(await amount('soul','extra'), String(unit*3n));
    }
    await form('soul').locator('[name="resets"]').fill('0');
    assert.equal(await amount('soul','cost'), '0');
    for (const name of ['attempts','resets']) {
      await form('soul').locator('[name="' + name + '"]').fill('1000001');
      assert.equal(await form('soul').locator('[data-demo-cost]').innerText(), '—');
      assert.match(await form('soul').locator('[data-demo-error]').innerText(), /1,000,000/);
      await form('soul').locator('[name="' + name + '"]').fill('0');
    }
    await form('soul').locator('[name="stage"]').evaluate(node => { node.value = ''; node.dispatchEvent(new Event('change',{bubbles:true})); });
    assert.equal(await form('soul').locator('[data-demo-cost]').innerText(), '—');
    assert.equal(await form('soul').locator('[name="stage"]').getAttribute('aria-invalid'), 'true');
    await form('soul').locator('[name="calculation"]').selectOption('actual');
    assert.equal(await form('soul').locator('[name="stage"]').isEnabled(), false);
    await form('soul').locator('[name="direct"]').fill('1200000000');
    await form('soul').locator('[name="extra"]').fill('30000000');
    assert.equal(await amount('soul','cost'), '1230000000');
    await reset('soul');
    assert.equal(await form('soul').locator('[name="calculation"]').inputValue(), 'standard');
    assert.equal(await form('soul').locator('[name="direct"]').isEnabled(), false);
    pass('소울 4단계·4등급 공식 단가, 0회, 잘못된 조건, 직접 입력 모드와 초기화');

    await activate('ability');
    assert.equal(await amount('ability','cost'), '165000000');
    await form('ability').locator('[name="count"]').fill('0');
    assert.equal(await amount('ability','cost'), '150000000');
    assert.equal(await amount('ability','fame'), '400000');
    await form('ability').locator('[name="resets"]').fill('0');
    assert.equal(await amount('ability','cost'), '0');
    assert.equal(await amount('ability','fame'), '0');
    await form('ability').locator('[name="resets"]').fill('3');
    for (const [locks,unit,fame] of [['lock0',2000000n,20000n],['lock1',6000000n,30000n],['lock2',15000000n,40000n]]) {
      await form('ability').locator('[name="locks"]').selectOption(locks);
      assert.equal(await amount('ability','cost'), String(unit*3n));
      assert.equal(await amount('ability','fame'), String(fame*3n));
    }
    await form('ability').locator('[name="resets"]').fill('1,000,000');
    assert.equal(await amount('ability','direct'), '15000000000000');
    assert.equal(await amount('ability','fame'), '40000000000');
    for (const bad of ['', '-1', '1.5', '1e3', '1,00', '1000001']) {
      await form('ability').locator('[name="resets"]').fill(bad);
      assert.equal(await form('ability').locator('[data-demo-cost]').innerText(), '—');
      assert.equal(await form('ability').locator('[data-demo-fame]').innerText(), '—');
    }
    await form('ability').locator('[name="calculation"]').selectOption('actual');
    await form('ability').locator('[name="direct"]').fill('90000000');
    await form('ability').locator('[name="fame"]').fill('200000');
    assert.equal(await amount('ability','cost'), '90000000');
    assert.equal(await amount('ability','fame'), '200000');
    await form('ability').locator('[name="price"]').fill('0');
    await form('ability').locator('[name="count"]').fill('100');
    assert.equal(await amount('ability','cost'), '90000000');
    await reset('ability');
    pass('어빌리티 잠금 0·1·2개의 3회 비용, 명성치 별도, 무료·0회·직접 입력·횟수 검증');

    const url = page.url();
    await page.evaluate(() => { window.__demoPageSentinel = '로드 유지'; });
    await form('ability').locator('[name="resets"]').press('Enter');
    const canceled = await form('ability').evaluate(node => !node.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })));
    assert.equal(canceled, true);
    assert.equal(page.url(), url);
    assert.equal(await page.evaluate(() => window.__demoPageSentinel), '로드 유지');
    pass('Enter와 form submit으로 페이지 이동·전송하지 않음');

    await form('ability').locator('[name="resets"]').fill('12345');
    await activate('profit');
    await page.locator('#demo-tab-profit').focus();
    for (const [key,mode] of [['ArrowRight','soul'],['End','ability'],['ArrowRight','profit'],['ArrowLeft','ability'],['Home','profit']]) {
      await page.keyboard.press(key);
      assert.equal(await page.locator('#demo-tab-' + mode).evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator('#demo-tab-' + mode).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#demo-panel-' + mode).isVisible(), true);
      assert.equal(await page.locator('[data-demo-mode][tabindex="0"]').count(), 1);
    }
    await activate('ability');
    assert.equal(await form('ability').locator('[name="resets"]').inputValue(), '12345');
    pass('탭 방향키·Home·End·포커스·탭 전환 입력 유지');

    for (const width of [1440,390,320]) for (const mode of ['profit','soul','ability']) await checkLayout(page,width,mode);
    pass('1440·390·320px의 세 모드 가로 넘침 없이 표시');

    const audit = await page.evaluate(() => window.__publicDemoAudit());
    assert.deepEqual(audit.calls, [], '저장소·API·장부에 접근했습니다.');
    assert.deepEqual(audit.after, audit.before, '검증용 장부·복구·세션 값이 바뀌었습니다.');
    assert(external.every(url => url.startsWith('https://static.cloudflareinsights.com/')), '예상하지 않은 외부 요청: ' + external.join(', '));
    assert.deepEqual(errors, [], '브라우저 오류');
    pass('저장소 읽기·쓰기, 장부 접근, fetch/XHR/beacon 모두 0회·외부 통신 차단');

    const noJs = await browser.newContext({ javaScriptEnabled:false, viewport:{width:390,height:900} });
    await noJs.route('**/*', route);
    const staticPage = await noJs.newPage();
    await staticPage.goto(origin + '/guide/profit-expense/');
    assert.equal(await staticPage.locator('h1').isVisible(), true);
    assert.equal(await staticPage.locator('#soul-ability-example').isVisible(), true);
    assert.equal(await staticPage.locator('[data-expense-demo] :is(input,select,button):enabled').count(), 0, 'JavaScript 없이 결과를 갱신할 수 없는 입력은 잠급니다.');
    const text = await staticPage.locator('main').innerText();
    assert.match(text, /39,500,000/);
    assert.match(text, /소울/);
    assert.match(text, /어빌리티/);
    assert.match(text, /JavaScript/);
    assert.match(text, /88,000,000/);
    assert.match(text, /40,000 × 10 = 400,000/);
    assert.match(text, /성공까지의 기대 비용/);
    await noJs.close();
    pass('JavaScript가 꺼져도 제목·계산 표·소울/어빌리티 본문 열람');
    await context.close();
    process.stdout.write('공개 계산 체험 검증 ' + checks + '묶음 통과. 스크린샷: ' + output + '\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
