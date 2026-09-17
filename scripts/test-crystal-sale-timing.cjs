const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sandbox={};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/september-boss-rules.js'),'utf8'),sandbox);
const rules=sandbox.MapleSeptemberBossRules;
const bosses=JSON.parse(source.match(/const BOSSES = (\[[\s\S]*?\n\]);/)[1]);
const bossMap=Object.fromEntries(bosses.map(b=>[b[0],b]));
const official=JSON.parse(fs.readFileSync(path.join(root,'scripts/fixtures/kms-1.2.419-crystals.json'),'utf8'));
const normalizeName=name=>name.replace(/선택받은 |감시자 |\s/g,'');
let weeklyCount=0;

// 기대 가격은 구현의 가격표가 아니라 별도 보관한 본서버 공지 표에서 읽습니다.
for(const row of official.rows){
  const boss=bosses.find(b=>normalizeName(b[1])===normalizeName(row.name));
  assert(boss,row.name+' 보스 없음');
  if(boss[3]==='w'){
    weeklyCount++;
    assert.equal(rules.canSelectSaleTiming(boss,'2026-09-17'),true,row.name+' 전환 주차 선택');
    assert.equal(rules.crystalPrice(boss,'2026-09-17','before-patch'),row.old,row.name+' 점검 전 단가');
    assert.equal(rules.crystalPrice(boss,'2026-09-17','after-patch'),row.new,row.name+' 점검 후 단가');
    assert.equal(rules.crystalPrice(boss,'2026-09-17'),row.new,row.name+' 기존 기본값');
    assert.equal(rules.crystalPrice(boss,'2026-09-17','invalid'),row.new,row.name+' 잘못된 선택값');
    assert.equal(rules.crystalPrice(boss,'2026-09-10','before-patch'),boss[2],row.name+' 지난 주차 원본 가격');
    assert.equal(rules.crystalPrice(boss,'2026-09-24','before-patch'),row.new,row.name+' 다음 주차 새 가격');
  }else{
    assert.equal(rules.canSelectSaleTiming(boss,'2026-09-17'),false,row.name+' 월간 제외');
    assert.equal(rules.crystalPrice(boss,'2026-09','before-patch'),boss[2]);
    assert.equal(rules.crystalPrice(boss,'2026-10','before-patch'),row.new);
  }
}
assert.equal(weeklyCount,44);
for(const period of ['','bad','2026-09','2026-09-16','2026-09-18','2026-09-24','2026-10-01']){
  assert.equal(rules.canSelectSaleTiming(bossMap.czak,period),false,period+' 전환 주차 외 선택 금지');
}
assert.equal(rules.canSelectSaleTiming(null,'2026-09-17'),false);
for(const boss of bosses.filter(b=>!Object.hasOwn(rules.weeklyPrices,b[0]))){
  assert.equal(rules.canSelectSaleTiming(boss,'2026-09-17'),false,boss[1]+' 미변경/월간 보스 제외');
}
assert.equal(rules.crystalPrice(bossMap.nbellona,'2026-09-17','before-patch'),850000000,'벨로나 점검 전 판매는 공식 구가격 사용');
assert.equal(rules.crystalPrice(bossMap.nbellona,'2026-09-10','before-patch'),890000000,'기존 벨로나 과거 장부 단가 보존');

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
  let name=new URL(req.url,'http://localhost').pathname;
  if(name.endsWith('/')) name+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{
    if(error) return res.writeHead(404).end();
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);
  });
});
const timing=(page,id)=>page.locator('#charlist .card[data-char-name="판매 시점 검증"] select.crystal-sale-timing[data-id="'+id+'"]');
const card=(page,id)=>page.locator('#charlist .card[data-char-name="판매 시점 검증"] .bcard').filter({has:page.locator('input.boss-check[data-id="'+id+'"]')});
const ledgerSnapshot=page=>page.evaluate(()=>JSON.stringify({
  records:db.records,expenses:db.expenses,profits:db.profits,enhancements:db.enhancements,
  past:db.chars.map(c=>({bosses:c.bossWeeks['2026-09-10'],drops:c.dropWeeks['2026-09-10'],prices:c.dropPriceWeeks['2026-09-10'],shares:c.dropShareWeeks['2026-09-10']}))
},(_,value)=>typeof value==='bigint'?value.toString():value));
const saleSnapshot=page=>page.evaluate(()=>JSON.stringify(db.chars.map(c=>({name:c.name,selection:c.bossCrystalPriceWeeks,bosses:c.bossWeeks,total:charSum(c,'2026-09-17').w}))));

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({timezoneId:'Asia/Seoul',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      return url.origin===origin || url.protocol==='data:' ? route.continue() : route.abort();
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.clock.setFixedTime(new Date('2026-09-17T12:00:00+09:00'));
    await page.goto(origin+'/?page=boss');
    const info=await page.evaluate(()=>{
      const c=normalizeChar({name:'판매 시점 검증',server:'main',worldName:'크로아',
        bossWeeks:{'2026-09-10':{czak:3,nsu:2,nbellona:1},'2026-09-17':{czak:3,nsu:2}},
        monthBossMonths:{'2026-09':{hblack:1},'2026-10':{hblack:1}}});
      const second=normalizeChar({name:'캐릭터 독립 검증',server:'main',worldName:'크로아',bossWeeks:{'2026-09-17':{czak:1}}});
      const item=dropItemsForBoss(BOSS_MAP.hsu).find(item=>!item.availableFrom);
      const key=dropKey(BOSS_MAP.hsu,item);
      c.dropWeeks['2026-09-10']={[key]:true};
      c.dropPriceWeeks['2026-09-10']={[key]:'123456789'};
      c.dropShareWeeks['2026-09-10']={[key]:{role:'leader',fee:3,ratio:'1:2',party:3}};
      c.dropWeeks['2026-09-17']={[key]:true};
      c.dropPriceWeeks['2026-09-17']={[key]:'7654321'};
      db.chars=[c,second];
      db.records=normalizeRecords({'2026-09-10':{sessions:[{id:'sale-test-hunt',runs:1,meso:'23456789',erda:3}]}},db.settings);
      db.expenses=[normalizeExpenseRecord({id:'sale-test-expense',date:'2026-09-10',category:'equipment',amount:'987654321',memo:'보존할 지출'})];
      openChars.add(c.name);openChars.add(second.name);weeklyBossViewWeek='2026-09-17';
      save();renderBoss();
      return {groupNames:['czak','nsu'].map(id=>BOSS_GROUPS.w.find(g=>g.bosses.some(b=>b[0]===id)).name),dropSnapshot:JSON.stringify({drops:c.dropWeeks,prices:c.dropPriceWeeks,shares:c.dropShareWeeks})};
    });
    const originalLedger=await ledgerSnapshot(page);
    assert.equal(await timing(page,'czak').inputValue(),'after-patch','기존 기록은 기본 점검 후 유지');
    assert.equal(await timing(page,'nsu').inputValue(),'after-patch');
    assert.equal(await timing(page,'czak').getAttribute('aria-label'),info.groupNames[0]+' 결정석 판매 시점');
    assert.equal(await timing(page,'nsu').getAttribute('aria-label'),info.groupNames[1]+' 결정석 판매 시점');
    assert.equal(await page.locator('#charlist select.crystal-sale-timing').count(),3,'미체크 보스에는 시점 입력란 없음');
    const options=await timing(page,'czak').locator('option').allTextContents();
    assert(options.some(text=>/점검 전/.test(text)) && options.some(text=>/점검 후/.test(text)),'점검 전후를 사용자가 구별할 수 있어야 합니다.');
    assert.equal(await page.evaluate(()=>charSum(db.chars[0],'2026-09-17').w),5521666,'기본 자쿰 3인 + 스우 2인');
    await timing(page,'czak').selectOption('before-patch');
    assert.equal(await page.evaluate(()=>charSum(db.chars[0],'2026-09-17').w),6868333,'점검 전 자쿰 3인 + 점검 후 스우 2인');
    assert.equal(await page.evaluate(()=>bossTotals('2026-09-17').crystalWeek),10908333,'두 캐릭터 합계 반영');
    assert.match(await card(page,'czak').locator('.bprice').innerText(),/808만/);
    assert.match(await card(page,'czak').locator('.bshare').innerText(),/269만/);
    assert.equal(await page.evaluate(()=>charSum(db.chars[1],'2026-09-17').w),4040000,'다른 캐릭터 선택 독립');
    await timing(page,'nsu').selectOption('before-patch');
    assert.equal(await page.evaluate(()=>charSum(db.chars[0],'2026-09-17').w),11043333,'두 보스 점검 전 파티 배분');
    await card(page,'nsu').locator('select.party').selectOption('1');
    assert.equal(await page.evaluate(()=>charSum(db.chars[0],'2026-09-17').w),19393333,'판매 시점 선택 후 파티 인원 변경');
    await card(page,'nsu').locator('select.party').selectOption('2');
    await timing(page,'nsu').selectOption('after-patch');
    assert.equal(await page.evaluate(()=>charSum(db.chars[0],'2026-09-17').w),6868333,'점검 후 되돌리기');
    assert.equal(await ledgerSnapshot(page),originalLedger,'판매 시점 변경이 기존 장부/과거 드랍을 수정했습니다.');
    assert.equal(await page.evaluate(()=>JSON.stringify({drops:db.chars[0].dropWeeks,prices:db.chars[0].dropPriceWeeks})),await page.evaluate(snapshot=>{const data=JSON.parse(snapshot);return JSON.stringify({drops:data.drops,prices:data.prices});},info.dropSnapshot),'판매 시점 및 파티 변경이 드랍 체크/금액을 수정했습니다.');

    // 체크 취소는 판매 시점 기록을 지우지 않고 다시 체크하면 복구합니다.
    await card(page,'czak').locator('input.boss-check').uncheck();
    assert.equal(await timing(page,'czak').count(),0);
    await card(page,'czak').locator('input.boss-check').check();
    assert.equal(await timing(page,'czak').inputValue(),'before-patch');
    assert.equal(await page.evaluate(()=>charSum(db.chars[0],'2026-09-17').w),6868333);

    // 체크한 보스의 난이도를 바꿔도 판매 시점 의도가 유지되어야 합니다.
    await timing(page,'nsu').selectOption('before-patch');
    await card(page,'nsu').locator('select.diff').selectOption('hsu');
    assert.equal(await timing(page,'hsu').inputValue(),'before-patch');
    assert.equal(await page.evaluate(()=>bossCrystalPrice(BOSS_MAP.hsu,'2026-09-17',db.chars[0])),51500000);
    await card(page,'hsu').locator('select.diff').selectOption('nsu');
    assert.equal(await timing(page,'nsu').inputValue(),'before-patch');
    await timing(page,'nsu').selectOption('after-patch');
    const scheduler=await page.evaluate(()=>{
      const c=db.chars[0],before=JSON.stringify(c.bossCrystalPriceWeeks);
      applySchedulerBossCompletion(c,BOSS_MAP.czak,'weekly','2026-09-17');
      applySchedulerData(c,{date:'2026-09-17',boss_contents:[]});
      return {preserved:before===JSON.stringify(c.bossCrystalPriceWeeks),value:bossCrystalPrice(BOSS_MAP.czak,'2026-09-17',c)};
    });
    assert(scheduler.preserved,'API 갱신이 사용자의 판매 시점을 지웠습니다.');
    assert.equal(scheduler.value,8080000);

    // localStorage, JSON 백업, 클라우드 데이터 경로는 모두 합성 데이터만 사용합니다.
    await page.evaluate(()=>save());
    const storedSales=await saleSnapshot(page);
    await page.reload();
    assert.equal(await saleSnapshot(page),storedSales,'새로고침 후 판매 시점/수익 변경');
    await page.evaluate(()=>{
      const bundle=JSON.parse(JSON.stringify(exportBackupBundle()));
      db=trackerDbFromData(bundle,'',db.backupSnapshots);
      applyCloudSnapshot({data:JSON.parse(JSON.stringify(exportDb())),updatedAt:Date.now()});
      save();openChars.add(db.chars[0].name);weeklyBossViewWeek='2026-09-17';renderBoss();
    });
    assert.equal(await saleSnapshot(page),storedSales,'JSON 백업/클라우드 왕복에서 판매 시점/수익 변경');
    assert.equal(await ledgerSnapshot(page),originalLedger,'백업/클라우드 왕복에서 과거 장부 변경');

    const boundaries=await page.evaluate(()=>{
      const c=db.chars[0],group=BOSS_GROUPS.w.find(g=>g.bosses.some(b=>b[0]==='czak'));
      const old=charSum(c,'2026-09-10').w;
      c.bossWeeks['2026-09-24']={czak:2};
      c.bossCrystalPriceWeeks['2026-09-24']={czak:'before-patch'};
      c.bossCrystalPriceWeeks['2026-09-10']={czak:'before-patch'};
      return {old,oldAgain:charSum(c,'2026-09-10').w,next:charSum(c,'2026-09-24').w,
        oldCard:bossGroupCard(group,c,'2026-09-10'),nextCard:bossGroupCard(group,c,'2026-09-24'),
        monthly:monthlyCharSum(c,'2026-09').m,october:monthlyCharSum(c,'2026-10').m,
        monthlyCard:bossGroupCard(BOSS_GROUPS.m[0],c,'2026-09','monthly')};
    });
    assert.equal(boundaries.old,901043333,'지난주 원본 단가/파티 수익');
    assert.equal(boundaries.oldAgain,boundaries.old);
    assert.equal(boundaries.next,2020000,'다음주에 점검 전 값이 남아 있어도 새 가격 적용');
    assert.equal(boundaries.monthly,665000000);
    assert.equal(boundaries.october,465000000);
    for(const html of [boundaries.oldCard,boundaries.nextCard,boundaries.monthlyCard]) assert(!html.includes('class="crystal-sale-timing"'),'다른 주차/월간에 선택 UI가 노출되었습니다.');

    const reviewDirectory=path.join(root,'.tools','ui-review');
    fs.mkdirSync(reviewDirectory,{recursive:true});
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,width+'px 화면 가로 넘침');
      const bounds=await page.locator('#charlist select.crystal-sale-timing:visible').evaluateAll(elements=>elements.length>0&&elements.every(el=>{
        const r=el.getBoundingClientRect(),p=el.closest('.bcard').getBoundingClientRect();
        return r.width>0&&r.left>=p.left&&r.right<=p.right+1;
      }));
      assert.equal(bounds,true,width+'px 판매 시점 입력란 넘침');
      await card(page,'czak').screenshot({path:path.join(reviewDirectory,'crystal-sale-timing-'+width+'.png')});
    }

    // 다음주 복사는 보스와 파티만 복사하며 점검 전 판매 선택을 전달하지 않습니다.
    await page.clock.setFixedTime(new Date('2026-09-24T12:00:00+09:00'));
    const copied=await page.evaluate(()=>{
      const c=db.chars[0],before=JSON.stringify(c.bossCrystalPriceWeeks['2026-09-17']);
      c.bossWeeks['2026-09-24']={};delete c.bossCrystalPriceWeeks['2026-09-24'];
      const count=copyPreviousWeeklyBosses(c);
      return {count,selection:c.bossCrystalPriceWeeks['2026-09-24']||{},old:JSON.stringify(c.bossCrystalPriceWeeks['2026-09-17']),before,total:charSum(c,'2026-09-24').w};
    });
    assert.equal(copied.count,2);
    assert.deepEqual(copied.selection,{});
    assert.equal(copied.old,copied.before,'지난주 원본 판매 시점 변경');
    assert.equal(copied.total,5521666);
    assert.deepEqual(errors,[],'브라우저 오류');
    await context.close();
    console.log('결정석 판매 시점 검증 완료: 공식 44종 점검 전후 단가, 캐릭터/보스별 선택·파티·합계, 체크/난이도 변경, API 갱신, 저장/JSON/클라우드 왕복, 과거 장부·드랍 보존, 주차·월간 경계, 지난주 복사, 3개 화면 너비.');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
