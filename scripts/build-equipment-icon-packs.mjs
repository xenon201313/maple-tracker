// Generate offline, name-addressable equipment icons. No player data or API key is used.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetDirectory = path.join(root,'assets');
const cacheDirectory = path.join(root,'.tools','kms-catalog');
const pngCache = path.join(cacheDirectory,'nexon-png');
const packDirectory = path.join(assetDirectory,'equipment-icons');
const legacyUrl = 'https://maplestory.io/api/KMS/389/item?overallCategoryFilter=Equip&cashFilter=false';
const specialPngs = new Map([[1005980,'KEPCOOGB'],[1122088,'KEOAJHGJ']]);
const normalizeName = value => value.normalize('NFC').trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pngHeader = Buffer.from('89504e470d0a1a0a','hex');
// pngjs is bundled by the project's pinned Playwright dependency.
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
// The Nexon CDN returns this 256×256 graphic with HTTP 200 for nonexistent items.
const missingIconHash='16786a52fd1da495eef223378341aec945a2358fec6bad546de37d35c94bbb87';

function isPng(bytes) {
  return bytes.length > 32 && bytes.subarray(0,8).equals(pngHeader) &&
    bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0;
}

function pngPayload(bytes) {
  // The archived /icon endpoint sometimes appends a JSON status object after IEND.
  // Keep the complete, original PNG only. Locate the actual chunk boundary.
  for(let at=8;at+12<=bytes.length;) {
    const size=bytes.readUInt32BE(at), type=bytes.toString('ascii',at+4,at+8);
    at+=12+size;
    if(at>bytes.length) break;
    if(type==='IEND' && size===0) return bytes.subarray(0,at);
  }
  throw Error('Incomplete PNG');
}

function hasArtwork(bytes) {
  if(hash(bytes)===missingIconHash) return false;
  const rgba=PNG.sync.read(pngPayload(bytes)).data;
  for(let offset=3;offset<rgba.length;offset+=4) if(rgba[offset]) return true;
  return false;
}

async function readCached(file) {
  try { return await readFile(file); }
  catch(error) { if(error.code!=='ENOENT') throw error; return undefined; }
}

