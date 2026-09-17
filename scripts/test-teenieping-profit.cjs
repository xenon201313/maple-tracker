const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/teenieping-profit.js'), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const catalog = sandbox.MapleTeeniepingProfit;
const start = Date.parse('2026-09-17T00:00:00+09:00');
const end = Date.parse('2026-10-22T00:00:00+09:00');
assert.equal(catalog.startsAt, '2026-09-17T00:00:00+09:00');
assert.equal(catalog.endsAt, '2026-10-22T00:00:00+09:00');
for (const [at, expected] of [[start-1,false],[start,true],[end-1,true],[end,false],[end+86400000,false]]) {
  assert.equal(catalog.isActive(at), expected, '한국 시간 판매 기간 경계 '+new Date(at).toISOString());
}
assert.deepEqual(Array.from(catalog.products, p=>p.id), ['goods','luna-sweet','luna-dream']);
assert.deepEqual(Array.from(catalog.products, p=>p.outputs.length), [19,13,13], '공식 상품별 결과물 수');
const ids = new Set();
const regions = [];
for (const product of catalog.products) {
  assert.equal(catalog.product(product.id).id, product.id);
  assert(product.title.trim(), '상품명은 비어 있지 않아야 합니다.');
  if (product.id !== 'goods') {
    assert.equal(product.costs.filter(c=>!c.optional).length, 3, '루나 합성의 크리스탈·베이스·재료 비용');
    assert.equal(product.costs.filter(c=>c.optional).length, 3, '루나 장비 선택 비용');
  }
  for (const item of [...product.costs,...product.outputs]) {
    assert(item.id && item.name && item.img, product.id+' 품목 ID·이름·아이콘');
    assert(!['luna_sweet','luna_dream','luna_petite','wonder_black'].includes(item.id), '기존 펫 등급 아이콘과 식별자가 충돌하면 안 됩니다.');
    const relative = item.img.split('?')[0];
    assert(relative.startsWith('assets/'), '아이콘은 자체 호스팅된 파일이어야 합니다: '+item.img);
    assert(fs.existsSync(path.join(root,relative)), '아이콘 파일 누락: '+relative);
    ids.add(relative);
    const region=catalog.iconRegion(item);
    if (region) {
      assert(region.w>0 && region.h>0 && region.x>=0 && region.y>=0, item.name+' 원본 아이콘 영역');
      assert(region.x+region.w<=region.width && region.y+region.h<=region.height, item.name+' 원본 이미지 경계를 벗어난 좌표');
      assert(fs.existsSync(path.join(root,region.img)),item.name+' 원본 이미지 누락');
      ids.add(region.img);
      regions.push({name:item.name,...region});
    }
  }
}

