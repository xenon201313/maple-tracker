(function () {
  'use strict';

  const E = window.MapleEnhancements;
  const pageSize = 20;
  const labels = {starforce:'스타포스', potential:'메소 잠재능력', cube:'큐브', 'soul-potential':'소울 잠재능력', manual:'직접 기록'};
  const states = {pending:'미반영', confirmed:'장부 반영', excluded:'제외됨', conflict:'중복 확인', manual:'직접 기록'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const money = value => window.MapleEnhancementBridge.money(String(value));
  const ledgerSymbols=new Map([
    ['월묘의당근','moon-carrot'],['나무새총','wooden-slingshot'],['플라스틱새총','plastic-slingshot'],
    ['꼬마유니콘','little-unicorn'],['유니콘네온사인','unicorn-neon'],['출항','setting-sail']
  ]);

  function iconHtml(item,size) {
    const name=String(item?.name || '').trim();
    if (!name) return '<svg class="ui-icon" aria-hidden="true"><use href="assets/ui-icons.svg#receipt"></use></svg>';
    const words=name.split(/\s+/);
    const initials=words.length===1 ? Array.from(name).slice(0,2).join('') :
      Array.from(words[0])[0]+Array.from(words[words.length-1])[0];
    const original=window.resolveItemImage(item);
    const symbol=original ? '' : ledgerSymbols.get(name.normalize('NFC').replace(/\s+/g,''));
    const url=original || (symbol ? 'assets/equipment-symbols/'+symbol+'.svg' : '');
    const attribution=symbol ? ' title="'+escape(name+' · 메계부 제작 식별 아이콘')+'"' : '';
    const badge='<span class="expense-item-initials" title="'+escape(name+' · 원본 이미지 미확인')+'">'+escape(initials)+'</span>';
    const image=url ? '<img src="'+escape(url)+'" alt="'+escape(name)+'"'+attribution+' width="'+size+'" height="'+size+'" loading="lazy">' : '';
    return '<span class="expense-item-art" style="--item-icon-size:'+size+'px" aria-hidden="true">'+image+badge+'</span>';
  }

  function eventAmount(event, detail) {
    const unit = event.kind === 'starforce' && detail.basis !== 'saved-rate'
      ? E.starCost({...event,level:detail.resolvedLevel},detail.profile) : detail.unit;
    if (unit == null || detail.attempts == null) return null;
    return String(BigInt(unit) * BigInt(detail.attempts));
  }

  function build(state, manual) {
    const rows = [];
    const batches = state.batches.slice().sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const conflicts = new Set(E.allocated(state).conflicts.map(b => b.id));
    const byKey = new Map(state.events.map(event => [event.key,event]));
    const actionByEvent = new Map();
    for (const batch of batches) {
      for (const key of batch.eventKeys) {
        const event = byKey.get(key);
        if (!event) continue;
        const identity = E.identity(event);
        if (!actionByEvent.has(identity)) actionByEvent.set(identity,batch);
      }
    }
    // Show original attempts after confirmation, while retaining each batch's actual payment separately.
    const groups = E.groups({...state, batches:[]});
    for (const detail of groups) {
      for (const event of detail.events) {
        const batch = actionByEvent.get(E.identity(event));
        const status = batch ? (conflicts.has(batch.id) ? 'conflict' : batch.status) : 'pending';
        const when = Date.parse(event.at);
        rows.push({id:event.key,date:event.date,when,time:time.format(when),item:event.item,character:event.character,
          world:event.world,kind:event.kind,method:E.methodLabel(event),status,amount:eventAmount(event,detail),event,batch});
      }
    }
    for (const record of manual) {
      rows.push({id:record.id,date:record.date,when:0,time:'',item:record.item,character:record.character || '',
        world:'',kind:'manual',method:record.method,status:'manual',amount:record.amount,record});
    }
    return rows.sort((a,b) => b.date.localeCompare(a.date) || b.when-a.when || String(a.id).localeCompare(String(b.id)));
  }

  function optionList(title,options,groupOfThree=false) {
    const lines = (Array.isArray(options) ? options : []).filter(o => o && (o.grade || o.value));
    const list = options => options.map(o =>
      '<li><small>'+escape(o.grade)+'</small> '+escape(o.value || '옵션 문구 미제공')+'</li>').join('');
    let body='<p>저장된 옵션 없음</p>';
    if (groupOfThree && lines.length===9) {
      body=[0,3,6].map((offset,i)=>'<h5>'+(i+1)+'회 결과</h5><ul>'+list(lines.slice(offset,offset+3))+'</ul>').join('');
    } else if (lines.length) body='<ul>'+list(lines)+'</ul>';
    return '<section><h4>'+title+'</h4>'+body+'</section>';
  }

  function result(event) {
    if (event.kind === 'starforce') {
      const stars = n => Number.isInteger(n) ? n+'성' : '단계 미상';
      return [event.result,stars(event.stars)+' → '+stars(event.nextStars)].filter(Boolean).join(' · ');
    }
    return (event.grade || '등급 미상')+' → '+(event.nextGrade || '등급 미상');
  }

  function eventDetails(row) {
    const e = row.event;
    if (!e) {
      const costs = (row.record.costs || []).filter(line => line.count > 0 && /^\d+$/.test(String(line.price)));
      const memo = row.record.memo ? '<p>'+escape(row.record.memo)+'</p>' : '';
      return memo + (costs.length ? '<ul class="eh-manual-lines">'+costs.map(line =>
        '<li>'+iconHtml({id:line.id,name:line.name},24)+' '+escape(line.name)+' · '+money(line.price)+' × '+escape(line.count)+'</li>').join('')+'</ul>' : '<p>'+escape(row.method)+'</p>');
    }
    const detail = [];
    if (e.equipmentPart) detail.push(e.equipmentPart);
    if (e.level != null) detail.push('장비 레벨 '+e.level);
    if (e.soulStage != null) detail.push('소울 증폭 '+e.soulStage+'단계');
    if (e.starcatchResult) detail.push('스타캐치 '+e.starcatchResult);
    if (e.kind === 'starforce') {
      const [superior,defence,chance,,scroll,shield,,events] = E.starConditions(e);
      if (E.flag(superior)) detail.push('슈페리얼 장비');
      if (E.flag(defence)) detail.push('파괴 방지');
      if (E.flag(chance)) detail.push('찬스 타임');
      if (scroll && !/미사용|없음/.test(scroll)) detail.push('강화 주문서 '+scroll);
      if (E.flag(shield)) detail.push('보호 주문서');
      for (const [discount,range] of Array.isArray(events) ? events : []) {
        if (parseFloat(discount)>0) detail.push(String(discount).replace(/%$/,'')+'% 할인'+(range?' ('+range+')':''));
      }
    }
    if (e.miracleTimeFlag) detail.push('미라클 타임 '+(E.flag(e.miracleTimeFlag)?'적용':'미적용'));
    if (e.guaranteed === true) detail.push('등급 상승 보장 적용');
    if (e.guaranteeCount != null) detail.push('등급 상승 보장 횟수 '+e.guaranteeCount);
    const soulAttempts=e.kind==='soul-potential'?E.soulAttempts(e):null;
    if (e.kind==='soul-potential') {
      const unit=E.defaultUnit(e);
      if (unit!=null && soulAttempts!=null) detail.push('공식 1회 비용 '+money(unit)+' × '+soulAttempts+'회');
    }
    let html = detail.length ? '<p>'+escape(detail.join(' · '))+'</p>' : '';
    if (e.kind !== 'starforce') {
      html += '<div class="eh-options">'+optionList('변경 전 옵션',e.beforeOptions)+optionList('변경 후 옵션',e.options,soulAttempts===3)+'</div>';
      if (e.otherBeforeOptions?.length || e.otherOptions?.length) {
        const other = e.optionTrack === '에디셔널 잠재능력' ? '잠재능력' : '에디셔널 잠재능력';
        html += '<div class="eh-options">'+optionList(other+' 변경 전',e.otherBeforeOptions)+optionList(other+' 변경 후',e.otherOptions)+'</div>';
      }
    }
    if (row.batch && row.status === 'confirmed') html += '<p class="eh-booked">이 시도가 속한 '+row.batch.eventKeys.length+'건의 확정 지출 · '+money(row.batch.amount)+'</p>';
    if (row.status === 'pending') html += '<button type="button" class="ghost" data-history-manage="'+escape(e.kind)+'" data-event-key="'+escape(e.key)+'">장비별 지출 관리</button>';
    return html || '<p>'+escape(result(e))+'</p>';
  }

  const navOptions = values => Object.entries(values).map(([key,label]) => '<option value="'+key+'">'+label+'</option>').join('');
  function draw(host, rows, manage, filters) {
    const months=[...new Set(rows.map(r=>r.date.slice(0,7)))].sort().reverse();
    host.innerHTML = '<div class="eh-toolbar"><label>기록 검색<input type="search" data-history-search placeholder="장비·캐릭터·날짜·메모" maxlength="120"></label>'+
      '<label>기록 월<select data-history-month><option value="">전체 기간</option>'+months.map(month=>'<option value="'+escape(month)+'">'+escape(month)+'</option>').join('')+'</select></label>'+
      '<label>기록 종류<select data-history-kind><option value="">전체 종류</option>'+navOptions(labels)+'</select></label>'+
      '<label>반영 상태<select data-history-status><option value="">전체 상태</option>'+navOptions(states)+'</select></label></div>'+
      '<div class="eh-filter-result"><p class="eh-count" role="status" aria-live="polite"></p><button type="button" class="ghost" data-history-reset hidden>필터 초기화</button></div><div class="eh-days"></div>'+
      '<div class="enhancement-pagination" data-history-pages><button type="button" class="ghost" data-history-prev>이전</button><span></span><button type="button" class="ghost" data-history-next>다음</button></div>';
    const find = selector => host.querySelector(selector);
    const search = find('[data-history-search]'), month = find('[data-history-month]'), kind = find('[data-history-kind]'), status = find('[data-history-status]');
    const list = find('.eh-days'), prev = find('[data-history-prev]'), next = find('[data-history-next]'), reset = find('[data-history-reset]');
    search.value=filters.query; month.value=months.includes(filters.month)?filters.month:''; kind.value=filters.kind; status.value=filters.status;
    function update() {
      const query = search.value.trim().toLocaleLowerCase();
      for (const input of [search,month,kind,status]) input.classList.toggle('eh-filter-active',Boolean(input.value));
      reset.hidden=![search,month,kind,status].some(input=>input.value);
      const matches = rows.filter(r => (!month.value || r.date.startsWith(month.value)) && (!kind.value || r.kind===kind.value) && (!status.value || r.status===status.value) &&
        (!query || [r.date,r.item,r.character,r.world,r.method,r.record?.memo].join(' ').toLocaleLowerCase().includes(query)));
      const pages=Math.ceil(matches.length/pageSize);
      filters.page=Math.max(0,Math.min(filters.page,pages-1));
      const start=filters.page*pageSize;
      const shown=matches.slice(start,start+pageSize);
      find('.eh-count').textContent = matches.length ? matches.length.toLocaleString()+'건 중 '+(start+1)+'–'+(start+shown.length)+'번째' : '0건';
      let date='';
      list.innerHTML=shown.map(r=>{
        const heading = date!==r.date ? '<h3 class="eh-date">'+escape(r.date.replace(/-/g,'. '))+'</h3>' : '';
        date=r.date;
        const price=r.amount==null ? '비용 미확인' : money(r.amount);
        const priceType = r.kind==='cube' ? '큐브 환산액' : r.kind==='manual' ? '확정 지출' : '예상 비용';
        const costKind = r.amount==null ? 'unknown' : r.kind==='cube' ? 'conversion' : r.kind==='manual' ? 'booked' : 'estimate';
        const art=iconHtml(r.event ? {name:r.item} : r.record.itemArt,32);
        return heading+'<details class="eh-event"><summary><span class="eh-time">'+escape(r.time || '수기')+'</span>'+
          '<span class="eh-item"><span class="eh-art" aria-hidden="true">'+art+'</span><span><strong>'+escape(r.item)+'</strong><small>'+escape([r.character,r.world,r.method===r.item?'':r.method].filter(Boolean).join(' · '))+'</small></span></span>'+
          '<span class="eh-result">'+escape(r.event?result(r.event):r.record.memo || '')+'</span>'+
          '<span class="eh-cost" data-cost="'+costKind+'"><small>'+priceType+'</small><b>'+price+'</b></span><span class="eh-status" data-state="'+r.status+'">'+states[r.status]+'</span></summary>'+
          '<div class="eh-event-detail">'+eventDetails(r)+'</div></details>';
      }).join('') || '<p class="muted enhancement-empty">'+(rows.length?'조건에 맞는 기록이 없습니다. 검색어나 필터를 바꿔 보세요.':'저장된 이력이 없습니다. 조회 기간을 선택하고 ‘이력 가져오기’를 누르세요.')+'</p>';
      find('[data-history-pages]').hidden=pages<2;
      find('[data-history-pages] span').textContent=(filters.page+1)+' / '+pages;
      prev.disabled=filters.page===0; next.disabled=filters.page+1>=pages;
    }
    function filter() {
      Object.assign(filters,{query:search.value,month:month.value,kind:kind.value,status:status.value,page:0}); update();
    }
    search.oninput=filter; month.onchange=filter; kind.onchange=filter; status.onchange=filter;
    reset.onclick=()=>{for(const input of [search,month,kind,status]) input.value=''; filter(); search.focus();};
    prev.onclick=()=>{filters.page--;update();}; next.onclick=()=>{filters.page++;update();};
    list.onclick=event=>{
      const button=event.target.closest('[data-history-manage]');
      if (button) manage(button.dataset.historyManage,button.dataset.eventKey);
    };
    update();
  }

  window.MapleExpenseHistory=Object.freeze({build,draw,eventAmount,iconHtml});
})();
