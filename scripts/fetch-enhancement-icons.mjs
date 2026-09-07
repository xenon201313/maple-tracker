import {mkdir,writeFile,access,readFile} from 'node:fs/promises';
import '../assets/enhancement-ledger.js';

// Preserve the official item pixels; no generated or look-alike equipment art.
const directory=new URL('../assets/enhancements/',import.meta.url);
await mkdir(directory,{recursive:true});
const sources=new Map(JSON.parse(await readFile(new URL('SOURCES.json',directory),'utf8')).items.map(item=>[item.code,item.url]));
for(const [name,,code] of globalThis.MapleEnhancements.equipment) {
  if(!code) continue;
  const output=new URL(code+'.png',directory);
  try {await access(output);continue;} catch {}
  const response=await fetch(sources.get(code)||'https://open.api.nexon.com/static/maplestory/item/icon/'+code,{signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error('Icon download failed: '+name+' '+response.status);
  const data=Buffer.from(await response.arrayBuffer());
  if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Invalid PNG: '+name);
  await writeFile(output,data);
  console.log(name+': '+data.length+' bytes');
}
