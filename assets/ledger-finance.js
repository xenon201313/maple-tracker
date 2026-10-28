(function (root) {
  'use strict';
  const id = prefix => prefix + '_' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const active = value => (Array.isArray(value) ? value : []).filter(row => row && !row.deletedAt);
  function nextStamp(row) {
    const times=[row?.updatedAt,row?.deletedAt].map(Number).filter(Number.isFinite);
    return Math.max(Date.now(),...times)+1;
  }
  function amount(value, negative = false) {
    const text = String(value ?? '0').trim().replace(/,/g, '');
    if (!(negative ? /^-?\d+$/ : /^\d+$/).test(text)) throw new Error('메소는 소수점 없는 정수로 입력해 주세요.');
    const result = BigInt(text);
    if (result < 0n && !negative) throw new Error('메소는 0 이상이어야 합니다.');
    return result;
  }
  function safeAmount(value, negative = false) { try { return amount(value, negative); } catch { return 0n; } }
  function quantity(value) {
    if (!/^\d+$/.test(String(value ?? ''))) throw new Error('수량은 1 이상의 정수로 입력해 주세요.');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > 1000000000) throw new Error('수량은 1부터 10억까지 입력할 수 있습니다.');
    return n;
  }
  function rate(value) {
    const text = String(value ?? '0').trim();
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) throw new Error('비율은 0~100 사이, 소수 둘째 자리까지 입력해 주세요.');
    const [whole, fraction = ''] = text.split('.');
    const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (bps > 10000) throw new Error('비율은 100%를 넘을 수 없습니다.');
    return BigInt(bps);
  }
  function date(value) {
    const text = String(value ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('날짜를 입력해 주세요.');
    const d = new Date(text + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) throw new Error('올바른 날짜를 입력해 주세요.');
    return text;
  }
  function sourceReferences(context) {
    const refs = [];
    active(context.enhancements).filter(row => row.confirmed).forEach(row => refs.push({key:'enhancement:' + row.id, sourceId:String(row.id), kind:'enhancement', date:row.date || '', charName:row.charName || '', itemName:row.itemName || row.type || '강화 지출', amount:safeAmount(row.amount).toString(), icon:row.icon || ''}));
    active(context.expenses).forEach(row => refs.push({key:'expense:' + row.id, sourceId:String(row.id), kind:'expense', date:row.date || '', charName:row.charName || '', itemName:row.memo || row.category || '직접 지출', amount:safeAmount(row.amount).toString(), icon:''}));
    return [...new Map(refs.map(row => [row.key, row])).values()];
  }
  function investmentTotals(project, context) {
    const refs = new Map(sourceReferences(context).map(row => [row.key, row]));
    const usedElsewhere=new Set(active(context.planner?.investments).filter(row=>row!==project&&(!project.id||row.id!==project.id)).flatMap(row=>(Array.isArray(row.links)?row.links:[]).map(link=>link.key)));
    const seen = new Set(), missing = [], linked = [], conflicts = [];
    for (const link of Array.isArray(project.links) ? project.links : []) {
      if (!link?.key || seen.has(link.key)) continue;
      seen.add(link.key);
      const current = refs.get(link.key);
      if(usedElsewhere.has(link.key))conflicts.push(current||link);
      else if (current) linked.push(current); else missing.push(link);
    }
    const spent = linked.reduce((sum, row) => sum + amount(row.amount), 0n);
    const budget = safeAmount(project.budget);
    return {spent:spent.toString(), budget:budget.toString(), remaining:(budget - spent).toString(), plannedPurchase:safeAmount(project.purchaseCost).toString(), linked, missing, conflicts};
  }
  function availableReferences(context, projectId = '') {
    const used = new Set(active(context.planner?.investments).filter(row => row.id !== projectId).flatMap(row => (Array.isArray(row.links) ? row.links : []).map(link => link.key)));
    const current=active(context.planner?.investments).find(row=>row.id===projectId);
    const own=new Set((Array.isArray(current?.links)?current.links:[]).map(link=>link.key));
    return sourceReferences(context).filter(row => !used.has(row.key)||own.has(row.key));
  }
  function saleTotals(sale) {
    const q = quantity(sale.quantity), unit = amount(sale.unitPrice);
    const gross = unit * BigInt(q), net = gross * (10000n-rate(sale.feePercent ?? '3')) / 10000n;
    const fee = gross-net, own = net * rate(sale.sharePercent ?? '100') / 10000n;
    const payable = net - own, paid = amount(sale.paidAmount ?? '0');
    if (paid > payable) throw new Error('분배 지급액은 파티 분배 대상액을 넘을 수 없습니다.');
    return {quantity:q, gross:gross.toString(), fee:fee.toString(), net:net.toString(), own:own.toString(), payable:payable.toString(), paid:paid.toString(), unpaid:(payable-paid).toString()};
  }
  function tradeTotals(trade, options = {}) {
    const totalQuantity = quantity(trade.quantity);
    let soldQuantity = 0, gross = 0n, fee = 0n, own = 0n, paid = 0n, unpaid = 0n, payable = 0n;
    const sales = active(trade.sales).map(sale => {
      const totals = saleTotals(sale);
      soldQuantity += totals.quantity;
      gross += amount(totals.gross); fee += amount(totals.fee); own += amount(totals.own);
      paid += amount(totals.paid); unpaid += amount(totals.unpaid); payable += amount(totals.payable);
      return {...sale, totals};
    });
    const excessQuantity = Math.max(0, soldQuantity-totalQuantity), quantityConflict = excessQuantity>0;
    if (quantityConflict && !options.allowOversold) throw new Error('판매 수량 합계가 획득 수량보다 많습니다.');
    const remainingQuantity = Math.max(0, totalQuantity - soldQuantity);
    const status = quantityConflict ? '판매 수량 충돌' : !soldQuantity ? '미판매' : remainingQuantity ? '부분 판매' : unpaid > 0n ? '판매 완료·분배 대기' : '정산 완료';
    return {soldQuantity, remainingQuantity, excessQuantity, quantityConflict, gross:gross.toString(), fee:fee.toString(), own:own.toString(), paid:paid.toString(), unpaid:unpaid.toString(), payable:payable.toString(), status, sales};
  }
  function validateTradeRepair(previous, next) {
    const before=tradeTotals(previous,{allowOversold:true});
    const after=tradeTotals(next,{allowOversold:before.quantityConflict});
    if(after.quantityConflict&&after.excessQuantity>before.excessQuantity)throw new Error('판매 수량 충돌이 더 커지는 수정은 저장할 수 없습니다. 판매 수량을 줄이거나 잘못된 판매를 취소해 주세요.');
    return after;
  }
  function budgetTotals(context) {
    const opening = active(context.planner?.opening).sort((a,b) => Number(b.updatedAt||0)-Number(a.updatedAt||0))[0];
    const since = opening?.date || '', until = context.today || '9999-12-31';
    let balance = safeAmount(opening?.amount), income = 0n, expense = 0n, adjustment = 0n;
    const cashEntries = [];
    if (since) {
      for (const row of active(context.cashEntries)) {
        if (!row.date || row.date < since || row.date > until) continue;
        const value = row.signedAmount !== undefined ? safeAmount(row.signedAmount, true) : safeAmount(row.amount) * (row.kind === 'expense' ? -1n : 1n);
        if (value >= 0n) income += value; else expense -= value;
        balance += value; cashEntries.push({...row, signedAmount:value.toString()});
      }
      for (const row of active(context.planner?.adjustments)) {
        if (!row.date || row.date < since || row.date > until) continue;
        const value = safeAmount(row.amount, true); adjustment += value; balance += value;
      }
    }
    const reserve = safeAmount(opening?.reserve), available = balance > reserve ? balance-reserve : 0n;
    const goals = active(context.planner?.funds).sort((a,b) => Number(a.priority||999)-Number(b.priority||999));
    const allocated = goals.reduce((sum,row) => sum+safeAmount(row.allocation), 0n);
    return {opening:opening || null, balance:balance.toString(), income:income.toString(), expense:expense.toString(), adjustment:adjustment.toString(), reserve:reserve.toString(), available:available.toString(), allocated:allocated.toString(), unallocated:(available-allocated).toString(), cashEntries, goals};
  }
  function makeApiEquipment(item, asOf) {
    return {name:String(item.item_name || item.name || ''), slot:String(item.item_equipment_slot || item.slot || ''), icon:String(item.item_icon || item.icon || ''), starforce:String(item.starforce || ''), potential:String(item.potential_option_grade || ''), asOf:String(asOf || ''), fetchedAt:Date.now()};
  }
  const field = (label, control, full = false) => '<label class="lp-field' + (full ? ' lp-full' : '') + '"><span>' + escape(label) + '</span>' + control + '</label>';
  const input = (name, value = '', type = 'text', extra = '') => '<input name="' + escape(name) + '" type="' + type + '" value="' + escape(value) + '" ' + extra + '>';
  const textarea = (name, value = '') => '<textarea name="' + escape(name) + '" rows="2" maxlength="1000">' + escape(value) + '</textarea>';
  const button = (label, action = '', rowId = '', cls = 'ghost') => '<button type="button" class="' + cls + '" data-action="' + escape(action) + '" data-id="' + escape(rowId) + '">' + escape(label) + '</button>';
  const charOptions = (characters, selected = '', empty = '캐릭터 미지정') => '<option value="">' + empty + '</option>' + active(characters).map(row => '<option value="' + escape(row.id) + '"' + (String(selected) === String(row.id) ? ' selected' : '') + '>' + escape(row.name) + '</option>').join('');
  const statusHtml = () => '<p class="lp-feedback" role="status" aria-live="polite"></p>';
  function showMessage(rootElement, message, error = false) {
    const target = rootElement.querySelector('.lp-feedback');
    if (!target) return;
    target.textContent = message; target.classList.toggle('is-error', error); target.setAttribute('role', error ? 'alert' : 'status');
  }
  function money(bridge, value) { try { return escape(bridge.money(String(value))); } catch { return escape(String(value) + ' 메소'); } }
  function rows(context, section) { return clone(Array.isArray(context.planner?.[section]) ? context.planner[section] : []); }
  function save(bridge, context, section, value) {
    const next = rows(context, section), index = next.findIndex(row => row.id === value.id);
    value.updatedAt = Date.now();
    if (index < 0) next.push(value); else next[index] = value;
    bridge.commit(section, next);
  }
  function formData(form) { return Object.fromEntries(new FormData(form)); }
  function run(rootElement, fn) { try { return fn(); } catch (error) { showMessage(rootElement, error.message || '기록을 저장하지 못했습니다.', true); } }
  function requireText(value, message) { const result = String(value || '').trim(); if (!result) throw new Error(message); return result.slice(0, 200); }

  function renderInvestment(rootElement, bridge, editingId = '', success = '') {
    const context = bridge.getContext(), list = active(context.planner?.investments);
    const editing = list.find(row => row.id === editingId) || {};
    let selectedEquipment = editing.equipment || null;
    const refs = availableReferences(context, editingId);
    const checked = new Set((Array.isArray(editing.links) ? editing.links : []).map(row => row.key));
    const duplicateKeys=new Set(active(context.planner?.investments).filter(row=>row.id!==editingId).flatMap(row=>(Array.isArray(row.links)?row.links:[]).map(link=>link.key)));
    rootElement.innerHTML = '<div class="lp-section-head"><div><h2>장비별 투자 장부</h2><p>확정한 강화비와 직접 지출을 장비에 연결해 누적 투자액을 확인합니다.</p></div></div>' + statusHtml() +
      '<form class="lp-form" data-form="investment"><h3>' + (editingId ? '장비 프로젝트 수정' : '장비 프로젝트 만들기') + '</h3><div class="lp-form-grid">' +
      field('프로젝트 이름', input('name', editing.name, 'text', 'required maxlength="120" placeholder="예: 가디언 엔젤 링 22성"')) +
      field('캐릭터', '<select name="charId">' + charOptions(context.characters, editing.charId) + '</select>') +
      field('프로젝트 시작일', input('date', editing.date || context.today, 'date', 'required')) +
      field('전체 투자 예산(메소)', input('budget', editing.budget || '0', 'text', 'inputmode="numeric" required')) +
      field('예상 구입비(계획용 메소)', input('purchaseCost', editing.purchaseCost || '0', 'text', 'inputmode="numeric" required')) +
      field('장비 부위·현재 상태', input('note', editing.note, 'text', 'maxlength="200" placeholder="예: 반지 / 현재 18성"')) + '</div>' +
      '<div class="lp-actions">' + button('장착 장비 불러오기', 'fetch-equipment') + '<select name="equipment" aria-label="불러온 장비 선택"><option value="">장착 장비를 먼저 불러오세요</option></select></div>' +
      '<p class="lp-help">예상 구입비는 계획용입니다. 실제 구입비는 지출 기록에 한 번 입력한 뒤 아래에서 연결하세요. 같은 원본 지출은 여러 장비에 중복 연결할 수 없습니다.</p>' +
      '<details' + (editingId ? ' open' : '') + '><summary>기존 확정 지출 연결 (' + refs.length + '건 선택 가능)</summary><div class="lp-reference-list">' +
      (refs.length ? refs.map(row => '<label><input type="checkbox" name="references" value="' + escape(row.key) + '"' + (checked.has(row.key) ? ' checked' : '') + '><span>' + escape([row.date, row.charName, row.itemName].filter(Boolean).join(' · ')) + ' <strong>' + money(bridge, row.amount) + '</strong>'+(duplicateKeys.has(row.key)?' <small class="lp-warning">중복 연결 · 합계 보류</small>':'')+'</span></label>').join('') : '<p class="lp-empty">연결할 확정 지출이 없습니다. 지출 기록에서 실제 비용을 기록하거나 API 이력을 검토 후 확정해 주세요.</p>') + '</div></details>' +
      '<div class="lp-actions"><button type="submit">' + (editingId ? '수정 저장' : '프로젝트 저장') + '</button>' + (editingId ? button('수정 취소', 'reset') : '') + button('지출 기록 열기', 'expense') + '</div></form>' +
      '<div class="lp-list">' + (list.length ? list.map(project => {
        const total = investmentTotals(project, context), snapshot = project.equipment;
        const fresh = snapshot && Date.now()-Number(snapshot.fetchedAt || 0) < 30*86400000;
        return '<article class="lp-entry"><div class="lp-entry-head"><h3>' + escape(project.name) + '</h3><span>' + escape(project.charName || '캐릭터 미지정') + '</span></div>' +
          (fresh ? '<p>' + escape([snapshot.slot, snapshot.name, snapshot.starforce ? snapshot.starforce + '성' : '', snapshot.potential, snapshot.asOf ? 'API 제공일 ' + snapshot.asOf : 'API 제공일 미확인',snapshot.fetchedAt?'조회 '+new Date(snapshot.fetchedAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):''].filter(Boolean).join(' · ')) + '</p>' : '') +
          '<dl class="lp-summary"><div><dt>확정 누적 지출</dt><dd>' + money(bridge, total.spent) + '</dd></div><div><dt>투자 예산</dt><dd>' + money(bridge, total.budget) + '</dd></div><div><dt>남은 예산</dt><dd>' + money(bridge, total.remaining) + '</dd></div><div><dt>예상 구입비 · 계획</dt><dd>' + money(bridge, total.plannedPurchase) + '</dd></div></dl>' +
          '<p>' + escape(project.note || '') + '</p>'+(total.conflicts.length?'<p class="lp-warning" role="alert">다른 프로젝트와 중복 연결된 원본 '+total.conflicts.length+'건은 양쪽 합계에서 보류했습니다. 수정에서 중복 연결 체크를 해제해 주세요. 원본 지출과 연결 기록은 보존됩니다.</p>':'')+'<details><summary>연결한 지출 ' + total.linked.length + '건'+(total.conflicts.length?' · 중복 '+total.conflicts.length+'건 보류':'')+'</summary>' +
          total.linked.map(row => '<p>' + escape([row.date,row.itemName].filter(Boolean).join(' · ')) + ' <strong>' + money(bridge,row.amount) + '</strong></p>').join('') +
          (total.missing.length ? '<p class="lp-warning">연결 원본이 없거나 확정이 해제된 ' + total.missing.length + '건은 합계에서 제외했습니다. 원본 기록을 확인해 주세요.</p>' : '') + '</details><div class="lp-actions">' + button('수정', 'edit', project.id) + button('프로젝트 삭제', 'delete', project.id, 'danger') + '</div></article>';
      }).join('') : '<p class="lp-empty">첫 장비 프로젝트를 만들면 확정 지출을 장비별로 모아볼 수 있습니다.</p>') + '</div>';
    if (success) showMessage(rootElement, success);
    const form = rootElement.querySelector('form');
    form.addEventListener('submit', event => { event.preventDefault(); run(rootElement, () => {
      const data = formData(form), char = context.characters.find(row => String(row.id) === data.charId);
      const selected = [...form.querySelectorAll('[name="references"]:checked')].map(input => input.value);
      const allowed = new Map(availableReferences(bridge.getContext(), editingId).map(row => [row.key,row]));
      if (selected.some(key => !allowed.has(key))) throw new Error('다른 장비에 연결되었거나 변경된 지출이 있습니다. 화면을 새로 열어 확인해 주세요.');
      const links = selected.map(key => { const row=allowed.get(key); return {key:row.key,sourceId:row.sourceId,kind:row.kind,label:row.itemName,date:row.date,amount:row.amount}; });
      const currentKeys=new Set(sourceReferences(bridge.getContext()).map(row=>row.key));
      (Array.isArray(editing.links)?editing.links:[]).filter(link=>!currentKeys.has(link.key)).forEach(link=>links.push(link));
      const value = {...editing,id:editingId || id('investment'),name:requireText(data.name,'프로젝트 이름을 입력해 주세요.'),charId:data.charId,charName:char?.name || '',date:date(data.date),budget:amount(data.budget).toString(),purchaseCost:amount(data.purchaseCost).toString(),note:String(data.note || '').trim(),links,equipment:selectedEquipment};
      save(bridge,bridge.getContext(),'investments',value); renderInvestment(rootElement,bridge,'','프로젝트를 저장했습니다. 원본 지출 금액은 그대로 유지됩니다.');
    }); });
    form.elements.equipment.addEventListener('change', () => {
      const option = form.elements.equipment.selectedOptions[0];
      if (!option?.dataset.equipment) return;
      selectedEquipment=JSON.parse(option.dataset.equipment);
      if (!form.elements.name.value) form.elements.name.value=selectedEquipment.name;
      form.elements.note.value=[selectedEquipment.slot,selectedEquipment.starforce ? selectedEquipment.starforce+'성' : '',selectedEquipment.potential].filter(Boolean).join(' / ');
    });
    rootElement.onclick = event => {
      const target=event.target.closest('[data-action]'); if(!target)return;
      const action=target.dataset.action, rowId=target.dataset.id;
      if(action==='expense'){ if(typeof root.openPage==='function')root.openPage('expense'); return; }
      if(action==='reset')return renderInvestment(rootElement,bridge);
      if(action==='edit')return renderInvestment(rootElement,bridge,rowId);
      if(action==='delete')return run(rootElement,()=>{if(!root.confirm('프로젝트만 삭제할까요? 연결된 원본 지출은 유지됩니다.'))return;bridge.remove('investments',rowId);renderInvestment(rootElement,bridge,'','프로젝트를 삭제했습니다.');});
      if(action==='fetch-equipment'){
        const charId=form.elements.charId.value;
        if(!charId)return showMessage(rootElement,'장비를 조회할 캐릭터를 선택해 주세요.',true);
        target.disabled=true;showMessage(rootElement,'장착 장비를 조회하고 있습니다.');
        Promise.resolve().then(()=>bridge.fetchEquipment(charId,'equipment')).then(result=>{
          if(!form.isConnected||form.elements.charId.value!==charId)return;
          const select=form.elements.equipment;select.innerHTML='<option value="">조회한 장비를 선택해 주세요</option>';
          (Array.isArray(result.equipment)?result.equipment:[]).forEach((item,index)=>{
            const equipment=makeApiEquipment(item,result.date),option=document.createElement('option');
            option.value=String(index);option.textContent=[equipment.slot,equipment.name,equipment.starforce?equipment.starforce+'성':''].filter(Boolean).join(' · ');option.dataset.equipment=JSON.stringify(equipment);select.appendChild(option);
          });
          showMessage(rootElement,(select.options.length>1?'조회한 장비를 선택해 프로젝트에 연결하세요.':'조회 가능한 장착 장비가 없습니다. 프로젝트는 직접 작성할 수 있습니다.')+' '+(result.date?'API 제공일 '+result.date:'API 제공일 미확인')+' · 현재 조회일 '+new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}));
        }).catch(error=>{if(form.isConnected)showMessage(rootElement,error.message||'장비 조회에 실패했습니다. 직접 입력도 가능합니다.',true);}).finally(()=>{target.disabled=false;});
      }
    };
  }

  function renderSettlement(rootElement, bridge, editingId = '', saleEdit = null, success = '') {
    const context=bridge.getContext(),trades=active(context.planner?.trades),editing=trades.find(row=>row.id===editingId)||{};
    const candidates=active(context.settlementCandidates),used=new Set(trades.filter(row=>row.id!==editingId).map(row=>row.sourceId).filter(Boolean));
    rootElement.innerHTML='<div class="lp-section-head"><div><h2>미판매·미지급 정산함</h2><p>획득일과 판매일을 나누고, 일부 판매와 파티 분배 진행을 기록합니다.</p></div></div>'+statusHtml()+
      '<p class="lp-help">정산함은 기존 장부를 참조하는 별도 관리표입니다. 판매를 기록해도 기존 통계나 잔액에 다시 더하지 않습니다. 기존 장부에 없는 실제 입금만 자금 계획의 잔액 조정으로 한 번 기록하세요.</p>'+
      '<form class="lp-form" data-form="trade"><h3>'+(editingId?'획득 기록 수정':'정산할 아이템 등록')+'</h3><div class="lp-form-grid">'+
      field('기존 획득·손익 기록에서 가져오기','<select name="candidate"><option value="">직접 입력</option>'+candidates.map(row=>'<option value="'+escape(row.id)+'"'+(used.has(row.id)?' disabled':'')+(editing.sourceId===row.id?' selected':'')+'>'+escape([row.date,row.charName,row.itemName,used.has(row.id)?'(등록됨)':''].filter(Boolean).join(' · '))+'</option>').join('')+'</select>',true)+
      field('아이템 이름',input('itemName',editing.itemName,'text','required maxlength="120"'))+
      field('캐릭터',input('charName',editing.charName,'text','maxlength="120"'))+
      field('획득일',input('acquiredDate',editing.acquiredDate||context.today,'date','required'))+
      field('획득 수량',input('quantity',editing.quantity||1,'number','required min="1" max="1000000000" step="1"'))+
      field('예상 개당 판매가 · 참고용',input('expectedPrice',editing.expectedPrice||'0','text','inputmode="numeric" required'))+
      field('메모',input('note',editing.note,'text','maxlength="200"'))+'</div><p class="lp-help" data-source-info>'+escape(editing.originalShareText?'원본 참고: '+editing.originalShareText+' · 새 정산의 분배율은 직접 확인해 주세요.':'기존 원본의 가격·분배 정보는 참고값입니다. 실제 판매가와 분배율을 확인해 기록하세요.')+'</p><p class="lp-help" data-date-basis>'+escape(editing.dateBasis||'기존 주간·월간 기록은 실제 획득일을 직접 확인해 주세요.')+'</p><label class="lp-check"><input type="checkbox" name="confirmDate"'+(editingId?' checked':'')+'> 실제 획득일을 확인했습니다.</label><div class="lp-actions"><button type="submit">'+(editingId?'수정 저장':'획득 기록 저장')+'</button>'+(editingId?button('수정 취소','reset'):'')+'</div></form>'+
      '<div class="lp-toolbar"><label>보기 <select data-filter="status"><option value="pending">미판매·미지급</option><option value="all">전체</option><option value="done">정산 완료</option></select></label><label>검색 <input type="search" data-filter="search" placeholder="아이템·캐릭터 검색"></label>'+button('잔액 조정 열기','budget')+'</div><div class="lp-list" data-trade-list></div>';
    const form=rootElement.querySelector('[data-form="trade"]');
    let sourceId=editing.sourceId||'',sourceType=editing.sourceType||'',sourcePeriod=editing.sourcePeriod||'',dateBasis=editing.dateBasis||'',sourceFee=editing.feePercent??'3',sourceShare=editing.sharePercent??'100',originalShareText=editing.originalShareText||'',originalNet=editing.originalNet||'0';
    form.elements.candidate.addEventListener('change',()=>{
      const candidate=candidates.find(row=>row.id===form.elements.candidate.value);
      sourceId=candidate?.id||'';sourceType=candidate?.sourceType||'';sourcePeriod=candidate?.sourcePeriod||'';dateBasis=candidate?.dateBasis||'';
      sourceFee=String(candidate?.fee??'3');sourceShare=candidate?.shareRate!==undefined?String(Math.max(0,Math.min(100,Number(candidate.shareRate)*100)).toFixed(2)):'100';
      originalShareText=String(candidate?.originalShareText||'');originalNet=String(candidate?.originalNet||'0');
      form.querySelector('[data-source-info]').textContent=(originalShareText?'원본 참고: '+originalShareText+' · ':'')+(candidate?.note?candidate.note+' ':'')+'새 정산의 분배율은 직접 확인해 주세요. 가져온 분배율은 0.01% 단위의 단순 비율입니다.';
      form.querySelector('[data-date-basis]').textContent=candidate?.dateBasis?([candidate.sourcePeriod,candidate.dateBasis].filter(Boolean).join(' · ')):'획득일은 직접 확인해 기록하세요.';
      form.elements.confirmDate.required=!!candidate&&!candidate.date;form.elements.confirmDate.checked=false;
      if(!candidate)return;
      form.elements.itemName.value=candidate.itemName||'';form.elements.charName.value=candidate.charName||'';
      form.elements.acquiredDate.value=candidate.date||context.today;form.elements.quantity.value=candidate.quantity||1;
      form.elements.expectedPrice.value=String(candidate.unitPrice||'0');
    });
    form.addEventListener('submit',event=>{event.preventDefault();run(rootElement,()=>{
      const data=formData(form),latest=bridge.getContext();
      if(sourceId&&active(latest.planner?.trades).some(row=>row.id!==editingId&&row.sourceId===sourceId))throw new Error('이미 정산함에 가져온 원본 기록입니다.');
      if(sourceId&&dateBasis&&!data.confirmDate)throw new Error('원본 기간과 실제 획득일을 확인한 뒤 확인란을 선택해 주세요.');
      const value={...editing,id:editingId||id('trade'),itemName:requireText(data.itemName,'아이템 이름을 입력해 주세요.'),charName:String(data.charName||'').trim(),acquiredDate:date(data.acquiredDate),quantity:quantity(data.quantity),expectedPrice:amount(data.expectedPrice).toString(),note:String(data.note||'').trim(),sourceId,sourceType,sourcePeriod,dateBasis,feePercent:sourceFee,sharePercent:sourceShare,originalShareText,originalNet,dateConfirmed:!!data.confirmDate,sales:Array.isArray(editing.sales)?editing.sales:[]};
      if(editingId)validateTradeRepair(editing,value);else tradeTotals(value);
      save(bridge,latest,'trades',value);renderSettlement(rootElement,bridge,'',null,'획득 기록을 저장했습니다.');
    });});
    const listRoot=rootElement.querySelector('[data-trade-list]');
    function drawList(){
      const filter=rootElement.querySelector('[data-filter="status"]').value,search=rootElement.querySelector('[data-filter="search"]').value.trim().toLocaleLowerCase();
      const checked=trades.map(trade=>{try{return{trade,totals:tradeTotals(trade,{allowOversold:true})};}catch(error){return{trade,error:error.message};}});
      const visible=checked.filter(({trade,totals})=>(!search||(trade.itemName+' '+trade.charName).toLocaleLowerCase().includes(search))&&(filter==='all'||(filter==='done'?totals?.status==='정산 완료':totals?.status!=='정산 완료')));
      listRoot.innerHTML=visible.length?visible.map(({trade,totals:t,error})=>{
        if(error)return '<article class="lp-entry"><h3>'+escape(trade.itemName||'확인이 필요한 기록')+'</h3><p class="lp-warning">이 정산 기록을 계산하지 못했습니다: '+escape(error)+'</p><div class="lp-actions">'+button('획득 수정','edit',trade.id)+button('아이템 기록 삭제','delete',trade.id,'danger')+'</div></article>';
        const sale=saleEdit?.tradeId===trade.id?t.sales.find(row=>row.id===saleEdit.saleId):null;
        return '<article class="lp-entry" data-trade="'+escape(trade.id)+'"><div class="lp-entry-head"><h3>'+escape(trade.itemName)+'</h3><strong'+(t.quantityConflict?' class="lp-warning"':'')+'>'+escape(t.status)+'</strong></div><p>'+escape([trade.charName,trade.acquiredDate+' 획득',trade.note].filter(Boolean).join(' · '))+'</p>'+(t.quantityConflict?'<p class="lp-warning" role="alert">판매 수량 충돌: 획득 '+escape(trade.quantity)+'개에 판매 합계 '+t.soldQuantity+'개로 '+t.excessQuantity+'개가 초과했습니다. 여러 기기의 판매 기록을 모두 보존했습니다. 아래 내역에서 잘못된 판매를 수정하거나 취소해 주세요. 합계 금액은 검토 전 참고용이며 기존 잔액에 추가하지 않습니다.</p>':'')+(trade.originalShareText?'<p class="lp-help">원본 참고: '+escape(trade.originalShareText)+' · 원본 가격 기준 실수령 '+money(bridge,trade.originalNet||'0')+'</p>':'')+'<dl class="lp-summary"><div><dt>남은 수량</dt><dd>'+t.remainingQuantity+' / '+escape(trade.quantity)+'개</dd></div><div><dt>'+(t.quantityConflict?'내 몫 합계 · 검토 전 참고':'판매 후 내 몫')+'</dt><dd>'+money(bridge,t.own)+'</dd></div><div><dt>'+(t.quantityConflict?'미지급 합계 · 검토 전 참고':'파티 미지급')+'</dt><dd>'+money(bridge,t.unpaid)+'</dd></div></dl>'+
          '<details'+(sale||t.quantityConflict?' open':'')+'><summary>판매·분배 내역 '+t.sales.length+'건 / '+(sale?'판매 수정':t.quantityConflict?'충돌 검토':t.remainingQuantity>0?'판매 추가':'완료 내역')+'</summary>'+
          (t.sales.length?'<div class="lp-table-scroll"><table><thead><tr><th>판매일</th><th>수량</th><th>수수료 후 내 몫</th><th>파티 분배</th><th>관리</th></tr></thead><tbody>'+t.sales.map(row=>'<tr><td>'+escape(row.date)+'</td><td>'+row.quantity+'개</td><td>'+money(bridge,row.totals.own)+'</td><td>지급 '+money(bridge,row.totals.paid)+'<br>미지급 '+money(bridge,row.totals.unpaid)+'<br>'+escape(row.recipient||'')+'</td><td>'+button('판매 수정','sale-edit',row.id)+button('판매 취소','sale-delete',row.id,'danger')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="lp-empty">아직 판매한 기록이 없습니다.</p>')+
          (t.remainingQuantity>0||sale?'<form class="lp-form" data-form="sale" data-trade-id="'+escape(trade.id)+'" data-sale-id="'+escape(sale?.id||'')+'"><div class="lp-form-grid">'+
          field('실제 판매일',input('date',sale?.date||context.today,'date','required'))+
          field('판매 수량',input('quantity',sale?.quantity||Math.max(t.remainingQuantity,1),'number','required min="1" max="1000000000" step="1"'))+
          field('실제 개당 판매가',input('unitPrice',sale?.unitPrice||trade.expectedPrice||'0','text','required inputmode="numeric"'))+
          field('판매 수수료(%)',input('feePercent',sale?.feePercent??trade.feePercent??'3','number','required min="0" max="100" step="0.01"'))+
          field('수수료 차감 후 내 분배율(%)',input('sharePercent',sale?.sharePercent??trade.sharePercent??'100','number','required min="0" max="100" step="0.01"'))+
          field('파티에 이미 지급한 총 메소',input('paidAmount',sale?.paidAmount||'0','text','required inputmode="numeric"'))+
          field('분배 대상·지급 메모',input('recipient',sale?.recipient,'text','maxlength="200" placeholder="예: A 3억 지급 / B 지급 대기"'))+
          field('판매 메모',input('memo',sale?.memo,'text','maxlength="200"'))+'</div><p class="lp-help">내 분배율을 뺀 금액이 파티 분배 대상액입니다. 지급액은 해당 금액 이내로 입력하세요. 분배율은 0.01% 단위의 단순 비율이며, 원본의 파티장·파티원 송금 수수료 계산과 다를 수 있습니다. 실제 내 몫과 분배율을 확인해 주세요.</p><div class="lp-actions"><button type="submit">'+(sale?'판매 수정 저장':'판매 기록 추가')+'</button></div></form>':'<p class="lp-help">획득 수량의 판매를 모두 기록했습니다. 지급액 변경은 판매 수정에서 할 수 있습니다.</p>')+'</details><div class="lp-actions">'+button('획득 수정','edit',trade.id)+button('아이템 기록 삭제','delete',trade.id,'danger')+'</div></article>';
      }).join(''):'<p class="lp-empty">조건에 맞는 정산 기록이 없습니다. 획득 기록을 등록하거나 보기 조건을 바꿔 주세요.</p>';
      listRoot.querySelectorAll('[data-form="sale"]').forEach(saleForm=>saleForm.addEventListener('submit',event=>{event.preventDefault();run(rootElement,()=>{
        const data=formData(saleForm),latest=bridge.getContext(),trade=active(latest.planner?.trades).find(row=>row.id===saleForm.dataset.tradeId);
        if(!trade)throw new Error('획득 기록이 변경되었습니다. 화면을 다시 열어 주세요.');
        const sales=clone(trade.sales||[]),saleId=saleForm.dataset.saleId||id('sale'),saleDate=date(data.date);
        if(saleDate<trade.acquiredDate)throw new Error('판매일은 획득일보다 빠를 수 없습니다.');
        const value={id:saleId,date:saleDate,quantity:quantity(data.quantity),unitPrice:amount(data.unitPrice).toString(),feePercent:String(data.feePercent),sharePercent:String(data.sharePercent),paidAmount:amount(data.paidAmount).toString(),recipient:String(data.recipient||'').trim(),memo:String(data.memo||'').trim(),updatedAt:nextStamp(sales.find(row=>row.id===saleId))};
        saleTotals(value);const index=sales.findIndex(row=>row.id===saleId);if(index<0)sales.push(value);else sales[index]=value;
        const next={...trade,sales};
        if(saleForm.dataset.saleId)validateTradeRepair(trade,next);else tradeTotals(next);
        save(bridge,latest,'trades',next);renderSettlement(rootElement,bridge,'',null,'판매·분배 기록을 저장했습니다. 기존 수익과 잔액에는 중복 반영하지 않았습니다.');
      });}));
    }
    rootElement.querySelector('[data-filter="status"]').addEventListener('change',drawList);rootElement.querySelector('[data-filter="search"]').addEventListener('input',drawList);
    if(saleEdit)rootElement.querySelector('[data-filter="status"]').value='all';
    drawList();
    if(success)showMessage(rootElement,success);
    rootElement.onclick=event=>{
      const target=event.target.closest('[data-action]');if(!target)return;
      const action=target.dataset.action,rowId=target.dataset.id;
      if(action==='reset')return renderSettlement(rootElement,bridge);
      if(action==='edit')return renderSettlement(rootElement,bridge,rowId);
      if(action==='budget'){ if(root.MapleLedgerPlanner?.open)root.MapleLedgerPlanner.open('budget');else{rootElement.dispatchEvent(new CustomEvent('planner:tab',{bubbles:true,detail:{tab:'budget'}}));} return; }
      if(action==='delete')return run(rootElement,()=>{if(!root.confirm('획득·판매·분배 기록을 정산함에서 삭제할까요? 기존 장부의 원본은 유지됩니다.'))return;bridge.remove('trades',rowId);renderSettlement(rootElement,bridge,'',null,'정산함 기록을 삭제했습니다.');});
      if(action==='sale-edit')return renderSettlement(rootElement,bridge,'',{tradeId:target.closest('[data-trade]').dataset.trade,saleId:rowId});
      if(action==='sale-delete')return run(rootElement,()=>{
        if(!root.confirm('이 판매 기록을 취소할까요? 판매 수량과 지급액을 다시 계산합니다.'))return;
        const tradeId=target.closest('[data-trade]').dataset.trade,latest=bridge.getContext(),trade=active(latest.planner?.trades).find(row=>row.id===tradeId);
        if(!trade)throw new Error('획득 기록을 찾을 수 없습니다.');
        const sales=clone(trade.sales||[]),sale=sales.find(row=>row.id===rowId);if(!sale)throw new Error('판매 기록을 찾을 수 없습니다.');const changedAt=nextStamp(sale);sale.deletedAt=changedAt;sale.updatedAt=changedAt;
        save(bridge,latest,'trades',{...trade,sales});renderSettlement(rootElement,bridge,'',null,'판매 기록을 취소했습니다.');
      });
    };
  }

  function renderBudget(rootElement,bridge,editing = {},success = '') {
    const context=bridge.getContext(),totals=budgetTotals(context),opening=totals.opening||{};
    const goal=active(context.planner?.funds).find(row=>row.id===editing.fund)||{};
    const adjustment=active(context.planner?.adjustments).find(row=>row.id===editing.adjustment)||{};
    const transfer=active(context.planner?.transfers).find(row=>row.id===editing.transfer)||{};
    rootElement.innerHTML='<div class="lp-section-head"><div><h2>자금·목표 계획</h2><p>시작 잔액과 장부 기록을 기준으로 준비금과 여러 목표의 예산을 나눕니다.</p></div></div>'+statusHtml()+
      '<p class="lp-help">게임 지갑을 자동 조회한 잔액이 아닙니다. 시작일 이후의 기존 장부 수입·지출과 직접 입력한 조정만 계산합니다. 미정산함 판매와 장비 프로젝트의 계획 금액은 다시 합산하지 않습니다.</p>'+(context.cashBasis?'<p class="lp-help">'+escape(context.cashBasis)+'</p>':'')+
      '<dl class="lp-summary"><div><dt>장부 기준 잔액</dt><dd>'+money(bridge,totals.balance)+'</dd></div><div><dt>준비금</dt><dd>'+money(bridge,totals.reserve)+'</dd></div><div><dt>목표에 배분한 금액</dt><dd>'+money(bridge,totals.allocated)+'</dd></div><div><dt>아직 배분하지 않은 금액</dt><dd>'+money(bridge,totals.unallocated)+'</dd></div></dl>'+
      (safeAmount(totals.unallocated,true)<0n?'<p class="lp-warning">현재 배정액이 준비금을 제외한 잔액보다 많습니다. 목표 배정액이나 준비금을 조정해 주세요.</p>':'')+
      '<details'+(!totals.opening?' open':'')+'><summary>시작 잔액·준비금 설정</summary><form class="lp-form" data-form="opening"><div class="lp-form-grid">'+
      field('장부 계산 시작일',input('date',opening.date||context.today,'date','required'))+
      field('시작일 직전 보유 메소',input('amount',opening.amount||'0','text','required inputmode="numeric"'))+
      field('남겨둘 준비금',input('reserve',opening.reserve||'0','text','required inputmode="numeric"'))+'</div><p class="lp-help">시작 잔액에는 시작일 이전까지의 보유 메소를 입력하세요. 같은 날 이미 포함한 수입·지출을 중복 계산하지 않도록 시작일과 장부 내역을 확인해 주세요.</p><button type="submit">시작 잔액 저장</button></form></details>'+
      '<form class="lp-form" data-form="fund"><h3>'+(editing.fund?'목표 수정':'목표 추가')+'</h3><div class="lp-form-grid">'+
      field('목표 이름',input('name',goal.name,'text','required maxlength="120" placeholder="예: 에테르넬 장갑 구입"'))+
      field('목표 금액',input('target',goal.target||'0','text','required inputmode="numeric"'))+
      field('현재 배정할 금액',input('allocation',goal.allocation||'0','text','required inputmode="numeric"'))+
      field('우선순위',input('priority',goal.priority||1,'number','required min="1" max="999" step="1"'))+
      field('메모',textarea('note',goal.note),true)+'</div><div class="lp-actions"><button type="submit">'+(editing.fund?'목표 수정 저장':'목표 저장')+'</button>'+(editing.fund?button('수정 취소','reset'):'')+'</div></form>'+
      '<div class="lp-list">'+(totals.goals.length?totals.goals.map(row=>{const target=safeAmount(row.target),allocation=safeAmount(row.allocation),percent=target>0n?Number(allocation*100n/target):0;return '<article class="lp-entry"><div class="lp-entry-head"><h3>'+escape(row.name)+'</h3><span>우선순위 '+escape(row.priority||1)+'</span></div><p>배정 '+money(bridge,allocation)+' / 목표 '+money(bridge,target)+'</p><progress value="'+Math.min(percent,100)+'" max="100" aria-label="'+escape(row.name)+' 예산 배정률">'+percent+'%</progress><p>'+escape(row.note||'')+'</p><div class="lp-actions">'+button('목표 수정','fund-edit',row.id)+button('목표 삭제','fund-delete',row.id,'danger')+'</div></article>';}).join(''):'<p class="lp-empty">구입하거나 강화할 목표를 추가해 준비금과 구분해 보세요.</p>')+'</div>'+
      '<details'+(editing.adjustment?' open':'')+'><summary>기존 장부에 없는 입금·출금 조정</summary><form class="lp-form" data-form="adjustment"><div class="lp-form-grid">'+
      field('조정일',input('date',adjustment.date||context.today,'date','required'))+
      field('구분','<select name="direction"><option value="in">입금·증가</option><option value="out"'+(safeAmount(adjustment.amount,true)<0n?' selected':'')+'>출금·감소</option></select>')+
      field('조정 메소',input('amount',(safeAmount(adjustment.amount,true)<0n?-safeAmount(adjustment.amount,true):safeAmount(adjustment.amount,true)).toString(),'text','required inputmode="numeric"'))+
      field('조정 사유',input('reason',adjustment.reason,'text','required maxlength="200" placeholder="예: 기존 장부에 없는 드랍 판매 입금"'))+'</div><p class="lp-help">이미 재획·보스·손익·지출 기록에 반영한 금액은 다시 조정하지 마세요. 조정은 전체 수익 통계와 별도로 보관합니다.</p><button type="submit">'+(editing.adjustment?'조정 수정 저장':'잔액 조정 저장')+'</button></form>'+
      '<div class="lp-table-scroll"><table><thead><tr><th>날짜</th><th>사유</th><th>조정액</th><th>관리</th></tr></thead><tbody>'+active(context.planner?.adjustments).sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(row=>'<tr><td>'+escape(row.date)+'</td><td>'+escape(row.reason)+'</td><td>'+money(bridge,row.amount)+'</td><td>'+button('수정','adjustment-edit',row.id)+button('삭제','adjustment-delete',row.id,'danger')+'</td></tr>').join('')+'</tbody></table></div></details>'+
      '<details'+(editing.transfer?' open':'')+'><summary>내 캐릭터 간 메소 이동</summary><form class="lp-form" data-form="transfer"><div class="lp-form-grid">'+
      field('이동일',input('date',transfer.date||context.today,'date','required'))+
      field('보내는 캐릭터','<select name="from" required>'+charOptions(context.characters,transfer.from,'선택해 주세요')+'</select>')+
      field('받는 캐릭터','<select name="to" required>'+charOptions(context.characters,transfer.to,'선택해 주세요')+'</select>')+
      field('이동 메소',input('amount',transfer.amount||'0','text','required inputmode="numeric"'))+
      field('메모',input('note',transfer.note,'text','maxlength="200"'))+'</div><p class="lp-help">내 캐릭터 간 이동은 계정 전체 잔액과 수익을 늘리거나 줄이지 않습니다. 게임 내 실제 이체를 실행하는 기능은 아닙니다.</p><button type="submit">'+(editing.transfer?'이동 기록 수정':'이동 기록 저장')+'</button></form><div class="lp-table-scroll"><table><thead><tr><th>날짜</th><th>캐릭터 이동</th><th>금액</th><th>관리</th></tr></thead><tbody>'+active(context.planner?.transfers).sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(row=>'<tr><td>'+escape(row.date)+'</td><td>'+escape(row.fromName||row.from)+' → '+escape(row.toName||row.to)+'<br>'+escape(row.note||'')+'</td><td>'+money(bridge,row.amount)+'</td><td>'+button('수정','transfer-edit',row.id)+button('삭제','transfer-delete',row.id,'danger')+'</td></tr>').join('')+'</tbody></table></div></details>'+
      '<details><summary>시작일 이후 잔액 계산에 사용한 기존 장부 '+totals.cashEntries.length+'건</summary><p>수입 '+money(bridge,totals.income)+' · 지출 '+money(bridge,totals.expense)+' · 별도 조정 '+money(bridge,totals.adjustment)+'</p><div class="lp-table-scroll"><table><thead><tr><th>기준일</th><th>종류·캐릭터</th><th>금액</th></tr></thead><tbody>'+totals.cashEntries.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(row=>'<tr><td>'+escape(row.date)+'</td><td>'+escape([row.kind,row.charName].filter(Boolean).join(' · '))+'</td><td>'+money(bridge,row.signedAmount)+'</td></tr>').join('')+'</tbody></table></div></details>';
    if(success)showMessage(rootElement,success);
    rootElement.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();run(rootElement,()=>{
      const data=formData(form),latest=bridge.getContext(),kind=form.dataset.form;
      if(kind==='opening'){
        const initial={...opening,id:opening.id||id('opening'),date:date(data.date),amount:amount(data.amount).toString(),reserve:amount(data.reserve).toString()};
        save(bridge,latest,'opening',initial);
      }else if(kind==='fund'){
        if(!budgetTotals(latest).opening)throw new Error('시작 잔액을 먼저 설정해 주세요.');
        const target=amount(data.target),allocation=amount(data.allocation),priority=quantity(data.priority);
        if(target<=0n)throw new Error('목표 금액은 1 메소 이상이어야 합니다.');
        if(priority>999)throw new Error('우선순위는 1부터 999까지 입력해 주세요.');
        if(allocation>target)throw new Error('배정 금액은 목표 금액보다 클 수 없습니다.');
        const other=active(latest.planner?.funds).filter(row=>row.id!==editing.fund).reduce((sum,row)=>sum+safeAmount(row.allocation),0n);
        if(other+allocation>amount(budgetTotals(latest).available))throw new Error('준비금을 제외한 잔액보다 많은 금액을 배정할 수 없습니다.');
        save(bridge,latest,'funds',{...goal,id:editing.fund||id('fund'),name:requireText(data.name,'목표 이름을 입력해 주세요.'),target:target.toString(),allocation:allocation.toString(),priority,note:String(data.note||'').trim()});
      }else if(kind==='adjustment'){
        const q=amount(data.amount);if(q<=0n)throw new Error('조정 금액은 1 메소 이상이어야 합니다.');
        save(bridge,latest,'adjustments',{...adjustment,id:editing.adjustment||id('adjustment'),date:date(data.date),amount:(data.direction==='out'?-q:q).toString(),reason:requireText(data.reason,'조정 사유를 입력해 주세요.')});
      }else if(kind==='transfer'){
        if(!data.from||!data.to||data.from===data.to)throw new Error('서로 다른 두 캐릭터를 선택해 주세요.');
        const q=amount(data.amount);if(q<=0n)throw new Error('이동 금액은 1 메소 이상이어야 합니다.');
        const from=latest.characters.find(row=>String(row.id)===data.from),to=latest.characters.find(row=>String(row.id)===data.to);
        if(!from||!to)throw new Error('선택한 캐릭터를 확인해 주세요.');
        save(bridge,latest,'transfers',{...transfer,id:editing.transfer||id('transfer'),date:date(data.date),from:data.from,to:data.to,fromName:from.name,toName:to.name,amount:q.toString(),note:String(data.note||'').trim()});
      }
      renderBudget(rootElement,bridge,{},'자금 계획을 저장했습니다.');
    });}));
    rootElement.onclick=event=>{
      const target=event.target.closest('[data-action]');if(!target)return;
      const action=target.dataset.action,rowId=target.dataset.id;
      if(action==='reset')return renderBudget(rootElement,bridge);
      const match=/^(fund|adjustment|transfer)-(edit|delete)$/.exec(action);if(!match)return;
      const section={fund:'funds',adjustment:'adjustments',transfer:'transfers'}[match[1]];
      if(match[2]==='edit')return renderBudget(rootElement,bridge,{[match[1]]:rowId});
      run(rootElement,()=>{if(!root.confirm('이 기록을 삭제할까요? 기존 장부의 원본 수입·지출은 유지됩니다.'))return;bridge.remove(section,rowId);renderBudget(rootElement,bridge,{},'기록을 삭제했습니다.');});
    };
  }
  function render(rootElement,tab,bridge){
    if(!rootElement||!bridge?.getContext||!bridge?.commit)return;
    try {
      if(tab==='investment')renderInvestment(rootElement,bridge);
      else if(tab==='settlement')renderSettlement(rootElement,bridge);
      else if(tab==='budget')renderBudget(rootElement,bridge);
    }catch(error){rootElement.innerHTML='<p class="lp-feedback is-error" role="alert">'+escape(error.message||'화면을 불러오지 못했습니다.')+'</p>';}
  }
  const api={render,amount,quantity,rate,date,nextStamp,sourceReferences,availableReferences,investmentTotals,saleTotals,tradeTotals,validateTradeRepair,budgetTotals,makeApiEquipment,escape};
  root.MapleLedgerFinance=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
