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

// 원본 단가를 보존한 채 주간·월간 시행 경계와 표에 없는 보스의 단가를 확인합니다.
assert.equal(Object.keys(rules.weeklyPrices).length,44);
assert.equal(Object.keys(rules.monthlyPrices).length,2);
for(const boss of bosses){
  assert.equal(rules.crystalPrice(boss,'2026-09-10'),boss[2],boss[1]+'의 과거 주간 단가');
  const expected=boss[3]==='m' ? boss[2] : (rules.weeklyPrices[boss[0]] ?? boss[2]);
  assert.equal(rules.crystalPrice(boss,'2026-09-17'),expected,boss[1]+'의 9월 17일 단가');
}
for(const id of Object.keys(rules.weeklyPrices)) assert(bossMap[id],'기존 보스에 없는 가격 ID: '+id);
assert.equal(rules.crystalPrice(bossMap.cpier,'2026-09-17'),4080000,'피에르의 공식 새 단가를 임의 반올림하면 안 됩니다.');
assert.equal(rules.crystalPrice(bossMap.njhil,'2026-09-17'),67600000);
assert.equal(rules.crystalPrice(bossMap.hblack,'2026-09-30'),665000000);
assert.equal(rules.crystalPrice(bossMap.hblack,'2026-10'),465000000);
assert.equal(rules.crystalPrice(bossMap.xblack,'2026-10-01'),5680000000);
assert.equal(rules.weeklyLimit('2026-09-16'),12);
assert.equal(rules.weeklyLimit('2026-09-17'),Infinity);
assert.equal(rules.challengerEnded('2026-09-16'),false);
assert.equal(rules.challengerEnded('2026-09-17'),true);

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf'};
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

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    for(const date of ['2026-09-16','2026-09-17','2026-10-01']){
      const context=await browser.newContext({timezoneId:'Asia/Seoul',viewport:{width:1280,height:900}});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        return url.origin===origin || url.protocol==='data:' ? route.continue() : route.abort();
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      await page.clock.install({time:new Date(date+'T12:00:00+09:00')});
      await page.goto(origin+'/?page=boss');
      const results=await page.evaluate(date=>{
        const c=normalizeChar({name:'패치 경계 검증',server:'challenger',worldName:'챌린저스4',
          bossWeeks:{'2026-09-10':{czak:1,nmeirin:1}},
          monthBossMonths:{'2026-09':{hblack:1},'2026-10':{hblack:1}},
          monthBossClearWeeks:{'2026-09':{hblack:'2026-09-10'},'2026-10':{hblack:'2026-10-01'}}});
        const item=dropItemsForBoss(BOSS_MAP.nmeirin)[0];
        const key=dropKey(BOSS_MAP.nmeirin,item);
        c.dropWeeks['2026-09-10']={[key]:true};
        c.dropPriceWeeks['2026-09-10']={[key]:'123456789'};
        db.chars=[c];
        db.records=normalizeRecords({'2026-09-10':{sessions:[{id:'보존할 재획',runs:1,meso:'12345678',erda:3}]}},db.settings);
        const pastSnapshot=JSON.stringify({bosses:c.bossWeeks['2026-09-10'],drops:c.dropWeeks['2026-09-10'],prices:c.dropPriceWeeks['2026-09-10'],records:db.records});
        const oldIncome=charSum(c,'2026-09-10').w;
        const beforeServer=c.server;
        const normalBosses=BOSS_GROUPS.w.filter(g=>g.bosses.some(b=>canUseBoss(c,b,date) && !isLimitFreeBoss(b))).map(g=>g.bosses.find(b=>canUseBoss(c,b,date) && !isLimitFreeBoss(b)));
        const week=currentWeekKey();
        c.bossWeeks[week]={};
        const apiResults=normalBosses.slice(0,13).map(b=>applySchedulerBossCompletion(c,b,'weekly',date));
        const apiCount=Object.keys(c.bossWeeks[week]).length;
        const meirinAllowed=canUseBoss(c,BOSS_MAP.nmeirin,date);
        const meirinApi=applySchedulerBossCompletion(c,BOSS_MAP.nmeirin,'weekly',date);
        const meirinRecorded=Object.prototype.hasOwnProperty.call(c.bossWeeks[week],'nmeirin');
        const expectedIncome=normalBosses.slice(0,apiCount).reduce((sum,b)=>sum+bossCrystalPrice(b,week),0);
        const actualIncome=charSum(c,week).w-(meirinRecorded?BOSS_MAP.nmeirin[2]:0);
        const september=monthlyCharSum(c,'2026-09').m;
        const october=monthlyCharSum(c,'2026-10').m;
        const monthWeek=monthlyBossTotalsForWeek('2026-10-01').crystalMeso;
        const storedServer=c.server;
        // 월드리프 이후에도 저장된 메이린 체크·드랍과 해당 주차 수입을 조회합니다.
        c.server='main';
        const meirGroup=BOSS_GROUPS.w.find(g=>g.bosses.some(b=>b[0]==='nmeirin'));
        const preservedCard=bossGroupCard(meirGroup,c,'2026-09-10');
        const holder=document.createElement('div'); holder.innerHTML=preservedCard;
        const savedVisible=!!holder.querySelector('input.boss-check:checked') && !!holder.querySelector('.drops');
        const savedDisabled=holder.querySelector('input.boss-check').disabled;
        const monthlySeptemberCard=bossGroupCard(BOSS_GROUPS.m[0],c,'2026-09','monthly');
        const monthlyOctoberCard=bossGroupCard(BOSS_GROUPS.m[0],c,'2026-10','monthly');
        c.server=beforeServer;
        // 과거 주차 수익 검사는 해당 주차를 의도적으로 수정하지 않은 시행일 이후에만 수행합니다.
        const preserved=week==='2026-09-10' || (charSum(c,'2026-09-10').w===oldIncome && JSON.stringify({bosses:c.bossWeeks['2026-09-10'],drops:c.dropWeeks['2026-09-10'],prices:c.dropPriceWeeks['2026-09-10'],records:db.records})===pastSnapshot);
        const prev=addDays(week,-7);
        c.bossWeeks[prev]=Object.fromEntries(normalBosses.slice(0,13).map(b=>[b[0],1]));
        c.bossWeeks[prev].nmeirin=1;
        c.bossWeeks[week]={};
        const previousSnapshot=JSON.stringify(c.bossWeeks[prev]);
        const copied=copyPreviousWeeklyBosses(c);
        const copiedMeirin=Object.prototype.hasOwnProperty.call(c.bossWeeks[week],'nmeirin');
        const copyPreserved=JSON.stringify(c.bossWeeks[prev])===previousSnapshot;
        // 실제 체크박스로 13번째 보스 입력 경로도 확인합니다.
        c.bossWeeks[week]=Object.fromEntries(normalBosses.slice(0,12).map(b=>[b[0],1]));
        c.bosses=c.bossWeeks[week];
        openChars.add(c.name); weeklyBossViewWeek=week;
        renderBoss();
        const thirteenth=normalBosses[12][0];
        window.patchTestChar=c;
        window.patchTestThirteenth=thirteenth;
        return {apiCount,apiResults,meirinAllowed,meirinApi,meirinRecorded,expectedIncome,actualIncome,september,october,monthWeek,savedVisible,savedDisabled,preserved,copied,copiedMeirin,copyPreserved,storedServer,
          monthlySeptemberCard,monthlyOctoberCard,thirteenth,postPatch:date>='2026-09-17'};
      },date);
      assert.equal(results.apiCount,results.postPatch?13:12,date+' API 주간 제한');
      assert.equal(results.meirinAllowed,!results.postPatch,date+' 메이린 입장 종료');
      assert.equal(results.meirinRecorded,!results.postPatch,date+' 종료 후 API 신규 메이린');
      assert.equal(results.actualIncome,results.expectedIncome,date+' 합계 단가');
      assert.equal(results.september,665000000,'9월 월간 가격 보존');
      assert.equal(results.october,465000000,'10월 월간 새 가격');
      assert.equal(results.monthWeek,465000000,'월간 보스의 주차 귀속 가격');
      assert(results.savedVisible,'리프한 캐릭터의 저장된 메이린 체크·드랍 표시');
      assert(results.savedDisabled,'본서버에서 메이린 신규 체크 잠금');
      assert(results.preserved,'가격표 전환이 과거 수입·장부를 변경했습니다.');
      assert.equal(results.copied,13,date+' 지난주 복사 개수');
      assert.equal(results.copiedMeirin,!results.postPatch,date+' 복사의 메이린 종료 적용');
      assert(results.copyPreserved,'지난주 복사가 원본 기록을 변경했습니다.');
      assert.equal(results.storedServer,'challenger','날짜 전환이 캐릭터 서버를 바꿨습니다.');
      assert(results.monthlySeptemberCard.includes('6억 6,500만'),'9월 카드 단가');
      assert(results.monthlyOctoberCard.includes('4억 6,500만'),'10월 카드 단가');
      await page.locator('#charlist input.boss-check[data-id="'+results.thirteenth+'"]').click();
      const manual=await page.evaluate(()=>({checked:patchTestThirteenth in bossStore(patchTestChar,currentWeekKey()),count:charSum(patchTestChar).wc,note:document.getElementById('weekly-boss-limit-note').textContent}));
      assert.equal(manual.checked,results.postPatch,date+' 수동 13번째 체크');
      assert.equal(manual.count,results.postPatch?13:12);
      assert(manual.note.includes(results.postPatch?'한도 없음':'12개'));
      const worlds=await page.evaluate(()=>{
        const week=currentWeekKey();
        const tenBosses=BOSS_GROUPS.w.filter(g=>g.bosses.some(b=>!isLimitFreeBoss(b))).slice(0,10).map(g=>g.bosses[0]);
        const seedWorld=(world,count)=>Array.from({length:count},(_,index)=>normalizeChar({name:(world || '미지정')+' 검증 '+index,server:'main',worldName:world,bossWeeks:{[week]:Object.fromEntries(tenBosses.map(b=>[b[0],1]))}}));
        const state=()=>{
          const totals=bossTotals(week);
          weeklyBossViewWeek=week;renderBoss();
          const renderedWarnings=document.querySelectorAll('#boss-total .world-crystal-over').length;
          refreshBossAggregateSummary(db.chars[0],week);
          return {total:totals.weeklyCrystals,over:totals.overWorldLimit,worlds:totals.worldCrystals,renderedWarnings,refreshedWarnings:document.querySelectorAll('#boss-total .world-crystal-over').length,text:document.getElementById('boss-total').textContent};
        };
        db.chars=seedWorld('크로아',5).concat(seedWorld('스카니아',5));
        const split=state();
        db.chars=seedWorld('크로아',9);
        const exact=state();
        db.chars=seedWorld('크로아',10);
        const one=state();
        const incomeBefore=bossTotals(week).week;
        save();
        const incomeAfter=bossTotals(week).week;
        db.chars=seedWorld('',10);
        const unknown=state();
        db.chars=[normalizeChar({name:'메이린 보상 보존',server:'challenger',worldName:'챌린저스4',bossWeeks:{'2026-09-10':{nmeirin:1}}})];
        const meirin=bossTotals('2026-09-10');
        return {split,exact,one,unknown,incomePreserved:incomeBefore===incomeAfter,meirin:{meso:String(meirin.week),crystals:meirin.weeklyCrystals,reward:meirin.specialRewardWeek,crystalMeso:meirin.crystalWeek,worlds:meirin.worldCrystals}};
      });
      assert.equal(worlds.split.total,100,'서로 다른 두 월드의 전체 개수');
      assert.deepEqual(worlds.split.worlds.map(w=>w.crystals),[50,50]);
      assert.equal(worlds.split.over,false,'크로아 50개 + 스카니아 50개에 한도 초과 오경고');
      assert.equal(worlds.split.renderedWarnings,0);
      assert.equal(worlds.split.refreshedWarnings,0);
      assert.equal(worlds.exact.total,90);
      assert.equal(worlds.exact.over,false,'동일 월드의 정확히 90개');
      assert.equal(worlds.one.over,true,'동일 월드의 100개 초과 경고');
      assert.equal(worlds.one.renderedWarnings,1);
      assert.equal(worlds.one.refreshedWarnings,1);
      assert(worlds.incomePreserved,'90개 초과 경고가 장부 저장을 막거나 수익을 자르면 안 됩니다.');
      assert.equal(worlds.unknown.over,false,'월드 미지정 합산을 확정 초과로 표시하면 안 됩니다.');
      assert(worlds.unknown.text.includes('월드 미지정 합산 100개 (월드 확인 필요)'));
      assert.equal(worlds.unknown.renderedWarnings,0);
      assert.equal(worlds.meirin.meso,'300000000','기존 메이린 황금 메소 보상 유지');
      assert.equal(worlds.meirin.reward,300000000);
      assert.equal(worlds.meirin.crystals,0,'메이린 보상은 결정석이 아닙니다.');
      assert.equal(worlds.meirin.crystalMeso,0);
      assert.deepEqual(worlds.meirin.worlds,[]);
      if(results.postPatch){
        await page.setViewportSize({width:390,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'모바일 보스 화면 가로 넘침');
      }
      assert.deepEqual(errors,[],date+' 브라우저 오류');
      await context.close();
    }
    console.log('9월 패치 검증 완료: 46개 단가, 주간·월간 시행 경계, 13번째 수동/API 입력, 지난주 복사, 메이린 종료·황금 메소 보존, 월드별 90개 경고, 과거 장부·리프 기록 보존, 모바일 화면.');
  }finally{
    if(browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
