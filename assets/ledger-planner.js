(function(){
  'use strict';
  const state=globalThis.MaplePlannerState;
  const names={investment:'장비 투자',settlement:'미정산함',budget:'자금 계획',hunting:'재획 비교',bossplan:'보스 시간 계획',symbol:'심볼 예산'};
  let active=new URL(location.href).searchParams.get('tool')||'investment';
  if(!names[active])active='investment';
  let rendered='',owner='',requestEpoch=0,dirty=false;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const charId=c=>String(c.ledgerPlanId||c.ocid||[c.server,c.worldName,c.name].join(':'));
  const account=()=>String(characterLoginState().account||'legacy');
  const signed=value=>{const s=String(value??'0');return /^-?\d+$/.test(s)?BigInt(s):0n;};
  function candidates(){
    const result=[];
    db.chars.forEach(c=>{
      for(const [scope,store,priceStore]of [['weekly','dropWeeks','dropPriceWeeks'],['monthly','monthDropMonths','monthDropPriceMonths'],['daily','dailyDropDays','dailyDropPriceDays']]){
        for(const [period,drops]of Object.entries(ensureObj(c[store]))){
          for(const [key,checked]of Object.entries(ensureObj(drops))){
            if(!checked||!isCountedDropKey(key))continue;
            const item=(scope==='daily'?visibleDailyDropItemById:visibleDropItemById)(dropKeyItemId(key));if(!item)continue;
            const shown=selectedChildForDrop(key,item,drops)||item;
            const effective=effectiveDropKeyForParent(key,item,drops);
            const price=toMesoBig(ensureObj(ensureObj(c[priceStore])[period])[effective]);
            const shareMeta=ensureObj(ensureObj(ensureObj(c[scope==='weekly'?'dropShareWeeks':scope==='monthly'?'monthDropShareMonths':'dailyDropShareDays'])[period])[effective]);
            const party=scope==='daily'?dailyBossPartyForDropKey(c,period,effective):bossPartyForDropKey(c,period,effective,scope);
            const split=scope==='daily'?null:dropSplitInfo(c,period,effective,scope);
            const shareRate=split?.saleNet>0n?Number(split.mine*1000000n/split.saleNet)/1000000:1/Math.max(1,party);
            result.push({id:['drop',charId(c),scope,period,effective].join(':'),sourceType:'boss-drop',sourcePeriod:period,date:scope==='daily'?period:'',dateBasis:scope==='daily'?'일간 기록':'주간·월간 기록 · 획득일 직접 확인',charName:c.name,itemName:shown.name,quantity:1,unitPrice:price.toString(),fee:scope==='daily'?0:(split?.fee??validDropFee(shareMeta.fee)),shareRate,originalNet:scope==='daily'?sharedDailyDropPrice(c,period,effective).toString():(split?.mine?.toString()||''),originalShareText:scope==='daily'?dailyDropPriceText(c,period,effective):(split?dropSplitResultText(split):''),icon:shown.img||'',note:party>1?'원본 분배 결과는 참고값입니다. 새 정산의 단순 분배율과 송금 수수료를 직접 확인하세요.':''});
          }
        }
      }
    });
    (db.profits||[]).map(normalizeProfitRecord).forEach(r=>r.outputs.forEach((line,index)=>{
      if(line.sold||!line.sellable||!line.count)return;
      result.push({id:'profit:'+r.id+':'+(line.id||encodeURIComponent(line.name)+':'+index),sourceType:'profit',date:r.date,charName:'',itemName:line.name,quantity:line.count,unitPrice:String(line.price||0),fee:line.fee||0,shareRate:1,icon:line.img||''});
    }));return result;
  }
  function context(){
    const today=state.dateKst(),week=state.weekKst(today),cashEntries=[],hunts=[],bossOptions=[],bossRemainingLimits={};
    Object.entries(db.records).forEach(([date,record])=>normalizeRecord(record).sessions.forEach(session=>{
      if(session.kind==='recovery-adjustment')return;
      if(session.kind!=='erda-settlement')hunts.push({id:session.id,date,charName:session.charName,meso:String(session.meso||0),erda:session.erda,erdaSettled:session.erdaSettled,erdaUnitPrice:String(session.erdaUnitPrice||0),erdaFee:session.erdaFee,erdaMesoIncluded:session.erdaMesoIncluded,runs:session.runs,extraIncome:String(session.extraIncome||0)});
      cashEntries.push({id:'hunt:'+session.id,date,amount:recordMesoTotal(recordFromSessions([session])).toString(),signedAmount:recordMesoTotal(recordFromSessions([session])).toString(),kind:'재획 장부(정산 포함 설정 기준)',charName:session.charName});
    }));
    allProfitRecords().forEach(rec=>{const r=normalizeProfitRecord(rec),t=profitRecordTotals(r);cashEntries.push({id:'profit:'+r.id,date:r.date,amount:t.net.toString(),signedAmount:t.net.toString(),kind:'손익 장부',charName:''});});
    const expenses=(db.expenses||[]).map(normalizeExpenseRecord).map(r=>({id:'expense:'+r.id,date:r.date,charName:r.charName,category:expenseCategoryById(r.category).name,memo:r.memo,amount:String(r.amount)}));
    expenses.forEach(r=>cashEntries.push({...r,signedAmount:(-signed(r.amount)).toString(),kind:'직접 지출'}));
    db.chars.forEach(c=>{
      const id=charId(c),checked=ensureObj(ensureObj(c.bossWeeks)[week]),summary=charSum(c,week);
      bossRemainingLimits[id]=Math.max(0,weeklyBossCheckLimit(week)-summary.limitCount);
      BOSS_GROUPS.w.forEach(g=>{
        const pref=bossPreference(c,g),completed=g.bosses.some(b=>Object.hasOwn(checked,b[0]));
        g.bosses.filter(b=>canUseBoss(c,b,week)).forEach(b=>{const party=clampPartyForBoss(b,pref.party);bossOptions.push({id:id+'|'+b[0],groupId:id+'|'+g.key,charId:id,charName:c.name,bossId:g.key,bossCode:b[0],bossName:g.name,difficulty:b[1].replace(g.name,'').trim(),party,meso:share(bossCrystalPrice(b,week,c),party).toString(),completed,period:'weekly',limitFree:isLimitFreeBoss(b)});});
      });
      for(const [period,store]of Object.entries(ensureObj(c.bossWeeks))){
        let amount=0n;for(const [key,party]of Object.entries(ensureObj(store))){const b=BOSS_MAP[key];if(b)amount+=toMesoBig(share(bossCrystalPrice(b,period,c),clampPartyForBoss(b,party)));}
        if(amount)cashEntries.push({id:'boss:'+id+':'+period,date:period,signedAmount:amount.toString(),amount:amount.toString(),kind:'주간 결정석(기록 주차 기준)',charName:c.name});
      }
      // 판매일이 없는 드랍은 잔액에 자동 재반영하지 않습니다.
      for(const [month,store]of Object.entries(ensureObj(c.monthBossMonths))){let amount=0n;for(const [key,party]of Object.entries(ensureObj(store))){const b=BOSS_MAP[key];if(b)amount+=toMesoBig(share(bossCrystalPrice(b,month,c),clampPartyForBoss(b,party)));}if(amount)cashEntries.push({id:'monthlyboss:'+id+':'+month,date:month+'-01',signedAmount:amount.toString(),kind:'월간 결정석(기록월 기준)',charName:c.name});}
      for(const [date,store]of Object.entries(ensureObj(c.dailyBossDays))){let amount=0n;for(const [key,party]of Object.entries(ensureObj(store))){const b=typeof DAILY_BOSS_MAP!=='undefined'?DAILY_BOSS_MAP[key]:null;if(b)amount+=toMesoBig(share(b[2],Math.max(1,party)));}if(amount)cashEntries.push({id:'dailyboss:'+id+':'+date,date,signedAmount:amount.toString(),kind:'일간 결정석(기록일 기준)',charName:c.name});}
    });
    const enhancements=MapleEnhancements.allocated(db.enhancements).accepted.map(b=>({id:'api:'+b.id,date:b.date,charName:b.character,itemName:b.item,type:b.kind,amount:b.amount,confirmed:true,icon:globalThis.resolveItemImage?.({name:b.item})||'',detail:b.kind}));
    (db.profits||[]).filter(r=>MANUAL_ENHANCEMENT_TYPES.has(r.type)).forEach(raw=>{const r=normalizeProfitRecord(raw);enhancements.push({id:'manual:'+r.id,date:r.date,charName:'',itemName:r.itemName||r.title,type:r.type,amount:profitRecordTotals(r).cost.toString(),confirmed:true,icon:globalThis.resolveItemImage?.({name:r.itemName})||''});});
    return {planner:clone(state.normalize(db.planner)),characters:db.chars.map(c=>({id:charId(c),name:c.name,ocid:c.ocid,worldName:c.worldName,image:c.characterImage})),enhancements,expenses,profits:clone(db.profits||[]),settlementCandidates:candidates(),cashEntries,hunts,bossOptions,bossRemainingLimits,today,week,cashBasis:'기존 장부 반영일 기준입니다. 주간 결정석은 주차 시작일로 표시하며 실제 판매일·판매되지 않은 드랍은 별도로 확인하세요.'};
  }
  function commit(section,rows){
    if(!state.sections.includes(section)||!Array.isArray(rows))throw new Error('계획 기록 형식이 올바르지 않습니다.');
    globalThis.MapleAccountSync?.beforeSave();
    if(owner&&owner!==account())throw new Error('계정이 변경되었습니다. 새로 열어 주세요.');
    const current=state.normalize(db.planner),stored=JSON.parse(localStorage.getItem(LS_KEY)||'{}');
    if(rendered&&JSON.stringify(current)!==rendered)throw new Error('계획이 변경되었습니다. 새로고침 후 다시 저장해 주세요.');
    if(JSON.stringify(state.normalize(stored.planner))!==JSON.stringify(current))throw new Error('다른 창에서 계획이 변경되었습니다. 최신 기록을 새로 열어 주세요.');
    const now=Math.max(Date.now(),...current[section].map(row=>Number(row.updatedAt)||0))+1,next=rows.map(row=>{
      const item=clone(row),old=current[section].find(x=>x.id===item.id);
      if(!item.id)item.id='plan_'+crypto.randomUUID();
      if(!old||JSON.stringify(item)!==JSON.stringify(old))item.updatedAt=now;
      return item;
    });
    const previous=db.planner,previousTime=db.updatedAt;
    db.planner=state.merge(current,{[section]:next});
    try{save();}catch(error){db.planner=previous;db.updatedAt=previousTime;throw error;}
    rendered=JSON.stringify(state.normalize(db.planner));dirty=false;
    return clone(db.planner[section]);
  }
  async function fetchEquipment(id,requested){
    const c=db.chars.find(c=>charId(c)===id);if(!c)throw new Error('등록된 캐릭터를 선택해 주세요.');
    const ctx=characterQueryContext(c),epoch=requestEpoch;
    try{
      if(!ctx.source)throw new Error(characterConnectionMessage());
      if(!c.ocid)throw new Error('캐릭터 등록에서 정보를 갱신한 뒤 다시 조회해 주세요.');
      let data;
      if(ctx.source==='friends')data=await window.MapleFriends.request('character-equipment',{ocid:c.ocid},ctx.signal);
      else{
        const results=await Promise.allSettled([nexonFetch('/character/item-equipment',{ocid:c.ocid},ctx.signal),nexonFetch('/character/symbol-equipment',{ocid:c.ocid},ctx.signal)]);ctx.guard();
        const equipment=results[0].status==='fulfilled'?results[0].value:null,symbols=results[1].status==='fulfilled'?results[1].value:null;
        if(!Array.isArray(equipment?.item_equipment)&&!Array.isArray(symbols?.symbol))throw new Error('장비·심볼 정보를 불러오지 못했습니다. 기존 계획은 유지됩니다.');
        data={date:equipment?.date||symbols?.date||'',equipment:equipment?.item_equipment,symbols:symbols?.symbol,warning:results.some(x=>x.status==='rejected')?'일부 정보는 불러오지 못했습니다. 기존 값을 확인하세요.':''};
      }
      ctx.guard();if(epoch!==requestEpoch)throw new Error('장부가 변경되어 조회 결과를 취소했습니다.');
      if(requested==='equipment'&&!Array.isArray(data.equipment))throw new Error('장비 정보를 조회하지 못했습니다. 기존 투자 기록은 유지됩니다.');
      if(requested==='symbols'&&!Array.isArray(data.symbols))throw new Error('심볼 정보를 조회하지 못했습니다. 기존 심볼 계획은 유지됩니다.');
      return {equipment:Array.isArray(data.equipment)?data.equipment:[],symbols:Array.isArray(data.symbols)?data.symbols:[],date:data.date||'',fetchedAt:Date.now(),warning:data.warning||''};
    }finally{ctx.release();}
  }
  const bridge={getContext:context,commit,remove(section,id){const rows=clone(state.normalize(db.planner)[section]);const row=rows.find(row=>row.id===id);if(!row)throw new Error('기록을 찾지 못했습니다.');row.deletedAt=Date.now();return commit(section,rows);},refresh:()=>render(true),money:value=>{const n=signed(value);return(n<0n?'-':'')+korMeso(n<0n?-n:n);},fetchEquipment};
  function render(force=false){
    const page=document.getElementById('page-planner');if(!page)return;
    if(dirty&&!force&&page.querySelector('#planner-panel').childNodes.length)return;
    dirty=false;
    rendered=JSON.stringify(state.normalize(db.planner));owner=account();
    page.querySelectorAll('[data-planner-tool]').forEach(button=>{const yes=button.dataset.plannerTool===active;button.setAttribute('aria-selected',String(yes));button.tabIndex=yes?0:-1;});
    const host=page.querySelector('#planner-panel');
    try{
      if(['investment','settlement','budget'].includes(active))window.MapleLedgerFinance.render(host,active,bridge);
      else window.MapleLedgerActivity.render(host,active,bridge);
    }catch(error){host.replaceChildren();const message=document.createElement('p');message.className='lp-error';message.textContent='계획 화면을 열지 못했습니다. 저장한 장부는 유지됩니다. '+error.message;host.append(message);}
  }
  document.querySelectorAll('[data-planner-tool]').forEach(button=>button.addEventListener('click',()=>{
    if(dirty&&!confirm('저장하지 않은 입력이 있습니다. 다른 계획으로 이동할까요?'))return;
    active=button.dataset.plannerTool;const url=new URL(location.href);url.searchParams.set('tool',active);history.replaceState(null,'',url);render(true);
  }));
  document.querySelector('.planner-tabs')?.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=[...document.querySelectorAll('[data-planner-tool]')],i=buttons.indexOf(document.activeElement);if(i<0)return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();
  });
  document.addEventListener('workspace:page',event=>{if(event.detail.page==='planner')render();});
  document.addEventListener('maple:account-ledger-changing',()=>{requestEpoch++;owner='changed';});
  function open(tab){if(!names[tab])return;if(dirty&&!confirm('저장하지 않은 입력이 있습니다. 다른 계획으로 이동할까요?'))return;active=tab;if(activePageName()!=='planner')openPage('planner');const url=new URL(location.href);url.searchParams.set('page','planner');url.searchParams.set('tool',active);history.replaceState(null,'',url);render(true);}
  document.getElementById('planner-panel')?.addEventListener('input',()=>{dirty=true;});
  document.getElementById('planner-panel')?.addEventListener('change',()=>{dirty=true;});
  document.addEventListener('planner:tab',event=>open(event.detail?.tab));
  window.MapleLedgerPlanner={render,bridge,open};
  if(activePageName()==='planner')render();
})();
