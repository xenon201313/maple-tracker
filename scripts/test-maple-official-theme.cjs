// 합성 장부로만 공식 홈페이지 참고 테마의 반응형·탐색·대비·보존을 검증합니다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tools', 'official-theme-20261111');
fs.mkdirSync(output, { recursive:true });
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.ttf':'font/ttf', '.woff2':'font/woff2', '.json':'application/json' };
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => error ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream' }).end(data));
});
async function settle(page) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(40); }
async function noOverflow(page, label) {
  const state = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('.page.active button,.page.active input,.page.active select,.page.active textarea,.workspace-header button,#maple-top-nav button,#maple-top-nav a')];
    return { width, scroll:document.documentElement.scrollWidth, outside:controls.filter(el => {
      if (!el.getClientRects().length) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.left < -2 || r.right > width + 2);
    }).slice(0, 8).map(el => ({ id:el.id, cls:el.className, text:el.textContent.trim().slice(0, 45) })) };
  });
  assert(state.scroll <= state.width + 2, label + ' document overflow ' + JSON.stringify(state));
  assert.deepEqual(state.outside, [], label + ' clipped controls');
}
const snapshot = page => page.evaluate(() => JSON.stringify({
  records:db.records, expenses:db.expenses, profits:db.profits, planner:db.planner,
  chars:db.chars.map(character => Object.fromEntries(Object.entries(character).map(([key, value]) => [key,
    /(Days|Weeks|Months)$/.test(key) && value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, bucket]) => !(bucket && typeof bucket === 'object' && !Array.isArray(bucket) && !Object.keys(bucket).length)))
      : value
  ])))
}));
async function contrast(page, selector) {
  const state = await page.locator(selector).first().evaluate(el => {
    const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
    const blend = (front, back) => { const alpha = front.length > 3 ? front[3] : 1; return [0, 1, 2].map(i => front[i] * alpha + back[i] * (1 - alpha)); };
    let background = [255, 255, 255];
    const chain = []; for (let parent = el; parent; parent = parent.parentElement) chain.push(parent);
    for (const parent of chain.reverse()) background = blend(rgb(getComputedStyle(parent).backgroundColor), background);
    const color = blend(rgb(getComputedStyle(el).color), background);
    const luminance = value => value.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const fg = luminance(color), bg = luminance(background);
    return { color, background, ratio:(Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05), font:getComputedStyle(el).fontFamily };
  });
  assert(state.ratio >= 4.5, selector + ' text contrast ' + JSON.stringify(state));
  return state;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless:true });
  try {
    const context = await browser.newContext({ viewport:{ width:1440, height:1000 }, timezoneId:'Asia/Seoul', reducedMotion:'reduce' });
    await fixtureDismissPatchNotes(context);
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await settle(page);
    assert.equal(await page.locator('body.maple-official-theme').count(), 1, 'the reference theme is active');
    assert.equal(await page.locator('#welcome-title').count(), 0, 'the root remains the ledger app');
    assert.equal(await page.locator('#account-choice').count(), 1, 'one account choice instance');
    await page.evaluate(() => {
      const date = todayStr(), now = Date.now();
      db.chars = [normalizeChar({ name:'공식참고테마검증캐릭터이름', server:'main', worldName:'크로아' })];
      db.records = normalizeRecords({ [date]:{ sessions:[{ id:'theme-hunt', kind:'hunt', runs:1, meso:'123456789123456789', erda:3, erdaSettled:0, erdaUnitPrice:'10000', erdaFee:3, erdaMesoIncluded:false, charName:db.chars[0].name, createdAt:now, updatedAt:now }] } }, db.settings);
      db.expenses = [{ id:'theme-expense', date, amount:'100', category:'equipment', memo:'새 테마 탐색 보존용 합성 지출', createdAt:now, updatedAt:now }];
      save(); renderAll();
    });
    const before = await snapshot(page), contrastResults = {};
    let screens = 0;
    for (const width of [320, 390, 768, 1024, 1440]) {
      const height = width < 700 ? 844 : 1000;
      await page.setViewportSize({ width, height });
      await page.evaluate(() => { openPage('home'); scrollTo(0, 0); }); await settle(page);
      assert.equal(await page.locator('#maple-top-nav').isVisible(), width > 900, width + ' desktop navigation adapts');
      const login = await page.locator('[data-desk-account]').boundingBox();
      assert(login && login.width >= 44 && login.height >= 44 && login.y >= 0 && login.y + login.height < height, width + ' visible 44px login');
      if (width <= 900) {
        await page.locator('.workspace-header [data-menu-toggle]').click();
        assert.equal(await page.locator('#workspace-sidebar').evaluate(el => el.classList.contains('is-open')), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#workspace-sidebar').evaluate(el => el.classList.contains('is-open')), false);
        contrastResults['mobile-nav-'+width] = await contrast(page, '.mobile-nav button span');
      }
      for (const name of ['home', 'character', 'daily', 'boss', 'monthlyboss', 'dailyboss', 'profit', 'expense', 'stats', 'intro']) {
        await page.evaluate(name => { openPage(name); scrollTo(0, 0); }, name); await settle(page);
        if (['boss', 'monthlyboss', 'dailyboss'].includes(name) && !await page.locator('.page.active .bosslist.open').count()) await page.locator('.page.active .character-disclosure').first().click();
        await noOverflow(page, width + ' ' + name); screens++;
        if (name==='boss' && width===1440) contrastResults['drop-picker'] = await contrast(page, '.page.active .drop-picker-summary');
        if ([390, 1440].includes(width) && ['home', 'boss', 'dailyboss', 'profit', 'expense'].includes(name)) await page.screenshot({ path:path.join(output, name + '-' + width + '.png'), fullPage:name === 'home' });
      }
      for (const tool of ['investment', 'settlement', 'budget', 'hunting', 'bossplan', 'symbol']) {
        await page.evaluate(tool => MapleLedgerPlanner.open(tool), tool); await settle(page);
        await noOverflow(page, width + ' ' + tool); screens++;
      }
    }
    await page.setViewportSize({ width:1440, height:1000 }); await page.evaluate(() => { openPage('home'); scrollTo(0, 0); }); await settle(page);
    assert.equal(await page.locator('#workspace-sidebar').isVisible(), false, 'desktop side menu is replaced by the top navigation');
    for (const selector of ['.home-head h2', '.home-overview .home-head p', '.home-summary span', '.home-summary b', '.clarity-fold>summary strong', '[data-desk-account] span', '.workspace-quick-actions button:first-child strong', '.desk-record-link span', '.weekly-progress-top b', '.site-footer-api-notice strong']) contrastResults[selector] = await contrast(page, selector);
    // 밝은 테마에서 과거 어두운 패널의 옅은 글자색이 남지 않도록 상세 화면도 확인합니다.
    for(const [name, selectors] of [
      ['character',['.api-copy b','#nexon-api-status','.api-field>span','.api-help>span','.cloud-sync-copy b','.character-api-card b']],
      ['daily',['#erda-price-result .pill b']],
      ['expense',['#enhancement-badge','#enhancement-summary span','#enhancement-summary strong','.enhancement-help>summary','.expense-summary span','.expense-summary b']],
      ['stats',['.community-stats-controls b','.community-stats-empty','.goal-title','.goal-note','.stats-period-metric.profit b']],
      ['intro',['.app-install-option b','.app-install-option p','.app-install-note']]
    ]) {
      await page.evaluate(name=>openPage(name),name);await settle(page);
      for(const selector of selectors) if(await page.locator(selector).count())contrastResults[name+' '+selector]=await contrast(page, selector);
    }
    await page.evaluate(()=>openPage('home'));await settle(page);
    const card = await page.locator('.home-overview').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(card, 'rgb(255, 255, 255)', 'white ledger panel follows the reference direction');
    const target = page.locator('#maple-top-nav [data-maple-route="daily"]').first();
    await page.evaluate(() => {
      window.themeMenuTrace=[];
      const describe=el=>el?el.tagName+'#'+el.id+'.'+String(el.className).slice(0,80):null;
      for(const type of ['focusout','focusin','click'])document.getElementById('maple-top-nav').addEventListener(type,event=>window.themeMenuTrace.push({type,target:describe(event.target),related:describe(event.relatedTarget),active:describe(document.activeElement)}));
    });
    const menu = target.locator('xpath=ancestor::details[1]');
    if (await menu.count()) {
      if (await menu.evaluate(el => el.open)) await menu.locator(':scope > summary').click();
      await menu.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
      assert.equal(await menu.evaluate(el => el.open), true, 'top navigation opens by keyboard');
    }
    await target.click();
    assert.match(page.url(), /page=daily/, JSON.stringify({ errors, state:await page.evaluate(() => ({ active:document.querySelector('.page.active')?.id, focused:document.activeElement?.tagName, trace:window.themeMenuTrace })) }));
    if (await menu.count()) assert.equal(await menu.evaluate(el => el.open), false, 'choosing a route closes the top menu');
    assert.equal(await page.locator('#page-daily').evaluate(el => el.classList.contains('active')), true);
    await page.locator('[data-desk-search]').click(); await page.locator('#desk-search-input').fill('백업');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-clarity-section="backup"]').evaluate(el => el.open), true);
    assert.equal(await page.locator('#home-backup').evaluate(el => document.activeElement === el), true);
    assert.equal(await snapshot(page), before, 'theme and navigation preserve the synthetic source ledger');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ checkedAt:new Date().toISOString(), screens, rootRemainsLedger:true, desktopTopNavigation:true, mobileDrawer:true, oneAccountChoice:true, contrastResults, sourceLedgerUnchanged:true, errors }, null, 2));
    console.log('공식 홈페이지 참고 테마: ' + screens + '개 화면·도구, 가로 메뉴/모바일 메뉴·로그인·본문 대비·큰 금액·검색/초점·원본 보존 통과');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
