import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import '../assets/enhancement-ledger.js';
const E=globalThis.MapleEnhancements;
const at='2026-09-06T12:00:00+09:00';
for(const [level,zero,seventeen,nineteen] of [[140,77200,44826900,198588800],[160,114800,66913100,296435300],[200,223200,130688600,578974200],[250,435000,255250300,1130808000]]) {
  assert.equal(E.starBase(level,0,at),zero);
  assert.equal(E.starBase(level,17,at),seventeen);
  assert.equal(E.starBase(level,19,at),nineteen);
}
assert.equal(E.starBase(200,0,'2024-01-25T09:59:59+09:00'),321000);
assert.equal(E.starBase(200,0,'2024-01-25T10:00:00+09:00'),223200);
assert.equal(E.starBase(200,19,'2025-03-20T09:59:59+09:00'),130270000);
assert.equal(E.starBase(200,19,'2025-03-20T10:00:00+09:00'),578974200);
const raw={id:'sf1',character_name:'테스트',world_name:'크로아',target_item:'가디언 엔젤 링',date_create:at,before_starforce_count:16,after_starforce_count:17,item_upgrade_result:'성공',superior_item_flag:'슈페리얼 장비 미해당',destroy_defence:'파괴 방지 미적용',chance_time:'찬스타임 미적용',event_field_flag:'파괴 방지 이벤트맵 미적용',protect_shield:'프로텍트 실드 미적용/소멸되지 않음',bonus_stat_upgrade:'보너스 스탯 미적용 아이템',starforce_event_list:[{cost_discount_rate:'30',starforce_event_range:'0~29'}]};
const sf=E.event('starforce',raw,'account');
assert.equal(E.starCost(sf),'30105810');
assert.equal(E.starCost(sf,{mvp:10,pc:true}),'25589939');
const guarded=E.event('starforce',{...raw,destroy_defence:'파괴 방지 적용'},'account');
assert.equal(E.starCost(guarded),'116122410','Safeguard surcharge is not discounted');
assert.equal(E.starCost(guarded,{mvp:10,pc:true}),'111606539');
const seventeenth=E.event('starforce',{...raw,before_starforce_count:17},'account');
assert.equal(E.starCost(seventeenth,{mvp:10,pc:true}),E.starCost(seventeenth),'No MVP/PC benefit after 16 stars');
assert.equal(E.starCost(E.event('starforce',{...raw,starforce_event_list:[{cost_discount_rate:'30%',starforce_event_range:'0~15'}]},'account')),'43008300','Event range is per attempt');
assert.equal(E.starCost(E.event('starforce',{...raw,starforce_event_list:[{cost_discount_rate:'30',starforce_event_range:'불명'}]},'account')),null);
assert.equal(E.starCost(E.event('starforce',{...raw,superior_item_flag:'슈페리얼 장비 해당'},'account')),null);
assert.equal(E.starCost(E.event('starforce',{...raw,upgrade_item:'스타포스 강화권'},'account')),null);
assert.equal(E.starCost({...sf,item:'알 수 없는 장비'}),null);
assert.equal(E.starCost({...sf,item:'알 수 없는 장비'},{level:160}),'30105810');
assert.equal(E.itemInfo('마이스터 링').level,140);
assert.equal(E.itemInfo('에테르넬 나이트헬름').level,250);
assert.equal(E.itemInfo('아케인셰이드 스태프').level,200);
assert.equal(E.itemInfo('앱솔랩스 메이지슈즈').level,160);
const state=E.merge({events:[sf,E.event('starforce',{...raw,id:'sf2',before_starforce_count:19,after_starforce_count:12,item_upgrade_result:'파괴'},'account')]});
assert.equal(E.groups(state).length,2);
let report=E.reports(state)[0];
assert.equal(E.reports(state).length,1,'Same item is one report across star levels');
assert.equal(report.count,2);
assert.equal(report.estimate,'237610520');
assert.equal(report.success,1);assert.equal(report.destroyed,1);
assert.deepEqual(report.details.map(d=>d.stars),[16,19]);
assert.deepEqual(E.profits(state),[]);
const oldKey=E.groups(state)[0].key;
const adjusted=E.merge(state,{profiles:[{key:report.key,level:200,mvp:5,pc:false,updatedAt:1}]});
assert.equal(E.groups(adjusted)[0].key,oldKey,'Cost settings must preserve legacy rate keys');
assert.equal(E.reports(adjusted)[0].resolvedLevel,200);
const withRate=E.merge(adjusted,{rates:[{key:oldKey,unit:'123',attempts:1,updatedAt:1}]});
assert.equal(E.groups(withRate)[0].unit,'123','Existing manual rates take precedence');
assert.notEqual(E.groups(E.merge(withRate,{rates:[{...withRate.rates[0],auto:true,updatedAt:2}]}))[0].unit,'123');
const patchDay=E.merge({events:['2025-03-20T09:59:59+09:00','2025-03-20T10:00:00+09:00'].map((date,i)=>E.event('starforce',{...raw,id:'patch'+i,date_create:date,before_starforce_count:19,starforce_event_list:[]},'account'))});
assert.equal(E.reports(patchDay)[0].estimate,String(E.starBase(160,19,'2025-03-20T09:59:59+09:00')+E.starBase(160,19,'2025-03-20T10:00:00+09:00')),'Cost rule changes within one day use each event timestamp');
const nextDay=E.event('starforce',{...raw,id:'sf3',date_create:'2026-09-07T12:00:00+09:00'},'account');
assert.equal(E.reports(E.merge(adjusted,{events:[nextDay]})).find(r=>r.date==='2026-09-07').resolvedLevel,160,'Settings must not spill into another date');
const confirmed=E.confirm(state,report,report.estimate,'item-batch');
assert.equal(E.groups(confirmed).length,0);
assert.equal(E.profits(E.merge(confirmed,adjusted))[0].costs[0].price,report.estimate,'Never recalculate confirmed spending');
assert.deepEqual(E.merge(confirmed,adjusted),E.merge(adjusted,confirmed));
assert.equal(E.reports(E.merge(confirmed,{events:[E.event('starforce',raw,'another-auth')]})).length,0);
assert.throws(()=>E.confirm(E.merge(state,{events:[E.event('starforce',{...raw,id:'late'},'account')]}),report,'1','stale'));
const potRaw={id:'p1',character_name:'테스트',target_item:'가디언 엔젤 링',item_level:160,date_create:at,potential_type:'잠재능력',before_potential_option:[{grade:'유니크'}],after_potential_option:[{grade:'레전드리',value:'LUK : +12%'}]};
const p1=E.event('potential',potRaw,'account');
const p2=E.event('potential',{...potRaw,id:'p2',date_create:'2026-09-06T12:01:00+09:00',before_potential_option:[{grade:'레전드리'}]},'account');
const potentials=E.merge({events:[p1,p2]});
report=E.reports(potentials)[0];
assert.equal(report.estimate,'78625000','Pre-upgrade grades must be charged individually');
assert.equal(report.success,1);
assert.equal(report.firstGrade,'유니크');assert.equal(report.lastGrade,'레전드리');
assert.equal(E.reports(E.merge(potentials,{profiles:[{key:report.key,level:250,attempts:3,updatedAt:1}]}))[0].estimate,'235875000','Raw API item level wins over an override');
const manualPotential=E.merge({events:[p1]},{rates:[{key:E.groups({events:[p1]})[0].key,unit:'100',attempts:1,updatedAt:1}]});
const manualReport=E.reports(manualPotential)[0];
const triplePotential=E.merge(manualPotential,{profiles:[{key:manualReport.key,level:160,attempts:3,updatedAt:2}]});
assert.equal(E.reports(triplePotential)[0].count,3,'Changing attempts must take effect after entering a manual unit price');
assert.equal(E.reports(triplePotential)[0].estimate,'300','Changing attempts must preserve the manual unit price');
const singlePotential=E.merge(triplePotential,{profiles:[{key:manualReport.key,level:160,attempts:1,updatedAt:3}]});
assert.equal(E.reports(singlePotential)[0].estimate,'100','Switching back to one attempt must not retain triple spending');
assert.equal(E.profits(E.merge(E.confirm(manualPotential,manualReport,'100','fixed-manual'),triplePotential))[0].costs[0].price,'100','Already confirmed costs must never be recalculated');
const cube=E.event('cube',{...potRaw,cube_type:'수상한 큐브'},'account');
assert.equal(E.reports({events:[cube]})[0].estimate,'36125000','Cubes use a clearly separated meso equivalent');
assert.equal(E.reports({events:[cube]})[0].basis,'cube-equivalent');
assert.deepEqual(E.profits({events:[cube]}),[],'A cube equivalent is not automatically a real expense');
assert.equal(E.defaultUnit({...cube,cubeType:'알 수 없는 큐브'}),null);
assert.equal(E.reports({events:[cube]})[0].count,1);
assert.equal(E.reports({events:[cube,p1]}).length,2);
const cubeReport=E.reports({events:[cube]})[0];
assert.equal(E.profits(E.confirm({events:[cube]},cubeReport,'10000','cube-batch'))[0].type,'potential');
for(const [level,normal,additional] of [[140,'40000000','78000000'],[160,'42500000','83000000'],[200,'45000000','88000000'],[250,'50000000','98000000']]) {
  assert.equal(E.defaultUnit({...p1,level,grade:'레전드리'}),normal);
  assert.equal(E.defaultUnit({...p1,level,grade:'레전드리',potentialType:'에디셔널 잠재능력'}),additional);
  assert.equal(E.defaultUnit({...cube,level,grade:'레전드리',cubeType:'카르마 화이트 에디셔널 큐브'}),additional);
}
const karmaEvents=Array.from({length:20},(_,i)=>E.event('cube',{id:'karma-'+i,date_create:at,character_name:'테스트',target_item:'루즈 컨트롤 머신 마크',item_level:160,cube_type:'카르마 화이트 에디셔널 큐브',before_additional_potential_option:[{grade:'레전드리'}],after_additional_potential_option:[{grade:'레전드리'}]},'account'));
const karma=E.reports({events:karmaEvents})[0];
assert.equal(karma.details[0].unit,'83000000');
assert.equal(karma.estimate,'1660000000');
assert.equal(karma.count,20);
assert.deepEqual(E.profits({events:karmaEvents}),[]);
for(const [type,beforeField,afterField,expected] of [
  ['잠재능력 재설정','before_potential_option','after_potential_option','42500000'],
  ['에디셔널 잠재능력 재설정','before_additional_potential_option','after_additional_potential_option','83000000'],
  ['에디셔널  잠재능력 재설정 ','before_additional_potential_option','after_additional_potential_option','83000000']
]) {
  const imported=E.event('potential',{...potRaw,id:type.trim(),potential_type:type,before_potential_option:[],after_potential_option:[],[beforeField]:[{grade:'레전드리'}],[afterField]:[{grade:'레전드리'}]},'account',20);
  assert.equal(imported.grade,'레전드리','API reset suffix must select the correct potential options');
  assert.equal(E.reports({events:[imported]})[0].estimate,expected);
  assert.match(E.methodLabel(imported),/^메소 · /);
  if(type.startsWith('에디셔널')) {
    const legacy={...imported,grade:'',nextGrade:'',schemaVersion:1,observedAt:10};delete legacy.rateAliases;
    const legacyGroup=E.groups({events:[legacy]})[0];
    const legacyState={events:[legacy],rates:[{key:legacyGroup.key,unit:'7654321',attempts:1,updatedAt:15}]};
    const repaired=E.merge(legacyState,{events:[imported]});
    assert.equal(repaired.events.length,1,'Reimport repairs in place without adding a duplicate');
    assert.equal(E.reports(repaired)[0].estimate,'7654321','Repaired grade must retain the pre-fix manual rate');
    assert.equal(E.merge(repaired,{events:[{...legacy,observedAt:30}]}).events[0].grade,'레전드리','Old browser sync must not undo a repaired API record');
    assert.deepEqual(E.merge(legacyState,{events:[imported]}),E.merge({events:[imported]},legacyState));
    const locked=E.confirm(legacyState,legacyGroup,'12345678','locked');
    assert.equal(E.profits(E.merge(locked,{events:[imported]}))[0].costs[0].price,'12345678');
  }
}
for(const [item,level,cubeType,count,total] of [
  ['데스티니 피스톨',250,'대적자의 블랙 큐브',8,'400000000'],
  ['아스트라 매그넘',200,'대적자의 화이트 에디셔널 큐브',3,'264000000']
]) {
  const events=Array.from({length:count},(_,i)=>E.event('cube',{...potRaw,id:item+i,target_item:item,item_level:level,cube_type:cubeType,before_potential_option:[{grade:'레전드리'}],before_additional_potential_option:[{grade:'레전드리'}],after_additional_potential_option:[{grade:'레전드리'}]},'account'));
  assert.equal(E.reports({events})[0].estimate,total);
  assert.equal(E.methodLabel(events[0]),'큐브 · '+cubeType);
  assert.deepEqual(E.profits({events}),[]);
}
const missingBefore=E.event('potential',{...potRaw,before_potential_option:[],potential_option_grade:'레전드리'},'account');
assert.equal(E.reports({events:[missingBefore]})[0].estimate,null,'Never price a missing pre-upgrade grade from the after grade');
assert.equal(E.equipment.filter(e=>e[0].startsWith('데스티니 ')).length,36);
assert.equal(E.equipment.filter(e=>e[0].startsWith('아스트라 ')).length,47);
assert.equal(E.itemInfo('아스트라 마법화살').icon,E.itemInfo('아스트라 마법 화살').icon);
for(const [name,,code] of E.equipment) if(code) await access(new URL('../'+E.itemInfo(name).icon,import.meta.url));
console.log('Item costs, date-scoped settings, grouped history and icon checks passed.');
