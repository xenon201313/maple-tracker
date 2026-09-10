'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const sandbox = {};
for (const name of ['localStorage','sessionStorage','fetch','XMLHttpRequest']) {
  Object.defineProperty(sandbox,name,{get(){ throw new Error('계산 모듈은 저장소·네트워크에 접근할 수 없습니다.'); }});
}
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/september-expenses.js'),'utf8'),sandbox);
const E = sandbox.MapleSeptemberExpenses;
let checks = 0;
function check(name, fn) { fn(); checks++; process.stdout.write('통과: '+name+'\n'); }

const expected = {
  advanced_ability:[['lock0','2000000'],['lock1','6000000'],['lock2','15000000']],
  meso_scroll:[['premium_acc_attack','60000000'],['premium_acc_magic','60000000'],['ear_str','100000000'],['ear_dex','100000000'],['ear_luk','100000000'],['ear_int','100000000'],['magical_one_attack','60000000'],['magical_one_magic','60000000'],['magical_two_attack','60000000'],['pet_attack','30000000'],['pet_magic','30000000'],['premium_pet_attack','60000000'],['premium_pet_magic','60000000'],['positive60','500000'],['positive100','300000000'],['pet_innocence','1000000000'],['pet_clean_slate','60000000'],['return','400000000'],['pet_return','500000000']],
  soul_amplification:[['stage1','500000000'],['stage2','1000000000'],['stage3','1750000000'],['stage4','2750000000']],
  soul_potential:[['rare','20000000'],['epic','40000000'],['unique','65000000'],['legendary','88000000']]
};
for (const [category, items] of Object.entries(expected)) for (const [id,unit] of items) {
  check(category+'/'+id+' 공식 단가 및 실제 3회 비용',()=>{
    const result=E.quote(category,id,'3');
    assert.equal(result.ok,true);
    assert.equal(result.unit,unit);
    assert.equal(result.amount,(BigInt(unit)*3n).toString());
  });
}
check('어빌리티 동시 3개는 3회, 명성치는 메소와 분리',()=>{
  for (const [id,meso,fame] of [['lock0','6000000','60000'],['lock1','18000000','90000'],['lock2','45000000','120000']]) {
    const q=E.quote('advanced_ability',id,'3');
    assert.equal(q.amount,meso);assert.equal(q.fame,fame);
  }
});
check('큰 금액은 정수 정밀도 보존',()=>assert.equal(E.quote('soul_ether','ether4','3','9007199254740993').amount,'27021597764222979'));
check('미확정 시세·할인 추정 대신 실제 입력 금액 사용',()=>{
  assert.equal(E.quote('soul_ether','ether1','2','').ok,false);
  assert.equal(E.quote('september_meso_shop','purchase','2','12,345,678').amount,'24691356');
  assert.equal(E.quote('arcane_symbol','enhance','1','7000000').amount,'7000000');
});
check('무료·음수·소수·빈 횟수·과도한 횟수는 지출로 자동 계산하지 않음',()=>{
  for (const count of ['',0,-1,'1.5','2e3','1000001','1,000']) assert.equal(E.quote('advanced_ability','lock0',count).ok,false);
  for (const unit of ['',0,-10,'1.2','10원']) assert.equal(E.quote('soul_ether','ether2','1',unit).ok,false);
  assert.equal(E.quote('unknown','lock0','1').ok,false);
});
check('9월 16/17일 신규 종류 경계와 기존 심볼 지출 날짜 보존',()=>{
  for (const category of E.categories.filter(c=>c.id!=='arcane_symbol')) {
    assert.match(E.validateRecordDate(category.id,'2026-09-16'),/2026-09-17/);
    assert.equal(E.validateRecordDate(category.id,'2026-09-17'),'');
  }
  assert.equal(E.validateRecordDate('arcane_symbol','2026-09-01'),'');
  assert.equal(E.validateRecordDate('equipment','2026-09-01'),'');
  assert.match(E.validateRecordDate('soul_potential','2026-09-31'),/날짜/);
});
check('아르고 메소샵 기간 종료 경계',()=>{
  assert.equal(E.validateRecordDate('september_meso_shop','2026-11-18'),'');
  assert.match(E.validateRecordDate('september_meso_shop','2026-11-19'),/운영 기간/);
  assert.equal(E.validateRecordDate('soul_ether','2026-11-19'),'');
});

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=http.createServer((request,response)=>{
  let name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(name.endsWith('/')) name+='index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)) return response.writeHead(403).end();
  fs.readFile(file,(error,data)=>{if(error)return response.writeHead(404).end();response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});response.end(data);});
});
const snapshot=page=>page.evaluate(()=>JSON.stringify({records:db.records,expenses:db.expenses,profits:db.profits,chars:db.chars,enhancements:db.enhancements,huntTombstones:db.huntTombstones},(_,value)=>typeof value==='bigint'?value.toString():value));
async function setMode(page,mode,item,count,unit) {
  await page.selectOption('#september-expense-mode',mode);
  await page.selectOption('#september-expense-item',item);
  await page.fill('#september-expense-count',count);
  if(unit!==undefined) await page.fill('#september-expense-unit',unit);
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
    await context.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('data:')?route.continue():route.abort());
    const page=await context.newPage(), errors=[], dialogs=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
    await page.clock.setFixedTime(new Date('2026-09-16T12:00:00+09:00'));
    await page.goto(origin+'/?page=expense');
    await page.evaluate(()=>{
      db.chars=[];
      db.expenses=[normalizeExpenseRecord({id:'keep-expense',date:'2026-09-01',category:'equipment',amount:'987654321',memo:'기존 장비 구매',createdAt:'2026-09-01T12:00:00+09:00'})];
      db.profits=[normalizeProfitRecord({id:'keep-ability',date:'2026-09-01',type:'ability',costs:[{id:'manual',price:'1234567',count:1}],outputs:[],createdAt:'2026-09-01T12:00:00+09:00'})];
      db.records=normalizeRecords({'2026-09-01':{sessions:[{id:'keep-hunt',meso:'123456789',erda:10,runs:1}]}},db.settings);
      save();renderAll();
    });
    const before=await snapshot(page);
    await page.locator('#september-expense-helper summary').click();
    await setMode(page,'advanced_ability','lock2','3');
    assert.match(await page.locator('#september-expense-result').innerText(),/45,000,000 메소.*120,000/);
    assert.match(await page.locator('#september-expense-date-note').innerText(),/2026-09-17/);
    await page.click('#september-expense-fill');
    assert.equal(await snapshot(page),before,'계산·금액 채우기가 장부를 수정했습니다.');
    assert.equal(await page.locator('#expense-amount').inputValue(),'45,000,000');
    await page.click('#expense-save');
    assert.match(dialogs.pop(),/2026-09-17/);
    assert.equal(await snapshot(page),before,'패치 전 날짜로 신규 비용을 저장했습니다.');
    await page.fill('#expense-date','2026-09-17');
    await page.click('#expense-save');
    assert.match(dialogs.pop(),/미래 날짜/);
    assert.equal(await page.locator('#expense-date').inputValue(),'2026-09-17','미래 입력일을 오늘로 바꿨습니다.');
    assert.equal(await snapshot(page),before);
    await page.fill('#expense-date','2026-09-31');
    await page.click('#expense-save');
    assert.match(dialogs.pop(),/날짜를 입력/);
    assert.equal(await snapshot(page),before);
    process.stdout.write('통과: 패치 전 계산은 장부 미반영, 과거·미래·잘못된 날짜 신규 저장 차단\n');

    await page.clock.setFixedTime(new Date('2026-09-17T12:00:00+09:00'));
    await page.fill('#expense-date','2026-09-17');
    await page.fill('#expense-memo','새로운 어빌리티 실제 3회');
    await page.click('#september-expense-fill');
    const memo=await page.locator('#expense-memo').inputValue();
    await page.click('#september-expense-fill');
    assert.equal(await page.locator('#expense-memo').inputValue(),memo,'반복 채우기가 메모를 중복시켰습니다.');
    await page.click('#expense-save');
    assert.deepEqual(await page.evaluate(()=>{const r=db.expenses[0];return {category:r.category,amount:String(r.amount),date:r.date};}),{category:'advanced_ability',amount:'45000000',date:'2026-09-17'});
    assert.match(await page.locator('#expense-records').innerText(),/새로운 어빌리티 실제 3회/);
    assert.equal(await page.evaluate(()=>db.expenses.length),2);
    assert.equal(await page.evaluate(()=>db.profits.length),1,'기존 강화 지출에 중복 반영되었습니다.');
    assert.equal(await page.evaluate(()=>db.expenses[0].memo),memo);

    for(const [mode,item,count,unit,total] of [
      ['meso_scroll','return','2',undefined,'800000000'],
      ['soul_amplification','stage3','2',undefined,'3500000000'],
      ['soul_potential','legendary','4',undefined,'352000000'],
      ['soul_ether','ether3','2','123456789','246913578'],
      ['september_meso_shop','purchase','3','100000','300000'],
      ['arcane_symbol','enhance','1','7000000','7000000']
    ]) {
      await setMode(page,mode,item,count,unit);
      const beforeFill=await snapshot(page);
      await page.click('#september-expense-fill');
      assert.equal(await snapshot(page),beforeFill);
      await page.click('#expense-save');
      assert.equal(await page.evaluate(()=>String(db.expenses[0].amount)),total);
      assert.equal(await page.evaluate(()=>db.expenses[0].category),mode);
    }
    const after=await snapshot(page);
    const existing=JSON.parse(after);
    assert.deepEqual(existing.expenses.find(record=>record.id==='keep-expense'),JSON.parse(before).expenses[0]);
    for (const name of ['records','profits','chars','enhancements','huntTombstones']) assert.deepEqual(existing[name],JSON.parse(before)[name],'신규 지출이 기존 '+name+'을 변경했습니다.');
    await page.reload();
    assert.equal(await snapshot(page),after,'새 분류/금액/메모가 새로고침 후 변했습니다.');
    await page.evaluate(()=>{
      const bundle=exportBackupBundle();
      db=trackerDbFromData(bundle,'',db.backupSnapshots);
      applyCloudSnapshot({data:exportDb(),updatedAt:Date.now()});
      save();renderAll();
    });
    assert.equal(await snapshot(page),after,'백업 및 클라우드 왕복에서 지출이나 기존 장부가 변했습니다.');
    process.stdout.write('통과: 7종 지출 명시 저장·분류·메모, 기존 장부 및 백업/클라우드 왕복 보존\n');

    await page.locator('#september-expense-helper summary').click();
    await setMode(page,'meso_scroll','premium_acc_attack','100');
    assert.match(await page.locator('#september-expense-unit-note').innerText(),/프리미엄 악세서리 공격력 주문서 100%.*60,000,000메소 × 100회/);
    const reviewDirectory=path.join(root,'.tools','ui-review');
    fs.mkdirSync(reviewDirectory,{recursive:true});
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,width+'px 화면 가로 넘침');
      const bounds=await page.locator('#september-expense-helper').evaluate(host=>[...host.querySelectorAll('input,select,button')].filter(el=>el.getBoundingClientRect().width>0).every(el=>{const r=el.getBoundingClientRect(),parent=host.getBoundingClientRect();return r.left>=parent.left&&r.right<=parent.right+1;}));
      assert.equal(bounds,true,width+'px 도우미 입력란 넘침');
      if([1440,390].includes(width)) await page.locator('#september-expense-helper').screenshot({path:path.join(reviewDirectory,'september-expenses-'+width+'.png')});
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('통과: 4개 화면 너비와 브라우저 오류 검사\n');
    await context.close();
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
  process.stdout.write('9월 신규 지출: 비용·날짜 '+checks+'건 및 UI·보존 검사 통과\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
