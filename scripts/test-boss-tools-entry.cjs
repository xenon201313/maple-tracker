'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');

const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2'
};
const server = http.createServer((request, response) => {
  let route = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (route.endsWith('/')) route += 'index.html';
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return response.writeHead(404).end();
    response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'}).end(bytes);
  });
});

const snapshot = page => page.evaluate(() => JSON.stringify({
  chars: db.chars, records: db.records, expenses: db.expenses, profits: db.profits, planner: db.planner
}));

async function prepareDrop(page) {
  return page.evaluate(() => {
    const char = normalizeChar({name: '정산시험', server: 'main'});
    const week = currentWeekKey();
    const boss = BOSSES.find(row => row[3] === 'w' && dropItemsForBoss(row, week, {}).filter(item => !item.children?.length).length >= 2);
    const keys = dropItemsForBoss(boss, week, {}).filter(item => !item.children?.length).slice(0, 2).map(item => dropKey(boss, item));
    db.chars = [char];
    bossStore(char, week)[boss[0]] = 3;
    for (const key of keys) {
      dropStore(char, week)[key] = true;
      dropPriceStore(char, week)[key] = '1234567890';
    }
    dropShareStore(char, week)[keys[0]] = {fee: 5, role: 'leader', ratio: '7:3'};
    dropShareStore(char, week)[keys[1]] = {auctionFee: 3, transferFee: 0, role: 'leader', ratio: '1:1'};
    openChars.add(char.name);
    save();
    renderAll();
    return keys;
  });
}

async function checkViewport(page, dialog) {
  const bounds = await dialog.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
      width: innerWidth, height: innerHeight, scroll: el.scrollWidth, client: el.clientWidth,
      documentWidth: document.documentElement.scrollWidth
    };
  });
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1,
    'Dialog outside viewport ' + JSON.stringify(bounds));
  assert(bounds.scroll <= bounds.client + 1 && bounds.documentWidth <= bounds.width + 1,
    'Horizontal overflow ' + JSON.stringify(bounds));
  assert(await dialog.getByRole('heading', {name: /드랍 정산/}).first().isVisible());
  assert(await dialog.locator('[name=sale]').isVisible());
  assert(await dialog.locator('[name=party]').isVisible());
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    const context = await browser.newContext({timezoneId: 'Asia/Seoul', reducedMotion: 'reduce'});
    await fixtureDismissPatchNotes(context);
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/?page=home');
    const dialog = page.locator('#boss-settlement-dialog');
    const opener = '[data-open-boss-settlement]';
    for (const pageName of ['home', 'boss', 'monthlyboss', 'dailyboss']) {
      await page.evaluate(name => openPage(name), pageName);
      const entry = page.locator('#page-' + pageName).locator(opener).first();
      assert(await entry.isVisible(), 'No empty-ledger entry on ' + pageName);
      await entry.click();
      await dialog.waitFor({state: 'visible'});
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'hidden'});
      assert(await entry.evaluate(el => el === document.activeElement), pageName + ' focus restoration');
    }

    await page.evaluate(() => openPage('boss'));
    const [legacyKey, modernKey] = await prepareDrop(page);
    await page.evaluate(() => {
      // Visiting a ledger screen initializes its period buckets before the comparison.
      openPage('home');
      MapleLedgerPlanner.open('settlement');
      openPage('boss');
    });
    const baseline = await snapshot(page);
    const entryForKey = key => page.locator('.drop-settlement-fields[data-drop-key="' + key + '"]').locator(opener);
    const rowEntry = entryForKey(legacyKey);
    await rowEntry.click();
    assert.equal((await dialog.locator('[name=sale]').inputValue()).replace(/\D/g, ''), '1234567890');
    assert.equal(await dialog.locator('[name=party]').inputValue(), '3');
    const legacyNet = (await dialog.locator('[name=saleNet]').inputValue()).replace(/\D/g, '');
    assert.equal(await dialog.locator('[name=mode]').inputValue(), 'weighted');
    await dialog.locator('[name=sale]').fill('1000000000');
    await dialog.locator('[name=party]').selectOption('2');
    await dialog.locator('[data-close-boss-settlement]').click();
    assert.equal(await snapshot(page), baseline, 'Preview modified registered character or legacy drop conditions');
    await rowEntry.click();
    assert.equal((await dialog.locator('[name=sale]').inputValue()).replace(/\D/g, ''), '1234567890');
    await page.keyboard.press('Escape');
    await entryForKey(modernKey).click();
    assert.equal((await dialog.locator('[name=saleNet]').inputValue()).replace(/\D/g, ''), '1197530853', 'Current 3%');
    assert.equal(await dialog.locator('[name=mode]').inputValue(), 'equal');
    await page.keyboard.press('Escape');

    await page.evaluate(() => openPage('home'));
    const home = page.locator('#page-home').locator(opener).first();
    for (const width of [320, 390, 1440]) {
      const height = width > 1000 ? 950 : 844;
      await page.setViewportSize({width, height});
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => MapleThemeMode.setPreference(theme), theme);
        await home.click();
        await dialog.waitFor({state: 'visible'});
        await dialog.locator('[name=sale]').fill('1000000000');
        await checkViewport(page, dialog);
        if (process.env.MAPLE_BOSS_QA_SCREENSHOTS) {
          const directory = process.env.MAPLE_BOSS_QA_SCREENSHOTS;
          fs.mkdirSync(directory, {recursive: true});
          await page.screenshot({path: path.join(directory, 'boss-settlement-' + theme + '-' + width + '.png')});
        }
        await page.keyboard.press('Escape');
        await dialog.waitFor({state: 'hidden'});
      }
    }

    const search = page.locator('[data-desk-search]').first();
    await search.click();
    await page.locator('#desk-search-input').fill('보스 드랍 정산');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await dialog.waitFor({state: 'visible'});
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.keyboard.press('Escape');
    await dialog.waitFor({state: 'hidden'});
    assert(await search.evaluate(el => el === document.activeElement), 'Search launcher lost focus');
    await home.click();
    await dialog.locator('[data-settlement-ledger]').click();
    await page.waitForURL(url => url.searchParams.get('tool') === 'settlement');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await snapshot(page), baseline, 'Navigation changed synthetic ledger');
    assert.equal(legacyNet, '1172839495', 'Preserve historic 5%');

    await page.setViewportSize({width: 320, height: 844});
    await page.evaluate(() => openPage('character'));
    await page.locator('#in-character-source').selectOption('manual');
    const charName = '수기정산시험';
    await page.getByLabel('캐릭터 이름', {exact:true}).fill(charName);
    await page.getByLabel(/장부용 계정 별명/).first().fill('두번째계정');
    for (const selector of ['#in-character-source', '#in-char', '#in-character-account', '#btn-addchar']) {
      const bounds = await page.locator(selector).boundingBox();
      assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320, 'Mobile control clipped: ' + selector);
    }
    await page.locator('#btn-addchar').click();
    await page.locator('#registered-char-list .nm').filter({hasText:charName}).waitFor({state:'visible'});
    await page.evaluate(() => openPage('daily'));
    assert.equal(await page.locator('#hunt-registered-characters option[value="' + charName + '"]').count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS 홈·보스 3개 탭·검색·미정산함, 기존 드랍 보존, 화면 크기와 양쪽 테마, 모바일 외부 캐릭터 등록·재획 선택');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {console.error(error); process.exitCode = 1;});
