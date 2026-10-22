const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {chromium}=require('playwright');
const {fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const evidence=JSON.parse(fs.readFileSync(path.join(root,'scripts/fixtures/kms-1.2.420-bosses.json'),'utf8'));
const sandbox={};
for(const file of ['september-boss-rules.js','october-boss-rules.js']) vm.runInNewContext(fs.readFileSync(path.join(root,'assets',file),'utf8'),sandbox);
const september=sandbox.MapleSeptemberBossRules,october=sandbox.MapleOctoberBossRules;
const bosses=JSON.parse(source.match(/const BOSSES = (\[[\s\S]*?\n\]);/)[1]);
const map=Object.fromEntries(bosses.map(b=>[b[0],b]));
for(const row of evidence.changedPrices){
  const boss=map[row.id];
  const price=(date,timing)=>october.crystalPrice(boss,date,timing,september.crystalPrice(boss,date,timing));
  assert.equal(price('2026-10-15'),row.old,row.name+' 이전 주차');
  assert.equal(price('2026-10-22'),row.new,row.name+' 패치 후');
  assert.equal(price('2026-10-22','before-patch'),row.old,row.name+' 점검 전 매도');
  assert.equal(price('2026-10-29','before-patch'),row.new,row.name+' 다음 주에는 선택 무시');
  assert.equal(october.canSelectSaleTiming(boss,'2026-10-22'),true);
}
for(const row of evidence.newBosses){
  assert.equal(map[row.id][2],row.crystal);
  const open=Date.parse(row.opening);
  assert(october.lockReason(map[row.id],'2026-10-22',open-1));
  assert.equal(october.lockReason(map[row.id],'2026-10-22',open),'');
  assert(october.lockReason(map[row.id],'2026-10-15',open+86400000),'과거 주차 제한');
  assert(october.lockReason(map[row.id],'2026-10-22',open+86400000,true),'API의 실제 격파 날짜가 개방 전이면 거부');
  assert.equal(october.lockReason(map[row.id],'2026-10-29',open+7*86400000),'');
}
const expiry=Date.parse('2026-10-29T00:00:00+09:00');
assert.equal(october.saleTimingUiActive('2026-10-22',expiry-1),true);
assert.equal(october.saleTimingUiActive('2026-10-22',expiry),false);
assert.equal(october.saleTimingUiActive('2026-10-15',expiry-1),false);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
  let name=new URL(req.url,'http://localhost').pathname;
  if(name.endsWith('/')) name+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.MAPLE_TEST_CHROMIUM?{executablePath:process.env.MAPLE_TEST_CHROMIUM}:{})});
    const context=await browser.newContext({timezoneId:'Asia/Seoul'});
    await fixtureDismissPatchNotes(context);
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install({time:new Date('2026-10-22T10:30:00+09:00')});
    await page.goto(origin+'/?page=boss');
    const initial=await page.evaluate(()=>{
      const c=normalizeChar({name:'10월 패치 가상 검증',server:'main',bossWeeks:{'2026-10-15':{xkali:1,hjup:3},'2026-10-22':{xkali:1,hjup:3}}});
      db.chars=[c];openChars.add(c.name);weeklyBossViewWeek='2026-10-22';renderBoss();
      return {past:JSON.stringify(c.bossWeeks['2026-10-15']),pastTotal:charSum(c,'2026-10-15').w,current:charSum(c,'2026-10-22').w};
    });
    assert.equal(initial.pastTotal,7002000000);
    assert.equal(initial.current,6640666666);
    const timing=page.locator('select.crystal-sale-timing[data-id="xkali"]');
    assert.equal(await timing.count(),1);
    await timing.selectOption('before-patch');
    assert.equal(await page.evaluate(()=>charSum(db.chars[0],'2026-10-22').w),7182666666);
    assert.equal(await page.locator('#october-crystal-sale-guidance').isVisible(),true);
    assert.equal(await page.locator('select.diff[aria-label="림보 난이도"] option[value="xlimbo"]').isDisabled(),true);
    const mapping=await page.evaluate(()=>[
      schedulerBossCandidate({content_name:'림보',difficulty:'익스트림'},'weekly')?.[0],
      schedulerBossCandidate({content_name:'발드릭스',difficulty:'EXTREME'},'weekly')?.[0],
      schedulerBossCandidate({content_name:'림보 (익스트림)'},'weekly')?.[0]
    ]);
    assert.deepEqual(mapping,['xlimbo','xbal','xlimbo']);
    await page.clock.setSystemTime(new Date('2026-10-23T18:59:59.999+09:00'));
    await page.evaluate(()=>refreshOctoberBossAvailability());
    await page.clock.runFor(1);
    const at19=await page.evaluate(()=>({limbo:canUseBoss(db.chars[0],BOSS_MAP.xlimbo,'2026-10-22'),baldrix:canUseBoss(db.chars[0],BOSS_MAP.xbal,'2026-10-22')}));
    assert.deepEqual(at19,{limbo:true,baldrix:false});
    assert.equal(await page.locator('select.diff[aria-label="림보 난이도"] option[value="xlimbo"]').isDisabled(),false,'열어 둔 화면도 개방 정각에 갱신');
    await page.clock.setFixedTime(new Date('2026-10-23T20:00:00+09:00'));
    const completion=await page.evaluate(()=>{
      const c=db.chars[0];
      c.bossWeeks['2026-10-22'].hlimbo=3;
      const collision=applySchedulerBossCompletion(c,BOSS_MAP.xlimbo,'weekly','2026-10-23');
      const added=applySchedulerBossCompletion(c,BOSS_MAP.xbal,'weekly','2026-10-23');
      const impossible=applySchedulerBossCompletion(c,BOSS_MAP.xbal,'weekly','2026-10-22');
      return {collision,added,impossible,bosses:c.bossWeeks['2026-10-22'],partyMax:bossPartyMax(BOSS_MAP.xbal),drops:DROP_ITEMS.xlimbo.map(item=>item.id)};
    });
    assert.equal(completion.collision.added,false,'이미 하드 완료한 주차를 익스트림으로 덮어쓰지 않는다');
    assert.equal(completion.added.added,true);
    assert.equal(completion.impossible.added,false);
    assert.equal(completion.bosses.hlimbo,3);
    assert.equal(completion.bosses.xbal,1);
    assert.equal(completion.partyMax,3);
    assert(completion.drops.includes('exceptional_hammer_pocket'));
    assert(completion.drops.includes('soul_ether_3'));
    await page.clock.setFixedTime(new Date('2026-10-29T00:00:00+09:00'));
    const after=await page.evaluate(()=>{
      refreshCrystalSaleTimingUi();
      return {fields:document.querySelectorAll('.crystal-sale-field').length,price:bossCrystalPrice(BOSS_MAP.xkali,'2026-10-22',db.chars[0]),timing:db.chars[0].bossCrystalPriceWeeks['2026-10-22'].xkali,past:JSON.stringify(db.chars[0].bossWeeks['2026-10-15'])};
    });
    assert.equal(after.fields,0);
    assert.equal(after.price,5387000000,'UI 종료 뒤에도 점검 전 단가 보존');
    assert.equal(after.timing,'before-patch');
    assert.equal(after.past,initial.past);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('10월 보스 검증 완료: 공식 2종 단가, 점검 전 매도·과거 보존, 개방시각, 신규 드랍, API 난이도와 중복 완료 보호, 선택 UI 종료.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
