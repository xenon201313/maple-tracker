// 실제 계정·개인 키 없이 넥슨 로그인 캐릭터 경로와 기록 보존을 검증합니다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { fixtureDismissPatchNotes } = require('./helpers/patch-notes.cjs');
const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.ttf':'font/ttf' };
const server = http.createServer((req,res) => {
  let name = new URL(req.url,'http://localhost').pathname;
  if(name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + decodeURIComponent(name));
  if(!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error,data) => error ? res.writeHead(404).end() : res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'}).end(data));
});

async function prepare(page, { duplicates=false, apiKey=false } = {}) {
  return page.evaluate(({duplicates,apiKey}) => {
    clearInterval(nexonAutoRefresh.timer); clearTimeout(nexonAutoRefresh.timeout);
    nexonAutoRefresh.timer=0; nexonAutoRefresh.timeout=0;
    const account='a'.repeat(64), ocid='e'.repeat(32), day=todayStr(), week=currentWeekKey();
    window.loginFixture={account,connected:true,allowed:true,mode:'normal',calls:[],saves:0,release:null};
    const fixture=window.loginFixture;
    window.MapleFriends={
      getState:()=>({connected:fixture.connected,account:fixture.account,ready:true,finishing:false,scopes:['maplestory.characterlist','maplestory.scheduler']}),
      request:async(action,body={},signal)=>{
        fixture.calls.push({action,body:JSON.parse(JSON.stringify(body))});
        signal?.throwIfAborted();
        if(action==='character-list')return {account_list:[{account_id:'fixture',character_list:[{ocid,character_name:'로그인검증',world_name:'크로아',character_class:'제논',character_level:280}]}]};
        if(action==='scheduler')return {date:day,character_name:'로그인검증',world_name:'크로아',weekly_boss_clear_count:0,weekly_boss_clear_limit_count:12,boss_contents:[],daily_contents:[],weekly_contents:[]};
        if(action!=='character-profile')throw new Error('시험에서 허용하지 않은 요청: '+action);
        if(fixture.mode==='expired')throw Object.assign(new Error('시험용 세션 만료'),{status:401,httpStatus:401,errorCode:'SESSION_REQUIRED'});
        const basic={character_name:'로그인검증',world_name:'크로아',character_class:'제논',character_level:280,character_exp:'987654',character_exp_rate:'20',character_image:'assets/icon.png'};
        const result={ocid,basic,stat:{final_stat:[{stat_name:'전투력',stat_value:'123456789'}]},history:(Array.isArray(body.dates)?body.dates:[]).map(date=>({date,basic:{...basic,character_level:279,character_exp:'456789',character_exp_rate:'10'}}))};
        if(fixture.mode==='delayed')await new Promise(resolve=>{fixture.release=resolve;});
        signal?.throwIfAborted();
        return result;
      }
    };
    window.MapleAccountSync={
      beforeSave(){}, changed(){fixture.saves++;}, guard(){}, blocksLegacy:()=>true,
      canUseAccount:id=>fixture.connected&&fixture.allowed&&id===fixture.account,
      getState:()=>({owner:'friends:'+fixture.account,connected:true,dirty:false,pending:!fixture.allowed,busy:false}),
      initialize:async()=>{}, upload:async()=>{}, pull:async()=>{}
    };
    const make=index=>normalizeChar({name:'로그인검증',server:'main',ocid:'',
      bossWeeks:{[week]:{nzakum:index+1}},dropWeeks:{[week]:{['keep-drop-'+index]:index+1}},
      dropPriceWeeks:{[week]:{['keep-drop-'+index]:'123456789'}},dropShareWeeks:{[week]:{['keep-drop-'+index]:index+1}},
      expHistory:[{at:Date.now()-86400000,level:278,exp:'12345',rate:'5'}]});
    db.chars=duplicates?[make(0),make(1)]:[make(0)];
    db.settings.nexonApiKey=apiKey?'FIXTURE-KEY-NEVER-USE':'';
    db.records=normalizeRecords({[day]:{sessions:[{id:'keep-hunt',charName:'로그인검증',runs:1,meso:'123456789',erda:2}]}},db.settings);
    db.profits=[normalizeProfitRecord({id:'keep-profit',date:day,type:'potential',costs:[],outputs:[]})];
    db.expenses=[normalizeExpenseRecord({id:'keep-expense',date:day,amount:'1234',category:'equipment'})];
    window.loginOriginalChars=[...db.chars];
    window.loginRecordSnapshot=()=>JSON.stringify({records:db.records,profits:db.profits,expenses:db.expenses,
      chars:db.chars.map(c=>Object.fromEntries(['bossWeeks','dropWeeks','dropPriceWeeks','dropShareWeeks','monthBossMonths','monthDropMonths','monthDropPriceMonths','monthDropShareMonths','dailyBossDays','dailyDropDays','dailyDropPriceDays'].map(key=>[key,Object.fromEntries(Object.entries(c[key]).filter(([,v])=>Object.keys(v).length))])))});
    window.loginBefore=loginRecordSnapshot();
    renderAll();
    updateCharacterConnectionControls();
    fixture.saves=0;
    return loginBefore;
  }, {duplicates,apiKey});
}

