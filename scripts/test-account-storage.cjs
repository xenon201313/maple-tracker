const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const ARCHIVE='maple:account-ledger:archive:v1:',VAULT='maple:account-ledger:vault:v1:',TX='maple:account-ledger:transaction:v1';
const owner='friends:'+'a'.repeat(64),archiveKey=ARCHIVE+owner+':fixture',vaultKey=VAULT+'legacy';
const values={'mapleTracker.v2':JSON.stringify({updatedAt:100,records:{'2026-10-28':{sessions:[{id:'synthetic-hunt',meso:'12345678901234567890'}]}},planner:{funds:[{id:'synthetic-fund',target:'98765432109876543210'}]}}),'mapleTracker.huntRecovery.v1':JSON.stringify([{reason:'synthetic-recovery',data:{records:{}}}]),'mapleTracker.weeklyDropRecovery.v1':JSON.stringify([{reason:'synthetic-drop',data:{chars:[]}}]),'mapleTracker.huntJournal.v1':'[{"id":"synthetic-journal"}]','mapleTracker.legacyRecovery.fixture':'{"records":{"fixture":{}}}'};
const archived={owner,label:'합성 보관본',createdAt:100,values},vaulted={meta:{owner:'legacy',revision:0,dirty:true},values};
const server=http.createServer((req,res)=>{
  if(req.url==='/assets/account-storage.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(fs.readFileSync(path.join(root,'assets/account-storage.js')));return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><meta charset="utf-8"><script src="/assets/account-storage.js"></script>');
});
let browser,origin;const errors=[];
async function page(seed,mode='normal'){
  const context=await browser.newContext();
  await context.addInitScript(({seed,mode})=>{
    window.fixtureUnhandled=[];addEventListener('unhandledrejection',event=>window.fixtureUnhandled.push(event.reason?.message||String(event.reason)));
    for(const [key,value] of Object.entries(seed))localStorage.setItem(key,value);
    if(mode==='unavailable')Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true});
    if(mode==='quota'){IDBObjectStore.prototype.put=function(){throw new DOMException('fixture only','QuotaExceededError');};}
    if(mode==='delete-failure'){
      const original=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key.startsWith('maple:account-ledger:archive:v1:'))throw new DOMException('fixture only','SecurityError');return original.call(this,key);};
    }
  },{seed,mode});
  const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));await p.goto(origin);return {p,context};
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  try{
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
    const seed={[archiveKey]:JSON.stringify(archived),[vaultKey]:JSON.stringify(vaulted),[TX]:'{"fixture":"old-transaction-must-remain"}','unrelated-site-preference':'keep','mapleTracker.v2':values['mapleTracker.v2'],'mapleTracker.huntRecovery.v1':values['mapleTracker.huntRecovery.v1']};
    const first=await page(seed);await first.p.evaluate(()=>MapleAccountStorage.ready());
    assert.deepEqual(await first.p.evaluate(key=>MapleAccountStorage.get(key),archiveKey),archived);
    assert.deepEqual(await first.p.evaluate(key=>MapleAccountStorage.get(key),vaultKey),vaulted);
    const retained=await first.p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])));
    assert.equal(retained[archiveKey],undefined);assert.equal(retained[vaultKey],undefined);
    for(const key of [TX,'unrelated-site-preference','mapleTracker.v2','mapleTracker.huntRecovery.v1'])assert.equal(retained[key],seed[key]);
    assert.deepEqual(await first.p.evaluate(prefix=>MapleAccountStorage.list(prefix),ARCHIVE),[{key:archiveKey,value:archived}]);
    const before=JSON.stringify(retained);
    await first.p.evaluate(async({prefix,owner})=>{for(let i=0;i<18;i++)await MapleAccountStorage.put(prefix+owner+':large-'+i,{owner,label:'synthetic',createdAt:i,values:{'mapleTracker.v2':JSON.stringify({records:{},padding:'x'.repeat(500000)})}});},{prefix:ARCHIVE,owner});
    assert.equal(JSON.stringify(await first.p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])))),before,'새 보관본은 localStorage 용량을 늘리지 않음');
    assert.equal((await first.p.evaluate(prefix=>MapleAccountStorage.list(prefix),ARCHIVE)).length,19);
    const compact=await first.p.evaluate(prefix=>MapleAccountStorage.list(prefix,{metadataOnly:true}),ARCHIVE);
    assert.equal(compact.length,19);assert(compact.every(row=>!('values' in row.value)));assert(JSON.stringify(compact).length<10000,'9MB 보관본 목록은 작은 메타데이터만 반환');
    assert.deepEqual(await first.p.evaluate(prefix=>MapleAccountStorage.list(prefix,{metadataOnly:true}),VAULT),[{key:vaultKey,value:{meta:vaulted.meta}}]);
    await first.p.evaluate(async()=>{await MapleAccountStorage.put('maple:account-ledger:fixture-remove',{kept:true});await MapleAccountStorage.remove('maple:account-ledger:fixture-remove');});
    assert.equal(await first.p.evaluate(()=>MapleAccountStorage.get('maple:account-ledger:fixture-remove')),null);
    await first.p.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(key==='maple:account-ledger:fixture-write-failure')throw new DOMException('fixture only','QuotaExceededError');return put.call(this,value,key);};});
    assert.equal(await first.p.evaluate(async()=>{try{await MapleAccountStorage.put('maple:account-ledger:fixture-write-failure',{synthetic:true});return null;}catch(error){return error.name;}}),'QuotaExceededError','새 보관본 저장 실패를 성공으로 숨기지 않음');
    assert.equal(await first.p.evaluate(()=>MapleAccountStorage.get('maple:account-ledger:fixture-write-failure')),null);
    assert.deepEqual(await first.p.evaluate(()=>fixtureUnhandled),[]);await first.context.close();

    for(const mode of ['unavailable','quota']){
      const fixture=await page({[archiveKey]:JSON.stringify(archived)},mode);
      const failure=await fixture.p.evaluate(async()=>{try{await MapleAccountStorage.ready();return null;}catch(error){return {name:error.name,code:error.code,message:error.message};}});
      assert(failure);if(mode==='unavailable')assert.equal(failure.code,'STORAGE_UNAVAILABLE');else assert.equal(failure.name,'QuotaExceededError');
      assert.equal(await fixture.p.evaluate(key=>localStorage.getItem(key),archiveKey),JSON.stringify(archived),'이관 실패시 원본 유지');
      assert.deepEqual(await fixture.p.evaluate(()=>fixtureUnhandled),[]);await fixture.context.close();
    }
    const malformed=await page({[archiveKey]:'{invalid-json'});
    assert.equal(await malformed.p.evaluate(async()=>{try{await MapleAccountStorage.ready();return null;}catch(error){return error.code;}}),'STORAGE_INVALID_DATA');
    assert.equal(await malformed.p.evaluate(key=>localStorage.getItem(key),archiveKey),'{invalid-json');await malformed.context.close();

    const duplicate=await page({[archiveKey]:JSON.stringify(archived)},'delete-failure');await duplicate.p.evaluate(()=>MapleAccountStorage.ready());
    assert.equal((await duplicate.p.evaluate(prefix=>MapleAccountStorage.list(prefix),ARCHIVE)).length,1,'삭제 권한 실패 시 동일키 중복 방지');
    const newer={...archived,createdAt:200,label:'새 합성 보관본'};
    await duplicate.p.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:archiveKey,value:newer});
    assert.deepEqual(await duplicate.p.evaluate(key=>MapleAccountStorage.get(key),archiveKey),newer,'남아 있는 최신 localStorage 사본 우선');
    assert.deepEqual((await duplicate.p.evaluate(prefix=>MapleAccountStorage.list(prefix),ARCHIVE))[0].value,newer);
    assert.deepEqual((await duplicate.p.evaluate(prefix=>MapleAccountStorage.list(prefix,{metadataOnly:true}),ARCHIVE))[0].value,{owner:newer.owner,label:newer.label,createdAt:newer.createdAt});
    assert.deepEqual(await duplicate.p.evaluate(()=>fixtureUnhandled),[]);await duplicate.context.close();
    const conflict=await page({[archiveKey]:JSON.stringify(archived)});await conflict.p.evaluate(()=>MapleAccountStorage.ready());
    await conflict.p.evaluate(({key,value})=>MapleAccountStorage.put(key,value),{key:archiveKey,value:newer});
    // 재시작 시 남은 이전 localStorage 사본을 합성하여 양쪽 사본 보존을 검사합니다.
    await conflict.p.reload();await conflict.p.evaluate(()=>MapleAccountStorage.ready());
    assert.deepEqual(await conflict.p.evaluate(key=>MapleAccountStorage.get(key),archiveKey),newer);
    const preserved=await conflict.p.evaluate(prefix=>MapleAccountStorage.list(prefix),ARCHIVE);
    assert.equal(preserved.length,2);assert(preserved.some(row=>JSON.stringify(row.value)===JSON.stringify(archived)));
    assert.equal(await conflict.p.evaluate(key=>localStorage.getItem(key),archiveKey),null);
    await conflict.context.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: IndexedDB migration/readback, recovery values, 9 MB archive append without localStorage growth, failed migration/write preservation, malformed source preservation, conflicting copies, legacy duplicate/newer compatibility and remove');
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
