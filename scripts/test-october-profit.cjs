const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const sandbox={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/october-profit.js'),'utf8'),sandbox);
const mod=sandbox.MapleOctoberProfit;
for(const id of ['boutique','momentum_plus','artisan_gift'])assert(mod.catalog(id),id+' 공식 상품 목록 필요');
const at=s=>Date.parse(s);
assert.equal(mod.catalog('yeti_magnifier').outputs.length,2);
assert.equal(mod.isActive('yeti_magnifier',at('2026-11-19T01:59:59+09:00')),true);
assert.equal(mod.isActive('yeti_magnifier',at('2026-11-19T02:00:00+09:00')),false);
assert.equal(mod.isActive('boutique',at('2026-10-22T09:59:59+09:00')),false);
assert.equal(mod.isActive('boutique',at('2026-10-22T10:00:00+09:00')),true);
assert.equal(mod.canPurchase('boutique',at('2026-11-18T23:59:59+09:00')),true);
assert.equal(mod.canPurchase('boutique',at('2026-11-19T00:00:00+09:00')),false);
assert.equal(mod.isActive('boutique',at('2026-11-30T23:59:59+09:00')),true,'상품 판매 종료 후 티켓 정산은 계속 가능');
assert.equal(mod.isActive('boutique',at('2026-12-01T00:00:00+09:00')),false);
assert.equal(mod.canPurchase('boutique','2026-10-22'),true,'출시 첫날의 날짜 단위 구입 기록 허용');
assert.equal(mod.canPurchase('boutique','2026-11-18'),true);
assert.equal(mod.canPurchase('boutique','2026-11-19'),false);
assert.equal(mod.canPurchase('artisan_gift','2026-11-31'),false,'없는 달력 날짜를 구입 기록으로 허용하지 않음');
assert.equal(mod.canPurchase('momentum_plus',at('2026-11-18T22:59:59+09:00')),true);
assert.equal(mod.canPurchase('momentum_plus',at('2026-11-18T23:00:00+09:00')),false);
assert.equal(mod.isActive('momentum_plus',at('2026-11-18T23:59:59+09:00')),true);
assert.equal(mod.isActive('momentum_plus',at('2026-11-19T00:00:00+09:00')),false);
assert.equal(mod.canPurchase('royal162','2026-11-19'),true,'점검시각 미확정인 날짜를 자정에 조기 차단하지 않음');
assert.equal(mod.isActive('royal162',at('2027-01-01T00:00:00+09:00')),true,'지난 기수 실제 판매 정산은 보존');
assert.equal(mod.isActive('unknown'),false);
assert.equal(mod.today(at('2026-10-21T15:00:00Z')),'2026-10-22');
for(const [previous,current,fevers,normals,next] of [[0,0,0,0,10],[0,9,0,9,1],[0,10,1,9,10],[9,1,1,0,10],[19,12,2,10,9],[10,20,2,18,10]]){
  const result=mod.feverInfo(previous,current);assert.equal(result.feverUses,fevers);assert.equal(result.normalUses,normals);assert.equal(result.nextFeverIn,next);
}
for(const invalid of [-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>mod.feverInfo(invalid,1));
const boutique=mod.catalog('boutique');
assert.equal(boutique.outputs.length,21);
assert.equal(boutique.outputs[0].sellable,true,'티켓 자체는 공식 교환 가능한 상품');
assert.equal(boutique.outputs.filter(i=>i.ticketCost).length,20);
for(const group of [boutique.normalProbabilities,boutique.feverProbabilities])assert(Math.abs(group.reduce((s,p)=>s+p.probability,0)-100)<.000001);
assert.equal(mod.ticketBalance(100,20,{boutique_estelle:1}).valid,true);
assert.equal(mod.ticketBalance(100,21,{boutique_estelle:1}).valid,false,'같은 티켓의 판매·교환 중복 수량 방지');
assert.equal(mod.ticketBalance(100,20,{boutique_estelle:1}).remaining,0);
assert.throws(()=>mod.ticketBalance(100,0,{unknown:1}));
const artisan=mod.catalog('artisan_gift');
assert.equal(artisan.outputs.length,10);
assert.equal(artisan.outputs.reduce((sum,item)=>sum+parseFloat(item.note),0),100);
for(const removed of ['한손무기 공격력 주문서 100%','한손무기 마력 주문서 100%','두손무기 공격력 주문서 100%'])assert.equal(artisan.outputs.some(i=>i.name===removed),false);
assert.equal(artisan.outputs.find(i=>i.id==='artisan_elixir').quantityPerGift,100);
assert.equal(artisan.outputs.find(i=>i.id==='artisan_power_elixir').quantityPerGift,50);
assert.equal(artisan.outputs.find(i=>i.id==='artisan_spell_trace').quantityPerGift,100);
assert.equal(mod.royalOutputs.length,35,'공식 28종 추첨 결과의 성별 대체 품목을 분리한 전체 35개 행');
assert.equal(new Set(mod.royalOutputs.map(item=>item.id)).size,35,'로얄 전체 품목 ID 중복 방지');
for(const item of mod.royalOutputs)assert(fs.existsSync(path.join(__dirname,'..',item.img)),item.name+' 실제 아이콘 누락');
for(const gender of ['남자','여자']){
  const applicable=mod.royalOutputs.filter(item=>!item.gender||item.gender==='공용'||item.gender===gender);
  assert.equal(applicable.length,28,gender+' 캐릭터의 공식 추첨 결과 수');
  assert(Math.abs(applicable.reduce((sum,item)=>sum+parseFloat(item.note),0)-100)<.000001,gender+' 기준 확률 합계 100%');
}
for(const name of ['죄수 모자','죄수복','못가','우울하다','숟가락 탈옥범','암흑 실크햇 (남)','암흑 레이스 (여)','고결한 암흑 (남)','우아한 암흑 (여)','암흑 사박 (남)','암흑 사뿐 (여)','암흑의 균열','암흑 감시자','사신의 옥좌'])assert(mod.royalOutputs.some(item=>item.name===name),name+' 공식 결과 목록 누락 방지');
assert.equal(mod.royalOutputs.filter(i=>/ring_coupon$/.test(i.id)).length,2,'기간제 교환권과 영구 반지 별도 행');
assert.equal(mod.royalOutputs.find(i=>i.id==='royal162_name_ring').note,'0.1%');
assert.equal(mod.royalOutputs.find(i=>i.id==='royal162_name_ring_coupon').note,'5%');
assert(Object.isFrozen(mod)&&Object.isFrozen(mod.catalogs)&&Object.isFrozen(boutique.outputs));
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/profit/october2026/sources.json'),'utf8'));
const crypto=require('node:crypto');
for(const entry of Object.values(manifest.images)){
  const file=path.join(__dirname,'..',entry.file);assert(fs.existsSync(file),entry.file);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),entry.sha256);
  if(entry.crop){const source=manifest.sources[entry.source];assert(source);assert(entry.crop[0]>=0&&entry.crop[1]>=0&&entry.crop[2]<=source.dimensions[0]&&entry.crop[3]<=source.dimensions[1]);}
}
for(const name of ['assets/profit/october2026/artisan-sources.json','assets/profit/october2026/event-loupe-sources.json','assets/drops/october/sources.json']){
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'..',name),'utf8'));
  for(const entry of [...source.items,...(source.noticeItems||[])])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',entry.file))).digest('hex'),entry.sha256,entry.file+' 원본 이미지 출처');
}
console.log('10월 손익 상품 기간·구입/정산 분리·피버·티켓 중복·확률·실제 이미지 검증 통과');
