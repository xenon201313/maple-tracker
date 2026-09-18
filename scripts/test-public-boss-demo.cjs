'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');

// 사용자 브라우저와 실제 장부를 사용하지 않는 공개 정산 도구 검증입니다.
const root = path.resolve(__dirname, '..');
const output = process.env.PUBLIC_BOSS_DEMO_OUTPUT_DIR || path.join(root, '.tools', 'public-boss-demo-review');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.ttf':'font/ttf' };
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
});
const keys = ['saleNet','leaderNet','transfer','memberNet','saleCost','transferCost','rounding','received'];
let checks = 0;
const pass = label => { checks++; process.stdout.write('PASS ' + label + '\n'); };

function ledgerReference() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const functions = ['feeNet','floorHundred','dropSplitInfo'].map(name => {
    const code = html.match(new RegExp('function ' + name + '\\([^]*?\\n}'));
    assert(code, '장부 함수 누락: ' + name);
    return code[0];
  }).join('\n');
  const context = vm.createContext({
    toMesoBig: value => BigInt(value),
    validDropFee: value => Number(value),
    dropPriceStore: value => ({item:value.sale}),
    bossPartyForDropKey: value => value.party,
    dropShareMeta: value => ({role:'leader',fee:value.fee,ratio:{leader:BigInt(value.leader),member:BigInt(value.member)}})
  });
  vm.runInContext(functions, context);
  return value => context.dropSplitInfo(value, '검증 주차', 'item');
}

