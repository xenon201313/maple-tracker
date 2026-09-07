const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.tools', 'ui-review');
fs.mkdirSync(output, { recursive: true });
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  });
});
const snapshot = page => page.evaluate(() => JSON.stringify({
  profits:db.profits, expenses:db.expenses, records:db.records, enhancements:db.enhancements,
  totals:profitTotals(()=>true), direct:expenseTotals(()=>true), categories:spendingCategoryRows(()=>true)
}, (_, value) => typeof value === 'bigint' ? value.toString() : value));
async function navigate(page, name) {
  await page.evaluate(name => openPage(name), name);
  await page.evaluate(() => document.fonts.ready);
}
async function checkRows(page, label) {
  const failures = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.page.active .profit-line').forEach(row => {
      const bounds = row.getBoundingClientRect();
      if (bounds.width <= 0) return;
      for (const el of row.querySelectorAll('div,input,select,label,b,span')) {
        const rect = el.getBoundingClientRect();
        if (rect.width && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1)) {
          bad.push({item:row.dataset.profitLine, element:el.tagName, text:el.textContent.slice(0,60)});
        }
      }
      const children = [...row.children].map(el => el.getBoundingClientRect());
      for (let i=0;i<children.length;i++) for (let j=i+1;j<children.length;j++) {
        const a=children[i], b=children[j];
        if (a.left < b.right-1 && b.left < a.right-1 && a.top < b.bottom-1 && b.top < a.bottom-1) bad.push({overlap:[i,j]});
      }
    });
    return bad;
  });
  assert.deepEqual(failures, [], label + ' row overflow or overlap');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + ' page overflow');
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    const context = await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:'reduce'});
    await context.route('**/*', route => {
      const url = route.request().url();
      return url.startsWith(origin) || url.startsWith('data:') ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin + '/?page=profit');
    await page.evaluate(() => {
      db.chars = [];
      db.profits = normalizeProfitRecords(PROFIT_CATEGORIES.map((cat,i) => ({
        id:'legacy-'+cat.id, date:todayStr(), type:cat.id, title:cat.title,
        itemName:cat.id==='starforce'?'기존 판매 장비':'', expected:'200000000',
        costs:[{id:'cost',price:String(100000000+i),count:1}],
        outputs:[{id:'sale',name:'기존 판매 결과',price:'300000000',count:1,fee:3,sold:true}],
        createdAt:'2026-09-01T01:00:00Z'
      })));
      db.expenses = [normalizeExpenseRecord({id:'keep-purchase',date:todayStr(),category:'equipment',amount:'5000000'})];
      db.records = normalizeRecords({'2026-07-17':{sessions:[{id:'keep-hunt',meso:'123456789',erda:22,runs:1}]}},db.settings);
      const E=MapleEnhancements;
      const event=E.event('potential',{id:'api-fixture',character_name:'테스트',target_item:'아스트라 매그넘',date_create:todayStr()+'T10:00:00+09:00',item_level:200,potential_type:'잠재능력',before_potential_option:[{grade:'레전드리'}],after_potential_option:[{grade:'레전드리'}]},'fixture-account');
      const state=E.merge({events:[event]});
      db.enhancements=E.confirm(state,E.groups(state)[0],'45000000','keep-api');
      save();renderAll();
    });
    const before = await snapshot(page);
    assert.deepEqual(await page.locator('[data-profit-type]').evaluateAll(buttons=>buttons.map(b=>b.dataset.profitType)), ['wonderberry','royal','platinumapple']);
    assert.equal(await page.locator('#profit-records .profit-record').count(), 3);
    await navigate(page, 'expense');
    assert.equal(await page.locator('#manual-enhancement-records .profit-record').count(), 5);
    assert.match(await page.locator('#manual-enhancement-records').innerText(), /기존 판매 장비/);
    assert.match(await page.locator('#manual-enhancement-records').innerText(), /2억 9,100만/);
    assert.equal(await page.locator('#expense-records .expense-record').count(), 1);
    await navigate(page, 'stats');
    await navigate(page, 'profit');
    await page.reload();
    assert.equal(await snapshot(page), before, 'Navigation/reload modified historical data or totals');
    await page.evaluate(() => {
      const backup=exportBackupBundle();
      db=trackerDbFromData(backup,'',db.backupSnapshots);
      applyCloudSnapshot({data:exportDb(),updatedAt:Date.now()});
      save();renderAll();
    });
    assert.equal(await snapshot(page), before, 'Backup/cloud round trip changed historical sales or spending');

    const form = page.locator('#profit-calculator');
    await form.locator('[data-profit-cost-price="wonderberry"]').fill('1000000');
    await form.locator('[data-profit-cost-count="wonderberry"]').fill('10');
    await form.locator('[data-profit-out-price="wonder_black"]').fill('20000000');
    await form.locator('[data-profit-out-count="wonder_black"]').fill('2');
    assert.equal(await page.evaluate(()=>profitRecordTotals(buildProfitRecord(false)).revenue.toString()),'0');
    await form.locator('[data-profit-out-sold="wonder_black"]').check();
    assert.equal(await page.evaluate(()=>profitRecordTotals(buildProfitRecord(false)).revenue.toString()),'38800000');
    await form.locator('[data-profit-out-fee="wonder_black"]').selectOption('5');
    assert.equal(await page.evaluate(()=>profitRecordTotals(buildProfitRecord(false)).net.toString()),'28000000');
    await form.locator('[data-profit-out-count="wonder_black"]').fill('');
    await form.locator('[data-profit-out-price="wonder_black"]').fill('');
    await form.locator('[data-profit-out-sold="wonder_black"]').uncheck();
    assert.equal(await form.locator('[data-profit-out-subtotal="wonder_black"]').innerText(),'미판매','Cleared output kept stale revenue');
    await form.locator('[data-profit-cost-count="wonderberry"]').fill('');
    await form.locator('[data-profit-cost-price="wonderberry"]').fill('');
    assert.equal(await form.locator('[data-profit-cost-subtotal="wonderberry"]').innerText(),'0 메소','Cleared cost kept stale subtotal');

    await navigate(page,'expense');
    const manual=page.locator('#manual-enhancement-calculator');
    const yesterday=await page.evaluate(()=>addDays(todayStr(),-1));
    await manual.locator('[data-profit-input="date"]').fill(yesterday);
    await manual.locator('[data-profit-input="itemName"]').fill('데스티니 피스톨');
    await manual.locator('[data-profit-input="used"]').fill('123456789');
    await page.evaluate(()=>renderAll());
    assert.equal(await manual.locator('[data-profit-input="used"]').inputValue(),'123,456,789','Refresh erased draft');
    await navigate(page,'profit');
    await navigate(page,'expense');
    assert.equal(await manual.locator('[data-profit-input="date"]').inputValue(),yesterday,'Navigation erased draft');
    await page.click('#manual-enhancement-save');
    assert.deepEqual(await page.evaluate(()=>{const r=db.profits[0];return {type:r.type,date:r.date,item:r.itemName,cost:profitRecordTotals(r).cost.toString(),outputs:r.outputs};}),{type:'starforce',date:yesterday,item:'데스티니 피스톨',cost:'123456789',outputs:[]});
    for (const type of ['potential','scroll','bonus','ability']) {
      await page.selectOption('#manual-enhancement-type',type);
      if (type==='potential') await manual.locator('[data-profit-input="used"]').fill('50000000');
      else if (type==='bonus') await manual.locator('[data-profit-input="bonusCount"]').fill('3');
      else {
        await manual.locator('[data-profit-cost-price]').first().fill('2000000');
        await manual.locator('[data-profit-cost-count]').first().fill('2');
      }
      const expected=type==='potential'?'50000000':type==='bonus'?'9000000':'4000000';
      await page.click('#manual-enhancement-save');
      assert.equal(await page.evaluate(()=>profitRecordTotals(db.profits[0]).cost.toString()),expected);
      assert.equal(await page.evaluate(()=>db.profits[0].type),type);
      assert.deepEqual(await page.evaluate(()=>db.profits[0].outputs),[]);
    }
    assert.equal(await page.evaluate(()=>db.expenses.length),1,'Manual enhancement duplicated purchase records');
    await navigate(page,'profit');
    assert.equal(await page.locator('#profit-records .profit-record').count(),3,'Manual enhancement leaked into trade history');
    await form.locator('[data-profit-cost-price="wonderberry"]').fill('1000000');
    await form.locator('[data-profit-cost-count="wonderberry"]').fill('2');
    await form.locator('[data-profit-out-price="wonder_black"]').fill('20000000');
    await form.locator('[data-profit-out-count="wonder_black"]').fill('1');
    await form.locator('[data-profit-out-sold="wonder_black"]').check();
    const today=await page.evaluate(()=>todayStr());
    await page.click('#profit-save');
    assert.deepEqual(await page.evaluate(()=>{const r=db.profits[0];return {type:r.type,date:r.date,net:profitRecordTotals(r).net.toString()};}),{type:'wonderberry',date:today,net:'17400000'});
    assert.equal(await page.locator('#profit-records .profit-record').count(),4);
    const added=await page.evaluate(()=>db.profits[0].id);
    await page.click('[data-profit-delete="'+added+'"]');
    assert.equal(await page.locator('#profit-records .profit-record').count(),3);
    const afterInputs=await snapshot(page);
    await page.reload();
    assert.equal(await snapshot(page),afterInputs,'New expenses did not survive reload');
    const legacy=JSON.parse(afterInputs).profits.filter(r=>r.id.startsWith('legacy-'));
    assert.deepEqual(legacy,JSON.parse(before).profits,'Saving new expenses rewrote old records');

    for (const width of [1920,1440,1280,1024,900,768,620,390,320]) {
      await page.setViewportSize({width,height:1000});
      for (const type of ['wonderberry','royal','platinumapple']) {
        await page.click('[data-profit-type="'+type+'"]');
        await form.locator('[data-profit-out-price]').first().fill('99999999999999');
        await form.locator('[data-profit-out-count]').first().fill('99');
        await form.locator('[data-profit-out-sold]').first().check();
        await checkRows(page,width+' '+type);
        if (type==='platinumapple') assert.equal(await form.locator('.unsellable [data-profit-out-subtotal]').first().innerText(),'미반영');
        if (type==='wonderberry' && [1440,390].includes(width)) {
          await page.locator('#profit-calculator').screenshot({path:path.join(output,'wonderberry-'+width+'.png')});
        }
      }
      await navigate(page,'expense');
      for (const type of ['starforce','scroll','ability']) {
        await page.selectOption('#manual-enhancement-type',type);
        await checkRows(page,width+' manual '+type);
      }
      if(width===1440) await page.locator('#manual-enhancement-calculator').screenshot({path:path.join(output,'manual-enhancement.png')});
      await navigate(page,'profit');
      if([1440,390].includes(width)) {
        await page.evaluate(()=>scrollTo(0,0));
        await page.screenshot({path:path.join(output,'profit-page-'+width+'.png')});
      }
    }
    assert.equal(await snapshot(page),afterInputs,'Responsive rendering mutated records');
    assert.deepEqual(errors,[],'Browser errors');
    console.log('Profit/expense separation, legacy data, manual input, fees and 9 responsive widths passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