const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server = http.createServer((req,res)=>{
  let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root,'.'+name);
  if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{
    if (error) return res.writeHead(404).end();
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);
  });
});
const snapshot = page=>page.evaluate(()=>JSON.stringify({
  records:db.records, chars:db.chars, profits:db.profits, expenses:db.expenses,
  enhancements:db.enhancements, snapshots:db.backupSnapshots,
  totals:profitTotals(()=>true), spending:spendingCategoryRows(()=>true)
},(_,value)=>typeof value==='bigint'?value.toString():value));
const localSnapshot = page=>page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))));
async function contextFor(browser,origin,timezoneId='Asia/Seoul') {
  const context = await browser.newContext({timezoneId,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const url = route.request().url();
    return url.startsWith(origin+'/') || url.startsWith('data:') ? route.continue() : route.abort();
  });
  return context;
}
async function selectProduct(page,id) {
  await page.locator('[data-profit-type="teenieping"]').click();
  await page.locator('#teenieping-product').selectOption(id);
}
async function checkRows(page,label) {
  const issues = await page.evaluate(()=>{
    const failures = [];
    for (const row of document.querySelectorAll('#profit-calculator .profit-line')) {
      const box=row.getBoundingClientRect();
      if (box.width<=0 || box.height<=0) continue;
      for (const child of row.querySelectorAll('div,input,select,label,b,span')) {
        const rect=child.getBoundingClientRect();
        if (rect.width && (rect.left<box.left-1 || rect.right>box.right+1 || rect.bottom>box.bottom+1)) {
          failures.push({id:row.dataset.profitLine,tag:child.tagName,text:child.textContent.slice(0,50)});
        }
      }
    }
    return failures;
  });
  assert.deepEqual(issues,[],label+' 행 넘침');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' 페이지 가로 넘침');
}
async function exerciseProducts(browser,origin) {
  const context=await contextFor(browser,origin),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  try {
    await page.clock.setFixedTime(new Date('2026-09-18T12:00:00+09:00'));
    await page.goto(origin+'/?page=profit');
    await page.evaluate(()=>{
      db.chars=[];
      db.records=normalizeRecords({'2026-09-01':{sessions:[{id:'keep-hunt',meso:'123456789',erda:12,runs:1}]}},db.settings);
      db.profits=normalizeProfitRecords([
        {id:'keep-royal',date:'2026-09-01',type:'royal',title:'기존 로얄',costs:[{id:'old-cost',price:'5000000',count:2}],outputs:[{id:'old-sale',price:'20000000',count:1,fee:3,sold:true}]},
        {id:'keep-starforce',date:'2026-09-01',type:'starforce',title:'기존 강화',costs:[{id:'used',price:'7777777',count:1}],outputs:[]}
      ]);
      db.expenses=[normalizeExpenseRecord({id:'keep-expense',date:'2026-09-01',category:'equipment',amount:'9876543'})];
      save();renderAll();
    });
    const before=JSON.parse(await snapshot(page));
    assert.deepEqual(await page.locator('[data-profit-type]').evaluateAll(nodes=>nodes.map(n=>n.dataset.profitType)),['wonderberry','royal','platinumapple','teenieping']);
    const decoded=await page.evaluate(async paths=>Promise.all(paths.map(src=>new Promise(resolve=>{
      const img=new Image();img.onload=()=>resolve({src,width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>resolve({src,width:0,height:0});img.src=src;
    }))),Array.from(ids));
    for (const image of decoded) assert(image.width>0 && image.height>0,'품목 원본 이미지 디코딩: '+image.src);
    for (const region of regions) {
      const image=decoded.find(image=>image.src===region.img);
      assert.equal(image.width,region.width,region.name+' 원본 이미지 너비와 영역 메타데이터 일치');
      assert.equal(image.height,region.height,region.name+' 원본 이미지 높이와 영역 메타데이터 일치');
    }

    for (const product of catalog.products) {
      await selectProduct(page,product.id);
      const form=page.locator('#profit-calculator');
      assert.equal(await form.locator('[data-profit-out-count]').count(),product.outputs.length,product.id+' 결과물 노출');
      for (const item of [...product.costs,...product.outputs]) {
        if (!catalog.iconRegion(item)) continue;
        const icon=form.locator('[data-profit-line="'+item.id+'"] .teenieping-atlas-icon');
        assert.equal(await icon.count(),1,item.name+' CSS 아이콘 렌더');
        assert.equal(await icon.getAttribute('role'),'img',item.name+' 이미지 접근성 역할');
        assert.equal(await icon.getAttribute('aria-label'),item.name,item.name+' 이미지 접근성 이름');
        assert.notEqual(await icon.evaluate(node=>getComputedStyle(node).backgroundImage),'none',item.name+' 배경 이미지 연결');
      }
      if (product.id!=='goods') assert.equal(await form.locator('details[open]').count(),0,'선택 장비 비용은 처음에 접혀 있어야 합니다.');
      const cost=product.costs.find(c=>!c.optional),out=product.outputs.find(o=>o.sellable!==false);
      await form.locator('[data-profit-cost-price="'+cost.id+'"]').fill('10000000');
      await form.locator('[data-profit-cost-count="'+cost.id+'"]').fill('3');
      await form.locator('[data-profit-out-price="'+out.id+'"]').fill('100000000');
      await form.locator('[data-profit-out-count="'+out.id+'"]').fill('2');
      assert.equal(await page.evaluate(()=>profitRecordTotals(buildProfitRecord(false)).revenue.toString()),'0','미판매는 수익으로 반영하지 않습니다.');
      await form.locator('[data-profit-out-sold="'+out.id+'"]').check();
      assert.equal(await page.evaluate(()=>profitRecordTotals(buildProfitRecord(false)).net.toString()),'164000000','수수료 3% 후 손익');
      await form.locator('[data-profit-out-fee="'+out.id+'"]').selectOption('5');
      assert.equal(await page.evaluate(()=>profitRecordTotals(buildProfitRecord(false)).net.toString()),'160000000','수수료 5% 후 손익');
      const next=catalog.products.find(p=>p.id!==product.id).id;
      await form.locator('#teenieping-product').selectOption(next);
      await page.locator('#teenieping-product').selectOption(product.id);
      assert.equal(await form.locator('[data-profit-cost-price="'+cost.id+'"]').inputValue(),'10,000,000',product.id+' 상품 전환 시 비용 초안 보존');
      assert.equal(await form.locator('[data-profit-out-fee="'+out.id+'"]').inputValue(),'5',product.id+' 상품 전환 시 수수료 초안 보존');
      assert.equal(await form.locator('[data-profit-out-sold="'+out.id+'"]').isChecked(),true,product.id+' 상품 전환 시 판매 선택 보존');
      for (const width of [1440,390,320]) {
        await page.setViewportSize({width,height:1000});
        await form.locator('details').evaluateAll(nodes=>nodes.forEach(n=>{n.open=true;}));
        await checkRows(page,width+' '+product.id);
        if (process.env.TEENIEPING_UI_OUTPUT && [1440,390].includes(width)) {
          fs.mkdirSync(process.env.TEENIEPING_UI_OUTPUT,{recursive:true});
          await form.screenshot({path:path.join(process.env.TEENIEPING_UI_OUTPUT,'ui-'+product.id+'-'+width+'.png')});
        }
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('#profit-save').click();
      assert.deepEqual(await page.evaluate(()=>{const r=db.profits[0];return {type:r.type,itemId:r.itemId,itemName:r.itemName,net:profitRecordTotals(r).net.toString()};}),{type:'teenieping',itemId:product.id,itemName:product.title,net:'160000000'},product.id+' 저장 결과');
      await selectProduct(page,product.id);
      assert.equal(await form.locator('[data-profit-cost-price="'+cost.id+'"]').inputValue(),'','저장 후 해당 상품 초안 초기화');
      assert.equal(await form.locator('[data-profit-out-sold="'+out.id+'"]').isChecked(),false,'저장 후 판매 체크 초기화');
    }
    const after=JSON.parse(await snapshot(page));
    for (const key of ['records','chars','expenses','enhancements']) assert.deepEqual(after[key],before[key],key+' 기존 장부 불변');
    assert.deepEqual(after.profits.filter(r=>r.id.startsWith('keep-')),before.profits,'기존 손익 기록 불변');
    assert.equal(after.profits.filter(r=>r.type==='teenieping').length,3,'상품 세 종류 독립 저장');
    assert.equal(after.spending.find(row=>row.id==='teenieping').calculator,'90000000','새 비용은 콜라보 지출 분류에 한 번씩만 반영');
    const beforeReload=await snapshot(page);
    await page.reload();
    assert.equal(await snapshot(page),beforeReload,'새로고침 데이터 보존');
    await page.evaluate(()=>{
      const bundle=JSON.parse(JSON.stringify(exportBackupBundle()));
      db=trackerDbFromData(bundle,'',db.backupSnapshots);
      applyCloudSnapshot({data:JSON.parse(JSON.stringify(exportDb())),updatedAt:Date.now()});
      renderAll();
    });
    assert.equal(await snapshot(page),beforeReload,'백업·클라우드 왕복 시 상품·손익·과거 데이터 보존');
    assert.deepEqual(errors,[],'상품 UI 브라우저 오류');
  } finally { await context.close(); }
}
async function exerciseExpiry(browser,origin,timezoneId) {
  const context=await contextFor(browser,origin,timezoneId),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.clock.install({time:new Date(end-60000)});
    await page.clock.pauseAt(new Date(end-1));
    await page.goto(origin+'/?page=profit');
    await page.evaluate(()=>{
      db.chars=[];
      db.profits=normalizeProfitRecords([{id:'keep-teenieping',date:'2026-09-18',type:'teenieping',title:'프린세스 하츄핑',itemId:'goods',itemName:'하츄핑 굿즈',costs:[{id:'test-cost',name:'굿즈',price:'10000000',count:3}],outputs:[{id:'test-sale',name:'판매 결과',price:'100000000',count:2,fee:3,sold:true}]}]);
      db.expenses=[normalizeExpenseRecord({id:'keep-expiry-expense',date:'2026-09-18',category:'equipment',amount:'54321'})];
      save();renderAll();
    });
    await selectProduct(page,'goods');
    assert.equal(await page.locator('#profit-calculator [data-profit-input="date"]').inputValue(),'2026-10-21',timezoneId+' 종료 직전 입력 기본 날짜는 한국 시간 기준');
    const goodsCost=catalog.product('goods').costs.find(cost=>!cost.optional);
    await page.locator('[data-profit-cost-count="'+goodsCost.id+'"]').fill('1');
    assert.equal(await page.evaluate(()=>buildProfitRecord(false)?.date),'2026-10-21',timezoneId+' 종료 직전 한국 날짜를 미래 날짜로 거부하면 안 됩니다.');
    const before=await snapshot(page),storage=await localSnapshot(page);
    const assertExpired=async label=>{
      assert.equal(await page.locator('[data-profit-type="teenieping"]').count(),0,timezoneId+' '+label+' 카테고리 숨김');
      assert.equal(await page.locator('#teenieping-product').count(),0,timezoneId+' '+label+' 신규 입력 숨김');
      assert.equal(await page.evaluate(()=>profitState.active),'wonderberry',timezoneId+' '+label+' 기본 계산기로 전환');
      assert.equal(await page.locator('#profit-records .profit-record').count(),1,timezoneId+' '+label+' 저장 기록 노출');
      assert.equal(await snapshot(page),before,timezoneId+' '+label+' 과거 기록·통계·복구 데이터 보존');
      assert.equal(await localSnapshot(page),storage,timezoneId+' '+label+' UI 만료가 localStorage를 쓰지 않음');
    };
    await page.clock.runFor(1);
    await assertExpired('열린 탭 정각');
    await page.reload();
    await assertExpired('종료 후 새로고침');
    for (const eventName of ['pageshow','focus','visibilitychange']) {
      await page.clock.setSystemTime(new Date(end-1));
      await page.reload();
      await selectProduct(page,'goods');
      await page.clock.setSystemTime(new Date(end));
      await page.evaluate(name=>(name==='visibilitychange'?document:window).dispatchEvent(new Event(name)),eventName);
      await assertExpired(eventName+' 복귀');
    }
    await page.evaluate(()=>{
      const bundle=JSON.parse(JSON.stringify(exportBackupBundle()));
      db=trackerDbFromData(bundle,'',db.backupSnapshots);
      applyCloudSnapshot({data:JSON.parse(JSON.stringify(exportDb())),updatedAt:Date.now()});
      renderAll();
    });
    assert.equal(await snapshot(page),before,timezoneId+' 종료 후 백업·클라우드 복원');
    assert.equal(await page.locator('[data-profit-type="teenieping"]').count(),0,timezoneId+' 복원 후 숨김 유지');
    assert.deepEqual(errors,[],timezoneId+' 만료 경계 브라우저 오류');
  } finally { await context.close(); }
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    await exerciseProducts(browser,origin);
    for (const timezoneId of ['Asia/Seoul','UTC','America/Los_Angeles']) await exerciseExpiry(browser,origin,timezoneId);
    console.log('하츄핑: 품목·아이콘·3종 손익·초안·반응형·3개 시간대 만료·장부/백업/클라우드 보존 검증 통과.');
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
