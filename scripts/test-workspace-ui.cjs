const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tools', 'ui-review');
fs.mkdirSync(output, { recursive: true });
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'};
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  });
});

async function seed(page) {
  await page.evaluate(() => {
    const now = Date.now();
    db.records = {};
    db.settings.erdaPrice = '6999999';
    db.settings.erdaFee = 3;
    for (let i = 0; i < 17; i++) {
      const date = addDays(todayStr(), -i);
      db.records[date] = {sessions:[{
        id:'ui-fixture-' + i, kind:'hunt', runs:2.5, label:'2.5재획 테스트',
        meso:String(1978953210 + i * 100000000), extraIncome:i === 4 ? '3890000000' : '0',
        erda:330, erdaSettled:0, erdaUnitPrice:'6999999', erdaFee:3,
        erdaMesoIncluded:i % 2 === 0, charName:'검증용 캐릭터', createdAt:String(now-i*86400000),
        updatedAt:now-i*86400000, settlementSources:[]
      }]};
    }
    const week = currentWeekKey();
    const month = currentMonthKey();
    const character = normalizeChar({name:'검증용 캐릭터',server:'main',characterLevel:295,characterExpRate:'42.125',worldName:'크로아',characterClass:'제논'});
    BOSS_GROUPS.w.slice(0,7).forEach(group => {
      const boss = group.bosses.at(-1);
      character.bossWeeks[week][boss[0]] = 2;
    });
    const monthly = BOSS_GROUPS.m[0].bosses.at(-1);
    character.monthBossMonths[month][monthly[0]] = 3;
    character.expHistory = Array.from({length:7},(_,i)=>({
      date:addDays(todayStr(),i-6),level:295,exp:String(100000000000 + i*1000000000),
      expRate:36+i,updatedAt:now-(6-i)*86400000
    }));
    db.chars = [character];
    db.profits = [];
    db.expenses = [];
    save();
    renderAll();
  });
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(170);
}
async function navigate(page, name) {
  await page.evaluate(name => openPage(name), name);
  await settle(page);
}
async function recordSnapshot(page) {
  return page.evaluate(() => {
    // Read-only summaries lazily initialize empty periods; compare actual entries.
    const entries = store => Object.fromEntries(Object.entries(store || {}).filter(([,value])=>Object.keys(value).length).sort(([a],[b])=>a.localeCompare(b)));
    return JSON.stringify({records:db.records,chars:db.chars.map(c=>({
      name:c.name,bossWeeks:entries(c.bossWeeks),dropWeeks:entries(c.dropWeeks),
      dropPriceWeeks:entries(c.dropPriceWeeks),monthBossMonths:entries(c.monthBossMonths)
    })),profits:db.profits,expenses:db.expenses});
  });
}
async function overflow(page, label) {
  const offenders = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')].filter(el => {
      if (el.closest('.workspace-sidebar') && !el.closest('.workspace-sidebar.is-open') && innerWidth <= 900) return false;
      if (el.closest('.skip-link') || getComputedStyle(el).position === 'fixed') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > width + 2 || r.left < -2);
    }).slice(0,8).map(el => ({tag:el.tagName,id:el.id,class:el.className?.baseVal || el.className}));
  });
  assert.deepEqual(offenders, [], label + ' horizontal overflow: ' + JSON.stringify(offenders));
}

