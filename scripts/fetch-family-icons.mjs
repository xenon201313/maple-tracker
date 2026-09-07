import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Public equipment names identify the original Nexon icon; never substitute another item.
const jobs=['히어로','팔라딘','다크나이트','아크메이지(불,독)','아크메이지(썬,콜)','비숍','보우마스터','신궁','패스파인더','나이트로드','섀도어','듀얼블레이더','바이퍼','캡틴','캐논마스터','소울마스터','플레임위자드','윈드브레이커','나이트워커','스트라이커','미하일','아란','에반','메르세데스','팬텀','은월','루미너스','블래스터','배틀메이지','와일드헌터','메카닉','데몬슬레이어','데몬어벤져','제논','카이저','카인','카데나','엔젤릭버스터','제로','키네시스','아델','일리움','칼리','아크','렌','라라','호영','레테'];
const directory=new URL('../assets/enhancements/',import.meta.url);
await mkdir(directory,{recursive:true});
await mkdir(new URL('../.tools/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage();
await page.route('**/*',route=>route.abort());
const found=new Map();
try {for(const item of JSON.parse(await readFile(new URL('../.tools/family-icon-sources.json',import.meta.url),'utf8'))) found.set(item.name,item);} catch {}
try {
  for(const job of jobs) {
    const source='https://chuchu.gg/jobs/'+encodeURIComponent(job)+'/equipment';
    if([...found.values()].some(item=>item.source===source)) continue;
    let response;
    for(let attempt=0;attempt<3;attempt++) {
      response=await fetch(source+(attempt?'?level=260%2B':''),{signal:AbortSignal.timeout(20000)});
      if(response.ok) break;
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    if(!response.ok) {console.warn(job+': '+response.status);continue;}
    await page.setContent(await response.text(),{waitUntil:'domcontentloaded'});
    const items=await page.locator('img').evaluateAll(images=>images.map(img=>({name:img.alt.trim(),url:img.getAttribute('src')})).filter(img=>/^(데스티니|아스트라) /.test(img.name)));
    for(const item of items) {
      const url=new URL(item.url);
      if(url.origin!=='https://open.api.nexon.com' || !/^\/static\/maplestory\/item\/icon\/[A-P]{8}$/.test(url.pathname)) throw new Error('Unexpected icon source');
      if(!found.has(item.name)) found.set(item.name,{...item,source,code:url.pathname.split('/').pop()});
    }
    console.log(job+': '+items.length);
    await writeFile(new URL('../.tools/family-icon-sources.json',import.meta.url),JSON.stringify([...found.values()],null,2)+'\n');
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  const items=[...found.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  await writeFile(new URL('../.tools/family-icon-sources.json',import.meta.url),JSON.stringify(items,null,2)+'\n');
  for(const item of items) {
    const response=await fetch(item.url,{signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error(item.name+': '+response.status);
    const data=Buffer.from(await response.arrayBuffer());
    if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Invalid PNG: '+item.name);
    await writeFile(new URL(item.code+'.png',directory),data);
  }
  console.log(JSON.stringify(items.map(i=>[i.name,i.name.startsWith('데스티니')?250:200,i.code])));
} finally {await browser.close();}
