(function (root) {
  'use strict';
  const kinds = new Set(['starforce', 'potential', 'cube']);
  const grades = ['레어', '에픽', '유니크', '레전드리'];
  // Official cost tables: MapleStory updates 737 (2024-01-25) and 746 (2024-06-20).
  const potentialCosts = [[4000000,16000000,34000000,40000000],[4250000,17000000,36125000,42500000],[4500000,18000000,38250000,45000000],[5000000,20000000,42500000,50000000]];
  const additionalCosts = [[9750000,27300000,66300000,78000000],[10375000,29050000,70550000,83000000],[11000000,30800000,74800000,88000000],[12250000,34300000,83300000,98000000]];
  const equipment = [
    ['마이스터링',140,'KEODIHLE'],['데이브레이크 펜던트',140,'KEOAJDKC'],
    ['골든 클로버 벨트',140,'KEOBJEMH'],['트와일라이트 마크',140,'KEPDJALG'],['도미네이터 펜던트',140,'KEOAJEJF'],
    ['파풀라투스 마크',145,''],['분노한 자쿰의 벨트',150,''],
    ['가디언 엔젤 링',160,'KEODIEPC'],['에스텔라 이어링',160,'KEPBJENB'],
    ['루즈 컨트롤 머신 마크',160,'KEPDJBND'],['마력이 깃든 안대',160,'KEPAJFJJ'],['고통의 근원',160,'KEOAJDNB'],
    ['몽환의 벨트',200,'KEOBJEOJ'],['커맨더 포스 이어링',200,'KEPBJEPH'],['거대한 공포',200,'KEODIEOH'],['컴플리트 언더컨트롤',200,'KEJFJHHE'],
    ['근원의 속삭임',250,'KEODIEKA'],['죽음의 맹세',250,'KEOAJDKG'],['황홀한 악몽',250,'KEODIEIB'],['굶주리는 핏빛 원혼',250,'KEPAJEHG'],
    ["데스티니 가즈",250,"KELFJFGJ"],
    ["데스티니 대거",250,"KEMBJEOC"],
    ["데스티니 데스페라도",250,"KENBJGNE"],
    ["데스티니 듀얼보우건",250,"KEKAJGIF"],
    ["데스티니 라즐리",250,"KEKFJHPA"],
    ["데스티니 라피스",250,"KEKEJHPA"],
    ["데스티니 매직건틀릿",250,"KENKJHLF"],
    ["데스티니 보우",250,"KELHJFGE"],
    ["데스티니 브레스 슈터",250,"KENDPHKI"],
    ["데스티니 블래스트캐논",250,"KEKBJGJB"],
    ["데스티니 샤이닝로드",250,"KENDJGKD"],
    ["데스티니 세이버",250,"KEMCJEJC"],
    ["데스티니 소울슈터",250,"KENAJGNE"],
    ["데스티니 스태프",250,"KEMKJFGG"],
    ["데스티니 스피어",250,"KELBJFKB"],
    ["데스티니 에너지체인",250,"KENGJGIA"],
    ["데스티니 에인션트 보우",250,"KEKLJHKI"],
    ["데스티니 엑스",250,"KEMDJFMH"],
    ["데스티니 엘라하",250,"KEKKJHLJ"],
    ["데스티니 완드",250,"KEMFJFLA"],
    ["데스티니 차크람",250,"KELCPHKH"],
    ["데스티니 체인",250,"KENFJHLF"],
    ["데스티니 초극검",250,"KENDOHME"],
    ["데스티니 초월선",250,"KENLJHLB"],
    ["데스티니 케인",250,"KEMEJGIA"],
    ["데스티니 크로스보우",250,"KELEJFIJ"],
    ["데스티니 클로",250,"KELKJFKE"],
    ["데스티니 투핸드소드",250,"KELCJFHB"],
    ["데스티니 투핸드엑스",250,"KELDJGHG"],
    ["데스티니 투핸드해머",250,"KELAJFOJ"],
    ["데스티니 튜너",250,"KENDIHLC"],
    ["데스티니 폴암",250,"KELGJEOA"],
    ["데스티니 피스톨",250,"KELLJFLI"],
    ["데스티니 해머",250,"KEMAJFJI"],
    ["데스티니 ESP리미터",250,"KENEJHIE"],
    ["아스트라 금강석 선추",200,"KEIAPCOB"],
    ["아스트라 노바의 정수",200,"KEIAIEOD"],
    ["아스트라 데카코어 컨트롤러",200,"KEIAIHOD"],
    ["아스트라 레이븐아이",200,"KEIAKFOD"],
    ["아스트라 렐릭",200,"KEIALPOD"],
    ["아스트라 로자리오",200,"KEIALGOD"],
    ["아스트라 루비 실드",200,"KEPLJGNG"],
    ["아스트라 리스트 밴드",200,"KEIAKGOD"],
    ["아스트라 림리스",200,"KEIAKEOD"],
    ["아스트라 마법 화살",200,"KEIAJGOD"],
    ["아스트라 마법깃펜",200,"KEIANHOI"],
    ["아스트라 매그넘",200,"KEIAJOOD"],
    ["아스트라 매직윙",200,"KEIAPHOD"],
    ["아스트라 메달",200,"KEIALHOD"],
    ["아스트라 백호추",200,"KEIAKOOD"],
    ["아스트라 베인 실드",200,"KEPLJGNA"],
    ["아스트라 불스아이",200,"KEIALAOA"],
    ["아스트라 브레이슬릿",200,"KEIAIOOD"],
    ["아스트라 블레이드",200,"KEMGJGMC"],
    ["아스트라 사옥 노리개",200,"KEIAPDOD"],
    ["아스트라 사파이어",200,"KEIAKPOD"],
    ["아스트라 세이크리드 이지스",200,"KEPLJGME"],
    ["아스트라 소울링",200,"KEIAIBOD"],
    ["아스트라 소울실드",200,"KEPLDHPF"],
    ["아스트라 아케인 실드",200,"KEPLJGMJ"],
    ["아스트라 엄브럴 실드",200,"KEPLJGKC"],
    ["아스트라 에메랄드",200,"KEIAKBOD"],
    ["아스트라 여우구슬",200,"KEIAJDOD"],
    ["아스트라 여의보주",200,"KEIAPEOD"],
    ["아스트라 오브",200,"KEIAJEOD"],
    ["아스트라 옵시디언",200,"KEIAKAOD"],
    ["아스트라 와일드 터스크",200,"KEIAJPOD"],
    ["아스트라 웨폰 벨트",200,"KEIAIDOD"],
    ["아스트라 익스플로시브 필",200,"KEIAIGOA"],
    ["아스트라 체스피스 디 킹",200,"KEIAIPOD"],
    ["아스트라 체인",200,"KEIALFOD"],
    ["아스트라 카르트",200,"KEIAJFOD"],
    ["아스트라 탈리스만",200,"KEIALOOD"],
    ["아스트라 토파즈",200,"KEIAKDOD"],
    ["아스트라 트랜스미터",200,"KEIAICOD"],
    ["아스트라 패스",200,"KEIAPFOD"],
    ["아스트라 페더",200,"KEIALBOD"],
    ["아스트라 포스실드",200,"KEPLCHNA"],
    ["아스트라 프로미넌트 실드",200,"KEPLJGKB"],
    ["아스트라 헥스시커",200,"KEIAPGOD"],
    ["아스트라 아워글라스",200,"astra-hourglass"],
    ["아스트라 토파즈 이지스",200,"astra-topaz-aegis"],
    ["데스티니 카르타",250,"destiny-carta"]
  ];
  const cleanName = value => String(value||'').replace(/\s/g,'');
  function potentialType(value) {
    const name=cleanName(value);
    if(/^에디셔널잠재능력(?:재설정)?$/.test(name)) return '에디셔널 잠재능력';
    if(/^잠재능력(?:재설정)?$/.test(name)) return '잠재능력';
    return '';
  }
  function methodLabel(e) {
    if(e.kind==='starforce') return '스타포스';
    if(e.kind==='cube') return '큐브 · '+(e.cubeType||'종류 미상');
    return '메소 · '+(potentialType(e.potentialType)||'잠재능력');
  }
  function itemInfo(name) {
    const match=equipment.find(row=>cleanName(row[0])===cleanName(name));
    const level=match?.[1] ?? (/^(에테르넬|데스티니)/.test(name)?250:/^(아케인셰이드|아스트라|제네시스)/.test(name)?200:/^앱솔랩스/.test(name)?160:/^파프니르/.test(name)?150:null);
    return {level,icon:match?.[2]?'assets/enhancements/'+match[2]+'.png':''};
  }
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
    const additional = potentialType(raw.potential_type) === '에디셔널 잠재능력' || (kind==='cube' && /에디셔널/.test(raw.cube_type||''));
    const before = additional ? raw.before_additional_potential_option : raw.before_potential_option;
    const after = additional ? raw.after_additional_potential_option : raw.after_potential_option;
    const result = {
      key:key([account,kind,raw.id]), account:string(account), id:string(raw.id), kind, date,
      at:string(raw.date_create), character:string(raw.character_name), world:string(raw.world_name),
      item:string(raw.target_item), result:string(raw.item_upgrade_result),
      level:Number.isInteger(raw.item_level) ? raw.item_level : null,
      potentialType:string(raw.potential_type), grade:string(before?.[0]?.grade),
      cubeType:string(raw.cube_type), nextGrade:string(after?.[0]?.grade),
      options:Array.isArray(after)?after.slice(0,9).map(o=>({value:string(o.value),grade:string(o.grade)})):[],
      multiResult:Array.isArray(after) && after.length > 3,
      stars:Number.isInteger(raw.before_starforce_count) ? raw.before_starforce_count : null,
      nextStars:Number.isInteger(raw.after_starforce_count) ? raw.after_starforce_count : null,
      conditions:kind === 'starforce' ? key([raw.superior_item_flag,raw.destroy_defence,raw.chance_time,raw.event_field_flag,raw.upgrade_item,raw.protect_shield,raw.bonus_stat_upgrade,(raw.starforce_event_list || []).map(e=>[e.cost_discount_rate,e.starforce_event_range,e.recovery_cost_discount_rate])]) : '',
      observedAt:Number(observedAt) || 0, schemaVersion:2
    };
    // Keep pre-fix manual rates addressable when an API reimport repairs the grade.
    if(kind==='potential' && additional && raw.potential_type!=='에디셔널 잠재능력') {
      const legacy={...result,grade:string(raw.before_potential_option?.[0]?.grade),multiResult:Array.isArray(raw.after_potential_option) && raw.after_potential_option.length>3};
      if(rateKey(legacy)!==rateKey(result)) result.rateAliases=[rateKey(legacy)];
    }
    return result;
  }
  function normalize(value) {
    const result = {version:1, events:[], batches:[], rates:[], profiles:[]};
    if (!value || typeof value !== 'object') return result;
    result.events = (Array.isArray(value.events) ? value.events : []).filter(e => e && kinds.has(e.kind) && string(e.account) && string(e.id) && string(e.item) && string(e.character) && typeof e.world==='string' && e.key===key([e.account,e.kind,e.id]) && dateKst(e.at)===e.date && validDay(e.date)).map(e=>({...e}));
    result.batches = (Array.isArray(value.batches) ? value.batches : []).filter(b => b && string(b.id) && string(b.item) && string(b.character) && typeof b.createdAt==='string' && Number.isFinite(Date.parse(b.createdAt)) && Array.isArray(b.eventKeys) && b.eventKeys.length && b.eventKeys.every(k=>typeof k==='string') && ['confirmed','excluded'].includes(b.status) && amount(b.amount)!==null && kinds.has(b.kind) && validDay(b.date)).map(b=>({...b,eventKeys:[...new Set(b.eventKeys)]}));
    result.rates = (Array.isArray(value.rates) ? value.rates : []).filter(r=>r && typeof r.key==='string' && amount(r.unit)!==null && [1,3].includes(r.attempts)).map(r=>({...r}));
    result.profiles = (Array.isArray(value.profiles) ? value.profiles : []).filter(p=>p && typeof p.key==='string' && Number.isFinite(p.updatedAt)).map(p=>({key:p.key,level:Number.isInteger(p.level)&&p.level>=1&&p.level<=300?p.level:null,mvp:[0,3,5,10].includes(p.mvp)?p.mvp:0,pc:p.pc===true,attempts:[1,3].includes(p.attempts)?p.attempts:1,updatedAt:p.updatedAt}));
    return result;
  }
  function union(rows, id, version, schema) {
    const map = new Map();
    rows.forEach(row=>{
      const old = map.get(row[id]);
      const generation=schema?(Number(row[schema])||1)-(Number(old?.[schema])||1):0;
      if (!old || generation>0 || (generation===0 && (Number(row[version])>Number(old[version]) || (Number(row[version])===Number(old[version]) && JSON.stringify(row)>JSON.stringify(old))))) map.set(row[id],row);
    });
    return [...map.values()].sort((a,b)=>a[id].localeCompare(b[id]));
  }
  function merge(...values) {
    const states = values.map(normalize);
    return {version:1,
      events:union(states.flatMap(s=>s.events),'key','observedAt','schemaVersion'),
      batches:union(states.flatMap(s=>s.batches),'id','updatedAt'),
      rates:union(states.flatMap(s=>s.rates),'key','updatedAt'),
      profiles:union(states.flatMap(s=>s.profiles),'key','updatedAt')};
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
    const parts=[e.account,e.date,e.kind,e.character,e.world,e.item,e.level,e.potentialType,e.grade,e.stars,e.conditions,e.multiResult];
    if(e.kind==='cube') parts.push(e.cubeType);
    return key(parts);
  }
  const reportKey=e=>key(['item',e.account,e.date,e.kind,e.character,e.world,e.item,e.kind==='cube'?e.cubeType:e.potentialType]);
  function flag(value) {
    if(value===true) return true;
    const text=String(value||'').trim();
    if(!text || /미적용|미해당|미사용|사용하지|않음|없음|비적용|미발동|^false$|^0$|^N$/i.test(text)) return false;
    return /적용|해당|사용|발동|^true$|^1$|^Y$/i.test(text);
  }
  function starConditions(e) {
    try {const c=JSON.parse(e.conditions); return Array.isArray(c)?c:[];} catch {return [];}
  }
  // KMS costs before the attempt, including the 2024 reduction and 2025 expansion.
  function starBase(level,stars,at) {
    if(!Number.isInteger(level)||level<1||level>300||!Number.isInteger(stars)||stars<0||stars>29) return null;
    const time=Date.parse(at);
    if(!Number.isFinite(time)) return null;
    const reduced=time>=Date.parse('2024-01-25T10:00:00+09:00');
    const expanded=time>=Date.parse('2025-03-20T10:00:00+09:00');
    if(!expanded && stars>24) return null;
    let divisor;
    if(stars<10) divisor=reduced?36:25;
    else if(stars<15) divisor=(reduced?[571,314,214,157,107]:[400,220,150,110,75])[stars-10];
    else divisor=expanded?({17:150,18:70,19:45,21:125}[stars]||200):200;
    return 100*Math.round((1000+level**3*(stars<10?stars+1:(stars+1)**2.7)/divisor)/100);
  }
  function discountInRange(range,stars) {
    const text=String(range??'').trim();
    if(!text || /전체|모든|전 구간|^all$/i.test(text)) return true;
    const nums=text.match(/\d+/g)?.map(Number)||[];
    if(nums.length===2 && /~|～|-|부터/.test(text)) return stars>=nums[0] && stars<=nums[1];
    if(nums.length===1) return /미만/.test(text)?stars<nums[0]:/이하/.test(text)?stars<=nums[0]:/초과/.test(text)?stars>nums[0]:/이상/.test(text)?stars>=nums[0]:stars===nums[0];
    if(nums.length>1 && /,/.test(text)) return nums.includes(stars);
    return null;
  }
  function starCost(e,profile={}) {
    const c=starConditions(e), level=e.level??profile.level??itemInfo(e.item).level;
    const base=starBase(level,e.stars,e.at);
    if(base===null || flag(c[0]) || flag(c[5]) || flag(c[6])) return null;
    if(c[4] && !/미사용|사용하지|없음|^없음$|^-$|^0$/.test(c[4])) return null;
    let discount=0;
    for(const row of Array.isArray(c[7])?c[7]:[]) {
      const raw=String(row[0]??'').replace(/%$/,'').trim();
      if(!raw || /없음|미적용/.test(raw)) continue;
      const rate=Number(raw), applies=discountInRange(row[1],e.stars);
      if(!Number.isFinite(rate) || rate<0 || rate>100 || applies===null) return null;
      if(applies) discount=Math.max(discount,rate);
    }
    const extra=e.stars<17?([0,3,5,10].includes(profile.mvp)?profile.mvp:0)+(profile.pc?5:0):0;
    const safeguard=flag(c[1])?(Date.parse(e.at)>=Date.parse('2025-03-20T10:00:00+09:00')?2:1):0;
    return String(Math.round(base*(100-extra)*(100-discount)/10000+base*safeguard));
  }
  function defaultUnit(e) {
    let type=potentialType(e.potentialType);
    if(e.kind==='cube') {
      const cube=String(e.cubeType||'').trim().replace(/^(?:카르마|대적자의)\s+/,'');
      if(!['수상한 큐브','장인의 큐브','명장의 큐브','레드 큐브','블랙 큐브','에디셔널 큐브','화이트 에디셔널 큐브','수상한 에디셔널 큐브'].includes(cube)) return null;
      // A comparison value, not the purchase price of a free or cash cube.
      type=cube.includes('에디셔널')?'에디셔널 잠재능력':'잠재능력';
    }
    if (!['potential','cube'].includes(e.kind) || e.multiResult || !['잠재능력','에디셔널 잠재능력'].includes(type)) return null;
    const grade = grades.indexOf(e.grade), level=e.level;
    const since=type==='잠재능력' ? '2024-01-25' : '2024-06-20';
    if (e.date<since || grade<0 || !Number.isInteger(level) || level<1 || level>300) return null;
    const table=type==='잠재능력' ? potentialCosts : additionalCosts;
    return String(table[level<160?0:level<200?1:level<250?2:3][grade]);
  }
  function groups(value) {
    const state=normalize(value), {used}=allocated(state), map=new Map(), seen=new Set(), rates=new Map(state.rates.map(r=>[r.key,r])), profiles=new Map(state.profiles.map(p=>[p.key,p]));
    state.events.filter(e=>!used.has(e.key)).forEach(e=>{
      if(seen.has(identity(e))) return;
      seen.add(identity(e));
      const id=rateKey(e);
      if (!map.has(id)) map.set(id,{key:id,...e,eventKeys:[],events:[],count:0});
      const group=map.get(id); group.key=id; group.eventKeys.push(e.key); group.count++;
      group.events.push(e);
    });
    return [...map.values()].map(g=>{
      const profile=profiles.get(reportKey(g))||{}, level=g.level??profile.level??itemInfo(g.item).level;
      const saved=[g.key,...(Array.isArray(g.rateAliases)?g.rateAliases:[])].map(k=>rates.get(k)).filter(Boolean).sort((a,b)=>b.updatedAt-a.updatedAt)[0], rate=saved?.auto===true?undefined:saved;
      const attemptSettings=profile.updatedAt>=(rate?.updatedAt||0)?profile:rate;
      const attempts=g.kind==='potential'?(attemptSettings?.attempts||rate?.attempts||profile.attempts||1):1;
      const resolved={...g,level,multiResult:g.multiResult && !profile.attempts};
      const costs=g.events.map(e=>rate?.unit ?? (g.kind==='starforce'?starCost({...e,level},profile):defaultUnit(resolved)));
      const unit=costs.every(cost=>cost===costs[0])?costs[0]:null;
      const estimate=costs.some(cost=>cost===null)?null:String(costs.reduce((sum,cost)=>sum+BigInt(cost)*BigInt(attempts),0n));
      return {...g,resolvedLevel:level,profile,unit,attempts,estimate,basis:rate?'saved-rate':estimate===null?'needs-rate':g.kind==='starforce'?'star-formula':g.kind==='cube'?'cube-equivalent':'official-table'};
    }).sort((a,b)=>b.date.localeCompare(a.date)||a.character.localeCompare(b.character)||a.item.localeCompare(b.item)||a.key.localeCompare(b.key));
  }
  function reports(value) {
    const map=new Map();
    groups(value).forEach(g=>{
      const id=reportKey(g);
      if(!map.has(id)) map.set(id,{...g,key:id,details:[],events:[],eventKeys:[],count:0,total:0n,missing:0});
      const report=map.get(id);
      report.details.push(g); report.events.push(...g.events);report.eventKeys.push(...g.eventKeys);report.count+=g.count*g.attempts;
      if(g.estimate===null) report.missing+=g.count; else report.total+=BigInt(g.estimate);
    });
    return [...map.values()].map(r=>{
      const events=r.events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
      const first=events[0],last=events[events.length-1];
      r.details.sort((a,b)=>(a.stars??grades.indexOf(a.grade))-(b.stars??grades.indexOf(b.grade))||a.key.localeCompare(b.key));
      const {total,...report}=r;
      return {...report,estimate:r.missing?null:String(total),subtotal:String(total),
        firstAt:first.at,lastAt:last.at,firstStars:first.stars,lastStars:last.nextStars,firstGrade:first.grade,lastGrade:last.nextGrade||'',
        success:events.filter(e=>e.kind==='starforce'?e.nextStars>e.stars:grades.includes(e.grade) && grades.indexOf(e.nextGrade)>grades.indexOf(e.grade)).length,
        destroyed:events.filter(e=>/파괴/.test(e.result)).length,icon:itemInfo(r.item).icon};
    });
  }
  function confirm(state, group, value, id, now = new Date().toISOString(), status='confirmed') {
    if (amount(value)===null || (status==='confirmed' && BigInt(value)<=0n)) throw new Error('확정할 메소를 입력해 주세요.');
    const current=(group.details?reports(state):groups(state)).find(g=>g.key===group.key);
    if (!current || key([...current.eventKeys].sort())!==key([...group.eventKeys].sort())) throw new Error('이력이 변경되었습니다. 목록을 다시 확인해 주세요.');
    const batch={id,eventKeys:current.eventKeys,status,amount:String(value),kind:current.kind,potentialType:current.potentialType,cubeType:current.cubeType,date:current.date,item:current.item,character:current.character,createdAt:now,updatedAt:Date.parse(now)};
    return merge(state,{batches:[batch]});
  }
  function profits(state) {
    return allocated(state).accepted.map(b=>({id:'enhancement:'+b.id,date:b.date,type:b.kind==='cube'?'potential':b.kind,title:'API 이력 확인 지출',itemName:b.item+' · '+b.character,itemId:'',expected:0,createdAt:b.createdAt,costs:[{id:'used',name:'확인한 사용 메소',price:b.amount,count:1}],outputs:[]}));
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
  root.MapleEnhancements={event,normalize,merge,groups,reports,confirm,profits,allocated,collect,dateKst,defaultUnit,amount,starBase,starCost,starConditions,itemInfo,equipment,flag,potentialType,methodLabel};
})(typeof window==='undefined'?globalThis:window);
