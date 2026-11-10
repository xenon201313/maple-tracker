// 투명 여백이 큰 합성 스프라이트를 실제 브라우저에서 확대해 검증합니다.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),{fixtureDismissPatchNotes}=require('./helpers/patch-notes.cjs');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2'};
const sprite='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><path fill="#c97eb2" d="M122 123h51v77h-51z"/></svg>';
const wide='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><path fill="#482e96" d="M10 50h280v200H10z"/><path fill="#fff" opacity="0.01" d="M2 5h1v1H2z"/></svg>';
const server=http.createServer((req,res)=>{let name=new URL(req.url,'http://localhost').pathname;if(name==='/portrait-cors.svg')return res.writeHead(200,{'Content-Type':'image/svg+xml','Access-Control-Allow-Origin':'*'}).end(sprite);if(name==='/portrait-no-cors.svg')return res.writeHead(200,{'Content-Type':'image/svg+xml'}).end(sprite);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,bytes)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(bytes));});
async function inspect(page){return page.locator('.home-character-stage').first().evaluate(stage=>{const image=stage.querySelector('img'),s=stage.getBoundingClientRect(),i=image.getBoundingClientRect(),scale=i.width/image.naturalWidth;return {fit:stage.dataset.portraitFit,scale,ratio:scale/(parseFloat(getComputedStyle(stage).getPropertyValue('--portrait-base-size'))/300),pixelated:getComputedStyle(image).imageRendering,source:image.src,stage:{left:s.left,top:s.top,right:s.right,bottom:s.bottom},image:{left:i.left,top:i.top},clipped:stage.scrollWidth>stage.clientWidth};});}
function inside(state,bounds){for(const [x,y]of [[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y+bounds.height]]){const left=state.image.left+x*state.scale,top=state.image.top+y*state.scale;assert(left>=state.stage.left-1&&left<=state.stage.right+1&&top>=state.stage.top-1&&top<=state.stage.bottom+1,'every source pixel stays in frame '+JSON.stringify({state,bounds,left,top}));}}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,portraitOrigin='http://localhost:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await fixtureDismissPatchNotes(context);
  await context.route('**/*',route=>{const url=route.request().url();return url.startsWith(origin)||url.startsWith(portraitOrigin)||url.startsWith('data:')?route.continue():route.abort();});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.evaluate(()=>document.fonts.ready);
  const source='data:image/svg+xml,'+encodeURIComponent(sprite),wideSource='data:image/svg+xml,'+encodeURIComponent(wide);
  await page.evaluate(source=>{db.chars=[normalizeChar({name:'확대 검증',server:'main',characterImage:source})];renderAll();},source);
  const before=await page.evaluate(()=>JSON.stringify(db));
  await page.waitForFunction(()=>document.querySelector('.home-character-stage')?.dataset.portraitFit==='trimmed');
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>{const stage=document.querySelector('.home-character-stage'),img=stage.querySelector('img');return Math.abs(parseFloat(img.style.left)-((stage.clientWidth-55*parseFloat(img.style.width)/300)/2-120*parseFloat(img.style.width)/300))<1;});
   const state=await inspect(page);assert(state.ratio>=3,'actual sprite is at least three times larger '+width+' '+JSON.stringify(state));assert.equal(state.pixelated,'pixelated');assert.equal(state.source,source,'original image URL is retained');inside(state,{x:122,y:123,width:51,height:77});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no document overflow '+width);
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'display enlargement never writes to the ledger');
  await page.evaluate(source=>{db.chars=[normalizeChar({name:'장비 이펙트 검증',server:'main',characterImage:source})];renderAll();},wideSource);await page.waitForFunction(()=>document.querySelector('.home-character-stage')?.dataset.portraitFit==='trimmed');inside(await inspect(page),{x:2,y:5,width:288,height:245});
  await page.evaluate(origin=>{db.chars=[normalizeChar({name:'CORS 검증',server:'main',characterImage:origin+'/portrait-cors.svg'})];renderAll();},portraitOrigin);await page.waitForFunction(()=>document.querySelector('.home-character-stage')?.dataset.portraitFit==='trimmed');assert((await inspect(page)).ratio>=3);
  await page.evaluate(origin=>{db.chars=[normalizeChar({name:'CORS 대체 검증',server:'main',characterImage:origin+'/portrait-no-cors.svg'})];renderAll();},portraitOrigin);await page.waitForFunction(()=>document.querySelector('.home-character-stage')?.dataset.portraitFit==='full');assert.equal(await page.locator('.home-character-stage>img').evaluate(img=>img.complete&&img.naturalWidth===300),true,'CORS failure never removes a valid portrait');inside(await inspect(page),{x:0,y:0,width:300,height:300});
  await page.evaluate(origin=>{db.chars=Array.from({length:12},(_,i)=>normalizeChar({name:'여러 캐릭터 '+i,server:'main',characterImage:origin+'/portrait-cors.svg'}));renderAll();},portraitOrigin);await page.waitForFunction(()=>document.querySelectorAll('[data-portrait-fit="trimmed"]').length===12);assert.equal(await page.locator('.home-character-card').count(),12);assert(await page.locator('.home-character-list').evaluate(el=>el.scrollWidth>el.clientWidth));
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('maple:account-ledger-changing')));assert.equal(await page.locator('.home-character-card').count(),0,'account changes clear pending portraits');
  assert.deepEqual(errors,[]);await context.close();console.log('캐릭터 실제 도트 3배 이상·4개 폭·원본 URL·도트 렌더링·넓은 장비/희미한 이펙트·CORS/대체·12명·계정 전환·장부 불변 통과');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
