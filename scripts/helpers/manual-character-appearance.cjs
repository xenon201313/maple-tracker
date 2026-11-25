const assert = require('node:assert/strict');
const path = require('node:path');
const {fixtureDismissPatchNotes} = require('./patch-notes.cjs');

async function verifyManualCharacterProfile(browser, origin) {
  const context = await browser.newContext({timezoneId:'America/Los_Angeles'});
  context.setDefaultTimeout(10000);
  await fixtureDismissPatchNotes(context);
  const name = '코디검증';
  const ocid = 'c'.repeat(32);
  const imageBase = 'https://open.api.nexon.com/static/maplestory/character/look/';
  const calls = [], privateCalls = [];
  const dates = ['2026-11-19','2026-11-20','2026-11-21','2026-11-22','2026-11-23','2026-11-24','2026-11-25'];
  const history = dates.slice(0,-1).map((date,i) => ({date,basic:{
    character_level:265,character_exp:String(100000+i*12000),character_exp_rate:String(2+i)
  }}));
  let revision = 1, failure = false, partial = false, publicName = name, resultId = ocid, gate;
  function holdRequest() {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const started = page.waitForRequest(req => new URL(req.url()).pathname === '/v1/public-character');
    gate = () => pending;
    return {started,release() {gate = null; release();}};
  }
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin || url.protocol === 'data:') return route.continue();
    if (url.href.startsWith(imageBase)) return route.fulfill({
      path:path.join(__dirname,'../../assets/icon.png'),headers:{'access-control-allow-origin':'*','content-type':'image/png'}
    });
    if (url.pathname === '/v1/friends/config') return route.fulfill({json:{ready:false}});
    if (url.pathname === '/v1/public-character') {
      calls.push({method:request.method(),params:[...url.searchParams],headers:request.headers()});
      const basic = {character_name:publicName, character_level:265, character_class:'메카닉',
        world_name:'크로아',character_image:imageBase+'fixture'+revision};
      const body = {ocid:resultId,basic,history:partial?[]:history};
      if(partial){
        body.profileWarning='일부 공개 정보를 확인하지 못했습니다.';
        if(partial==='expOnly') basic.character_exp='933333';
      }else{
        basic.character_exp=String(900000+revision);
        basic.character_exp_rate=String(15+revision/2);
        body.stat={final_stat:[{stat_name:'전투력',stat_value:String(98765432-revision)}]};
      }
      if (gate) await gate();
      return route.fulfill({status:failure?503:200,json:failure?{error:'Temporarily unavailable'}:body,
        headers:{'access-control-allow-origin':'*','content-type':'application/json'}}).catch(() => {});
    }
    if (url.hostname === 'open.api.nexon.com' || /\/v1\/friends\/(character-|scheduler|history)/.test(url.pathname)) privateCalls.push(url.pathname);
    return route.abort();
  });
  const page = await context.newPage();
  // LA에서는 아직 24일, 메이플 장부의 KST 날짜는 25일이다.
  await page.clock.setFixedTime('2026-11-25T01:00:00Z');
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  page.on('dialog',dialog => dialog.accept());
  const card = page.locator('#registered-char-list .registered-card').filter({hasText:name});
  const single = card.getByRole('button',{name:'정보 갱신',exact:true});
  const register = async nickname => {
    await page.locator('#in-character-source').selectOption('manual');
    await page.locator('#in-char').fill(nickname);
    await page.locator('#in-character-account').fill('부계정');
    await page.locator('#btn-addchar').click();
    await page.locator('#registered-char-list .registered-card').filter({hasText:nickname}).waitFor();
  };
  const portrait = n => page.waitForFunction(src => {
    const c = db.chars.find(row => row.name === '코디검증');
    const img = document.querySelector('#registered-char-list .char-avatar img');
    return c?.characterImage === src && img?.src === src && img.naturalWidth > 0;
  },imageBase+'fixture'+n);
  const ledger = () => page.evaluate(() => {
    const c = db.chars.find(row => row.name === '코디검증');
    return JSON.stringify({name:c.name, alias:c.crystalAccountAlias, manual:c.manualOnly,
      server:c.server, world:c.worldName, worldType:c.crystalWorldType, ownOcid:c.ocid,
      boss:c.bossWeeks, drops:c.dropWeeks, prices:c.dropPriceWeeks, daily:c.dailyBossDays,
      scheduler:c.schedulerSync, sessions:db.records});
  });
  const savedStats = () => page.evaluate(() => {
    const c=db.chars.find(row=>row.name==='코디검증');
    return {power:c.combatPower,exp:c.characterExp,rate:c.characterExpRate,history:c.expHistory};
  });
  try {
    await page.goto(origin+'/?page=character');
    assert(await page.evaluate(() => !characterSource() && !nexonApiKey()));
    const first = holdRequest();
    await register(name);
    await page.waitForFunction(() => db.chars.some(c => c.name === '코디검증' && c.manualOnly));
    await first.started;
    first.release();
    await portrait(1);
    assert.deepEqual(calls[0].params,[['name',name]]);
    assert.equal(await card.locator('.scheduler-scope-toggle').count(),0);
    assert.equal(await page.evaluate(() => db.chars[0].characterClass),'메카닉');
    assert.match(await card.innerText(),/전투력\s*98,765,431/);
    const initial=await savedStats();
    assert.deepEqual([initial.power,initial.exp,Number(initial.rate)],['98765431','900001',15.5]);
    await page.evaluate(() => openPage('daily'));
    await page.locator('#exp-tracker-character').selectOption(name);
    const bars=page.locator('#exp-tracker .exp-bar-fill[data-exp-empty="0"]');
    assert.deepEqual(await bars.evaluateAll(rows=>rows.map(bar=>bar.dataset.expDate)),dates,'KST의 최근 7일을 표시');
    assert.match(await page.locator('#exp-tracker .exp-summary.current').innerText(),/15\.5%/);
    assert.match(await page.locator('#exp-tracker').innerText(),/EXP 900,001/);
    await page.evaluate(() => openPage('character'));
    await page.evaluate(() => {
      const day=todayStr(), week=currentWeekKey(), c=db.chars[0];
      c.bossWeeks[week]={nzakum:2}; c.dropWeeks[week]={fixture:true}; c.dropPriceWeeks[week]={fixture:'710000'};
      c.dailyBossDays[day]={fixture:1};
      db.records=normalizeRecords({[day]:{sessions:[{id:'manual-hunt',charName:c.name,runs:1,meso:'1234567',erda:3}]}},db.settings);
      save(); renderAll(); openPage('home');
    });
    const before = await ledger();
    const home = page.locator('#home-characters .home-character-card').filter({hasText:name});
    assert.equal(await home.locator('img').getAttribute('src'),imageBase+'fixture1');
    await home.click();
    revision = 2;
    await page.clock.setFixedTime('2026-11-25T01:01:00Z');
    await single.click();
    await portrait(2);
    assert.deepEqual(calls.at(-1).params,[['ocid',ocid]],'갱신은 이미 확인한 캐릭터 식별자를 사용');
    assert.match(await card.innerText(),/전투력\s*98,765,430/,'전투력이 감소해도 현재 공개 수치를 반영');
    const updated=await savedStats();
    assert.deepEqual([updated.exp,Number(updated.rate)],['900002',16]);
    assert.equal(updated.history.filter(row=>row.date==='2026-11-24').length,1,'같은 날짜의 과거 기록 중복 방지');
    await page.evaluate(() => openPage('home'));
    assert.equal(await home.locator('img').getAttribute('src'),imageBase+'fixture2');
    await home.click();
    failure = true;
    const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/public-character' && response.status() === 503);
    await single.click();
    await failed;
    await single.waitFor();
    await page.waitForFunction(() => !document.querySelector('.char-refresh-btn')?.disabled);
    assert.equal(await card.locator('.char-avatar img').getAttribute('src'),imageBase+'fixture2');
    assert.equal(await ledger(),before,'실패 후 외형과 보스·재획 기록 보존');
    assert.deepEqual(await savedStats(),updated,'조회 전체 실패 시 마지막 전투력·경험치 유지');

    failure = false; partial = true; revision = 3;
    await single.click();
    await portrait(3);
    assert.deepEqual(await savedStats(),updated,'기본 프로필만 성공하면 새 외형과 함께 마지막 전투력·경험치 유지');
    partial = 'expOnly';
    await page.clock.setFixedTime('2026-11-25T01:01:30Z');
    await single.evaluate(btn => btn.onclick());
    await page.evaluate(() => openPage('daily'));
    assert.match(await page.locator('#exp-tracker .exp-summary.current').innerText(),/16%/,
      '총 경험치만 응답할 때 누락된 비율을 0%로 그래프에 표시하지 않음');
    await page.evaluate(() => openPage('character'));
    const beforeMismatch=await savedStats();
    partial = false; resultId = 'b'.repeat(32); revision = 4;
    await single.evaluate(btn => btn.onclick());
    assert.equal(await card.locator('.char-avatar img').getAttribute('src'),imageBase+'fixture3',
      '같은 이름의 다른 식별자에 대한 응답은 기존 캐릭터에 반영되지 않음');
    assert.deepEqual(await savedStats(),beforeMismatch);
    resultId = ocid; publicName = '코디새이름';
    await page.clock.setFixedTime('2026-11-25T01:02:00Z');
    await page.locator('#btn-refresh-all-chars').click();
    await portrait(4);
    assert.match(await card.innerText(),/전투력\s*98,765,428/);
    assert.equal((await savedStats()).exp,'900004');
    assert.equal(await ledger(),before,'닉네임 변경과 전체 갱신 후 장부 이름 및 수동 기록 보존');
    const count = calls.length;
    await page.evaluate(() => runNexonAutoRefresh());
    assert.equal(calls.length,count,'갱신 직후 자동 재조회 제한');
    publicName = name; revision = 5;
    await page.clock.setFixedTime('2026-11-25T01:03:00Z');
    await page.evaluate(() => {
      const c=db.chars[0];
      delete c.publicProfileUpdatedAt;
      c.publicAppearanceAt=Date.now();
      c.combatPower=''; c.characterExp=''; c.characterExpRate=''; c.expHistory=[];
      save();
    });
    await page.reload();
    await portrait(5);
    assert.equal((await savedStats()).power,'98765427','코디 전용 구버전의 최근 캐시가 있어도 최초 방문 때 전투력을 채움');
    assert.deepEqual(calls.at(-1).params,[['ocid',ocid]]);
    revision = 6;
    await page.evaluate(() => {
      const c=db.chars[0];
      delete c.publicAppearanceAt; delete c.publicProfileOcid;
      c.ocid=''; c.characterImage=''; save();
    });
    await page.reload();
    await page.evaluate(() => openPage('character'));
    await portrait(6);
    assert.equal((await savedStats()).power,'98765426');
    assert.deepEqual(calls.at(-1).params,[['name',name]],'기존 장부의 수동 캐릭터도 재방문 때 갱신');
    assert.equal(await ledger(),before);
    failure = true;
    const missingResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('name') === '조회실패');
    await register('조회실패');
    await missingResponse;
    assert(await page.evaluate(() => db.chars.some(c => c.name === '조회실패' && c.manualOnly)));
    failure = false;
    const switching = holdRequest();
    revision = 7;
    await single.evaluate(btn => {window.appearancePending=btn.onclick();});
    await switching.started;
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('maple:account-ledger-changing')));
    switching.release();
    await page.evaluate(() => window.appearancePending);
    assert.equal(await page.evaluate(() => db.chars[0].characterImage),imageBase+'fixture6',
      '장부 전환 전에 요청한 이미지가 늦게 도착해도 적용하지 않음');
    const pending = holdRequest();
    await single.evaluate(btn => {window.appearancePending=btn.onclick();});
    await pending.started;
    await card.locator('.char-delete-btn').click();
    pending.release();
    await page.evaluate(() => window.appearancePending);
    await card.waitFor({state:'detached'});
    await page.evaluate(() => runNexonAutoRefresh());
    assert(await page.evaluate(() => !db.chars.some(c => c.name === '코디검증')));
    assert.deepEqual(privateCalls,[]);
    assert(calls.every(c => c.method === 'GET' && !c.headers.authorization && !c.headers['x-nxopen-api-key']));
    assert.deepEqual(errors,[]);
    console.log('PASS: 비로그인 공개 프로필·전투력·7일 경험치, 개별·전체·자동 갱신, 부분 실패·이름 변경·보스·재획 기록 보존');
  } finally { await context.close(); }
}
module.exports = {verifyManualCharacterProfile};
