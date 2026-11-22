const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {webcrypto}=require('node:crypto');
const {chromium}=require('playwright');
const {fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),A='a'.repeat(64),B='b'.repeat(64),META='maple:account-ledger:active:v1';
const scopes=['maplestory.characterlist','maplestory.scheduler','maplestory.starforce','maplestory.potential','maplestory.cube','maplestory.soulpotential'];
const server=http.createServer((req,res)=>{
  let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
const largeAccount='c'.repeat(64);
const accounts=new Map([A,B,largeAccount].map((id,index)=>[id,{account:id,key:String(index+1).repeat(64),revision:0,payload:null,history:[]}]));
let origin,browser,ledgerProtocol,legacyCalls=0,saves=0;const errors=[];
const fixture={records:{'2026-09-24':{sessions:[{id:'keep-hunt',meso:'123456789',erda:2,runs:1}]}},chars:[],profits:[],expenses:[],settings:{nexonApiKey:'FIXTURE-SECRET-KEY'},backupSnapshots:[]};
async function context(seed,account=A){
  const c=await browser.newContext({viewport:{width:1360,height:1000},acceptDownloads:true});c.setDefaultTimeout(15000);await fixtureDismissPatchNotes(c);
  await c.addInitScript(({seed,account})=>{
    window.fixtureAccountReadyEvents=[];
    document.addEventListener('maple:account-ledger-ready',()=>setTimeout(()=>{
      window.fixtureAccountReadyEvents.push({allowed:MapleAccountSync.canUseAccount(MapleFriends.getState().account),characters:db.chars.length,timer:nexonAutoRefresh.timer,timeout:nexonAutoRefresh.timeout});
    },0));
    if(!sessionStorage.getItem('test-session-init')){sessionStorage.setItem('maple:friends:session',JSON.stringify({state:account,proof:'f'.repeat(64),account}));sessionStorage.setItem('test-session-init','1');}
    if(seed&&!localStorage.getItem('test-ledger-init')){localStorage.setItem('mapleTracker.v2',JSON.stringify(seed));localStorage.setItem('mapleTracker.legacyRecovery.fixture',JSON.stringify({records:{'2026-09-01':{sessions:[{id:'archive-only',meso:'99',runs:1}]}}}));localStorage.setItem('test-ledger-init','1');}
  },{seed,account});
  await c.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.origin===origin||u.protocol==='data:')return route.continue();
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(u.pathname.startsWith('/v1/sync/')){legacyCalls++;return send({},500);}
    if(u.pathname==='/v1/friends/config')return send({ready:true,ledgerReady:true,scopes});
    if(!u.pathname.startsWith('/v1/friends/'))return route.abort();
    const body=route.request().postDataJSON(),acc=accounts.get(body?.state);
    if(!acc)return send({error:'fixture expired'},401);
    const action=u.pathname.split('/').at(-1);
    if(action==='status')return send({connected:true,account:acc.account,scopes});
    if(action==='logout')return send({ok:true});
    if(action==='ledger-key')return send({account:acc.account,key:acc.key});
    if(action==='ledger-read')return send({account:acc.account,revision:acc.revision,payload:acc.payload});
    if(action==='ledger-save'){
      if(route.request().postDataBuffer().length>ledgerProtocol.LEDGER_REQUEST_LIMIT)return send({error:'Request too large'},413);
      if(!ledgerProtocol.validLedgerPayload(body.payload))return send({error:'암호화된 장부 형식이 올바르지 않습니다.'},400);
      if(body.revision!==acc.revision)return send({error:'다른 기기 변경',errorCode:'LEDGER_CONFLICT',account:acc.account,revision:acc.revision},409);
      saves++;acc.revision++;acc.payload=body.payload;acc.history.unshift({revision:acc.revision,savedAt:Date.now(),payload:body.payload});return send({account:acc.account,revision:acc.revision,savedAt:Date.now()});
    }
    if(action==='ledger-history')return send({account:acc.account,snapshots:acc.history,nextBeforeRevision:null});
    if(action==='character-list')return send({account_list:[{account_id:'fixture-only',character_list:[{ocid:'ocid-fixture',character_name:'계정캐릭터',world_name:'크로아',character_class:'아크',character_level:280}]}]});
    // 선택 필드가 없는 정상 응답에도 기존 이미지·경험치·전투력은 유지되어야 합니다.
    if(action==='character-profile')return send({ocid:'ocid-fixture',basic:{character_name:'계정캐릭터',world_name:'크로아',character_class:'아크',character_level:280},history:[]});
    if(action==='scheduler')return send({date:'2026-09-24T00:00+09:00',boss_contents:[]});
    return send({error:'Unknown fixture action '+action},404);
  });return c;
}
async function open(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(origin+'/?page=home');return p;}
async function navigate(p,name){
  const top=p.locator('#maple-top-nav');
  if(await top.isVisible()){
    const route=top.locator('[data-maple-route="'+name+'"]'),group=route.locator('xpath=ancestor::details[1]');
    if(!await group.evaluate(el=>el.open))await group.locator('summary').click();
    await route.click();
  }else{
    if(!await p.locator('#workspace-sidebar').evaluate(el=>el.classList.contains('is-open')))await p.locator('.mobile-nav [data-menu-toggle]').click();
    await p.locator('.tab[data-page="'+name+'"]').click();
  }
}
async function pending(p){await p.waitForFunction(()=>window.MapleAccountSync?.getState().pending);}
async function synced(p){try{await p.waitForFunction(()=>{const s=window.MapleAccountSync?.getState();return s?.connected&&!s.dirty&&!s.pending&&!s.busy&&s.revision>0;});}catch(error){console.error('Fixture state',await p.evaluate(()=>({state:MapleAccountSync.getState(),status:document.getElementById('account-status').textContent,owner:JSON.parse(localStorage.getItem('maple:account-ledger:active:v1'))?.owner,errors:document.querySelector('dialog')?.textContent})));throw error;}}
async function change(p,name){await p.evaluate(name=>{
  db.records['2026-09-24'].sessions.push({id:name,meso:'77',runs:1});
  db.records=normalizeRecords(db.records,db.settings);
  save();
},name);}
async function switchTo(p,id){await p.evaluate(id=>sessionStorage.setItem('maple:friends:session',JSON.stringify({state:id,proof:'f'.repeat(64),account:id})),id);await p.reload();await pending(p);}
async function decode(acc){const key=await webcrypto.subtle.importKey('raw',Buffer.from(acc.key,'hex'),{name:'AES-GCM'},false,['decrypt']);return JSON.parse(Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(acc.payload.iv,'base64')},key,Buffer.from(acc.payload.ciphertext,'base64'))).toString());}
async function snapshotDigest(page){
  return page.evaluate(async()=>{
    const snapshot=MapleAccountBridge.snapshot();
    snapshot.updatedAt=0;snapshot.data.updatedAt=0;
    const serialized=JSON.stringify(snapshot,(_key,v)=>{
      if(v&&typeof v==='object'&&!Array.isArray(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]]));
      return v;
    });
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized))),b=>b.toString(16).padStart(2,'0')).join('');
  });
}
async function checkLargeLedger(){
  const account=accounts.get(largeAccount),source=await context(fixture,largeAccount),page=await open(source);
  await pending(page);await page.click('#account-use-local');await synced(page);
  assert.equal((await decode(account)).data.records['2026-09-24'].sessions[0].id,'keep-hunt','small ledgers remain readable as plain JSON after decryption');
  const [saved,plainLength]=await Promise.all([
    page.waitForResponse(response=>new URL(response.url()).pathname==='/v1/friends/ledger-save'),
    page.evaluate(()=>{
      const options=[{grade:'레전드리',value:'공격력 +12%'},{grade:'레전드리',value:'보스 몬스터 공격 시 데미지 +40%'},{grade:'유니크',value:'데미지 +9%'}];
      const events=Array.from({length:1450},(_,i)=>MapleEnhancements.event('potential',{
        id:'potential-'+i,character_name:'검증캐릭터',target_item:'아케인셰이드 무기',date_create:'2026-09-06T16:00:00+09:00',
        item_level:200,potential_type:'잠재능력',before_potential_option:options,after_potential_option:options
      },'fixture',1));
      db.enhancements=MapleEnhancements.normalize({events});
      db.expenses=normalizeExpenseRecords([{id:'direct-expense',date:'2026-09-24',amount:'9876543210'}]);
      db.backupSnapshots=[1250,1100,900].map((count,index)=>{
        const monthDate=new Date(todayStr()+'T12:00:00Z');
        monthDate.setUTCDate(1);monthDate.setUTCMonth(monthDate.getUTCMonth()-index);
        const createdAt=monthDate.toISOString(),month=createdAt.slice(0,7);
        const historical=backupDataPayload({...db,backupSnapshots:[],enhancements:MapleEnhancements.normalize({events:events.slice(0,count)})});
        return {id:'monthly-'+month,createdAt,month,data:historical};
      });
      storeHuntRecoveryPoint(db,'기존 재획 복구본');
      mergeWeeklyDropRecoveryHistory([{id:'drop-only',createdAt:'2026-09-24',data:{chars:[{name:'검증캐릭터',drops:{fixture:1}}]}}]);
      save();
      return new TextEncoder().encode(JSON.stringify(MapleAccountBridge.snapshot())).length;
    })
  ]);
  const previousWireBytes=4*Math.ceil((plainLength+16)/3);
  assert(previousWireBytes>ledgerProtocol.LEDGER_REQUEST_LIMIT&&previousWireBytes<8_000_000,'uncompressed fixture must reproduce the reported 5–8 MB request');
  assert.equal(saved.status(),200,'a locally persisted multi-month ledger exceeding the old limit must sync');
  await synced(page);
  const latestRevision=account.revision;
  // If a request still encounters a server size error, the origin keeps its changes and can retry.
  await page.route('**/v1/friends/ledger-save',route=>route.fulfill({status:413,contentType:'application/json',body:'{"error":"Request too large"}'}),{times:1});
  await change(page,'unsynced-after-413');
  await page.waitForFunction(()=>MapleAccountSync.getState().dirty&&!MapleAccountSync.getState().busy&&document.getElementById('account-status').textContent.includes('실패'));
  const sizeMessage=await page.locator('#account-status').innerText();
  assert.match(sizeMessage,/저장 한도/);
  assert.match(sizeMessage,/백업/);
  assert.doesNotMatch(sizeMessage,/Request too large/i);
  assert.equal(account.revision,latestRevision);
  assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('mapleTracker.v2')).records['2026-09-24'].sessions.some(row=>row.id==='unsynced-after-413')));
  await page.click('#account-save');await synced(page);
  const expected=await snapshotDigest(page);
  const target=await context(null,largeAccount),restored=await open(target);await pending(restored);
  await restored.click('#account-use-remote');await synced(restored);
  assert.equal(await snapshotDigest(restored),expected,'cross-device restore preserves all event rows, expenses, backups and recovery history');
  const restoredValues=await restored.evaluate(()=>{
    const s=MapleAccountBridge.snapshot();
    return [s.data.enhancements.events.length,String(s.data.expenses[0].amount),s.data.backupSnapshots.map(b=>b.data.enhancements.events.length),s.weeklyDropRecovery[0].id,s.huntRecovery[0].reason,s.huntJournal.some(r=>r.session.id==='unsynced-after-413')];
  });
  assert.deepEqual(restoredValues,[1450,'9876543210',[1250,1100,900],'drop-only','기존 재획 복구본',true]);
  await restored.locator('.account-sync details summary').click();await restored.click('#account-history');
  const previousBackup=restored.locator('#account-server-history').getByRole('button',{name:new RegExp('세대 '+latestRevision+' JSON 백업')});
  const [file]=await Promise.all([restored.waitForEvent('download'),previousBackup.click()]);
  const historical=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  assert.equal(historical.enhancements.events.length,1450);
  assert.equal(historical.huntRecovery[0].reason,'기존 재획 복구본');
  assert(!historical.records['2026-09-24'].sessions.some(row=>row.id==='unsynced-after-413'),'download the previous large revision, not the current one');
  console.log('PASS: large expense ledger, legacy JSON, 413 retry and lossless cross-device restore ('+previousWireBytes+' bytes before compression)');
  await target.close();await source.close();
}
(async()=>{
  ledgerProtocol=await import('../cloudflare-worker/friends-ledger.mjs');
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const c1=await context(fixture),p1=await open(c1);await pending(p1);console.log('fixture: choose initial account');
    assert.equal(saves,0,'장부 선택 전 서버 저장 금지');
    await p1.click('#account-use-local');await synced(p1);console.log('fixture: local migration synced');
    assert.equal(await p1.evaluate(()=>db.records['2026-09-24'].sessions[0].id),'keep-hunt');
    assert.equal(await p1.evaluate(async()=>(await MapleAccountStorage.get('maple:account-ledger:vault:v1:legacy')).values['mapleTracker.legacyRecovery.fixture']!==undefined),true);
    assert(!JSON.stringify(await decode(accounts.get(A))).includes('FIXTURE-SECRET-KEY'),'API key must not reach account server');
    await checkLargeLedger();
    // Another save of identical contents or a lost save acknowledgement can advance only the cloud revision.
    // The already selected ledger reopens without prompting or uploading the same record again.
    accounts.get(A).revision++;
    const beforeResumeSaves=saves;
    await p1.evaluate(key=>{
      const meta=JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key,JSON.stringify({...meta,dirty:true}));
    },META);
    await p1.reload();await synced(p1);
    assert.equal(saves,beforeResumeSaves,'동일 장부 재방문 중 중복 저장 금지');
    assert.equal(await p1.locator('#account-choice').isHidden(),true,'이미 연결한 동일 장부를 다시 선택하지 않음');
    for(const action of ['#account-pull','#account-save']){
      accounts.get(A).revision++;
      await p1.click(action);
      await p1.waitForFunction(revision=>{
        const state=MapleAccountSync.getState();
        return !state.busy&&!state.pending&&state.revision===revision;
      },accounts.get(A).revision);
      assert.equal(saves,beforeResumeSaves,'최신 확인·409 재시도 모두 동일 내용을 중복 저장하지 않음');
    }
    accounts.get(A).revision++;
    await p1.route('**/v1/friends/ledger-read',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture offline"}'}),{times:1});
    await p1.click('#account-save');
    await p1.waitForFunction(()=>document.getElementById('account-status').textContent.includes('다른 기기의 장부를 비교하지 못했습니다'));
    assert(await p1.evaluate(()=>MapleFriends.getState().connected),'재확인 통신 실패로 로그인 상태를 해제하지 않음');
    await p1.click('#account-pull');
    await p1.waitForFunction(rev=>MapleAccountSync.getState().revision===rev,accounts.get(A).revision);
    accounts.get(A).revision++;
    await p1.evaluate(key=>{
      const meta=JSON.parse(localStorage.getItem(key));
      const archives=JSON.parse(localStorage.getItem(HUNT_RECOVERY_KEY)||'[]');
      if(meta.dirty)throw new Error('fixture requires a last-synced ledger');
      archives.unshift({id:'only-local-recovery',createdAt:1,data:{records:{}}});
      localStorage.setItem(HUNT_RECOVERY_KEY,JSON.stringify(archives));
    },META);
    await p1.reload();await pending(p1);
    assert.equal(saves,beforeResumeSaves,'본문이 같아도 복구본이 다르면 자동 연결·덮어쓰기 금지');
    await p1.click('#account-use-local');await synced(p1);
    assert((await decode(accounts.get(A))).huntRecovery.some(row=>row.id==='only-local-recovery'));
    const c2=await context(null),p2=await open(c2);await pending(p2);await p2.click('#account-use-remote');await synced(p2);
    assert.equal(await p2.evaluate(()=>db.records['2026-09-24'].sessions[0].id),'keep-hunt');
    assert.equal(await p2.evaluate(()=>localStorage.getItem('mapleTracker.legacyRecovery.fixture')),null);
    await change(p1,'first-device');await synced(p1);
    await p2.reload();await synced(p2);
    assert(await p2.evaluate(()=>db.records['2026-09-24'].sessions.some(row=>row.id==='first-device')),'깨끗한 기기는 다른 기기에서 저장한 최신 장부를 자동으로 염');
    await p2.evaluate(key=>{const meta=JSON.parse(localStorage.getItem(key));delete meta.base;localStorage.setItem(key,JSON.stringify(meta));},META);
    await change(p1,'second-server-change');await synced(p1);
    await p2.reload();await synced(p2);
    assert(await p2.evaluate(()=>db.records['2026-09-24'].sessions.some(row=>row.id==='second-server-change')),'이전 버전도 서버 기준 세대가 입증되면 최신 장부 자동 복원');
    const missingBase=await p2.evaluate(key=>{const meta=JSON.parse(localStorage.getItem(key));delete meta.base;localStorage.setItem(key,JSON.stringify(meta));return meta.revision;},META);
    await change(p1,'remote-without-base');await synced(p1);
    const historyWithBase=accounts.get(A).history;
    accounts.get(A).history=historyWithBase.filter(row=>row.revision!==missingBase);
    await p2.reload();await pending(p2);
    assert.equal(await p2.evaluate(()=>db.records['2026-09-24'].sessions.some(row=>row.id==='remote-without-base')),false,'기준 세대를 확인할 수 없으면 자동 교체 금지');
    accounts.get(A).history=historyWithBase;
    await p2.click('#account-use-remote');await synced(p2);
    await change(p1,'different-device-edit');await synced(p1);const revision=accounts.get(A).revision;
    await change(p2,'second-device');await pending(p2);assert.equal(accounts.get(A).revision,revision,'충돌시 자동 덮어쓰기 금지');
    await p2.click('#account-use-remote');await synced(p2);
    assert.equal(await p2.evaluate(()=>db.records['2026-09-24'].sessions.some(x=>x.id==='first-device')),true);
    assert.equal(await p2.evaluate(async()=>(await MapleAccountStorage.list('maple:account-ledger:archive:')).some(row=>JSON.stringify(row.value).includes('second-device'))),true);
    await switchTo(p1,B);assert.equal(await p1.locator('#account-use-local').isHidden(),true,'A장부를B에연결버튼숨김');
    const before=await p1.evaluate(()=>localStorage.getItem('mapleTracker.v2'));
    await p1.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='maple:account-ledger:transaction:v1')throw new DOMException('fixture quota','QuotaExceededError');return set.call(this,k,v);};});
    await p1.click('#account-use-remote');await p1.waitForFunction(()=>document.getElementById('account-status').textContent.includes('실패'));
    assert.equal(await p1.evaluate(()=>localStorage.getItem('mapleTracker.v2')),before,'quota error preserves original');
    await p1.reload();await pending(p1);await p1.click('#account-use-remote');await synced(p1);
    assert.equal(await p1.evaluate(()=>Object.keys(db.records).length),0);assert.equal(await p1.evaluate(()=>localStorage.getItem('mapleTracker.legacyRecovery.fixture')),null);
    await switchTo(p1,A);await p1.click('#account-use-remote');await p1.waitForFunction(()=>{const s=window.MapleAccountSync?.getState();return s?.owner==='friends:'+'a'.repeat(64)&&s.connected&&!s.busy;});
    // 돌아온 계정의 기기 원본과 그 사이 바뀐 서버 장부를 다시 비교합니다.
    if(await p1.evaluate(()=>MapleAccountSync.getState().pending))await p1.click('#account-use-remote');await synced(p1);
    assert.equal(await p1.evaluate(()=>db.records['2026-09-24'].sessions.some(x=>x.id==='first-device')),true);
    await navigate(p1,'character');
    await p1.click('#friends-characters-load');await p1.locator('#friends-characters-list button').first().waitFor();await p1.locator('#friends-characters-list button').first().click();
    await p1.waitForFunction(()=>db.chars.length===1&&!document.getElementById('friends-characters-load').disabled);await synced(p1);
    await p1.evaluate(()=>{const c=db.chars[0];c.combatPower='123';c.characterImage='fixture-image';c.characterExp='456';save();});await synced(p1);
    await p1.locator('#friends-characters-list button').first().click();
    await p1.waitForFunction(()=>!document.getElementById('friends-characters-load').disabled);await synced(p1);
    assert.deepEqual(await p1.evaluate(()=>[db.chars.length,db.chars[0].combatPower,db.chars[0].characterImage,db.chars[0].characterExp]),[1,'123','fixture-image','456']);
    await p1.reload();await synced(p1);
    await p1.waitForFunction(()=>fixtureAccountReadyEvents.some(event=>event.allowed&&event.characters===1&&event.timer>0&&event.timeout>0));
    assert.equal(await p1.evaluate(()=>characterSource()),'friends','계정 장부 검증 완료 뒤 개인 키 없이 자동 갱신 예약');
    assert.equal(await p1.locator('#character-personal-api').isVisible(),false,'실제 계정 장부 준비 완료 이벤트 뒤 개인 키 입력 영역 숨김');
    assert.equal(await p1.locator('#character-personal-api').evaluate(el=>el.hidden),true,'페이지 표시 여부와 무관하게 개인 키 입력 자체를 숨김');
    await navigate(p1,'home');await p1.locator('.account-sync details summary').click();await p1.click('#account-history');await p1.locator('#account-server-history button').first().waitFor();
    const [download]=await Promise.all([p1.waitForEvent('download'),p1.locator('#account-server-history button').first().click()]);const bundle=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert(bundle.records);assert(Array.isArray(bundle.huntRecovery));assert(!JSON.stringify(bundle).includes('FIXTURE-SECRET-KEY'));
    const p3=await open(c1);await synced(p3);await change(p1,'same-browser-other-tab');await synced(p1);await p3.locator('dialog.account-stale').waitFor();
    assert.equal(await p3.evaluate(()=>{try{save();return false;}catch{return true;}}),true,'stale tab must not overwrite ledger');await p3.close();
    await p1.evaluate(()=>{
      const original=window.MapleAccountStorage;
      window.MapleAccountStorage={...original,put:async(key,value)=>{
        if(key.includes(':vault:'))throw new DOMException('fixture quota','QuotaExceededError');
        return original.put(key,value);
      }};
      window.restoreFixtureLedgerStorage=()=>{window.MapleAccountStorage=original;};
    });
    await p1.click('#account-logout');await p1.waitForFunction(()=>!window.MapleFriends.getState().connected && document.getElementById('account-status').textContent.includes('보관본을 만들지 못했습니다'));
    assert.equal(await p1.evaluate(()=>sessionStorage.getItem('maple:friends:session')),null,'보관본 쓰기 실패 때도 로그아웃');
    await p1.evaluate(()=>window.restoreFixtureLedgerStorage());await change(p1,'offline-after-logout');
    assert.equal(await p1.evaluate(()=>MapleAccountSync.blocksLegacy()),true,'no legacy upload fallback after logout');
    assert.equal(legacyCalls,0,'계정 사용 중 이전 API 키 보관함 요청 금지');
    await p1.click('#account-legacy');await p1.waitForFunction(()=>window.MapleAccountSync?.getState().owner==='legacy'&&window.MapleAccountBridge);
    assert.equal(await p1.evaluate(()=>db.settings.nexonApiKey),'FIXTURE-SECRET-KEY');
    assert.equal(await p1.evaluate(()=>db.records['2026-09-24'].sessions.length),1,'restore original legacy separately');
    // 실제 localStorage 한도에 가까운 과거 보관본 + 새 archive 쓰기 거부:
    // 이전 구현은 동일 계정 재연결에서 실패하고, 새 구현은 원본 검증 이관 뒤 저장합니다.
    const quotaSeed=structuredClone(fixture);quotaSeed.planner={funds:[{id:'quota-fund',target:'99999999999999999999',updatedAt:1}],trades:[{id:'quota-trade',quantity:2,sales:[{id:'partial',quantity:1,price:'12345',updatedAt:1}],updatedAt:1}]};
    const cq=await context(quotaSeed);
    await cq.addInitScript(({account,seed})=>{
      if(sessionStorage.getItem('quota-fixture-init'))return;sessionStorage.setItem('quota-fixture-init','1');
      localStorage.setItem('maple:account-ledger:active:v1',JSON.stringify({owner:'friends:'+account,revision:0,dirty:true}));
      for(let i=0;i<6;i++)localStorage.setItem('maple:account-ledger:archive:v1:friends:'+account+':old-'+i,JSON.stringify({owner:'friends:'+account,label:'과거 합성 복구본 '+i,createdAt:i+1,values:{'mapleTracker.v2':JSON.stringify(seed),'mapleTracker.legacyRecovery.padding':JSON.stringify({fixture:'x'.repeat(730000)})}}));
      const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('maple:account-ledger:archive:')||key.startsWith('maple:account-ledger:vault:'))throw new DOMException('internal fixture key must not appear','QuotaExceededError');return set.call(this,key,value);};
    },{account:A,seed:quotaSeed});
    const pq=await open(cq);await pending(pq);
    assert.equal(await pq.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('maple:account-ledger:archive:'))),false,'기존 보관본 검증 이관으로 localStorage 공간 확보');
    await pq.click('#account-use-local');await synced(pq);
    assert.equal(await pq.evaluate(()=>db.records['2026-09-24'].sessions[0].id),'keep-hunt');
    assert.equal(await pq.evaluate(()=>db.planner.funds[0].target),'99999999999999999999','큰 금액과 계획 보존');
    assert.equal(await pq.evaluate(()=>db.planner.trades[0].sales[0].id),'partial','부분 판매 보존');
    const quotaArchives=await pq.evaluate(async()=>MapleAccountStorage.list('maple:account-ledger:archive:',{metadataOnly:true}));
    assert.equal(quotaArchives.filter(row=>row.key.includes(':old-')).length,6,'과거 보관본 전부 보존');
    assert(quotaArchives.length>=7,'연결 직전 새 보관본도 저장');
    await pq.locator('.account-sync details summary').click();
    const archiveKey='maple:account-ledger:archive:v1:friends:'+A+':old-0';
    await pq.waitForFunction(key=>[...document.getElementById('account-local-history').options].some(option=>option.value===key),archiveKey);
    await pq.selectOption('#account-local-history',archiveKey);
    const [localDownload]=await Promise.all([pq.waitForEvent('download'),pq.click('#account-local-download')]);
    const localBundle=JSON.parse(fs.readFileSync(await localDownload.path(),'utf8'));assert.equal(localBundle.records['2026-09-24'].sessions[0].id,'keep-hunt');assert.equal(localBundle.planner.trades[0].sales[0].id,'partial');
    assert(!JSON.stringify(localBundle).includes('FIXTURE-SECRET-KEY'));await cq.close();
    // 새 작은 TX 표식에서 중단되어도 IndexedDB의 원본을 복구한 뒤 로드합니다.
    const cr=await context(fixture),pr=await open(cr);await pending(pr);
    await pr.evaluate(async()=>{
      const values=Object.fromEntries(Object.keys(localStorage).filter(key=>/^mapleTracker/i.test(key)).map(key=>[key,localStorage.getItem(key)])),key='maple:account-ledger:archive:v1:legacy:interrupted-fixture';
      await MapleAccountStorage.put(key,{owner:'legacy',label:'중단 합성 원본',createdAt:1,values});
      localStorage.setItem('mapleTracker.v2',JSON.stringify({records:{},chars:[],settings:{}}));
      localStorage.setItem('maple:account-ledger:active:v1',JSON.stringify({owner:'friends:'+'b'.repeat(64),revision:0}));
      localStorage.setItem('maple:account-ledger:transaction:v1',JSON.stringify({storage:'indexedDB',key,beforeMeta:{owner:'legacy',revision:0,dirty:false},createdAt:Date.now()-16000}));
    });
    await pr.reload();await pending(pr);
    await pr.waitForFunction(()=>localStorage.getItem('maple:account-ledger:transaction:v1')===null&&MapleAccountSync.getState().owner==='legacy');
    assert.equal(await pr.evaluate(()=>db.records['2026-09-24'].sessions[0].id),'keep-hunt','중단 전 원본 복원');
    assert(await pr.evaluate(()=>localStorage.getItem('mapleTracker.legacyRecovery.fixture')));await cr.close();
    // 최종 크기는 한도 이하여도 구 recovery와 새 main이 겹치면 초과하는 교체를 재현합니다.
    const cf=await context(fixture),pf=await open(cf);await pending(pf);
    await pf.evaluate(()=>{
      const raw=JSON.parse(localStorage.getItem('mapleTracker.v2'));raw.fixturePadding='x'.repeat(3100000);localStorage.setItem('mapleTracker.v2',JSON.stringify(raw));
      localStorage.setItem('mapleTracker.legacyRecovery.large-fixture','x'.repeat(1800000));
      MapleAccountBridge.storeFromSnapshot=snapshot=>({'mapleTracker.v2':JSON.stringify({...snapshot.data,fixturePadding:'x'.repeat(3700000)})});
    });
    await pf.click('#account-use-remote');await synced(pf);
    assert.equal(await pf.evaluate(()=>JSON.parse(localStorage.getItem('mapleTracker.v2')).fixturePadding.length),3700000,'겹치는 크기 없이 최종 장부 전환');
    assert.equal(await pf.evaluate(()=>localStorage.getItem('mapleTracker.legacyRecovery.large-fixture')),null,'이전 계정 복구 키는 보관함에서 격리');
    assert.equal(await pf.evaluate(async()=>(await MapleAccountStorage.get('maple:account-ledger:vault:v1:legacy')).values['mapleTracker.legacyRecovery.large-fixture'].length),1800000,'이전 복구 키는 삭제 없이 별도 보존');await cf.close();
    // Web Locks가 없는 환경: 원본을 읽는 동안 다른 탭이 전환을 완료했다면 덮어쓰지 않습니다.
    const cn=await context(fixture),pn=await open(cn);await pending(pn);
    await pn.evaluate(async()=>{
      const values={'mapleTracker.v2':localStorage.getItem('mapleTracker.v2')},key='maple:account-ledger:archive:v1:legacy:no-locks-fixture';
      await MapleAccountStorage.put(key,{owner:'legacy',label:'합성 동시 전환',createdAt:1,values});
      localStorage.setItem('maple:account-ledger:transaction:v1',JSON.stringify({storage:'indexedDB',key,beforeMeta:{owner:'legacy',revision:0,dirty:false},createdAt:Date.now()-16000}));
    });
    await cn.addInitScript(()=>{
      Object.defineProperty(navigator,'locks',{value:undefined});let storage;
      Object.defineProperty(window,'MapleAccountStorage',{get:()=>storage,set:value=>{storage={...value,get:async key=>{
        const row=await value.get(key);
        if(key.endsWith(':no-locks-fixture')&&localStorage.getItem('maple:account-ledger:transaction:v1')){
          const latest=JSON.parse(localStorage.getItem('mapleTracker.v2'));latest.records['2026-09-24'].sessions[0].id='latest-completed';
          localStorage.setItem('mapleTracker.v2',JSON.stringify(latest));localStorage.removeItem('maple:account-ledger:transaction:v1');
        }return row;
      }};}});
    });
    await pn.reload();await pending(pn);
    await pn.waitForFunction(()=>localStorage.getItem('maple:account-ledger:transaction:v1')===null&&MapleAccountSync.getState().owner==='legacy');
    assert.equal(await pn.evaluate(()=>db.records['2026-09-24'].sessions[0].id),'latest-completed','다른 탭에서 완료한 최신 장부 유지');await cn.close();
    // 전환을 마친 뒤의 이전 API 키 보관함 재접속은 정상 동작입니다.
    assert.equal(errors.length,0,errors.join('\n'));
    fs.mkdirSync(path.join(root,'.tools/ui-review'),{recursive:true});await p2.screenshot({path:path.join(root,'.tools/ui-review/nexon-account-desktop.png')});
    await p2.setViewportSize({width:390,height:844});
    if(await p2.evaluate(()=>document.getElementById('workspace-sidebar').classList.contains('is-open')))await p2.locator('.mobile-nav [data-menu-toggle]').click();
    await p2.waitForFunction(()=>document.getElementById('workspace-sidebar').getBoundingClientRect().right<=1);
    await p2.locator('#account-title').scrollIntoViewIfNeeded();await p2.screenshot({path:path.join(root,'.tools/ui-review/nexon-account-mobile.png')});
    assert.equal(await p2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');
    console.log('PASS: migration, encrypted reload, device conflicts, quota rollback, full archive migration, preserved JSON/planner/partial sale, interrupted IndexedDB journal recovery, A→B→A, character preservation, stale tabs, logout and legacy return');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