async function historicalEquipment() {
  const file = path.join(cacheDirectory,'historical-kms-389.json');
  const cached = await readCached(file);
  if (cached) return JSON.parse(cached);
  const response = await fetch(legacyUrl,{signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw Error('KMS 389 item archive: '+response.status);
  const rows = (await response.json()).filter(item=>item.typeInfo?.overallCategory==='Equip' &&
    item.isCash===false && item.id>=1000000 && item.id<2000000 && item.name?.trim())
    .map(item=>[item.id,item.name.trim()]);
  if (rows.length<9000) throw Error('Incomplete historical equipment list');
  await writeFile(file,JSON.stringify(rows));
  return rows;
}

let pausedUntil=0;
async function downloadIcon(id,url) {
  // Both the source and revision matter: a different CDN code for an ID must never reuse its old pixels.
  const file = path.join(pngCache,id+'-'+hash(url).slice(0,12)+'.png');
  const cached = await readCached(file);
  if (cached && isPng(cached)) return hasArtwork(cached)?pngPayload(cached):undefined;
  for (let attempt=0;attempt<4;attempt++) {
    if(pausedUntil>Date.now()) await sleep(pausedUntil-Date.now());
    let response;
    try { response=await fetch(url,{signal:AbortSignal.timeout(25000)}); }
    catch(error) { if(attempt===3) throw error; await sleep(1000*(attempt+1)); continue; }
    if (response.status===404 || response.status===410) return undefined;
    if (response.status===429 || response.status>=500) {
      const wait=Number(response.headers.get('retry-after'));
      pausedUntil=Math.max(pausedUntil,Date.now()+1000*(wait>0?wait:3*(attempt+1)));
      if(attempt===3) throw Error('Temporary CDN failure '+response.status+' for '+id);
      continue;
    }
    if(!response.ok) throw Error('Icon '+id+': '+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!isPng(bytes)) throw Error('Invalid PNG for '+id+' at '+url);
    await writeFile(file,bytes);
    return hasArtwork(bytes)?pngPayload(bytes):undefined;
  }
}

export async function cacheEquipmentImages(ids, urlForId, historicalIds=new Set()) {
  await mkdir(pngCache,{recursive:true});
  const results = new Map();
  let cursor=0;
  async function worker() {
    while(cursor<ids.length) {
      const id=ids[cursor++];
      let bytes=await downloadIcon(id,urlForId(id));
      // The historical archive correctly returns 404 on /icon for non-renderable IDs.
      // Its /iconRaw endpoint can throw a server error for those same unavailable assets.
      if(!bytes && historicalIds.has(id)) bytes=await downloadIcon(id,'https://maplestory.io/api/KMS/389/item/'+id+'/icon');
      if(bytes) results.set(id,bytes);
      if(results.size && results.size%1000===0) console.log('Verified images: '+results.size+'/'+ids.length);
    }
  }
  // Small bounded pool. The build cache prevents downloading unchanged art again.
  await Promise.all(Array.from({length:4},worker));
  return results;
}

function svgPack(rows) {
  const side=64;
  const elements=rows.map(([id,bytes],i)=>{
    const x=side*(i%8), y=side*Math.floor(i/8);
    return '<view id="i'+id+'" viewBox="'+[x,y,side,side].join(' ')+'"/>'+
      '<image x="'+x+'" y="'+y+'" width="'+side+'" height="'+side+'" xlink:href="data:image/png;base64,'+bytes.toString('base64')+'"/>';
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" viewBox="0 0 64 64">\n'+elements.join('\n')+'\n</svg>\n';
}

async function archivedImage(id) {
  const origin='https://maple.dwjeong.com';
  const detail=await fetch(origin+'/archive/equipitem/'+id,{signal:AbortSignal.timeout(25000)});
  if(detail.status===404) return undefined;
  if(!detail.ok) throw Error('Item detail '+id+': '+detail.status);
  for(const match of (await detail.text()).matchAll(/<img\s[^>]*?src="([^"]+)"/gi)) {
    const url=new URL(match[1].replaceAll('&amp;','&'),origin);
    const file=url.searchParams.get('f')||'';
    if(url.origin===origin && url.pathname==='/api/archive/itemcatalog/img' &&
      url.searchParams.get('mode')==='equip' && /^icons\/[\w/-]+\.png$/.test(file) && file.endsWith('/'+id+'.png')) {
      return downloadIcon(id,url.href);
    }
  }
}

async function legacyImage(source) {
  if(source.layers) {
    // These two items' inventory icons contain zero visible pixels. Use the item's own
    // Korean default appearance at its published origin; no avatar or other gear is included.
    const response=await fetch(source.url,{signal:AbortSignal.timeout(25000)});
    if(!response.ok) throw Error('Missing appearance '+source.id);
    const item=await response.json();
    if(item.id!==source.id || item.description.name!==source.name) throw Error('Unexpected equipment appearance');
    const effects=item.frameBooks.default.frames[0].effects;
    const layers=source.layers.map(([key,expected])=>{
      const frame=effects[key], bytes=Buffer.from(frame.image,'base64');
      if(hash(bytes)!==expected || !hasArtwork(bytes)) throw Error('Unexpected appearance layer '+source.id+'/'+key);
      return {bytes,image:PNG.sync.read(bytes),x:-frame.origin.x,y:-frame.origin.y};
    });
    if(layers.length===1) return layers[0].bytes;
    const left=Math.min(...layers.map(v=>v.x)), top=Math.min(...layers.map(v=>v.y));
    const width=Math.max(...layers.map(v=>v.x+v.image.width))-left;
    const height=Math.max(...layers.map(v=>v.y+v.image.height))-top;
    const out=new PNG({width,height});
    for(const layer of layers) {
      const {image}=layer;
      for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
        const src=(y*image.width+x)*4, dest=((y+layer.y-top)*width+x+layer.x-left)*4;
        const alpha=image.data[src+3]/255;
        if(!alpha) continue;
        const behind=(1-alpha)*out.data[dest+3]/255, combined=alpha+behind;
        for(let c=0;c<3;c++) out.data[dest+c]=Math.round((image.data[src+c]*alpha+out.data[dest+c]*behind)/combined);
        out.data[dest+3]=Math.round(combined*255);
      }
    }
    return PNG.sync.write(out);
  }
  const bytes=await downloadIcon(source.id,source.url);
  if(!bytes || hash(bytes)!==source.sha256) throw Error('Unverified archived icon '+source.id);
  return bytes;
}

async function build() {
  const {loadCurrentEquipment,nexonIconUrl}=await import('./current-equipment-source.mjs');
  await mkdir(pngCache,{recursive:true});
  const [current,historical]=await Promise.all([loadCurrentEquipment(),historicalEquipment()]);
  const idsByName=new Map();
  // The current Korean name takes precedence. A historical name remains an alias for its original item.
  for(const [id,name] of [...current,...historical]) {
    if (!Number.isInteger(id) || id<1000000 || id>=2000000 || !name.trim()) continue;
    const key=normalizeName(name);
    if(!idsByName.has(key)) idsByName.set(key,new Set());
    idsByName.get(key).add(id);
  }
  // Multiple IDs can share a name. Prefer the first current item with verified art for that name.
  const representatives=[...new Set([...idsByName.values()].map(ids=>ids.values().next().value))].sort((a,b)=>a-b);
  const historicalIds=new Set(historical.map(([id])=>id));
  const images=await cacheEquipmentImages(representatives,nexonIconUrl,historicalIds);
  const backups=[...new Set([...idsByName.values()].filter(ids=>![...ids].some(id=>images.has(id))).flatMap(ids=>[...ids].slice(1)))];
  for(const [id,bytes] of await cacheEquipmentImages(backups,nexonIconUrl,historicalIds)) images.set(id,bytes);
  // A current item can predate or postdate the CDN snapshot. Follow its own published
  // image link from the same numbered item detail, never a neighboring item's picture.
  const currentIds=new Set(current.map(([id])=>id));
  const lookedUp=new Set();
  for(const ids of idsByName.values()) {
    if([...ids].some(id=>images.has(id))) continue;
    for(const id of ids) {
      if(!currentIds.has(id) || lookedUp.has(id)) continue;
      lookedUp.add(id);
      const bytes=await archivedImage(id);
      if(bytes){images.set(id,bytes);break;}
    }
  }
  const legacySources=JSON.parse(await readFile(new URL('./legacy-equipment-icon-sources.json',import.meta.url),'utf8'));
  for(const source of legacySources) {
    if(!images.has(source.id)) images.set(source.id,await legacyImage(source));
  }
  const names=[];
  const unresolved=[];
  for(const [name,ids] of idsByName) {
    const id=[...ids].find(id=>images.has(id));
    if (id) names.push([name,id]); else unresolved.push([name,[...ids]]);
  }
  if(unresolved.length) console.warn('Names with no available official PNG:',unresolved.length);
  await writeFile(path.join(cacheDirectory,'unresolved-icons.json'),JSON.stringify(unresolved));
  names.sort(([a],[b])=>a<b?-1:a>b?1:0);
  const localPngs={};
  const packs=new Map();
  await mkdir(packDirectory,{recursive:true});
  for(const id of [...new Set(names.map(([,id])=>id))].sort((a,b)=>a-b)) {
    const bytes=images.get(id);
    const code=nexonIconUrl(id).split('/').pop();
    const local=path.join(assetDirectory,'enhancements',code+'.png');
    if(specialPngs.has(id)) {
      if(specialPngs.get(id)!==code) throw Error('Incorrect icon for reported item '+id);
      await writeFile(local,bytes);
    }
    const existing=await readCached(local);
    if(existing && isPng(existing) && hasArtwork(existing)) {localPngs[id]=code; continue;}
    const group=Math.floor(id/128);
    if(!packs.has(group)) packs.set(group,[]);
    packs.get(group).push([id,bytes]);
  }
  const revisions={};
  for(const [group,rows] of packs) {
    const svg=svgPack(rows);
    revisions[group]=hash(svg).slice(0,10);
    await writeFile(path.join(packDirectory,group+'.svg'),svg);
  }
  const js=[
    '// Generated by scripts/build-equipment-icon-packs.mjs. Item artwork © NEXON.',
    '// Names: maple.dwjeong.com/archive/equipitem (KMS) and maplestory.io/api/KMS/389/item.',
    '(() => {',
    '  const byName = new Map([',
    ...names.map(row=>'    '+JSON.stringify(row)+','),
    '  ]);',
    '  const local = '+JSON.stringify(localPngs)+';',
    '  const packs = '+JSON.stringify(revisions)+';',
    '  const spaceless = new Map();',
    '  for (const [name,id] of byName) {',
    "    const key=name.replace(/\\s+/gu,'');",
    '    spaceless.set(key,spaceless.has(key) && spaceless.get(key)!==id ? 0 : id);',
    '  }',
    '  globalThis.MapleEquipmentIcons = {',
    '    get(name) {',
    "      if (typeof name !== 'string') return '';",
    "      name=name.normalize('NFC').trim();",
    "      const id = byName.get(name) || spaceless.get(name.replace(/\\s+/gu,''));",
    "      if (!id) return '';",
    "      if (local[id]) return 'assets/enhancements/'+local[id]+'.png';",
    '      const group = Math.floor(id/128);',
    "      return 'assets/equipment-icons/'+group+'.svg?v='+packs[group]+'#i'+id;",
    '    }',
    '  };',
    '})();',''
  ].join('\n');
  await writeFile(path.join(assetDirectory,'equipment-icons.js'),js);
  console.log(names.length+' name mappings, '+images.size+' images, '+packs.size+' local packs');
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  build().catch(error=>{console.error(error);process.exitCode=1;});
}
