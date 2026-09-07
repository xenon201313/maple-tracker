const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tools', 'icon-review');
fs.mkdirSync(output, {recursive:true});
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalog = vm.runInNewContext(html.slice(html.indexOf('const DOMINATOR_PENDANT_IMG ='), html.indexOf('function bossParts(')) + ';({DROP_ITEMS,DAILY_DROP_ITEMS})');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/drops/SOURCES.json'), 'utf8'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
// Image repairs must not rename stored item keys or change box/result relationships.
assert.equal(hash(JSON.stringify(catalog, (key, value) => key === 'img' ? undefined : value)), '54d37e96003d3e15e6fa7dbf460c7859e79593ca6e8e2c1feda4c1de7557ba38');
const items = new Map();
function visit(item) {
  assert.match(item.img, /^assets\//, item.id + ' must use a bundled icon');
  if (items.has(item.id)) assert.equal(items.get(item.id).img, item.img, item.id + ' inconsistent icon');
  items.set(item.id, item);
  (item.children || []).forEach(visit);
}
Object.values(catalog).flatMap(group => Object.values(group).flat()).forEach(visit);
assert.equal(items.size, 69);
assert.equal(manifest.items.length, items.size);
for (const item of items.values()) {
  const source = manifest.items.find(entry => entry.id === item.id);
  assert.equal(source?.file, item.img, item.id + ' source manifest');
  const bytes = fs.readFileSync(path.join(root, item.img));
  assert.equal(hash(bytes), source.sha256, item.id + ' original pixels changed');
}

const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'};
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    res.end(bytes);
  });
});

