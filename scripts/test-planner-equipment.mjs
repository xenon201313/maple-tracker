import assert from 'node:assert/strict';
import {FriendsSession,friendsRoute} from '../cloudflare-worker/friends.mjs';
const oldFetch=globalThis.fetch;
const proof='a'.repeat(64),state='b'.repeat(64),ocid='1'.repeat(32),foreign='2'.repeat(32),account='c'.repeat(64),key='fixture-service-api-key';
const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(proof))).toString('hex');
const values=new Map(),storage={get:k=>Promise.resolve(values.get(k)),put:(k,v)=>Promise.resolve(values.set(k,v)),delete:k=>Promise.resolve(values.delete(k)),deleteAll:()=>Promise.resolve(values.clear()),setAlarm:async()=>{}};
const env={NEXON_API_KEY:key,NEXON_CLIENT_SECRET:'fixture-client-secret'};const session=new FriendsSession({storage,blockConcurrencyWhile:fn=>fn()},env);
env.FRIENDS_SESSIONS={idFromName:x=>x,get:()=>session};
let calls=[],failEquipment=false,failSymbol=false;
const reset=()=>{values.set('session',{challenge,account,scopes:['maplestory.characterlist'],access:'fixture-access',refresh:'fixture-refresh',accessUntil:Date.now()+3600000,expires:Date.now()+86400000,requests:0,window:Date.now(),pending:false});session.characterCache=null;session.profileCache.clear();calls=[];failEquipment=false;failSymbol=false;env.NEXON_API_KEY=key;};
const request=body=>friendsRoute(new Request('https://worker.test/v1/friends/character-equipment',{method:'POST',headers:{Origin:'https://maple-trackers.com','Content-Type':'application/json'},body:JSON.stringify({state,proof,...body})}),env);
globalThis.fetch=async(input,init)=>{
 const url=new URL(input);calls.push(url.pathname);assert.equal(url.origin,'https://open.api.nexon.com');assert.equal(init.redirect,'manual');
 if(url.pathname.endsWith('/list')){assert.equal(init.headers.Authorization,'Bearer fixture-access');return Response.json({account_list:[{account_id:'fixture-account',character_list:[{ocid,character_name:'가상캐릭터'}]}]});}
 assert.equal(url.searchParams.get('ocid'),ocid);assert.equal(init.headers['x-nxopen-api-key'],key);assert(!init.headers.Authorization);
 if(url.pathname.endsWith('/item-equipment'))return failEquipment?Response.json({error:{message:key}},{status:500}):Response.json({date:null,item_equipment:[{item_name:'가상 장비',item_icon:'https://open.api.nexon.com/item.png',starforce:'22',private_token:'DO-NOT-RETURN'}],private_token:'DO-NOT-RETURN'});
 if(url.pathname.endsWith('/symbol-equipment'))return failSymbol?Response.json({error:{message:key}},{status:500}):Response.json({symbol:[{symbol_name:'아케인심볼 : 소멸의 여로',symbol_level:15,symbol_growth_count:12,private_token:'DO-NOT-RETURN'}]});
 throw new Error('Unexpected upstream');
};
try{
 reset();assert.equal((await request({ocid:'../../session'})).status,400);assert.equal(calls.length,0);
 assert.equal((await request({ocid:foreign})).status,403);assert(calls.every(x=>x.endsWith('/list')));
 reset();let response=await request({ocid}),data=await response.json();assert.equal(response.status,200);assert.equal(data.equipment[0].starforce,'22');assert.equal(data.symbols[0].symbol_level,15);for(const secret of [key,'DO-NOT-RETURN','fixture-access'])assert(!JSON.stringify(data).includes(secret));
 const count=calls.length;await request({ocid});assert.equal(calls.length,count,'캐시 사용');
 reset();failSymbol=true;data=await(await request({ocid})).json();assert(Array.isArray(data.equipment));assert(!Object.hasOwn(data,'symbols'));assert(data.warning);
 reset();failSymbol=true;failEquipment=true;response=await request({ocid});assert.equal(response.status,502);assert(!(await response.text()).includes(key));
 reset();delete env.NEXON_API_KEY;assert.equal((await request({ocid})).status,503);assert.equal(calls.length,0);
 reset();values.get('session').scopes=[];assert.equal((await request({ocid})).status,403);assert.equal(calls.length,0);
 console.log('장비·심볼 API: 본인 소유권/동의·검증·비밀값차단·부분실패·캐시 통과');
}finally{globalThis.fetch=oldFetch;}
