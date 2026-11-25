const assert = require('node:assert/strict');
const path = require('node:path');
const {fixtureDismissPatchNotes} = require('./patch-notes.cjs');

async function verifyManualCharacterAppearance(browser, origin) {
  const context = await browser.newContext({timezoneId:'Asia/Seoul'});
  context.setDefaultTimeout(10000);
  await fixtureDismissPatchNotes(context);
  const name = '코디검증';
  const ocid = 'c'.repeat(32);
  const imageBase = 'https://open.api.nexon.com/static/maplestory/character/look/';
  const calls = [], privateCalls = [];
  let revision = 1, failure = false, publicName = name, resultId = ocid, gate;
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
      const body = {ocid:resultId, basic:{character_name:publicName, character_level:265, character_class:'메카닉', world_name:'크로아',character_image:imageBase+'fixture'+revision}};
      if (gate) await gate();
      return route.fulfill({status:failure?503:200,json:failure?{error:'Temporarily unavailable'}:body,
        headers:{'access-control-allow-origin':'*','content-type':'application/json'}}).catch(() => {});
    }
    if (url.hostname === 'open.api.nexon.com' || /\/v1\/friends\/(character-|scheduler|history)/.test(url.pathname)) privateCalls.push(url.pathname);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  page.on('dialog',dialog => dialog.accept());
  const card = page.locator('#registered-char-list .registered-card').filter({hasText:name});
  const single = card.getByRole('button',{name:'코디 갱신'});
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
      scheduler:c.schedulerSync, exp:c.expHistory, sessions:db.records});
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
    await single.click();
    await portrait(2);
    assert.deepEqual(calls.at(-1).params,[['ocid',ocid]],'갱신은 이미 확인한 캐릭터 식별자를 사용');
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

    failure = false; resultId = 'b'.repeat(32); revision = 3;
    await single.evaluate(btn => btn.onclick());
    assert.equal(await card.locator('.char-avatar img').getAttribute('src'),imageBase+'fixture2',
      '같은 이름의 다른 식별자에 대한 응답은 기존 캐릭터에 반영되지 않음');
    resultId = ocid; publicName = '코디새이름';
    await page.locator('#btn-refresh-all-chars').click();
    await portrait(3);
    assert.equal(await ledger(),before,'닉네임 변경과 전체 갱신 후 장부 이름 및 수동 기록 보존');
    const count = calls.length;
    await page.evaluate(() => runNexonAutoRefresh());
    assert.equal(calls.length,count,'갱신 직후 자동 재조회 제한');
    publicName = name; revision = 4;
    await page.evaluate(() => {
      const c=db.chars[0];
      delete c.publicAppearanceAt; delete c.publicProfileOcid;
      c.ocid=''; c.characterImage=''; save();
    });
    await page.reload();
    await page.evaluate(() => openPage('character'));
    await portrait(4);
    assert.deepEqual(calls.at(-1).params,[['name',name]],'기존 장부의 수동 캐릭터도 재방문 때 갱신');
    assert.equal(await ledger(),before);
    failure = true;
    const missingResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('name') === '조회실패');
    await register('조회실패');
    await missingResponse;
    assert(await page.evaluate(() => db.chars.some(c => c.name === '조회실패' && c.manualOnly)));
    failure = false;
    const switching = holdRequest();
    revision = 5;
    await single.evaluate(btn => {window.appearancePending=btn.onclick();});
    await switching.started;
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('maple:account-ledger-changing')));
    switching.release();
    await page.evaluate(() => window.appearancePending);
    assert.equal(await page.evaluate(() => db.chars[0].characterImage),imageBase+'fixture4',
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
    console.log('PASS: 비로그인 직접 기록 캐릭터 코디 등록·개별·전체·자동 갱신, 기존 기록 마이그레이션·실패·삭제·이름 변경 보존');
  } finally { await context.close(); }
}
module.exports = {verifyManualCharacterAppearance};
