/* 상품별 입력 화면만 구성합니다. 저장·합계는 기존 장부의 처리 경로를 사용합니다. */
(function(root){
  'use strict';
  const data=()=>root.MapleOctoberProfit;
  const state={royalSeries:'162',drafts:new Map()};
  const count=value=>/^\d{1,7}$/.test(String(value||'0')) && Number(value||0)<=1000000 ? Number(value||0) : null;
  const read=(box,key)=>box?.querySelector('[data-profit-input="'+key+'"]')?.value || '';
  function normalizeContext(raw){
    if(!raw || raw.version!==1 || !['royal','boutique','artisan_gift','momentum_plus','yeti_magnifier'].includes(raw.catalog)) return null;
    const result={version:1,catalog:raw.catalog};
    if(raw.catalog==='royal') result.royalSeries=raw.royalSeries==='162'?'162':'legacy';
    if(raw.catalog==='boutique'){
      const before=count(raw.beforeUses),used=count(raw.usedCount);
      if(before===null || used===null) return null;
      result.beforeUses=before;result.usedCount=used;
      if(raw.ticketCheck===true){
        const budget=count(raw.availableTickets);
        if(budget===null)return null;
        result.ticketCheck=true;result.availableTickets=budget;
      }
    }
    return result;
  }
  function fieldKey(el){
    return Array.from(el.attributes).filter(a=>a.name.startsWith('data-profit-')).map(a=>a.name+'='+a.value).join('|');
  }
  function capture(box){
    const key=box?.dataset.octoberDraftKey;if(!key)return;
    const values={};
    box.querySelectorAll('input,select').forEach(el=>{const field=fieldKey(el);if(field)values[field]=el.type==='checkbox'?el.checked:el.value;});
    state.drafts.set(key,values);
  }
  function restore(box){
    const values=state.drafts.get(box?.dataset.octoberDraftKey);if(!values)return;
    box.querySelectorAll('input,select').forEach(el=>{const key=fieldKey(el);if(!Object.hasOwn(values,key))return;if(el.type==='checkbox')el.checked=values[key];else el.value=values[key];});
  }
  function clear(box){state.drafts.delete(box?.dataset.octoberDraftKey);if(box)delete box.dataset.octoberDraftKey;}
  function supported(type){return type==='royal' || !!data()?.catalog(type);}
  function available(type,now=Date.now()){return !data()?.catalog(type) || data().isActive(type,now);}
  function draftKey(type){return supported(type)?type+(type==='royal'?':'+state.royalSeries:''):'';}
  function royalOutputs(legacy){return state.royalSeries==='162'?data().royalOutputs:legacy;}
  function allItems(){return data().catalogs.flatMap(c=>c.costs.concat(c.outputs)).concat(data().royalOutputs);}
  function notice(text,h){return '<p class="muted october-product-note">'+h.esc(text)+'</p>';}
  function officialPriceNotes(c,h){
    return '<ul class="october-product-prices">'+c.costs.map(item=>'<li>'+h.esc(item.name)+' — '+h.esc(item.tradeNote || '')+'</li>').join('')+'</ul>';
  }
  function form(type,h){
    if(type==='royal'){
      const active=data().isActive('royal162');
      if(!active) state.royalSeries='legacy';
      return '<div class="profit-entry-grid">'+h.profitDateBlock()+'<div class="profit-field"><label for="october-royal-series">기록 방식</label><select id="october-royal-series">'+
        (active?'<option value="162"'+(state.royalSeries==='162'?' selected':'')+'>162기 · 품목별</option>':'')+'<option value="legacy"'+(state.royalSeries==='legacy'?' selected':'')+'>기존 · 라벨 등급별</option></select></div></div>'+
        (state.royalSeries==='162'?notice('162기 꿈빛 마법 상점 · 1회 2,200캐시 · 목록은 11월 19일 점검 전까지입니다. 보유 쿠폰은 구입 후 7일 내 사용하며, 과거 결과의 판매 정산은 계속 기록할 수 있습니다. 품목별 기록과 라벨별 기록에 같은 판매를 두 번 입력하지 마세요.',h):notice('기존 기수·마스터피스의 라벨별 기록입니다. 162기 실물 이름을 남기려면 품목별 방식을 선택하세요.',h))+
        '<h3>실제 구입 비용</h3>'+h.profitCostRowsHtml(h.royalCosts,'개당 매입가 (메소)')+'<h3>획득 결과 · 실제 판매</h3>'+h.profitOutputRowsHtml(royalOutputs(h.royalLegacyOutputs))+
        '<p class="muted"><a href="'+data().royal.source+'" target="_blank" rel="noopener noreferrer">162기 공식 상품 안내</a></p>';
    }
    const c=data().catalog(type);if(!c)return '';
    const previous=(h.records || []).filter(r=>r.type==='boutique' && r.date>='2026-10-22' && r.date<='2026-11-30').reduce((max,r)=>{
      const context=normalizeContext(r.context);return context?Math.max(max,context.beforeUses+context.usedCount):max;
    },0);
    let result='<div class="profit-entry-grid">'+h.profitDateBlock()+'</div>'+officialPriceNotes(c,h)+
      (type==='yeti_magnifier'?'':notice('캐시·크레딧·메이플포인트 금액은 메소에 자동 합산하지 않습니다. 메소로 구입했거나 메소로 환산해 관리할 비용만 직접 입력하세요. 무료 지급품의 구입비는 0으로 둡니다.',h))+
      '<h3>실제 구입 비용</h3>'+h.profitCostRowsHtml(c.costs,'개당 실제 메소 비용');
    if(type==='boutique'){
      result+=notice('기프트 판매는 11월 18일 23:59까지, 티켓 사용은 11월 30일 23:59까지입니다. 기프트는 구입 후 7일 내 사용하세요. 판매 종료 후에는 남은 티켓·교환품의 판매 결과를 비용 0으로 정산할 수 있습니다.',h)+
        '<details class="october-fever"><summary>이번 시즌 피버 횟수 확인</summary><div class="profit-entry-grid">'+
        '<div class="profit-field"><label>이번 기록 이전 사용 수</label><input data-profit-input="boutiqueBefore" type="number" min="0" max="1000000" value="'+Math.min(previous,1000000)+'"></div>'+
        '<div class="profit-field"><label>이번에 실제 사용한 기프트 수</label><input data-profit-input="boutiqueUsed" type="number" min="0" max="1000000" value="0"></div></div>'+
        '<p class="muted">메이플ID의 이번 판매 시즌 사용 횟수입니다. 다른 기기·게임 내 사용분이 있다면 이전 사용 수를 맞춰 주세요. 구입 수와 사용 수는 별개입니다.</p><p data-october-fever-result role="status" aria-live="polite"></p>'+
        '<details><summary>공식 티켓 확률 보기</summary>'+probabilityTable('일반',c.normalProbabilities,h)+probabilityTable('10번째 사용 · 피버',c.feverProbabilities,h)+'</details></details>'+
        '<details class="october-ticket-check"><summary>티켓 판매·교환 수량 검산 (선택)</summary><label class="profit-check"><input data-profit-input="ticketCheck" type="checkbox"> 이번 정산의 티켓 사용량 검산</label><div class="profit-field"><label>이번 정산에 쓸 수 있는 총 티켓 수</label><input data-profit-input="ticketBudget" type="number" min="0" max="1000000" placeholder="보유·획득한 티켓 합계"></div><p class="muted">티켓 판매 수량과 이번에 교환한 모든 결과물의 필요 티켓 수를 합산합니다. 교환품을 따로 구입해 재판매한 경우에는 이 검산을 끄고 실제 매입비를 별도로 기록하세요.</p><p data-october-ticket-result role="status" aria-live="polite"></p></details>'+
        '<h3>티켓 판매</h3>'+h.profitOutputRowsHtml(c.outputs.slice(0,1))+
        '<details class="october-exchange"><summary>티켓으로 교환한 결과물 판매 기록</summary><p class="muted">교환에 쓴 티켓은 티켓 판매로도 입력하지 마세요. 아이템별 필요 티켓 수와 거래 조건을 확인하세요.</p>'+
        '<ul class="october-product-prices">'+c.outputs.slice(1).map(item=>'<li>'+h.esc(item.name)+' · '+h.esc(item.tradeNote)+'</li>').join('')+'</ul>'+h.profitOutputRowsHtml(c.outputs.slice(1))+'</details>';
    }else if(type==='artisan_gift'){
      result+='<h3>획득 결과 · 실제 판매</h3>'+notice('표시된 확률은 선물 1회 기준입니다. 엘릭서·파워 엘릭서·주문의 흔적은 묶음 수가 아닌 실제 낱개 수량을 적습니다. 거래할 수 없는 상태의 결과물은 판매로 체크하지 마세요.',h)+h.profitOutputRowsHtml(c.outputs);
    }else if(c.outputs.length){
      result+='<h3>획득 결과 · 실제 판매</h3>'+notice(c.tradeNote,h)+h.profitOutputRowsHtml(c.outputs);
    }
    return result+'<p class="muted"><a href="'+c.source+'" target="_blank" rel="noopener noreferrer">공식 상품·확률 안내</a></p>';
  }
  function probabilityTable(title,rows,h){
    return '<p><b>'+h.esc(title)+'</b> · '+rows.map(row=>row.quantity+'개 '+row.probability+'%').join(' / ')+'</p>';
  }
  function bind(box,type,rerender){
    restore(box);
    const series=box.querySelector('#october-royal-series');
    if(series)series.onchange=()=>{capture(box);state.royalSeries=series.value;rerender();};
    const updateFever=()=>{
      const output=box.querySelector('[data-october-fever-result]');if(!output)return;
      const before=count(read(box,'boutiqueBefore')),used=count(read(box,'boutiqueUsed'));
      if(before===null || used===null){output.textContent='사용 수를 0~1,000,000의 정수로 입력하세요.';return;}
      const info=data().feverInfo(before,used);
      output.textContent='이번 기록: 일반 '+info.normalUses+'회 · 피버 '+info.feverUses+'회 / 다음 피버까지 '+info.nextFeverIn+'회. 티켓 수익은 실제 획득·판매 수량으로 계산합니다.';
    };
    box.querySelectorAll('[data-profit-input="boutiqueBefore"],[data-profit-input="boutiqueUsed"]').forEach(el=>el.addEventListener('input',updateFever));
    updateFever();
    const updateTickets=()=>{
      const output=box.querySelector('[data-october-ticket-result]');if(!output)return;
      if(!box.querySelector('[data-profit-input="ticketCheck"]')?.checked){output.textContent='검산을 켜면 저장 전에 티켓 중복 사용 여부를 확인합니다.';return;}
      const result=ticketBalance(box);
      output.textContent=result.error || ('티켓 판매 '+result.soldTickets+'개 · 교환 사용 '+result.exchangedTickets+'개 · 남은 티켓 '+result.remaining+'개');
    };
    box.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',updateTickets);el.addEventListener('change',updateTickets);});
    updateTickets();
  }
  function ticketBalance(box){
    const budget=count(read(box,'ticketBudget'));
    if(budget===null || read(box,'ticketBudget')==='')return {error:'정산 가능한 총 티켓 수를 0~1,000,000의 정수로 입력하세요.'};
    const sold=box.querySelector('[data-profit-out-sold="boutique_ticket"]')?.checked;
    const soldCount=sold?count(box.querySelector('[data-profit-out-count="boutique_ticket"]')?.value):0;
    if(soldCount===null)return {error:'티켓 판매 수량을 정수로 입력하세요.'};
    const exchanges={};
    for(const item of data().catalog('boutique').outputs.filter(item=>item.ticketCost)){
      const quantity=count(box.querySelector('[data-profit-out-count="'+item.id+'"]')?.value);
      if(quantity===null)return {error:'교환 결과 수량을 0~1,000,000의 정수로 입력하세요.'};
      exchanges[item.id]=quantity;
    }
    const balance=data().ticketBalance(budget,soldCount,exchanges);
    return balance.valid?balance:{error:'티켓 판매와 교환 사용량이 총 티켓 수를 넘습니다. 같은 티켓을 두 번 반영했는지 확인하세요.'};
  }
  function context(type,box){
    if(!supported(type))return null;
    const result={version:1,catalog:type};
    if(type==='royal')result.royalSeries=state.royalSeries;
    if(type==='boutique'){
      result.beforeUses=read(box,'boutiqueBefore') || '0';result.usedCount=read(box,'boutiqueUsed') || '0';
      if(box.querySelector('[data-profit-input="ticketCheck"]')?.checked){result.ticketCheck=true;result.availableTickets=read(box,'ticketBudget');}
    }
    return normalizeContext(result);
  }
  function validation(type,date,record,box,now=Date.now()){
    if(!supported(type))return '';
    const c=data().catalog(type);
    if(c && !available(type,now))return '이 상품의 신규 입력 기간이 끝났습니다. 저장된 과거 기록과 통계는 유지됩니다.';
    if((c || state.royalSeries==='162') && date<'2026-10-22')return '이번 상품 기록은 2026년 10월 22일부터 입력하세요. 이전 로얄 기수는 기존 라벨 등급별 기록을 선택하세요.';
    if(c?.lastRecordDate && date>c.lastRecordDate)return '기록 날짜는 '+c.lastRecordDate+'까지 선택하세요.';
    if(c?.lastPurchaseDate && date>c.lastPurchaseDate && record.costs.some(line=>line.count>0))return '판매 기간 이후 구입비는 입력할 수 없습니다. 이전 구입비를 중복 입력하지 말고 남은 결과의 판매만 정산하세요.';
    if(type==='royal' && state.royalSeries==='162' && date>data().royal.lastPurchaseDate && record.costs.some(line=>line.id==='royal_style' && line.count>0))return '162기 목록 종료 이후 날짜에 새 쿠폰 구입비를 입력할 수 없습니다. 남은 결과의 판매 정산만 기록하세요.';
    if(type==='momentum_plus' && date===data().today(now) && !data().canPurchase(type,now) && record.costs.some(line=>['momentum_premium','momentum_prime'].includes(line.id) && line.count>0))return '패스 구매는 11월 18일 23:00에 종료됩니다. 실제 구매 날짜의 기록을 확인하세요.';
    if(!context(type,box))return '사용 수를 0~1,000,000의 정수로 입력하세요.';
    if(type==='boutique' && box.querySelector('[data-profit-input="ticketCheck"]')?.checked){const balance=ticketBalance(box);if(balance.error)return balance.error;}
    return '';
  }
  root.MapleOctoberProfitUI=Object.freeze({state,normalizeContext,supported,available,draftKey,royalOutputs,allItems,form,bind,capture,clear,context,validation});
})(globalThis);
