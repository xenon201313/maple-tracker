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
const accounts=new Map([A,B].map(id=>[id,{account:id,key:(id===A?'1':'2').repeat(64),revision:0,payload:null,history:[]}])) ;
let origin,browser,legacyCalls=0,saves=0;const errors=[];
const fixture={records:{'2026-09-24':{sessions:[{id:'keep-hunt',meso:'123456789',erda:2,runs:1}]}},chars:[],profits:[],expenses:[],settings:{nexonApiKey:'FIXTURE-SECRET-KEY'},backupSnapshots:[]};
async function context(seed,account=A){
  const c=await browser.newContext({viewport:{width:1360,height:1000},acceptDownloads:true});c.setDefaultTimeout(15000);await fixtureDismissPatchNotes(c);
  await c.addInitScript(({seed,account})=>{
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
      if(body.revision!==acc.revision)return send({error:'다른 기기 변경',errorCode:'LEDGER_CONFLICT',account:acc.account,revision:acc.revision},409);
      saves++;acc.revision++;acc.payload=body.payload;acc.history.unshift({revision:acc.revision,savedAt:Date.now(),payload:body.payload});return send({account:acc.account,revision:acc.revision,savedAt:Date.now()});
    }
    if(action==='ledger-history')return send({account:acc.account,snapshots:acc.history,nextBeforeRevision:null});
    if(action==='character-list')return send({account_list:[{account_id:'fixture-only',character_list:[{ocid:'ocid-fixture',character_name:'계정캐릭터',world_name:'크로아',character_class:'아크',character_level:280}]}]});
    if(action==='scheduler')return send({date:'2026-09-24T00:00+09:00',boss_contents:[]});
    return send({error:'Unknown fixture action '+action},404);
  });return c;
}
async function open(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(origin+'/?page=home');return p;}
async function pending(p){await p.waitForFunction(()=>window.MapleAccountSync?.getState().pending);}
async function synced(p){try{await p.waitForFunction(()=>{const s=window.MapleAccountSync?.getState();return s?.connected&&!s.dirty&&!s.pending&&!s.busy&&s.revision>0;});}catch(error){console.error('Fixture state',await p.evaluate(()=>({state:MapleAccountSync.getState(),status:document.getElementById('account-status').textContent,owner:JSON.parse(localStorage.getItem('maple:account-ledger:active:v1'))?.owner,errors:document.querySelector('dialog')?.textContent})));throw error;}}
async function change(p,name){await p.evaluate(name=>{db.records['2026-09-24'].sessions.push({id:name,meso:'77',runs:1});save();},name);}
async function switchTo(p,id){await p.evaluate(id=>sessionStorage.setItem('maple:friends:session',JSON.stringify({state:id,proof:'f'.repeat(64),account:id})),id);await p.reload();await pending(p);}
async function decode(acc){const key=await webcrypto.subtle.importKey('raw',Buffer.from(acc.key,'hex'),{name:'AES-GCM'},false,['decrypt']);return JSON.parse(Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(acc.payload.iv,'base64')},key,Buffer.from(acc.payload.ciphertext,'base64'))).toString());}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
    const c1=await context(fixture),p1=await open(c1);await pending(p1);console.log('fixture: choose initial account');
    assert.equal(saves,0,'장부 선택 전 서버 저장 금지');
    await p1.click('#account-use-local');await synced(p1);console.log('fixture: local migration synced');
    assert.equal(await p1.evaluate(()=>db.records['2026-09-24'].sessions[0].id),'keep-hunt');
    assert.equal(await p1.evaluate(()=>JSON.parse(localStorage.getItem('maple:account-ledger:vault:v1:legacy')).values['mapleTracker.legacyRecovery.fixture']!==undefined),true);
    assert(!JSON.stringify(await decode(accounts.get(A))).includes('FIXTURE-SECRET-KEY'),'API key must not reach account server');
    const c2=await context(null),p2=await open(c2);await pending(p2);await p2.click('#account-use-remote');await synced(p2);
    assert.equal(await p2.evaluate(()=>db.records['2026-09-24'].sessions[0].id),'keep-hunt');
    assert.equal(await p2.evaluate(()=>localStorage.getItem('mapleTracker.legacyRecovery.fixture')),null);
    await change(p1,'first-device');await synced(p1);const revision=accounts.get(A).revision;
    await change(p2,'second-device');await pending(p2);assert.equal(accounts.get(A).revision,revision,'충돌시 자동 덮어쓰기 금지');
    await p2.click('#account-use-remote');await synced(p2);
    assert.equal(await p2.evaluate(()=>db.records['2026-09-24'].sessions.some(x=>x.id==='first-device')),true);
    assert.equal(await p2.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('maple:account-ledger:archive:')).some(k=>localStorage.getItem(k).includes('second-device'))),true);
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
    await p1.click('a.tab[data-page="character"], button.tab[data-page="character"]');
    await p1.click('#friends-characters-load');await p1.locator('#friends-characters-list button').first().waitFor();await p1.locator('#friends-characters-list button').first().click();await synced(p1);
    await p1.evaluate(()=>{const c=db.chars[0];c.combatPower='123';c.characterImage='fixture-image';c.characterExp='456';save();});await synced(p1);
    await p1.locator('#friends-characters-list button').first().click();await synced(p1);
    assert.deepEqual(await p1.evaluate(()=>[db.chars.length,db.chars[0].combatPower,db.chars[0].characterImage,db.chars[0].characterExp]),[1,'123','fixture-image','456']);
    await p1.click('.tab[data-page="home"]');await p1.locator('.account-sync details summary').click();await p1.click('#account-history');await p1.locator('#account-server-history button').first().waitFor();
    const [download]=await Promise.all([p1.waitForEvent('download'),p1.locator('#account-server-history button').first().click()]);const bundle=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert(bundle.records);assert(Array.isArray(bundle.huntRecovery));assert(!JSON.stringify(bundle).includes('FIXTURE-SECRET-KEY'));
    const p3=await open(c1);await synced(p3);await change(p1,'same-browser-other-tab');await synced(p1);await p3.locator('dialog.account-stale').waitFor();
    assert.equal(await p3.evaluate(()=>{try{save();return false;}catch{return true;}}),true,'stale tab must not overwrite ledger');await p3.close();
    await p1.click('#account-logout');await p1.waitForFunction(()=>!window.MapleFriends.getState().connected);await change(p1,'offline-after-logout');
    assert.equal(await p1.evaluate(()=>MapleAccountSync.blocksLegacy()),true,'no legacy upload fallback after logout');
    assert.equal(legacyCalls,0,'계정 사용 중 이전 API 키 보관함 요청 금지');
    await p1.click('#account-legacy');await p1.waitForFunction(()=>window.MapleAccountSync?.getState().owner==='legacy'&&window.MapleAccountBridge);
    assert.equal(await p1.evaluate(()=>db.settings.nexonApiKey),'FIXTURE-SECRET-KEY');
    assert.equal(await p1.evaluate(()=>db.records['2026-09-24'].sessions.length),1,'restore original legacy separately');
    // 전환을 마친 뒤의 이전 API 키 보관함 재접속은 정상 동작입니다.
    assert.equal(errors.length,0,errors.join('\n'));
    fs.mkdirSync(path.join(root,'.tools/ui-review'),{recursive:true});await p2.screenshot({path:path.join(root,'.tools/ui-review/nexon-account-desktop.png')});
    await p2.setViewportSize({width:390,height:844});
    if(await p2.evaluate(()=>document.getElementById('workspace-sidebar').classList.contains('is-open')))await p2.locator('.mobile-nav [data-menu-toggle]').click();
    await p2.waitForFunction(()=>document.getElementById('workspace-sidebar').getBoundingClientRect().right<=1);
    await p2.locator('#account-title').scrollIntoViewIfNeeded();await p2.screenshot({path:path.join(root,'.tools/ui-review/nexon-account-mobile.png')});
    assert.equal(await p2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow');
    console.log('PASS: migration, encrypted reload, device conflicts, quota rollback, A→B→A, character preservation, JSON recovery, stale tabs, logout and legacy return');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