async function assertImages(page, selector) {
  const broken = await page.locator(selector).evaluateAll(async images => {
    images.forEach(img => { img.loading = 'eager'; });
    await Promise.all(images.map(img => img.decode().catch(() => {})));
    await new Promise(resolve => setTimeout(resolve, 100));
    return images.filter(img => !img.naturalWidth || img.dataset.imageUnavailable || img.src.includes('image-unavailable.svg')).map(img => ({name:img.alt, src:img.getAttribute('src')}));
  });
  assert.deepEqual(broken, [], selector + ' missing/placeholder images');
}
async function snapshot(page) {
  return page.evaluate(() => {
    const entries = value => Object.fromEntries(Object.entries(value || {}).filter(([,v]) => Object.keys(v).length).sort(([a],[b]) => a.localeCompare(b)));
    return JSON.stringify({records:db.records,profits:db.profits,expenses:db.expenses,enhancements:db.enhancements,chars:db.chars.map(c => Object.fromEntries([
      'bossWeeks','dropWeeks','dropPriceWeeks','monthBossMonths','monthDropMonths','monthDropPriceMonths','dailyBossDays','dailyDropDays','dailyDropPriceDays'
    ].map(key => [key, entries(c[key])])))});
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    const icons = await page.evaluate(() => [...new Set([
      ...ITEM_ICON_LOOKUP.byId.values(),
      ...MapleEnhancements.equipment.filter(e => e[2]).map(e => 'assets/enhancements/' + e[2] + '.png'),
      'assets/profit/equipment-sprite.png'
    ])]);
    for (const src of icons) {
      assert.match(src, /^(assets\/|data:image\/)/, 'No expiring remote icons: ' + src);
      const pixels = await page.evaluate(async src => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 20) visible++;
        return visible;
      }, src);
      assert(pixels > 25, src + ' blank image');
    }
    await page.evaluate(() => {
      const week = currentWeekKey(), month = currentMonthKey(), date = todayStr();
      const c = normalizeChar({name:'아이콘 검증',server:'main',worldName:'크로아'});
      for (const [kind, scope, period] of [['w','weekly',week],['m','monthly',month]]) {
        const bosses = bossStore(c,period,scope), drops = dropStore(c,period,scope), prices = dropPriceStore(c,period,scope);
        for (const group of BOSS_GROUPS[kind]) {
          bosses[group.bosses.at(-1)[0]] = 2;
          for (const boss of group.bosses) for (const item of dropItemsForBoss(boss)) {
            const key = dropKey(boss,item); drops[key] = 1; prices[key] = '123456789';
            if (item.children?.length) { drops[key+'|child|'+item.children[0].id] = 1; prices[key+'|child|'+item.children[0].id] = '987654321'; }
          }
        }
      }
      for (const [id, list] of Object.entries(DAILY_DROP_ITEMS)) {
        dailyBossStore(c,date)[id] = 1;
        for (const item of list) { dailyDropStore(c,date)[id+'|'+item.id] = 1; dailyDropPriceStore(c,date)[id+'|'+item.id] = '77777777'; }
      }
      db.chars = [c];
      db.records = {[date]:{sessions:[{id:'preserve-hunt',kind:'hunt',runs:1,meso:'123456789',erda:30,createdAt:Date.now(),updatedAt:Date.now()}]}};
      save(); renderAll();
    });
    await page.reload();
    assert.equal(await page.evaluate(() => db.records[todayStr()].sessions[0].meso), 123456789);
    const before = await snapshot(page);
    // Render every difficulty, box result, selected chip and settlement, including locked bosses.
    const coverage = await page.evaluate(() => {
      const test = document.createElement('section'); test.id = 'icon-fixture'; test.hidden = true;
      const c = db.chars[0];
      test.innerHTML = [['w','weekly',currentWeekKey()],['m','monthly',currentMonthKey()]].map(([kind,scope,period]) =>
        BOSS_GROUPS[kind].flatMap(group => group.bosses.map(boss => dropChecklistHtml(group,boss,c,period,scope))).join('')
      ).join('') + lootCellHtml([...resolvedDropEntriesForWeek(currentWeekKey()), ...resolvedMonthlyDropEntriesForMonth(), ...resolvedDailyDropEntriesForWeek(currentWeekKey())]);
      document.body.append(test);
      return {icons:test.querySelectorAll('img').length,children:test.querySelectorAll('.drop-child-item img').length,chips:test.querySelectorAll('.drop-chip img').length};
    });
    assert(coverage.icons > 100 && coverage.children > 0 && coverage.chips > 0);
    await assertImages(page, '#icon-fixture img');
    await page.locator('#icon-fixture').evaluate(el => el.remove());
    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      for (const name of ['boss','monthlyboss','dailyboss']) {
        await page.evaluate(name => openPage(name), name);
        if (!await page.locator('.page.active .bosslist.open').count()) await page.locator('.page.active .character-disclosure').first().click();
        await page.locator('.page.active .drop-picker').evaluateAll(list => list.forEach(el => {el.open = true;}));
        await assertImages(page, '.page.active img');
        assert(await page.locator('.page.active .drops img').count() > 0, name + ' must exercise drop UI');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), name + ' overflow at ' + width);
        if ([1440,390].includes(width) && name === 'boss') {
          const card = page.locator('.page.active .bcard').filter({has:page.locator('.bname', {hasText:'찬란한 흉성'})});
          await card.locator('.drop-picker').screenshot({path:path.join(output,'star-drops-'+width+'.png')});
        }
      }
    }
    // Stale/NULL image fields in old records are resolved without mutating the record.
    const repaired = await page.evaluate(() => {
      const old = Object.freeze({id:'kalingroid',name:'카링로이드',img:'https://expired.invalid/old.png',price:'123456789'});
      const nullIcon = Object.freeze({name:'파풀라투스 마크',img:'NULL'});
      const test = document.createElement('section'); test.id = 'icon-repair';
      test.innerHTML = profitIconHtml(old) + profitIconHtml(nullIcon) + '<img id="retry-known" alt="흉성로이드" src="/expired-known.png"><img id="retry-unknown" alt="Unknown item" src="/expired-unknown.png">';
      document.body.append(test);
      return {old:JSON.stringify(old),expected:resolveItemImage(old),nullIcon:resolveItemImage(nullIcon)};
    });
    assert.match(repaired.old, /expired\.invalid/);
    assert.equal(repaired.expected, 'assets/drops/kalingroid.png');
    assert.equal(repaired.nullIcon, 'assets/drops/papulatus_mark.png');
    await page.waitForFunction(() => document.getElementById('retry-known').src.endsWith('assets/drops/starroid.png') && document.getElementById('retry-unknown').dataset.imageUnavailable === 'true');
    await assertImages(page, '#icon-repair img:not(#retry-unknown)');
    await page.locator('#icon-repair').evaluate(el => el.remove());
    assert.equal(await snapshot(page), before, 'Viewing and repairing icons changed ledger records');
    await page.reload();
    assert.equal(await snapshot(page), before, 'Reload changed existing records');
    assert.deepEqual(errors, [], 'Browser errors');

    const gallery = await context.newPage();
    await gallery.goto(origin + '/assets/drops/SOURCES.json');
    await gallery.setViewportSize({width:1100,height:1000});
    await gallery.setContent('<html lang="ko"><head><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#2e3238;color:#eee;font:14px Arial,sans-serif}main{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}figure{margin:0;min-height:100px;display:flex;align-items:center;flex-direction:column;gap:12px;text-align:center}img{width:42px;height:42px;object-fit:contain;image-rendering:pixelated}figcaption{word-break:keep-all}</style></head><body><main></main></body></html>');
    await gallery.evaluate(({items,origin}) => {
      document.querySelector('main').replaceChildren(...items.map(item => {
        const figure = document.createElement('figure'), image = new Image(), caption = document.createElement('figcaption');
        image.src = origin + '/' + item.file; image.alt = item.name; caption.textContent = item.name;
        figure.append(image, caption); return figure;
      }));
    }, {items:manifest.items,origin});
    await assertImages(gallery, 'img');
    await gallery.screenshot({path:path.join(output,'drop-icon-catalog.png'),fullPage:true});
    console.log('Item icons passed:',items.size,'drop IDs,',icons.length,'bundled icons,',coverage.icons,'rendered drop/settlement images; records unchanged.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
