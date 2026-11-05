// 새 브라우저와 합성 장부로만 접근성·탐색·보존을 확인합니다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tools', 'clarity-20261105');
fs.mkdirSync(output, { recursive: true });
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.ttf':'font/ttf', '.woff2':'font/woff2', '.json':'application/json' };
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => error ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' }).end(data));
});
async function settle(page) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(50); }
async function noOverflow(page, label) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('.page.active button,.page.active input,.page.active select,.page.active textarea,.workspace-header button')];
    return { width, scroll:document.documentElement.scrollWidth, outside:controls.filter(el => {
      if (!el.getClientRects().length) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.left < -2 || r.right > width + 2);
    }).slice(0, 6).map(el => el.id || el.className) };
  });
  assert(result.scroll <= result.width + 2, label + ': document overflow ' + JSON.stringify(result));
  assert.deepEqual(result.outside, [], label + ': clipped controls');
}
const snapshot = page => page.evaluate(() => {
  // 조회 화면의 빈 주차·월 버킷 준비는 수익 기록을 바꾸지 않습니다. 실제 항목과 별도 설정은 모두 비교합니다.
  const chars = db.chars.map(character => Object.fromEntries(Object.entries(character).map(([key, value]) => [key,
    /(Days|Weeks|Months)$/.test(key) && value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, bucket]) => !(bucket && typeof bucket === 'object' && !Array.isArray(bucket) && !Object.keys(bucket).length)))
      : value
  ])));
  return JSON.stringify({ records:db.records, chars, expenses:db.expenses, profits:db.profits, planner:db.planner });
});
const sections = ['monthly', 'forecast', 'prices', 'records', 'backup', 'tools', 'guides'];

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless:true });
  try {
    const context = await browser.newContext({ viewport:{ width:1440, height:1000 }, reducedMotion:'reduce' });
    await fixtureDismissPatchNotes(context);
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await settle(page);
    for (const section of sections) {
      const disclosure = page.locator('details[data-clarity-section="' + section + '"]');
      assert.equal(await disclosure.count(), 1, section + ' has one native disclosure');
      assert.equal(await disclosure.evaluate(el => el.open), false, section + ' starts collapsed');
      assert((await disclosure.locator(':scope > summary').innerText()).trim().length > 2, section + ' has a clear visible label');
    }
    await page.evaluate(() => {
      const now = Date.now(), date = todayStr();
      db.chars = [normalizeChar({ name:'가시성검증용긴캐릭터이름', server:'main', worldName:'크로아' })];
      db.records = normalizeRecords({ [date]:{ sessions:[{ id:'clarity-hunt', kind:'hunt', runs:1, meso:'123456789', erda:3, erdaSettled:0, erdaUnitPrice:'10000', erdaFee:3, erdaMesoIncluded:false, charName:db.chars[0].name, createdAt:now, updatedAt:now }] } }, db.settings);
      db.expenses = [{ id:'clarity-expense', date, amount:'100', category:'equipment', memo:'탐색 보존용 합성 지출', createdAt:now, updatedAt:now }];
      save(); renderAll();
    });
    const before = await snapshot(page), homeHeights = {}, sizes = [320, 390, 768, 1024, 1440];
    let screens = 0;
    for (const width of sizes) {
      const height = width < 700 ? 844 : 1000;
      await page.setViewportSize({ width, height });
      await page.evaluate(() => { openPage('home'); document.querySelectorAll('details[data-clarity-section]').forEach(el => el.open = false); scrollTo(0, 0); });
      await settle(page); await noOverflow(page, width + ' home'); screens++;
      const actionBounds = await page.locator('.workspace-quick-actions').boundingBox();
      assert(actionBounds && actionBounds.y + actionBounds.height < height - 60, width + ' primary record actions clear the bottom bar in first screen');
      const loginBounds = await page.locator('[data-desk-account]').boundingBox();
      assert(loginBounds && loginBounds.width >= 44 && loginBounds.height >= 44, width + ' visible login target');
      if (width <= 700) {
        const resultBounds = await page.locator('.home-overview').boundingBox();
        const accountBounds = await page.locator('.home-account-panel').boundingBox();
        assert(resultBounds.y < height - 68, width + ' actual recorded results start in first screen');
        assert(resultBounds.y < accountBounds.y, width + ' results precede secondary account guidance');
      }
      homeHeights[width] = Math.round(await page.locator('#page-home').evaluate(el => el.getBoundingClientRect().height));
      if ([390, 1440].includes(width)) await page.screenshot({ path:path.join(output, 'home-' + width + '.png'), fullPage:true });
      for (const section of sections) {
        const disclosure = page.locator('details[data-clarity-section="' + section + '"]');
        const summary = disclosure.locator(':scope > summary');
        await summary.focus(); await page.keyboard.press('Enter');
        assert.equal(await disclosure.evaluate(el => el.open), true, width + ' ' + section + ' opens by keyboard');
        await noOverflow(page, width + ' ' + section); screens++;
        await page.keyboard.press('Enter');
        assert.equal(await disclosure.evaluate(el => el.open), false, width + ' ' + section + ' closes by keyboard');
      }
      for (const name of ['character', 'daily', 'boss', 'monthlyboss', 'dailyboss', 'profit', 'expense', 'stats']) {
        await page.evaluate(name => { openPage(name); scrollTo(0, 0); }, name); await settle(page);
        if (['boss', 'monthlyboss', 'dailyboss'].includes(name) && !await page.locator('.page.active .bosslist.open').count()) {
          await page.locator('.page.active .character-disclosure').first().click();
        }
        await noOverflow(page, width + ' ' + name); screens++;
        if (name === 'dailyboss') {
          const sale = page.locator('.page.active .daily-sale-check').first();
          assert.match(await sale.innerText(), /결정석 판매/, width + ' explicit sale label');
          assert((await sale.boundingBox()).height >= 44, width + ' sale touch target');
          assert.equal(await page.locator('.page.active .daily-boss-clear').first().isChecked(), false, 'viewing does not clear a boss');
          assert.equal(await page.locator('.page.active .daily-boss-check').first().isChecked(), false, 'viewing does not sell a crystal');
          if ([390, 1440].includes(width)) {
            await page.screenshot({ path:path.join(output, 'dailyboss-' + width + '.png'), fullPage:false });
            await page.locator('.page.active .bcard').first().screenshot({ path:path.join(output, 'dailyboss-card-' + width + '.png') });
          }
        }
      }
      for (const tool of ['investment', 'settlement', 'budget', 'hunting', 'bossplan', 'symbol']) {
        await page.evaluate(tool => MapleLedgerPlanner.open(tool), tool); await settle(page);
        await noOverflow(page, width + ' tool ' + tool); screens++;
      }
    }
    await page.setViewportSize({ width:1440, height:1000 });
    await page.evaluate(() => { openPage('home'); document.querySelector('details[data-clarity-section="backup"]').open = false; });
    await page.locator('[data-desk-search]').click();
    await page.locator('#desk-search-input').fill('백업');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('details[data-clarity-section="backup"]').evaluate(el => el.open), true, 'search opens hidden backup section');
    assert.equal(await page.locator('#home-backup').evaluate(el => document.activeElement === el), true, 'search focuses backup target');
    await page.locator('[data-desk-search]').click();
    await page.locator('#desk-search-input').fill('심볼');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.match(page.url(), /tool=symbol/, 'search keeps tool deep link');
    await page.locator('[data-desk-account]').click();
    assert.equal(await page.locator('#account-title').evaluate(el => document.activeElement === el), true, 'login remains reachable after disclosure navigation');
    assert.equal(await page.locator('#account-choice').count(), 1, 'account choice DOM is not cloned');
    assert.equal(await snapshot(page), before, 'viewing, disclosure, search, and plan navigation preserve ledger');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ checkedAt:new Date().toISOString(), screens, homeHeights, keyboardDisclosures:sections.length * sizes.length, backupSearchOpensHiddenSection:true, ledgerUnchanged:true, errors }, null, 2));
    console.log('가시성 개편: ' + screens + '개 화면·도구 검사, 접기 35회 키보드 왕복·로그인·숨긴 백업 검색·딥링크·장부 불변 통과');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
