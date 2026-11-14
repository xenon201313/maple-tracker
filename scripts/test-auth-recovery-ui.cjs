// 실제 계정 없이 미검증 연결의 재확인·만료·중복 로그인 차단을 실제 UI에서 확인합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),{fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),account='a'.repeat(64);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,bytes)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(bytes));});
const snapshot=page=>page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(key=>/^mapleTracker|^maple:account-ledger/.test(key)).sort().map(key=>[key,localStorage.getItem(key)]))));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});await fixtureDismissPatchNotes(context);
  await context.addInitScript(account=>{
   sessionStorage.setItem('maple:friends:session',JSON.stringify({state:account,proof:'f'.repeat(64),account}));
   sessionStorage.setItem('auth-recovery-keep','preserved');
   localStorage.setItem('mapleTracker.v2',JSON.stringify({records:{'2026-11-13':{sessions:[{id:'auth-keep-hunt',runs:1,meso:'123456789',erda:2}]}},chars:[],profits:[],expenses:[],settings:{},backupSnapshots:[]}));
   localStorage.setItem('mapleTracker.legacyRecovery.fixture',JSON.stringify({records:{'2026-09-01':{sessions:[{id:'keep-recovery',runs:1,meso:'99'}]}}}));
  },account);
  let mode='pending',releaseInitial,starts=0,statuses=0,saves=0,legacy=0;
  const scopes=['maplestory.characterlist','maplestory.scheduler','maplestory.starforce','maplestory.potential','maplestory.cube','maplestory.soulpotential'];
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin===origin||url.protocol==='data:')return route.continue();
   const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname.startsWith('/v1/sync/')){legacy++;return send({},503);}
   if(!url.pathname.startsWith('/v1/friends/'))return route.abort();
   const action=url.pathname.split('/').at(-1);
   if(action==='config')return send({ready:true,ledgerReady:true,scopes});
   if(action==='status'){
    statuses++;if(mode==='pending')await new Promise(resolve=>{releaseInitial=resolve;});
    if(mode==='unavailable')return send({error:'일시적인 확인 실패',errorCode:'SERVICE_UNAVAILABLE'},503);
    if(mode==='expired')return send({error:'연결이 만료되었습니다.',errorCode:'SESSION_EXPIRED'},401);
    return send({connected:true,account,scopes});
   }
   if(action==='ledger-key')return send({account,key:'1'.repeat(64)});
   if(action==='ledger-read')return send({account,revision:0,payload:null});
   if(action==='ledger-save'){saves++;return send({error:'검증 중 저장 금지'},409);}
   if(action==='start'){starts++;return send({state:'b'.repeat(64),url:'https://openid.nexon.com/oauth2/authorize?state='+'b'.repeat(64)});}
   if(action==='logout')return send({ok:true});
   return send({error:'검증에서 허용하지 않은 동작'},400);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?page=home');await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>window.MapleFriends?.getState().hasSession&&MapleFriends.getState().checking&&MapleFriends.getState().ready);
  assert.equal(await page.locator('#account-login').isHidden(),true,'저장 연결 확인 중에는 다시 로그인 버튼을 표시하지 않음');
  assert.equal(await page.locator('#account-recheck').isVisible(),true);assert.equal(await page.locator('#account-recheck').isDisabled(),true);
  assert.equal(await page.locator('[data-desk-account] span').innerText(),'연결 확인');
  const before=await snapshot(page);
  await page.evaluate(()=>{window.authRecoveryConnects=Promise.allSettled([MapleFriends.connect(),MapleFriends.connect()]);});
  for(let attempts=0;!releaseInitial&&attempts<100;attempts++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(typeof releaseInitial,'function');
  mode='unavailable';releaseInitial();await page.evaluate(()=>window.authRecoveryConnects);
  await page.waitForFunction(()=>!MapleFriends.getState().checking&&!!MapleFriends.getState().error);
  assert.equal(statuses,1,'연결 확인과 로그인 버튼 요청은 같은 검증을 기다림');assert.equal(starts,0);
  assert.equal(await page.locator('#account-login').isHidden(),true);assert.equal(await page.locator('#account-recheck').isEnabled(),true);
  assert.equal(await snapshot(page),before,'일시 오류가 장부·복구·보관 표식을 바꾸지 않음');
  mode='valid';await page.locator('#account-recheck').click();
  await page.waitForFunction(()=>MapleFriends.getState().connected&&!MapleFriends.getState().checking&&MapleAccountSync.getState().pending);
  assert.equal(await page.locator('#account-login').isHidden(),true);assert.equal(await page.locator('[data-desk-account] span').innerText(),'계정·저장');assert.equal(await page.locator('#account-choice').isVisible(),true,'연결 복구 뒤에도 장부 선택은 사용자가 결정');
  await page.evaluate(()=>Promise.all([MapleFriends.connect(),MapleFriends.connect()]));assert.equal(starts,0,'연결된 계정에서 로그인 재시도는 새 인증을 시작하지 않음');
  await page.evaluate(()=>{const row=document.createElement('div');row.dataset.recheckKeep='true';row.textContent='같은 계정의 캐릭터 목록';document.getElementById('friends-characters-list').append(row);});
  mode='unavailable';await page.evaluate(()=>MapleFriends.recheck());
  assert.equal(await page.evaluate(()=>MapleFriends.getState().connected),true,'확인된 계정은 일시 오류로 연결 해제하지 않음');assert.equal(await page.locator('#account-login').isHidden(),true);
  assert.equal(await page.locator('[data-recheck-keep]').count(),1,'같은 계정의 상태 확인만으로 캐릭터 목록을 지우지 않음');
  assert.equal(await page.locator('#account-recheck').isVisible(),true,'연결은 유지하면서 일시 오류를 다시 확인할 수 있음');
  mode='expired';await page.evaluate(()=>MapleFriends.recheck());
  await page.waitForFunction(()=>!MapleFriends.getState().connected&&!MapleFriends.getState().checking&&!MapleFriends.getState().hasSession);
  assert.equal(await page.locator('#account-login').isVisible(),true);assert.equal(await page.locator('#account-login').isEnabled(),true,'서버가 실제 만료를 확인한 때만 재로그인 허용');
  assert.equal(await snapshot(page),before,'복구와 만료 처리 뒤에도 장부·복구·보관 표식을 유지');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('auth-recovery-keep')),'preserved');assert.equal(saves,0,'명시적인 장부 선택 전 자동 업로드 금지');assert.equal(legacy,0,'저장 세션이 있는 동안 이전 API 키 동기화로 우회하지 않음');assert.deepEqual(errors,[]);
  await context.close();console.log('인증 UI: 확인 중 버튼·일시 503 보존·재확인 복구·중복 OAuth 0회·실제 만료 재로그인·장부 선택/복구 보존 통과');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
