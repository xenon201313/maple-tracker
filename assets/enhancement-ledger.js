(function (root) {
  'use strict';
  const kinds = new Set(['starforce', 'potential']);
  const grades = ['레어', '에픽', '유니크', '레전드리'];
  // Official cost tables: MapleStory updates 737 (2024-01-25) and 746 (2024-06-20).
  const potentialCosts = [[4000000,16000000,34000000,40000000],[4250000,17000000,36125000,42500000],[4500000,18000000,38250000,45000000],[5000000,20000000,42500000,50000000]];
  const additionalCosts = [[9750000,27300000,66300000,78000000],[10375000,29050000,70550000,83000000],[11000000,30800000,74800000,88000000],[12250000,34300000,83300000,98000000]];
  const string = value => typeof value === 'string' ? value.trim().slice(0, 500) : '';
  const amount = value => /^(0|[1-9]\d{0,29})$/.test(String(value)) ? String(value) : null;
  const key = values => JSON.stringify(values);
  const identity = e => key([e.kind,e.id,e.at,e.character,e.world,e.item]);
  const validDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function dateKst(value) {
    if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return '';
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0,10) : '';
  }
  function event(kind, raw, account, observedAt = Date.now()) {
    if (!kinds.has(kind) || !raw || !string(raw.id) || !string(account)) throw new Error('잘못된 강화 이력입니다.');
    const date = dateKst(raw.date_create);
    if (!date || !string(raw.target_item) || !string(raw.character_name)) throw new Error('강화 이력의 날짜 또는 장비 정보가 없습니다.');
    const additional = raw.potential_type === '에디셔널 잠재능력';
    const before = additional ? raw.before_additional_potential_option : raw.before_potential_option;
    const after = additional ? raw.after_additional_potential_option : raw.after_potential_option;
    return {
      key:key([account,kind,raw.id]), account:string(account), id:string(raw.id), kind, date,
      at:string(raw.date_create), character:string(raw.character_name), world:string(raw.world_name),
      item:string(raw.target_item), result:string(raw.item_upgrade_result),
      level:Number.isInteger(raw.item_level) ? raw.item_level : null,
      potentialType:string(raw.potential_type), grade:string(before?.[0]?.grade),
      multiResult:Array.isArray(after) && after.length > 3,
      stars:Number.isInteger(raw.before_starforce_count) ? raw.before_starforce_count : null,
      nextStars:Number.isInteger(raw.after_starforce_count) ? raw.after_starforce_count : null,
      conditions:kind === 'starforce' ? key([raw.superior_item_flag,raw.destroy_defence,raw.chance_time,raw.event_field_flag,raw.upgrade_item,raw.protect_shield,raw.bonus_stat_upgrade,(raw.starforce_event_list || []).map(e=>[e.cost_discount_rate,e.starforce_event_range,e.recovery_cost_discount_rate])]) : '',
      observedAt:Number(observedAt) || 0
    };
  }
  function normalize(value) {
    const result = {version:1, events:[], batches:[], rates:[]};
    if (!value || typeof value !== 'object') return result;
    result.events = (Array.isArray(value.events) ? value.events : []).filter(e => e && kinds.has(e.kind) && string(e.account) && string(e.id) && string(e.item) && string(e.character) && typeof e.world==='string' && e.key===key([e.account,e.kind,e.id]) && dateKst(e.at)===e.date && validDay(e.date)).map(e=>({...e}));
    result.batches = (Array.isArray(value.batches) ? value.batches : []).filter(b => b && string(b.id) && string(b.item) && string(b.character) && typeof b.createdAt==='string' && Number.isFinite(Date.parse(b.createdAt)) && Array.isArray(b.eventKeys) && b.eventKeys.length && b.eventKeys.every(k=>typeof k==='string') && ['confirmed','excluded'].includes(b.status) && amount(b.amount)!==null && kinds.has(b.kind) && validDay(b.date)).map(b=>({...b,eventKeys:[...new Set(b.eventKeys)]}));
    result.rates = (Array.isArray(value.rates) ? value.rates : []).filter(r=>r && typeof r.key==='string' && amount(r.unit)!==null && [1,3].includes(r.attempts)).map(r=>({...r}));
    return result;
  }
  function union(rows, id, version) {
    const map = new Map();
    rows.forEach(row=>{
      const old = map.get(row[id]);
      if (!old || Number(row[version])>Number(old[version]) || (Number(row[version])===Number(old[version]) && JSON.stringify(row)>JSON.stringify(old))) map.set(row[id],row);
    });
    return [...map.values()].sort((a,b)=>a[id].localeCompare(b[id]));
  }
  function merge(...values) {
    const states = values.map(normalize);
    return {version:1,
      events:union(states.flatMap(s=>s.events),'key','observedAt'),
      batches:union(states.flatMap(s=>s.batches),'id','updatedAt'),
      rates:union(states.flatMap(s=>s.rates),'key','updatedAt')};
  }
  function allocated(state) {
    const normalized=normalize(state), used = new Set(), claimed = new Set(), accepted = [], conflicts = [];
    const identities=new Map(normalized.events.map(e=>[e.key,identity(e)]));
    // A concurrent confirmation may cover the same events. Never charge it twice.
    normalized.batches.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).forEach(batch=>{
      const eventIdentities=batch.eventKeys.map(k=>identities.get(k)||k);
      const duplicate=eventIdentities.some(k=>claimed.has(k));
      eventIdentities.forEach(k=>claimed.add(k));
      batch.eventKeys.forEach(k=>used.add(k));
      if (duplicate) { conflicts.push(batch); return; }
      if (batch.status==='confirmed') accepted.push(batch);
    });
    normalized.events.forEach(e=>{if(claimed.has(identity(e))) used.add(e.key);});
    return {used,accepted,conflicts};
  }
  function rateKey(e) {
    return key([e.account,e.date,e.kind,e.character,e.world,e.item,e.level,e.potentialType,e.grade,e.stars,e.conditions,e.multiResult]);
  }
  function defaultUnit(e) {
    if (e.kind!=='potential' || e.multiResult || !['잠재능력','에디셔널 잠재능력'].includes(e.potentialType)) return null;
    const grade = grades.indexOf(e.grade), level=e.level;
    const since=e.potentialType==='잠재능력' ? '2024-01-25' : '2024-06-20';
    if (e.date<since || grade<0 || !Number.isInteger(level) || level<1 || level>300) return null;
    const table=e.potentialType==='잠재능력' ? potentialCosts : additionalCosts;
    return String(table[level<160?0:level<200?1:level<250?2:3][grade]);
  }
  function groups(value) {
    const state=normalize(value), {used}=allocated(state), map=new Map(), seen=new Set(), rates=new Map(state.rates.map(r=>[r.key,r]));
    state.events.filter(e=>!used.has(e.key)).forEach(e=>{
      if(seen.has(identity(e))) return;
      seen.add(identity(e));
      const id=rateKey(e);
      if (!map.has(id)) map.set(id,{key:id,...e,eventKeys:[],count:0});
      const group=map.get(id); group.key=id; group.eventKeys.push(e.key); group.count++;
    });
    return [...map.values()].map(g=>{
      const rate=rates.get(g.key), unit=rate?.unit ?? defaultUnit(g), attempts=rate?.attempts || 1;
      return {...g,unit,attempts,estimate:unit===null?null:(BigInt(unit)*BigInt(g.count)*BigInt(attempts)).toString(),basis:rate?'saved-rate':unit===null?'needs-rate':'official-table'};
    }).sort((a,b)=>b.date.localeCompare(a.date)||a.character.localeCompare(b.character)||a.item.localeCompare(b.item)||a.key.localeCompare(b.key));
  }
  function confirm(state, group, value, id, now = new Date().toISOString(), status='confirmed') {
    if (amount(value)===null || (status==='confirmed' && BigInt(value)<=0n)) throw new Error('확정할 메소를 입력해 주세요.');
    const current=groups(state).find(g=>g.key===group.key);
    if (!current || key([...current.eventKeys].sort())!==key([...group.eventKeys].sort())) throw new Error('이력이 변경되었습니다. 목록을 다시 확인해 주세요.');
    const batch={id,eventKeys:current.eventKeys,status,amount:String(value),kind:current.kind,date:current.date,item:current.item,character:current.character,createdAt:now,updatedAt:Date.parse(now)};
    return merge(state,{batches:[batch]});
  }
  function profits(state) {
    return allocated(state).accepted.map(b=>({id:'enhancement:'+b.id,date:b.date,type:b.kind,title:'API 이력 확인 지출',itemName:b.item+' · '+b.character,itemId:'',expected:0,createdAt:b.createdAt,costs:[{id:'used',name:'확인한 사용 메소',price:b.amount,count:1}],outputs:[]}));
  }
  async function collect(fetchPage, kind, date, account, signal) {
    if (!kinds.has(kind) || !validDay(date)) throw new Error('조회 조건을 확인해 주세요.');
    const events=[], cursors=new Set(); let cursor='';
    for (let page=0; page<200; page++) {
      signal?.throwIfAborted();
      const body=await fetchPage(kind,cursor?{count:1000,cursor}:{count:1000,date},signal);
      const rows=body?.[kind+'_history'];
      if (!Array.isArray(rows)) throw new Error('API 응답에 강화 이력이 없습니다. 기존 기록은 유지됩니다.');
      for (const raw of rows) {
        const row=event(kind,raw,account);
        if (row.date!==date) throw new Error('조회 날짜와 다른 이력이 반환되었습니다. 저장하지 않았습니다.');
        events.push(row);
      }
      cursor=typeof body.next_cursor==='string'?body.next_cursor:'';
      if (!cursor) return merge({events}).events;
      if (cursors.has(cursor)) throw new Error('API 페이지가 반복되어 조회를 중단했습니다.');
      cursors.add(cursor);
    }
    throw new Error('하루 조회 한도를 넘었습니다. 기존 기록은 유지됩니다.');
  }
  root.MapleEnhancements={event,normalize,merge,groups,confirm,profits,allocated,collect,dateKst,defaultUnit,amount};
})(typeof window==='undefined'?globalThis:window);
