// Fresh Chrome profiles and mock Friends responses only.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const html='<meta charset="utf-8"><label><input type="checkbox" data-remember-login="home"><small></small></label><script src="/assets/device-login.js"></script><script src="/assets/friends-expenses.js"></script>';
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/') return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
  if(!['/assets/device-login.js','/assets/friends-expenses.js'].includes(pathname))return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':'text/javascript'}).end(fs.readFileSync(path.join(root,pathname)));
});
const session={state:'a'.repeat(64),proof:'b'.repeat(64),account:'c'.repeat(64)};
const independent={state:'d'.repeat(64),proof:'e'.repeat(64),account:'f'.repeat(64)};
const profilePrefix=path.join(os.tmpdir(),'maple-device-login-test-');
const profile=fs.mkdtempSync(profilePrefix);
let context,origin,start=0,revoked=0,status=200;
async function launch() {
  context=await chromium.launchPersistentContext(profile,{headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
  await context.route('https://maple-tracker-sync.xenon201313.workers.dev/v1/friends/**',async route=>{
    const action=route.request().url().split('/').at(-1);
    let body={ready:true}, code=200;
    if(action==='status' || action==='finish'){
      const identity=route.request().postDataJSON()?.state===independent.state?independent:session;
      code=status;body=code===200?{connected:true,account:identity.account,scopes:[]}:{error:'unavailable'};
    }
    if(action==='start'){start++;body={};}
    if(action==='logout'){revoked++;body={ok:true};}
    await route.fulfill({status:code,json:body,headers:{'Access-Control-Allow-Origin':'*'}});
  });
}
const waitConnected=page=>page.waitForFunction(()=>MapleFriends.getState().connected && !MapleFriends.getState().checking);
const waitChecked=page=>page.waitForFunction(()=>MapleFriends.getState().ready && !MapleFriends.getState().checking);
async function fresh() {const page=await context.newPage();await page.goto(origin);return page;}
async function signIn(page,remember=false) {
  await page.evaluate(({session,remember})=>sessionStorage.setItem('maple:friends:flow',JSON.stringify({...session,createdAt:Date.now(),returnPage:'home',remember})),{session,remember});
  await page.goto(origin+'/?page=home&state='+session.state+'&code=test');
  await waitConnected(page);
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  await launch();
  let page=await fresh();await waitChecked(page);
  assert.equal(await page.locator('input').isChecked(),false);
  await signIn(page);let other=await fresh();await waitChecked(other);
  assert.equal(await other.evaluate(()=>MapleFriends.getState().connected),false,'ordinary mode does not enter other tabs');
  assert.equal(await page.evaluate(()=>MapleDeviceLogin.current()),'');
  status=503;await page.reload();
  await page.waitForFunction(()=>MapleFriends.getState().error && !MapleFriends.getState().checking);
  assert(await page.locator('input').isDisabled(),'an unverified offline tab cannot display a successful opt-in');
  status=200;await page.evaluate(()=>MapleFriends.recheck());await waitConnected(page);
  const opening=await context.newPage();
  let releaseConfig,enteredConfig;
  const held=new Promise(resolve=>{releaseConfig=resolve;});
  const entered=new Promise(resolve=>{enteredConfig=resolve;});
  await opening.route('**/v1/friends/config',async route=>{enteredConfig();await held;await route.fulfill({json:{ready:true},headers:{'Access-Control-Allow-Origin':'*'}});});
  await opening.goto(origin);await entered;
  await page.locator('input').check();
  await page.waitForFunction(()=>MapleFriends.getState().remembered);
  releaseConfig();await waitConnected(opening);await opening.close();
  await waitConnected(other);
  const atRest=await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('maple-device-login');r.onsuccess=()=>resolve(r.result);});
    const row=await new Promise(resolve=>{const r=db.transaction('sessions').objectStore('sessions').get(MapleDeviceLogin.current());r.onsuccess=()=>resolve(r.result);});
    return {extractable:row.key.extractable,cipher:row.cipher.byteLength,storage:JSON.stringify(localStorage),plainFields:['proof','state','account'].some(k=>k in row)};
  });
  assert.equal(atRest.extractable,false);assert(atRest.cipher>64);assert.equal(atRest.plainFields,false);
  for(const value of Object.values(session))assert(!atRest.storage.includes(value));
  await context.close();await launch();page=await fresh();await waitConnected(page);
  assert(await page.locator('input').isChecked(),'survives full browser restart');
  other=await fresh();await waitConnected(other);
  await page.locator('input').uncheck();
  await page.waitForFunction(()=>MapleFriends.getState().connected && !MapleFriends.getState().remembered);
  await other.waitForFunction(()=>!MapleFriends.getState().hasSession);
  await page.locator('input').check();await waitConnected(other);
  await other.evaluate(()=>MapleFriends.disconnect());
  await page.waitForFunction(()=>!MapleFriends.getState().hasSession);
  assert.equal(revoked,1);
  await signIn(page,true);
  assert(await page.evaluate(()=>MapleFriends.getState().remembered),'explicit opt-in survives provider callback');
  other=await fresh();await waitConnected(other);
  await other.evaluate(identity=>sessionStorage.setItem('maple:friends:session',JSON.stringify(identity)),independent);
  await other.reload();await waitConnected(other);
  assert.equal(await other.evaluate(()=>MapleFriends.getState().account),independent.account);
  assert(!await other.locator('input').isChecked(),'separately signed-in account does not inherit the other account’s preference');
  await other.evaluate(()=>MapleFriends.disconnect());
  assert(await page.evaluate(()=>MapleFriends.getState().remembered && !!MapleDeviceLogin.current()),'another independent account logout does not erase the remembered one');
  await other.close();
  await page.close();status=503;page=await fresh();
  await page.waitForFunction(()=>MapleFriends.getState().error && !MapleFriends.getState().checking);
  assert(await page.evaluate(()=>MapleFriends.getState().hasSession));
  assert(!await page.evaluate(()=>MapleFriends.getState().connected));
  await assert.rejects(page.evaluate(()=>MapleFriends.connect()));
  status=200;await page.evaluate(()=>MapleFriends.recheck());await waitConnected(page);
  status=401;await page.evaluate(()=>MapleFriends.recheck());
  await page.waitForFunction(()=>!MapleFriends.getState().hasSession);
  status=200;await signIn(page,true);
  await page.evaluate(()=>{Date.now=()=>new Date().getTime()+15*86400000;window.dispatchEvent(new Event('pageshow'));});
  await page.waitForFunction(()=>!MapleFriends.getState().remembered && MapleFriends.getState().connected);
  assert.equal(await page.evaluate(()=>MapleDeviceLogin.current()),'');
  await page.close();page=await fresh();await signIn(page,true);
  other=await context.newPage();
  await other.addInitScript(()=>{Date.now=()=>new Date().getTime()+15*86400000;});
  await other.goto(origin);await waitChecked(other);
  assert(!await other.evaluate(()=>MapleFriends.getState().hasSession),'expired bookmark cannot authenticate a new tab');
  await other.close();await signIn(page,true);
  const blocked=await context.newPage();
  await blocked.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('disabled','SecurityError');}}));
  await blocked.goto(origin);
  await blocked.waitForFunction(()=>!MapleFriends.getState().checking && MapleFriends.getState().error);
  assert(!await blocked.evaluate(()=>MapleFriends.getState().connected),'storage denial never unlocks an account');
  await blocked.locator('input').uncheck();
  await waitChecked(blocked);
  assert(!await blocked.evaluate(()=>MapleFriends.getState().hasSession),'forget works when remembered credential cannot be read');
  await signIn(blocked);
  await blocked.locator('input').click();
  await blocked.waitForFunction(()=>MapleFriends.getState().error);
  assert(await blocked.evaluate(()=>MapleFriends.getState().connected && !MapleFriends.getState().remembered),'storage denial retains current tab login');
  assert.equal(await blocked.evaluate(()=>MapleDeviceLogin.current()),'');
  await blocked.close();
  await signIn(page,true);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('maple-device-login');r.onsuccess=resolve;r.onerror=reject;}));
  other=await fresh();await waitChecked(other);
  assert(!await other.evaluate(()=>MapleFriends.getState().hasSession),'missing encrypted record clears bookmark');
  await signIn(page);
  await signIn(other);
  await page.evaluate(()=>{
    const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);
    crypto.subtle.encrypt=async(...args)=>{await new Promise(resolve=>{window.resumeDeviceSave=resolve;});return encrypt(...args);};
  });
  await page.locator('input').check();await page.waitForFunction(()=>typeof window.resumeDeviceSave==='function');
  await other.evaluate(()=>MapleFriends.disconnect());
  await page.waitForFunction(()=>!MapleFriends.getState().hasSession);
  await page.evaluate(()=>window.resumeDeviceSave());
  await page.waitForFunction(()=>!document.querySelector('input').disabled);
  assert.equal(await page.evaluate(()=>MapleDeviceLogin.current()),'','an in-flight opt-in cannot undo logout in another tab');
  assert.equal(start,0,'no automatic OAuth redirects');
  console.log('기기 자동 로그인: 기본 꺼짐, 명시적 동의·브라우저 재시작·암호화 저장·다중 탭·로그아웃·오프라인·서버 및 기기 만료 통과');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(context)await context.close();
  server.close();
  if(path.dirname(profile)===os.tmpdir() && path.basename(profile).startsWith('maple-device-login-test-')) fs.rmSync(profile,{recursive:true,force:true,maxRetries:3});
});