async function assertProfiles(page, expectedCount=1) {
  try { await page.waitForFunction(count=>db.chars.length===count&&db.chars.every(c=>c.characterImage&&c.characterLevel===280&&c.characterExp==='987654'&&c.combatPower==='123456789'),expectedCount); }
  catch(error) {
    console.error('고립 시험 상태',await page.evaluate(()=>({chars:db.chars.map(c=>({name:c.name,image:!!c.characterImage,level:c.characterLevel,exp:c.characterExp,power:c.combatPower})),calls:loginFixture.calls,status:document.getElementById('friends-characters-status').textContent,apiStatus:document.getElementById('nexon-api-status').textContent})));
    throw error;
  }
  const result=await page.evaluate(()=>({count:db.chars.length,same:db.chars.every((c,i)=>c===loginOriginalChars[i]),
    kept:loginRecordSnapshot()===loginBefore,oldExp:db.chars.every(c=>c.expHistory.some(e=>e.exp==='12345')),
    calls:loginFixture.calls,hasKey:!!nexonApiKey(),images:[...document.querySelectorAll('#registered-char-list .char-avatar img')].length}));
  assert.equal(result.count,expectedCount);assert(result.same,'기존 캐릭터 객체를 교체하지 않음');
  assert(result.kept,'캐릭터 조회로 보스·드랍·재획·손익·지출 기록이 바뀌지 않음');
  assert(result.oldExp,'기존 경험치 이력을 유지함');assert.equal(result.hasKey,false);
  assert.equal(result.images,expectedCount);assert(result.calls.some(call=>call.action==='character-profile'));
  assert(result.calls.some(call=>call.action==='scheduler'));
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Los_Angeles'});context.setDefaultTimeout(10000);
    await fixtureDismissPatchNotes(context);
    let directCalls=0;
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin||url.protocol==='data:')return route.continue();
      if(url.hostname==='open.api.nexon.com')directCalls++;
      if(url.pathname==='/v1/friends/config')return route.fulfill({contentType:'application/json',body:JSON.stringify({ready:false})});
      return route.abort();
    });
    const page=await context.newPage(),errors=[],dialogs=[];
    // LA는 9월 28일이지만 한국은 9월 29일인 시점으로 고정합니다. 타이머는 정상 진행됩니다.
    await page.clock.setFixedTime('2026-09-29T00:30:00Z');
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>{dialogs.push(dialog.message());return dialog.accept();});
    await page.goto(origin+'/?page=character');

    await prepare(page);
    await page.locator('.char-refresh-btn').click();await assertProfiles(page);
    assert(!dialogs.some(text=>text.includes('API 키를 먼저 저장')),'넥슨 로그인 사용자에게 개인 키를 요구하지 않음');
    console.log('PASS: 넥슨 로그인만으로 기존 수동 캐릭터 개별 갱신');

    await prepare(page,{duplicates:true});
    await page.locator('#btn-refresh-all-chars').click();await assertProfiles(page,2);
    console.log('PASS: 중복 캐릭터 행과 각 기록을 유지한 일괄 갱신');

    await prepare(page);await page.evaluate(()=>runNexonAutoRefresh());await assertProfiles(page);
    await page.evaluate(()=>{loginFixture.calls=[];db.chars[0].lastApiSyncAt=Date.now();});
    await page.evaluate(()=>runNexonAutoRefresh());
    assert(await page.evaluate(()=>loginFixture.calls.some(call=>call.action==='scheduler')),'프로필 유효 시 보스 완료 자동 갱신');
    console.log('PASS: 로그인 경로의 자동 프로필·보스 갱신');

    await prepare(page);await page.evaluate(()=>{db.chars=[];loginOriginalChars=[];renderAll();});
    await page.locator('#in-char').fill('로그인검증');await page.locator('#btn-addchar').click();
    await page.waitForFunction(()=>db.chars.length===1&&db.chars[0].characterImage&&db.chars[0].characterExp==='987654');
    assert.equal(await page.evaluate(()=>nexonApiKey()),'');
    console.log('PASS: 로그인 경로의 이름 입력 캐릭터 추가');
    assert.equal(await page.evaluate(()=>todayStr()),'2026-09-28','미국 현지 날짜로 실행 중인지 확인');
    const dates=await page.evaluate(()=>loginFixture.calls.find(call=>call.action==='character-profile').body.dates);
    assert.deepEqual(dates,['2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27','2026-09-28'],'해외 시간대에서도 한국 어제부터 6일 전까지만 과거 경험치를 조회함');
    console.log('PASS: 미국 시간대에서도 KST 기준 최근 6일 조회');

    await prepare(page);await page.locator('#friends-characters-load').click();
    await page.locator('#friends-characters-list button').first().click();await assertProfiles(page);
    assert.equal(await page.evaluate(()=>db.chars.length),1,'본인 목록에서 기존 수동 캐릭터를 추가해도 중복 생성하지 않음');
    console.log('PASS: 내 캐릭터 목록 추가에서 상세 프로필도 반영');

    for(const reason of ['계정 변경','연결 해제','장부 미선택']) {
      await prepare(page);
      const before=await page.evaluate(()=>{loginFixture.mode='delayed';return JSON.stringify(db.chars);});
      await page.locator('.char-refresh-btn').click();
      await page.waitForFunction(()=>typeof loginFixture.release==='function');
      await page.evaluate(reason=>{
        if(reason==='계정 변경')loginFixture.account='b'.repeat(64);
        if(reason==='연결 해제')loginFixture.connected=false;
        if(reason==='장부 미선택')loginFixture.allowed=false;
        loginFixture.release();
      },reason);
      await page.waitForFunction(()=>{const button=document.querySelector('.char-refresh-btn');return button&&!button.disabled;});
      assert.equal(await page.evaluate(()=>JSON.stringify(db.chars)),before,reason+' 이후 늦은 응답이 캐릭터를 변경하지 않음');
      assert.equal(await page.evaluate(()=>loginFixture.saves),0,reason+' 이후 늦은 응답을 저장하지 않음');
    }
    console.log('PASS: 계정 변경·로그아웃·장부 선택 변경 중 지연 응답 차단');

    await prepare(page);
    const deletedBefore=await page.evaluate(()=>{
      loginFixture.mode='delayed';window.loginDeletedTarget=db.chars[0];
      window.loginPendingRefresh=document.querySelector('.char-refresh-btn').onclick();
      return JSON.stringify(loginDeletedTarget);
    });
    await page.waitForFunction(()=>typeof loginFixture.release==='function');
    await page.locator('.char-delete-btn').click();
    const savedAfterDelete=await page.evaluate(()=>loginFixture.saves);
    await page.evaluate(async()=>{loginFixture.release();await loginPendingRefresh;});
    assert.equal(await page.evaluate(()=>db.chars.length),0,'조회 중 삭제한 캐릭터를 다시 추가하지 않음');
    assert.equal(await page.evaluate(()=>JSON.stringify(loginDeletedTarget)),deletedBefore,'삭제된 객체에도 늦은 응답을 적용하지 않음');
    assert.equal(await page.evaluate(()=>loginFixture.saves),savedAfterDelete,'삭제 뒤 완료된 조회를 저장하지 않음');
    console.log('PASS: 조회 중 대상 캐릭터 삭제 시 지연 응답 차단');

    await prepare(page,{apiKey:true});
    const unselected=await page.evaluate(()=>{loginFixture.allowed=false;return JSON.stringify(db.chars);});
    await page.locator('.char-refresh-btn').click();
    await page.waitForFunction(()=>document.querySelector('.char-refresh-btn')?.disabled===false);
    assert.equal(await page.evaluate(()=>loginFixture.calls.length),0,'계정 장부를 선택하기 전에는 조회를 시작하지 않음');
    assert.equal(await page.evaluate(()=>JSON.stringify(db.chars)),unselected,'장부 미선택 상태에서 프로필 보존');

    await prepare(page,{apiKey:true});
    const before=await page.evaluate(()=>{loginFixture.mode='expired';return JSON.stringify(db.chars);});
    await page.locator('.char-refresh-btn').click();
    await page.waitForFunction(()=>loginFixture.calls.some(call=>call.action==='character-profile')&&document.querySelector('.char-refresh-btn')?.disabled===false);
    assert.equal(await page.evaluate(()=>JSON.stringify(db.chars)),before,'세션 만료 시 기존 프로필 보존');
    assert.equal(directCalls,0,'넥슨 인증 실패를 개인 API 키 호출로 자동 우회하지 않음');
    console.log('PASS: 세션 만료 시 개인 키로 자동 우회하지 않음');

    await prepare(page);await page.locator('.char-refresh-btn').click();await assertProfiles(page);
    assert.equal(await page.locator('#character-personal-api').isVisible(),false,'넥슨 로그인 시 개인 API 키 입력 영역을 숨김');
    const output=path.join(root,'.tools','ui-review');fs.mkdirSync(output,{recursive:true});
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      if(width<600&&await page.evaluate(()=>document.getElementById('workspace-sidebar')?.classList.contains('is-open')))await page.locator('.mobile-nav [data-menu-toggle]').click();
      await page.locator('#registered-char-list').scrollIntoViewIfNeeded();
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'캐릭터 UI 가로 넘침 '+width);
      await page.screenshot({path:path.join(output,'nexon-character-login-'+(width===1280?'desktop':'mobile')+'.png'),animations:'disabled'});
    }
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('PASS: 넥슨 로그인 캐릭터 조회 회귀 전체 완료');
  } finally { await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