(async () => {
  fs.mkdirSync(output, { recursive:true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    const context = await browser.newContext({ viewport:{width:1440,height:1000}, reducedMotion:'reduce' });
    await context.addInitScript(() => {
      const local = window.localStorage, session = window.sessionStorage, get = Storage.prototype.getItem;
      local.setItem('boss-demo-ledger-fixture', '{"meso":"123456789"}');
      local.setItem('boss-demo-recovery-fixture', '검증용 복구 기록');
      session.setItem('boss-demo-auth-fixture', '실제 인증값 아님');
      const entries = [[local,'boss-demo-ledger-fixture'],[local,'boss-demo-recovery-fixture'],[session,'boss-demo-auth-fixture']];
      const before = entries.map(([store,key]) => get.call(store,key));
      const calls = [];
      const denied = name => () => { calls.push(name); throw new Error('금지된 접근: ' + name); };
      for (const name of ['getItem','setItem','removeItem','clear','key']) Storage.prototype[name] = denied('Storage.' + name);
      for (const name of ['localStorage','sessionStorage','db']) Object.defineProperty(window,name,{get:denied(name)});
      window.fetch = denied('fetch');
      XMLHttpRequest.prototype.open = denied('XMLHttpRequest');
      navigator.sendBeacon = denied('sendBeacon');
      window.WebSocket = denied('WebSocket');
      window.__bossDemoAudit = () => ({ calls:[...calls], before, after:entries.map(([store,key]) => get.call(store,key)) });
    });
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
    await page.goto(origin + '/guide/boss-settlement/');
    await page.evaluate(() => document.fonts.ready);
    const form = page.locator('[data-boss-demo] form');
    const result = async () => page.locator('[data-boss-demo]').evaluate(node => Object.fromEntries([...node.querySelectorAll('[data-boss-result]')].map(item => [item.dataset.bossResult,item.textContent.replace(/[^\d-]/g,'')])));
    const set = data => form.evaluate((node, values) => {
      for (const [key,value] of Object.entries(values)) node.elements.namedItem(key).value = String(value);
      node.dispatchEvent(new Event('change', {bubbles:true}));
    }, data);
    const reset = async () => {
      await form.locator('[type="reset"]').click();
      await page.waitForFunction(() => document.querySelector('[data-boss-result="leaderNet"]').textContent === '462,820,600 메소');
    };
    let amounts = await result();
    assert.deepEqual(amounts, {saleNet:'950000000',leaderNet:'462820600',transfer:'487179400',memberNet:'462820430',saleCost:'50000000',transferCost:'24358970',rounding:'86',received:'925641030'});
    pass('10억·2인·5% 실수령과 송금액·100메소 내림 잔액이 본문 예제와 일치');

    await form.locator('[name="party"]').selectOption('3');
    await form.locator('[name="mode"]').selectOption('weighted');
    amounts = await result();
    assert.equal(amounts.leaderNet, '499407200');
    assert.equal(amounts.transfer, '225296400');
    assert.equal(amounts.memberNet, '214031580');
    assert.match(await page.locator('[data-boss-detail]').innerText(), /파티원 2명/);
    pass('3인 7:3을 파티장 7·파티원 각각 3으로 계산');

    const reference = ledgerReference();
    let comparisons = 0;
    for (const party of [1,2,3,4,5,6]) {
      for (const fee of [0,3,5]) {
        for (const [leader,member] of [[1,1],[7,3],[10,0],[0,1]]) {
          const sale = comparisons % 2 ? '9007199254740993123' : '1000000123';
          await set({sale,saleFee:fee,transferFee:fee,party,mode:'weighted',leader,member});
          const expected = reference({sale,party,fee,leader,member});
          amounts = await result();
          assert.equal(amounts.saleNet,String(expected.saleNet));
          assert.equal(amounts.leaderNet,String(expected.leaderNet));
          assert.equal(amounts.transfer,String(expected.transferGross));
          assert.equal(amounts.memberNet,String(expected.memberNet));
          assert.equal(BigInt(amounts.saleCost)+BigInt(amounts.transferCost)+BigInt(amounts.received),BigInt(sale));
          assert.equal(BigInt(amounts.transfer)%100n,0n);
          comparisons++;
        }
      }
    }
    pass('장부 실제 dropSplitInfo와 ' + comparisons + '조건 일치·큰 정수·0 가중치·총액 보존');

    await set({sale:'1,000,000,000',saleFee:5,transferFee:0,party:2,mode:'equal'});
    amounts = await result();
    assert.equal(amounts.leaderNet,'475000000');
    assert.equal(amounts.transfer,'475000000');
    assert.equal(amounts.memberNet,'475000000');
    assert.equal(amounts.transferCost,'0');
    await set({party:1,saleFee:3});
    amounts = await result();
    assert.equal(amounts.leaderNet,'970000000');
    assert.equal(amounts.transfer,'0');
    assert.equal(await form.locator('[name="transferFee"]').isDisabled(),true);
    assert.equal(await form.locator('[name="mode"]').isDisabled(),true);
    assert.equal(await page.locator('[data-boss-ratio]').isVisible(),false);
    pass('판매·송금 수수료 개별 입력 및 혼자 판매할 때 송금 조건 제외');

    await reset();
    for (const bad of ['', '-1', '1.5', '1e9', '1,00', '<img>', ' '.repeat(3), '9'.repeat(41)]) {
      await form.locator('[name="sale"]').fill(bad);
      for (const key of keys) assert.equal(await page.locator('[data-boss-result="' + key + '"]').innerText(),'—');
      assert.match(await page.locator('[data-boss-error]').innerText(),/정수/);
      assert.equal(await form.locator('[name="sale"]').getAttribute('aria-invalid'),'true');
    }
    await reset();
    await form.locator('[name="mode"]').selectOption('weighted');
    await form.locator('[name="leader"]').fill('10000');
    assert.match(await page.locator('[data-boss-error]').innerText(),/9,999/);
    await form.locator('[name="leader"]').fill('0');
    await form.locator('[name="member"]').fill('0');
    assert.match(await page.locator('[data-boss-error]').innerText(),/모두 0/);
    await form.locator('[name="mode"]').selectOption('equal');
    assert.equal(await page.locator('[data-boss-error]').innerText(),'');
    assert.equal((await result()).leaderNet,'462820600');
    pass('잘못된 정수·쉼표·비율·빈칸 오류 표시, 균등 분배에서 숨겨진 비율 무시');

    await form.locator('[name="sale"]').fill('0');
    assert(Object.values(await result()).every(value => value === '0'));
    await form.locator('[name="sale"]').fill('99');
    amounts = await result();
    assert.equal(amounts.transfer,'0');
    assert.equal(amounts.leaderNet,'94');
    await reset();
    const url = page.url();
    await page.evaluate(() => { window.__bossDemoSentinel = '페이지 유지'; });
    await form.locator('[name="sale"]').press('Enter');
    assert.equal(await form.evaluate(node => !node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))),true);
    assert.equal(page.url(),url);
    assert.equal(await page.evaluate(() => window.__bossDemoSentinel),'페이지 유지');
    pass('0메소·100메소 미만 정산·예제 복원·Enter와 제출 시 이동 및 전송 없음');

    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      await form.locator('[name="mode"]').selectOption('weighted');
      await page.locator('#try-settlement').scrollIntoViewIfNeeded();
      const state = await page.locator('#try-settlement').evaluate(node => {
        const bounds = node.getBoundingClientRect();
        const bad = [...node.querySelectorAll('button,input,select,dd')].filter(item => {
          const box = item.getBoundingClientRect();
          return box.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1);
        }).map(item => item.outerHTML.slice(0,100));
        return {bad,overflow:document.documentElement.scrollWidth > innerWidth + 1};
      });
      assert.deepEqual(state.bad,[]);
      assert.equal(state.overflow,false);
      await page.locator('#try-settlement').screenshot({path:path.join(output,'boss-demo-'+width+'.png')});
    }
    pass('1440·390·320px 입력과 결과 가로 넘침 없이 표시');

    const audit = await page.evaluate(() => window.__bossDemoAudit());
    assert.deepEqual(audit.calls,[]);
    assert.deepEqual(audit.after,audit.before);
    assert.deepEqual(errors,[]);
    assert(external.every(url => url.startsWith('https://static.cloudflareinsights.com/')));
    pass('저장소·장부 읽기/쓰기·API 호출 0회, 외부 통신 차단, 가상 장부·복구·세션 보존');

    const noJs = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
    await noJs.route('**/*',route);
    const staticPage = await noJs.newPage();
    await staticPage.goto(origin + '/guide/boss-settlement/');
    assert.equal(await staticPage.locator('h1').isVisible(),true);
    assert.equal(await staticPage.locator('[name="sale"]').isDisabled(),true);
    assert.equal(await staticPage.locator('[data-boss-result="transfer"]').innerText(),'487,179,400 메소');
    const text = await staticPage.locator('main').innerText();
    for (const value of ['462,820,430','499,407,200','100메소','JavaScript']) assert(text.includes(value));
    await noJs.close();
    pass('JavaScript 없이도 계산 결과·본문 검산표 표시, 동작하지 않는 입력은 잠금');
    await context.close();
    process.stdout.write('공개 보스 정산 검증 ' + checks + '묶음 통과. 스크린샷: ' + output + '\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