async function checkReadability(page, width) {
  const style = await page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    const backdrop = getComputedStyle(document.body, '::before');
    const main = document.querySelector('.workspace-main').getBoundingClientRect();
    return {
      background: backdrop.backgroundImage, display: backdrop.display,
      body: parseFloat(css('body').fontSize), nav: parseFloat(css('.tab').fontSize),
      action: parseFloat(css('.workspace-quick-actions button').fontSize),
      label: parseFloat(css('.home-summary span').fontSize),
      note: parseFloat(css('.home-summary small').fontSize),
      value: parseFloat(css('.home-summary b').fontSize),
      gutter: document.documentElement.clientWidth - main.right,
      actionsFirst: document.querySelector('.workspace-quick-actions').getBoundingClientRect().bottom < document.querySelector('.home-summary-grid').getBoundingClientRect().top
    };
  });
  assert.match(style.background, /maple-village-bg\.png/, width+' original village background');
  assert.notEqual(style.display, 'none');
  assert(style.gutter >= 8, width+' background has no visible side gutter');
  for (const [field, minimum] of Object.entries({body:15,nav:15,action:14,label:14,note:13,value:23})) {
    assert(style[field] >= minimum, width+' '+field+' too small: '+style[field]);
  }
  assert(style.actionsFirst, width+' primary actions must precede the summary');
}

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
    await context.route('**/*', route => {
      const url = route.request().url();
      return url.startsWith(origin) || url.startsWith('data:') ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await settle(page);
    await overflow(page,'empty home');
    await page.screenshot({path:path.join(output,'empty-home.png'),fullPage:true});
    await seed(page);
    await page.reload();
    await settle(page);
    const before = await recordSnapshot(page);
    for (const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      for (const name of ['home','character','daily','boss','monthlyboss','dailyboss','profit','expense','stats','intro']) {
        await navigate(page,name);
        if (name === 'home') await checkReadability(page,width);
        if (['boss','monthlyboss','dailyboss'].includes(name)) {
          if (!await page.locator('.page.active .bosslist.open').count()) {
            await page.locator('.page.active .character-disclosure').first().click();
          }
          await settle(page);
          if (width === 1440) {
            const broken = await page.evaluate(async () => {
              const images = [...document.querySelectorAll('.page.active img')];
              images.forEach(image=>{image.loading='eager';});
              await Promise.all(images.map(image => image.decode().catch(()=>{})));
              // A failed remote image is explicitly represented by the local missing-image icon.
              await new Promise(resolve=>setTimeout(resolve,100));
              await Promise.all(images.map(image => image.decode().catch(()=>{})));
              return images.filter(image=>!image.naturalWidth).map(image=>image.getAttribute('src'));
            });
            assert.deepEqual(broken,[],name+' broken images');
            assert.equal(await page.locator('.page.active .bimg[data-image-unavailable]').count(),0,name+' boss artwork must not use placeholders');
          }
        }
        await overflow(page,width+' '+name);
        if ([1440,390].includes(width) && ['home','daily','boss','stats'].includes(name)) {
          await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
          await page.screenshot({path:path.join(output,name+'-'+width+'-viewport.png')});
        }
      }
    }
    assert.equal(await recordSnapshot(page),before,'Navigation changed ledger records');
    await navigate(page,'home');
    await page.locator('.home-summary [data-open-page="stats"]').click();
    assert.equal(await page.locator('#workspace-title').textContent(),'통계','Goal shortcut must open statistics');
    await page.setViewportSize({width:390,height:844});
    await navigate(page,'boss');
    const disclosure = page.locator('.page.active .character-disclosure').first();
    await disclosure.focus();
    const expanded = await disclosure.getAttribute('aria-expanded');
    await page.keyboard.press('Enter');
    assert.notEqual(await disclosure.getAttribute('aria-expanded'),expanded,'Keyboard disclosure did not toggle');
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-mobile-page="daily"]').click();
    assert.equal(await page.locator('#workspace-title').textContent(),'재획 기록');
    assert.match(page.url(),/page=daily/);
    await page.locator('.mobile-nav [data-menu-toggle]').click();
    assert.equal(await page.locator('#workspace-sidebar').evaluate(el=>el.classList.contains('is-open')),true);
    await page.screenshot({path:path.join(output,'mobile-menu.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.workspace-main').evaluate(el=>el.inert),false);
    await page.locator('.mobile-nav [data-menu-toggle]').click();
    await page.locator('.tab[data-page=expense]').click();
    assert.equal(await page.locator('#workspace-title').textContent(),'지출 기록');
    await page.goBack();
    await settle(page);
    assert.equal(await page.locator('#workspace-title').textContent(),'재획 기록');
    await page.locator('#in-meso').fill('123456789');
    await page.locator('#in-erda').fill('12');
    await page.locator('#in-hunt-char').fill('새 기록 검증');
    await page.locator('#in-erda-include-meso').uncheck();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#btn-save').click();
    assert.equal(await page.evaluate(()=>Object.values(db.records).flatMap(r=>r.sessions).length),18);
    const saved = await recordSnapshot(page);
    await page.reload();
    await settle(page);
    assert.equal(await recordSnapshot(page),saved,'Reload lost recorded data');
    const download = page.waitForEvent('download');
    await page.locator('#workspace-backup').click();
    const backup = await download;
    const payload = JSON.parse(fs.readFileSync(await backup.path(),'utf8'));
    assert(payload.records || payload.data?.records,'Backup has no records');
    await page.setViewportSize({width:1440,height:1000});
    await navigate(page,'boss');
    if (!await page.locator('.page.active .bosslist.open').count()) {
      await page.locator('.page.active .character-disclosure').first().click();
    }
    const target = page.locator('.page.active .bcard').filter({has:page.locator('.drop-check')}).last();
    await target.locator('.drop-picker-summary').click();
    const check = target.locator('.drop-check').first();
    await check.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(()=>scrollY);
    await check.check();
    await settle(page);
    const scrollAfter = await page.evaluate(()=>scrollY);
    assert(Math.abs(scrollAfter-scrollBefore) < 100,'Drop selection moved viewport: '+scrollBefore+' -> '+scrollAfter);
    const price = page.locator('.page.active input.drop-price').last();
    await price.scrollIntoViewIfNeeded();
    await price.focus();
    const priceScroll = await page.evaluate(()=>scrollY);
    await price.fill('2345678900');
    await page.keyboard.press('Tab');
    await settle(page);
    assert(Math.abs(await page.evaluate(()=>scrollY)-priceScroll) < 100,'Price entry moved viewport');
    assert.equal(await price.inputValue(),'2,345,678,900');
    const dropsSaved = await recordSnapshot(page);
    await page.reload();
    await settle(page);
    assert.equal(await recordSnapshot(page),dropsSaved,'Reload lost boss drops');
    await page.setViewportSize({width:390,height:844});
    await page.locator('.page.active .character-disclosure').first().click();
    const mobilePrice = page.locator('.page.active input.drop-price').last();
    await mobilePrice.scrollIntoViewIfNeeded();
    await mobilePrice.focus();
    const mobileScroll = await page.evaluate(()=>scrollY);
    await mobilePrice.fill('');
    await mobilePrice.pressSequentially('2345678910');
    await settle(page);
    assert(Math.abs(await page.evaluate(()=>scrollY)-mobileScroll) < 100,'Mobile price input moved viewport');
    assert(await mobilePrice.evaluate(el=>el===document.activeElement),'Mobile price input lost focus');
    await overflow(page,'mobile expanded settlement');
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      for (const route of ['/guide/','/api/','/about/','/privacy.html']) {
        await page.goto(origin+route);
        await settle(page);
        await overflow(page,width+' '+route);
        assert.match(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage+' '+getComputedStyle(document.body,'::before').backgroundImage),/maple-village-bg\.png/,route+' original village background');
        if (route === '/guide/' && [1440,390].includes(width)) {
          await page.screenshot({path:path.join(output,'guide-'+width+'-viewport.png')});
        }
      }
    }
    assert.deepEqual(errors,[],'Browser errors');
    await context.close();
    console.log('Workspace UI: 50 app + 12 public page/viewport checks, background, readable text, shortcuts, navigation, mobile menu, hunt save, backup, boss drops and reload persistence passed.');
    console.log('Screenshots: '+output);
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{ console.error(error); server.close(); process.exitCode=1; });
