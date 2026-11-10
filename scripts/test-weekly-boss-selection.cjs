// 실제 계정 없이 주차·캐릭터별 선택 한도와 기존 초과 기록의 보존을 검사합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),{fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(b));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{
 const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul'});await fixtureDismissPatchNotes(context);
 await context.route('**/*',r=>r.request().url().startsWith(origin)||r.request().url().startsWith('data:')?r.continue():r.abort());
 const page=await context.newPage(),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());return d.accept();});
 await page.clock.setFixedTime('2026-11-11T03:00:00Z');await page.goto(origin+'/?page=boss');
 const initial=await page.evaluate(()=>{
  clearInterval(nexonAutoRefresh.timer);clearTimeout(nexonAutoRefresh.timeout);
  const c=normalizeChar({name:'주간 한도 합성',server:'main'}),week=currentWeekKey();db.chars=[c];
  const groups=BOSS_GROUPS.w.filter(g=>g.bosses.some(b=>canUseBoss(c,b,week))),bosses=groups.map(g=>g.bosses.find(b=>canUseBoss(c,b,week)));
  window.selectionFixture={week,ids:bosses.map(b=>b[0])};
  const results=bosses.slice(0,13).map(b=>applySchedulerBossCompletion(c,b,'weekly',todayStr()));
  const overflow=bossParts(bosses[12][1]);applySchedulerData(c,{date:todayStr(),boss_contents:[{content_name:overflow.base,difficulty:overflow.diff,cycle:'weekly',complete_flag:true}]});
  openChars.add(c.name);save();renderAll();
  return {count:charSum(c,week).wc,conflict:results[12].conflict,id:bosses[12][0],status:characterSchedulerTrackingHtml(c)};
 });
 assert.equal(initial.count,12,'API가 13번째 주간 보스를 신규 선택하지 않음');assert.match(initial.conflict,/12/);assert.match(initial.status,/자동 반영 제외/);assert.match(initial.status,/12종 한도/);
 console.log('PASS API 신규 13번째 선택 차단');
 let thirteenth=page.locator('#charlist .boss-check[data-id="'+initial.id+'"]');assert.equal(await thirteenth.isDisabled(),true);
 assert.equal(await page.locator('#charlist .boss-check:checked:not(:disabled)').count(),12);
 await thirteenth.evaluate(el=>{el.disabled=false;el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>charSum(db.chars[0]).wc),12);assert.equal(await thirteenth.isChecked(),false);assert(dialogs.some(text=>/12/.test(text)));
 console.log('PASS 12개 선택 시 나머지 비활성화 및 직접 이벤트 우회 차단');
 const first=await page.locator('#charlist .boss-check:checked').first().getAttribute('data-id');await page.locator('#charlist .boss-check[data-id="'+first+'"]').uncheck();
 thirteenth=page.locator('#charlist .boss-check[data-id="'+initial.id+'"]');assert.equal(await thirteenth.isDisabled(),false);await thirteenth.check();assert.equal(await page.evaluate(()=>charSum(db.chars[0]).wc),12);
 const replacement=await page.evaluate(()=>{
  const c=db.chars[0],store=bossStore(c),g=BOSS_GROUPS.w.find(g=>g.bosses.some(b=>b[0] in store)&&g.bosses.filter(b=>canUseBoss(c,b,currentWeekKey())).length>1);
  return {group:g.key,old:g.bosses.find(b=>b[0] in store)[0],next:g.bosses.find(b=>!(b[0] in store)&&canUseBoss(c,b,currentWeekKey()))[0]};
 });
 await page.locator('#charlist .diff[data-group="'+replacement.group+'"]').selectOption(replacement.next);
 assert.equal(await page.evaluate(()=>charSum(db.chars[0]).wc),12);assert.equal(await page.evaluate(id=>id in bossStore(db.chars[0]),replacement.next),true);
 console.log('PASS 하나 해제하면 추가 가능, 한도 도달 상태에서 난이도 교체 가능');
 const preserved=await page.evaluate(()=>{
  const c=db.chars[0],week=selectionFixture.week,ids=selectionFixture.ids;
  c.bossWeeks[week]=Object.fromEntries(ids.slice(0,13).map(id=>[id,1]));c.bosses=c.bossWeeks[week];
  c.dropWeeks[week]={preserve:true};c.dropPriceWeeks[week]={preserve:'123456789'};
  const before=JSON.stringify([c.bossWeeks[week],c.dropWeeks[week],c.dropPriceWeeks[week]]),income=charSum(c,week).w;
  save();renderAll();const after=JSON.stringify([c.bossWeeks[week],c.dropWeeks[week],c.dropPriceWeeks[week]]);
  const restored=trackerDbFromData(backupDataPayload(db)).chars[0];
  const ctx=MapleLedgerPlanner.bridge.getContext(),char=ctx.characters[0];
  return {before,after,count:charSum(c,week).wc,income,incomeAfter:charSum(c,week).w,restored:JSON.stringify([restored.bossWeeks[week],restored.dropWeeks[week],restored.dropPriceWeeks[week]]),remaining:ctx.bossRemainingLimits[char.id],free:ctx.bossOptions.some(o=>o.limitFree),progress:weeklyProgressForChar(c,week)};
 });
 assert.equal(preserved.count,13);assert.equal(preserved.before,preserved.after);assert.equal(preserved.before,preserved.restored);assert.equal(preserved.income,preserved.incomeAfter);assert.equal(preserved.remaining,0);assert.equal(preserved.free,false);assert.equal(preserved.progress.expected,0n);
 assert.match(await page.locator('#charlist .cnt').innerText(),/13\s*\/\s*12/);
 assert.equal(await page.locator('#charlist .boss-check:checked:not(:disabled)').count(),13);
 console.log('PASS 기존 13개 기록·가격·수익·백업 유지, 추가 선택과 계획 잔여 0');
 const bulk=await page.evaluate(()=>{
  const c=db.chars[0],week=selectionFixture.week,previous=addDays(week,-7);c.bossWeeks[previous]=Object.fromEntries(selectionFixture.ids.slice(0,13).map(id=>[id,1]));
  const original=JSON.stringify(c.bossWeeks[previous]);c.bossWeeks[week]={};c.bosses=c.bossWeeks[week];
  const copied=copyPreviousWeeklyBosses(c),sourceKept=JSON.stringify(c.bossWeeks[previous])===original;
  const other=normalizeChar({name:'독립 캐릭터',server:'main'});db.chars.push(other);const independent=applySchedulerBossCompletion(other,BOSS_MAP[selectionFixture.ids[0]],'weekly',todayStr());
  applySchedulerBossCompletion(c,BOSS_MAP.hblack,'monthly',todayStr());const monthly=monthlyCharSum(c,currentMonthKey()).mc;
  const daily=DAILY_BOSSES.find(b=>/아카이럼/.test(b[1]));applySchedulerBossCompletion(c,daily,'daily',todayStr());
  const dailyCleared=Object.keys(c.dailyBossClearDays[todayStr()]||{}).length;save();renderAll();
  return {copied,sourceKept,count:charSum(c,week).wc,other:charSum(other,week).wc,independent:independent.added,monthly,dailyCleared};
 });
 assert.deepEqual(bulk,{copied:12,sourceKept:true,count:12,other:1,independent:true,monthly:1,dailyCleared:1});
 console.log('PASS 지난주 복사 최대 12개·원본 보존, 캐릭터·일간·월간 독립');
 const historical=await page.evaluate(()=>{
  const date='2026-09-10',c=normalizeChar({name:'과거 특수 보스 한도',server:'challenger'});
  const ordinary=BOSS_GROUPS.w.map(g=>g.bosses.find(b=>canUseBoss(c,b,date)&&!isLimitFreeBoss(b))).filter(Boolean);
  ordinary.slice(0,11).forEach(b=>applySchedulerBossCompletion(c,b,'weekly',date));
  const special=applySchedulerBossCompletion(c,BOSS_MAP.nmeirin,'weekly',date),blocked=applySchedulerBossCompletion(c,ordinary[11],'weekly',date);
  return {special:special.added,count:weeklyBossSelectionCount(c,date),added:blocked.added,conflict:blocked.conflict,gameLimit:MapleSeptemberBossRules.weeklyLimit('2026-09-17')===Infinity};
 });
 assert.equal(historical.special,true);assert.equal(historical.count,12);assert.equal(historical.added,false);assert.match(historical.conflict,/12/);assert.equal(historical.gameLimit,true);
 console.log('PASS 과거 특수 보스도 앱 12종 한도에 포함, 공식 게임 규칙 원본 유지');
 const stable=await page.evaluate(()=>JSON.stringify(db.chars.map(c=>c.bossWeeks)));await page.reload();assert.equal(await page.evaluate(()=>JSON.stringify(db.chars.map(c=>c.bossWeeks))),stable);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'가로 넘침 '+width);}
 assert.deepEqual(errors,[]);console.log('PASS 저장·재로딩 및 3개 화면 폭');await context.close();
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
