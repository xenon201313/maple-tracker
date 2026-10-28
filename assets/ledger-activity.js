(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const active = rows => (Array.isArray(rows) ? rows : []).filter(row => row && !row.deletedAt);
  const uid = prefix => prefix + '_' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  function money(value, allowNegative = false) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
    const text = String(value ?? '').trim().replace(/,/g, '');
    if (!(allowNegative ? /^-?\d+$/ : /^\d+$/).test(text) || text.replace('-', '').length > 50) return null;
    return BigInt(text).toString();
  }
  function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
  }
  function date(value) {
    const s = String(value ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(s + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
  }
  function perHour(amount, minutes) {
    const value = money(amount, true), seconds = Math.round(Number(minutes) * 60);
    if (value === null || !Number.isSafeInteger(seconds) || seconds <= 0) return null;
    return (BigInt(value) * 3600n / BigInt(seconds)).toString();
  }
  function huntMetrics(hunt, note) {
    if (!hunt || !note) return null;
    const mins = Number(note.minutes);
    if (!Number.isFinite(mins) || mins <= 0 || mins > 1440) return null;
    const fallback = value => value === undefined ? 0 : value;
    const meso = money(fallback(hunt.meso)), extra = money(fallback(hunt.extraIncome)), cost = money(fallback(note.consumableCost));
    const receipt = money(fallback(note.fragmentReceipt)), unit = money(hunt.erdaUnitPrice);
    const fragments = integer(fallback(hunt.erda)), sold = integer(fallback(note.soldFragments));
    if ([meso, extra, cost, receipt].some(v => v === null) || fragments === null || sold === null || sold > fragments) return null;
    const fee = Number(hunt.erdaFee ?? 0), bps = Math.round(fee * 100);
    if (!Number.isFinite(fee) || bps < 0 || bps > 10000) return null;
    const net = BigInt(meso) + BigInt(extra) + BigInt(receipt) - BigInt(cost);
    const unsoldValue = fragments === sold ? '0' : unit !== null && BigInt(unit) > 0n ? (BigInt(fragments - sold) * BigInt(unit) * BigInt(10000 - bps) / 10000n).toString() : null;
    const exp = note.expGain === '' || note.expGain === null || note.expGain === undefined ? null : money(note.expGain);
    if (note.expGain !== '' && note.expGain !== null && note.expGain !== undefined && exp === null) return null;
    return {
      minutes: mins, cashNet: net.toString(), cashPerHour: perHour(net.toString(), mins),
      fragments, soldFragments: sold, unsoldFragments: fragments - sold, unsoldEstimate: unsoldValue,
      fragmentsPerHour: fragments * 60 / mins, expGain: exp, expPerHour: exp === null ? null : perHour(exp, mins)
    };
  }
  function huntComparisons(hunts, notes) {
    const byId = new Map((hunts || []).map(h => [String(h.id), h]));
    const groups = new Map();
    active(notes).forEach(note => {
      const hunt = byId.get(String(note.huntId)), metrics = huntMetrics(hunt, note);
      if (!metrics) return;
      const key = JSON.stringify([String(hunt.charName || ''), String(note.map || '').trim(), String(note.buffs || '').trim()]);
      const row = groups.get(key) || { key, charName: hunt.charName || '', map: note.map || '', buffs: note.buffs || '', count: 0, minutes: 0, cashNet: 0n, fragments: 0, expGain: 0n, expMinutes: 0, unsoldEstimate: 0n, unpricedCount: 0 };
      row.count++; row.minutes += metrics.minutes; row.cashNet += BigInt(metrics.cashNet); row.fragments += metrics.fragments;
      if (metrics.unsoldEstimate === null) row.unpricedCount++; else row.unsoldEstimate += BigInt(metrics.unsoldEstimate);
      if (metrics.expGain !== null) { row.expGain += BigInt(metrics.expGain); row.expMinutes += metrics.minutes; }
      groups.set(key, row);
    });
    return [...groups.values()].map(r => ({ ...r, cashNet: r.cashNet.toString(), cashPerHour: perHour(r.cashNet.toString(), r.minutes), fragmentsPerHour: r.fragments * 60 / r.minutes, expGain: r.expGain.toString(), expPerHour: r.expMinutes ? perHour(r.expGain.toString(), r.expMinutes) : null, unsoldEstimate: r.unsoldEstimate.toString() })).sort((a, b) => BigInt(a.cashPerHour) > BigInt(b.cashPerHour) ? -1 : BigInt(a.cashPerHour) < BigInt(b.cashPerHour) ? 1 : a.key.localeCompare(b.key));
  }
  const bossGroup = option => String(option.charId || option.charName || '') + '\u0000' + String(option.bossId || option.bossName || '');
  function optimizeBosses(options, configurations, budget, remainingLimits = {}) {
    const capacity = integer(budget, 1, 10080);
    if (capacity === null) throw new Error('시간 예산은 1~10,080분 사이의 정수로 입력해 주세요.');
    const source = new Map((options || []).map(option => [String(option.id), option]));
    const completed = new Set((options || []).filter(o => o.completed).map(bossGroup));
    const groups = new Map(), excluded = [];
    active(configurations).forEach(plan => {
      const option = source.get(String(plan.optionId)), minutes = integer(plan.minutes, 1, 1440), value = option && money(option.meso);
      if (!plan.enabled || !option || !['weekly', '주간', undefined, ''].includes(option.period) || completed.has(bossGroup(option)) || minutes === null || value === null || value === '0' || minutes > capacity) { excluded.push(plan.id); return; }
      const key = bossGroup(option), list = groups.get(key) || [];
      list.push({ ...plan, option, minutes, value: BigInt(value), priority: integer(plan.priority, 1, 5) ?? 3 });
      groups.set(key, list);
    });
    // First solve each character with its remaining kill quota, then combine
    // characters under the shared time budget. This preserves exact choices:
    // pruning by time alone before applying quotas can discard a valid optimum.
    const better = (a, b) => !b || a.value > b.value || (a.value === b.value && a.priority > b.priority);
    const characters = new Map();
    for (const choices of groups.values()) {
      const character = String(choices[0].option.charId || choices[0].option.charName || '');
      const list = characters.get(character) || []; list.push(choices); characters.set(character, list);
    }
    const characterPlans = [];
    for (const [character, characterGroups] of characters) {
      const quota = integer(remainingLimits[character], 0, 200) ?? characterGroups.length;
      let local = new Map([['0|0', { minutes: 0, kills: 0, value: 0n, priority: 0, selected: [] }]]);
      for (const choices of characterGroups) {
        const next = new Map(local);
        for (const state of local.values()) for (const choice of choices) {
          const total = state.minutes + choice.minutes, kills = state.kills + (choice.option.limitFree ? 0 : 1);
          if (total > capacity || kills > quota) continue;
          const candidate = { minutes: total, kills, value: state.value + choice.value, priority: state.priority + choice.priority, selected: [...state.selected, choice] };
          const key = total + '|' + kills;
          if (better(candidate, next.get(key))) next.set(key, candidate);
        }
        local = next;
      }
      const byTime = new Map();
      for (const state of local.values()) if (better(state, byTime.get(state.minutes))) byTime.set(state.minutes, state);
      characterPlans.push(byTime);
    }
    let states = new Map([[0, { value: 0n, priority: 0, selected: [] }]]);
    for (const choices of characterPlans) {
      const next = new Map();
      for (const [elapsed, state] of states) for (const choice of choices.values()) {
        const total = elapsed + choice.minutes;
        if (total > capacity) continue;
        const candidate = { value: state.value + choice.value, priority: state.priority + choice.priority, selected: [...state.selected, ...choice.selected] };
        if (better(candidate, next.get(total))) next.set(total, candidate);
      }
      states = next;
    }
    let best = states.get(0), minutes = 0;
    for (const [elapsed, state] of states) if (better(state, best) || (state.value === best.value && state.priority === best.priority && elapsed < minutes)) { best = state; minutes = elapsed; }
    const selected = best.selected.map(({ value, ...choice }) => ({ ...choice, expectedMeso: value.toString() }));
    return { budget: capacity, minutes, remainingMinutes: capacity - minutes, meso: best.value.toString(), dropEstimate: selected.reduce((sum, item) => sum + BigInt(money(item.dropEstimate ?? 0) ?? '0'), 0n).toString(), selected, excluded };
  }
  function symbolCost(plan) {
    const current = integer(plan?.currentLevel, 0, 100), target = integer(plan?.targetLevel, 1, 100);
    if (current === null || target === null || target <= current) return { valid: false, reason: '목표 레벨은 현재 레벨보다 높아야 합니다.', total: null };
    if (plan.costMode === 'steps') {
      const costs = Array.isArray(plan.stepCosts) ? plan.stepCosts.map(v => money(v)) : [];
      if (costs.length !== target - current || costs.some(v => v === null)) return { valid: false, reason: '현재부터 목표까지의 강화 횟수만큼 단계별 비용을 입력해 주세요.', total: null };
      return { valid: true, total: costs.reduce((sum, value) => sum + BigInt(value), 0n).toString(), steps: costs };
    }
    const total = money(plan.plannedCost);
    return total === null ? { valid: false, reason: '확인한 예정 메소를 입력해 주세요. 비용을 모르면 비워 두고 확인해 주세요.', total: null } : { valid: true, total, steps: [] };
  }
  function symbolSummary(plans) {
    const rows = active(plans), pending = rows.filter(p => p.status !== 'done');
    return { count: rows.length, pendingCount: pending.length, missingCount: pending.filter(p => !symbolCost(p).valid).length, planned: pending.reduce((sum, plan) => sum + BigInt(symbolCost(plan).total || '0'), 0n).toString() };
  }
  function safeImage(value) {
    const text = String(value || '');
    return /^assets\/[a-z0-9_./-]+$/i.test(text) || /^https:\/\/open\.api\.nexon\.com\//i.test(text) ? text : '';
  }
  function mount(rootElement, tab, bridge) {
    if (!rootElement || !bridge?.getContext || !bridge?.commit) return;
    if (tab === 'hunting') renderHunting(rootElement, bridge);
    else if (tab === 'bossplan') renderBoss(rootElement, bridge);
    else if (tab === 'symbol') renderSymbols(rootElement, bridge);
  }
  function rows(bridge, section) { return active(bridge.getContext().planner?.[section]); }
  function upsert(bridge, section, entry) {
    const current = rows(bridge, section);
    bridge.commit(section, [...current.filter(row => String(row.id) !== String(entry.id)), { ...entry, deletedAt: 0 }]);
    bridge.refresh();
  }
  function message(rootElement, text, error = false) {
    const box = rootElement.querySelector('[data-la-message]');
    if (!box) return;
    box.textContent = text; box.className = error ? 'lp-message lp-error' : 'lp-message'; box.setAttribute('role', error ? 'alert' : 'status');
  }
  function attempt(rootElement, callback) { try { callback(); } catch (error) { message(rootElement, error?.message || '저장하지 못했습니다. 다시 확인해 주세요.', true); } }
  function field(label, input, extra = '') { return '<label class="lp-field">' + esc(label) + input + (extra ? '<small>' + esc(extra) + '</small>' : '') + '</label>'; }
  function input(name, value = '', type = 'text', extra = '') { return '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '" ' + extra + '>'; }
  function options(values, selected, label = r => r.name, id = r => r.id) { return values.map(r => '<option value="' + esc(id(r)) + '"' + (String(id(r)) === String(selected) ? ' selected' : '') + '>' + esc(label(r)) + '</option>').join(''); }
  function moneyView(bridge, value) { return value === null || value === undefined ? '—' : esc(bridge.money(value)); }
  function decimal(value, digits = 1) { return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits }); }
  function apiSourceLabel(sourceDate, fetchedAt) {
    const time = new Date(Number(fetchedAt));
    const fetched = Number(fetchedAt) > 0 && Number.isFinite(time.getTime()) ? time.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '';
    return (sourceDate ? 'API 자료 기준일 ' + String(sourceDate) : 'API 자료 기준일 미제공') + (fetched ? ' · 조회 ' + fetched + ' (한국 시간)' : '');
  }
  function empty(text) { return '<div class="lp-empty">' + esc(text) + '</div>'; }
  function deleteButtons(rootElement, bridge, section) {
    rootElement.querySelectorAll('[data-la-delete]').forEach(button => button.addEventListener('click', () => attempt(rootElement, () => {
      if (!root.confirm('이 계획만 삭제할까요? 기존 장부 기록은 유지됩니다.')) return;
      bridge.remove(section, button.dataset.laDelete); bridge.refresh();
    })));
  }
  function renderHunting(el, bridge, editId = '') {
    const context = bridge.getContext(), hunts = (context.hunts || []).filter(h => h.kind !== 'erda-settlement' && h.kind !== 'recovery-adjustment'), notes = rows(bridge, 'huntNotes');
    const editing = notes.find(n => n.id === editId), selected = hunts.find(h => String(h.id) === String(editing?.huntId)) || hunts[0];
    const groups = huntComparisons(hunts, notes);
    el.innerHTML = '<div class="lp-section-head"><h2>사냥 조건별 실측 비교</h2><p>같은 캐릭터·사냥터·버프의 기록끼리 비교합니다. 시간과 경험치는 직접 확인한 값을 입력하세요.</p></div>' +
      '<div class="lp-note">메소와 추가 수입은 기존 재획 회차에서 읽습니다. 아래 조각 판매 수령액·소모품 비용은 비교용이며 기존 수익·지출에 다시 더하지 않습니다. API 일별 경험치는 퀘스트 등 다른 활동이 섞여 회차 경험치로 자동 배정하지 않습니다.</div>' +
      '<div data-la-message role="status"></div>' + (hunts.length ? '<form class="lp-form" data-la-form><h3>' + (editing ? '비교 조건 수정' : '재획 회차에 조건 연결') + '</h3><div class="lp-form-grid">' +
        field('재획 회차', '<select name="huntId" required>' + options(hunts, selected?.id, h => h.date + ' · ' + (h.charName || '캐릭터 미지정') + ' · ' + h.runs + '재획 · ' + bridge.money(h.meso)) + '</select>') +
        field('사냥터', input('map', editing?.map || '', 'text', 'required maxlength="100" autocomplete="off"')) +
        field('실제 사냥 시간(분)', input('minutes', editing?.minutes ?? '', 'number', 'required min="0.5" max="1440" step="0.5"'), '재획 횟수에서 시간을 추정하지 않습니다.') +
        field('버프·도핑 조건', input('buffs', editing?.buffs || '', 'text', 'maxlength="200" placeholder="예: 재획비, 메획 장비"')) +
        field('비교에 차감할 소모품 비용', input('consumableCost', editing?.consumableCost ?? '0', 'text', 'required inputmode="numeric" pattern="[0-9,]+"')) +
        field('실제 판매한 조각 수', input('soldFragments', editing?.soldFragments ?? '0', 'number', 'required min="0" step="1"')) +
        field('조각 판매 후 실제 수령 메소', input('fragmentReceipt', editing?.fragmentReceipt ?? '0', 'text', 'required inputmode="numeric" pattern="[0-9,]+"'), '미판매 조각의 예상 가치는 아래에서 따로 표시합니다.') +
        field('확인한 획득 경험치(EXP, 선택)', input('expGain', editing?.expGain ?? '', 'text', 'inputmode="numeric" pattern="[0-9,]*"'), '사냥 전후 직접 확인한 증가량만 입력하세요.') +
        '</div><div class="lp-actions"><button type="submit">' + (editing ? '조건 수정 저장' : '비교 기록 저장') + '</button>' + (editing ? '<button type="button" class="ghost" data-la-cancel>취소</button>' : '') + '</div></form>' : empty('먼저 재획 기록에서 회차를 추가하면 사냥 조건을 연결할 수 있습니다.')) +
      '<section class="lp-results"><h3>조건별 비교</h3>' + (groups.length ? '<div class="lp-table-wrap"><table class="lp-table"><thead><tr><th scope="col">캐릭터·조건</th><th scope="col">기록·시간</th><th scope="col">시간당 수령 메소</th><th scope="col">시간당 조각</th><th scope="col">시간당 확인 EXP</th><th scope="col">미판매 조각 예상 가치</th></tr></thead><tbody>' + groups.map(g => '<tr><th scope="row">' + esc(g.charName || '미지정') + '<br>' + esc(g.map) + '<small>' + esc(g.buffs || '버프 미기록') + '</small></th><td>' + g.count + '회 · ' + decimal(g.minutes) + '분</td><td>' + moneyView(bridge, g.cashPerHour) + '</td><td>' + decimal(g.fragmentsPerHour) + '개</td><td>' + (g.expPerHour === null ? '미입력' : BigInt(g.expPerHour).toLocaleString('ko-KR')) + '</td><td>' + (g.unpricedCount ? '확인된 분 ' + moneyView(bridge, g.unsoldEstimate) + '<small>단가 미입력 ' + g.unpricedCount + '회 제외</small>' : moneyView(bridge, g.unsoldEstimate)) + '</td></tr>').join('') + '</tbody></table></div><p class="muted">시간당 값은 기록 합계 ÷ 총 사냥 시간입니다. 표본이 적거나 조건이 다르면 효율을 단정하기 어렵습니다.</p>' : empty('저장한 조건이 없습니다.')) + '</section>' +
      '<section><h3>저장한 회차 조건</h3>' + (notes.length ? '<div class="lp-list">' + notes.map(n => {
        const hunt = hunts.find(h => String(h.id) === String(n.huntId)), m = huntMetrics(hunt, n);
        return '<article class="lp-item"><h4>' + esc(hunt?.date || n.date || '') + ' · ' + esc(hunt?.charName || n.charName || '미지정') + ' · ' + esc(n.map) + '</h4><p>' + decimal(n.minutes) + '분 · ' + esc(n.buffs || '버프 미기록') + '</p><p>' + (m ? '회차 수령액에서 소모품 차감 ' + moneyView(bridge, m.cashNet) : '원본 회차가 없거나 입력 조건을 확인해야 합니다.') + '</p><div class="lp-actions"><button type="button" class="ghost" data-la-edit="' + esc(n.id) + '">수정</button><button type="button" class="ghost" data-la-delete="' + esc(n.id) + '">조건 삭제</button></div></article>';
      }).join('') + '</div>' : empty('회차 원본은 그대로 보존됩니다.')) + '</section>';
    const form = el.querySelector('[data-la-form]');
    form?.addEventListener('submit', event => { event.preventDefault(); attempt(el, () => {
      const data = Object.fromEntries(new FormData(form)), hunt = (bridge.getContext().hunts || []).find(h => String(h.id) === data.huntId);
      if (!hunt) throw new Error('원본 재획 회차를 찾지 못했습니다. 새로고침 후 다시 선택해 주세요.');
      const note = { ...editing, id: editing?.id || uid('huntnote'), huntId: data.huntId, date: hunt.date, charName: hunt.charName || '', map: data.map.trim(), minutes: Number(data.minutes), buffs: data.buffs.trim(), consumableCost: money(data.consumableCost), soldFragments: integer(data.soldFragments), fragmentReceipt: money(data.fragmentReceipt), expGain: data.expGain.trim() ? money(data.expGain) : '' };
      if (!note.map || !huntMetrics(hunt, note) || (data.expGain.trim() && note.expGain === null)) throw new Error('시간·비용·조각 수·경험치를 확인해 주세요. 판매한 조각 수는 회차 획득량을 넘을 수 없습니다.');
      if (note.soldFragments === 0 && BigInt(note.fragmentReceipt) > 0n) throw new Error('조각 판매 수령액이 있으면 실제 판매한 조각 수도 입력해 주세요.');
      const duplicate = rows(bridge, 'huntNotes').find(n => String(n.huntId) === data.huntId && n.id !== note.id);
      if (duplicate) throw new Error('이 회차의 조건이 이미 있습니다. 목록에서 수정해 주세요.');
      upsert(bridge, 'huntNotes', note);
    }); });
    el.querySelector('[data-la-cancel]')?.addEventListener('click', () => renderHunting(el, bridge));
    el.querySelectorAll('[data-la-edit]').forEach(b => b.addEventListener('click', () => renderHunting(el, bridge, b.dataset.laEdit)));
    deleteButtons(el, bridge, 'huntNotes');
  }
  function renderBoss(el, bridge, editId = '', budgetValue = '60') {
    const context = bridge.getContext(), source = context.bossOptions || [], configs = rows(bridge, 'bossPlans');
    const choices = source.filter(o => ['weekly', '주간', undefined, ''].includes(o.period)), editing = configs.find(r => r.id === editId);
    const renderResult = result => result.selected.length ? '<p class="lp-summary"><strong>' + result.minutes + '분 / ' + result.budget + '분</strong> · 결정석 예상 내 몫 <strong>' + moneyView(bridge, result.meso) + '</strong></p><div class="lp-table-wrap"><table class="lp-table"><thead><tr><th scope="col">캐릭터</th><th scope="col">보스·난이도</th><th scope="col">시간</th><th scope="col">결정석 예상 내 몫</th></tr></thead><tbody>' + result.selected.map(r => '<tr><td>' + esc(r.option.charName) + '</td><th scope="row">' + esc(r.option.bossName) + ' · ' + esc(r.option.difficulty || '') + '</th><td>' + r.minutes + '분</td><td>' + moneyView(bridge, r.expectedMeso) + '</td></tr>').join('') + '</tbody></table></div><p>별도 입력한 드랍 예상 내 몫 ' + moneyView(bridge, result.dropEstimate) + ' · 선택 최적화 기준에는 포함하지 않았습니다.</p>' : empty('선택할 수 있는 미완료 보스가 없습니다. 가능 보스와 소요 시간, 시간 예산을 확인해 주세요.');
    let first;
    try { first = optimizeBosses(choices, configs, budgetValue, context.bossRemainingLimits); } catch { first = optimizeBosses(choices, configs, 60, context.bossRemainingLimits); }
    el.innerHTML = '<div class="lp-section-head"><h2>시간 예산으로 짜는 주간 보스 계획</h2><p>직접 등록한 가능 보스 중 시간 안에 결정석 예상 내 몫이 가장 큰 조합을 계산합니다.</p></div>' +
      '<div class="lp-note">API 완료 상태와 기존 난이도·파티 설정을 읽습니다. 클리어 가능 여부와 소요 시간은 직접 확인하세요. 같은 캐릭터의 같은 보스는 한 난이도만 선택하며, 완료된 보스와 장부 기준 남은 주간 처치 한도를 반영합니다. 게임 안의 처치·판매 가능 횟수도 확인해 주세요.</div><div data-la-message role="status"></div>' +
      (choices.length ? '<form class="lp-form" data-la-form><h3>' + (editing ? '가능 보스 수정' : '가능 보스 추가') + '</h3><div class="lp-form-grid">' +
        field('캐릭터·주간 보스', '<select name="optionId" required>' + options(choices, editing?.optionId, o => (o.charName || '미지정') + ' · ' + o.bossName + ' · ' + (o.difficulty || '') + (o.completed ? ' (이번 주 완료)' : '')) + '</select>') +
        field('평균 소요 시간(분)', input('minutes', editing?.minutes ?? '', 'number', 'min="1" max="1440" step="1" required')) +
        field('우선순위', '<select name="priority">' + [5, 4, 3, 2, 1].map(n => '<option value="' + n + '"' + (Number(editing?.priority || 3) === n ? ' selected' : '') + '>' + n + (n === 5 ? ' (높음)' : n === 1 ? ' (낮음)' : '') + '</option>').join('') + '</select>', '예상 수익이 같을 때 높은 순위를 먼저 선택합니다.') +
        field('드랍 예상 내 몫(선택)', input('dropEstimate', editing?.dropEstimate ?? '0', 'text', 'inputmode="numeric" pattern="[0-9,]+"')) +
        '<label class="lp-check"><input name="enabled" type="checkbox"' + (editing?.enabled === false ? '' : ' checked') + '>이 보스를 계획 후보로 사용</label></div><div class="lp-actions"><button type="submit">' + (editing ? '보스 수정 저장' : '가능 보스 저장') + '</button>' + (editing ? '<button type="button" class="ghost" data-la-cancel>취소</button>' : '') + '</div></form>' : empty('캐릭터와 주간 보스 설정을 먼저 등록해 주세요.')) +
      '<form class="lp-form" data-la-optimize><h3>이번 주에 쓸 시간</h3><div class="lp-actions">' + [30, 60, 120].map(n => '<button type="button" class="ghost" data-la-budget="' + n + '">' + n + '분</button>').join('') + field('시간 예산(분)', input('budget', budgetValue, 'number', 'min="1" max="10080" step="1" required')) + '<button type="submit">조합 계산</button></div></form><section class="lp-results" aria-live="polite" data-la-result>' + renderResult(first) + '</section>' +
      '<section><h3>등록한 가능 보스</h3>' + (configs.length ? '<div class="lp-list">' + configs.map(plan => {
        const option = source.find(o => String(o.id) === String(plan.optionId));
        return '<article class="lp-item"><h4>' + esc(option?.charName || plan.charName || '') + ' · ' + esc(option?.bossName || plan.bossName || '원본 보스 없음') + ' · ' + esc(option?.difficulty || plan.difficulty || '') + '</h4><p>' + esc(plan.minutes) + '분 · 우선순위 ' + esc(plan.priority) + ' · ' + (option?.completed ? '이번 주 완료 · 계획 제외' : plan.enabled === false ? '후보 사용 안 함' : option ? '미완료 후보' : '원본 설정 확인 필요') + '</p><div class="lp-actions"><button type="button" class="ghost" data-la-edit="' + esc(plan.id) + '">수정</button><button type="button" class="ghost" data-la-delete="' + esc(plan.id) + '">계획 삭제</button></div></article>';
      }).join('') + '</div>' : empty('직접 클리어할 수 있는 보스만 추가하세요.')) + '</section>';
    const form = el.querySelector('[data-la-form]');
    form?.addEventListener('submit', event => { event.preventDefault(); attempt(el, () => {
      const data = Object.fromEntries(new FormData(form)), option = (bridge.getContext().bossOptions || []).find(o => String(o.id) === data.optionId);
      if (!option || integer(data.minutes, 1, 1440) === null || money(data.dropEstimate || 0) === null) throw new Error('보스·시간·드랍 예상 금액을 확인해 주세요.');
      const entry = { ...editing, id: editing?.id || uid('bossplan'), optionId: data.optionId, charId: option.charId, charName: option.charName || '', bossId: option.bossId, bossName: option.bossName, difficulty: option.difficulty || '', minutes: Number(data.minutes), priority: Number(data.priority), enabled: data.enabled === 'on', dropEstimate: money(data.dropEstimate || 0) };
      if (rows(bridge, 'bossPlans').some(r => String(r.optionId) === data.optionId && r.id !== entry.id)) throw new Error('이미 등록한 보스입니다. 목록에서 수정해 주세요.');
      upsert(bridge, 'bossPlans', entry);
    }); });
    const optimize = el.querySelector('[data-la-optimize]');
    const run = () => attempt(el, () => { const c = bridge.getContext(); el.querySelector('[data-la-result]').innerHTML = renderResult(optimizeBosses(c.bossOptions || [], c.planner?.bossPlans || [], optimize.elements.budget.value, c.bossRemainingLimits)); });
    optimize.addEventListener('submit', e => { e.preventDefault(); run(); });
    el.querySelectorAll('[data-la-budget]').forEach(b => b.addEventListener('click', () => { optimize.elements.budget.value = b.dataset.laBudget; run(); }));
    el.querySelector('[data-la-cancel]')?.addEventListener('click', () => renderBoss(el, bridge));
    el.querySelectorAll('[data-la-edit]').forEach(b => b.addEventListener('click', () => renderBoss(el, bridge, b.dataset.laEdit, optimize.elements.budget.value)));
    deleteButtons(el, bridge, 'bossPlans');
  }
  function renderSymbols(el, bridge, editId = '', imported = null) {
    const context = bridge.getContext(), chars = context.characters || [], plans = rows(bridge, 'symbolPlans'), editing = plans.find(p => p.id === editId), summary = symbolSummary(plans);
    const value = editing || imported || {}, character = chars.find(c => String(c.id) === String(value.charId)) || chars[0];
    el.innerHTML = '<div class="lp-section-head"><h2>심볼 성장 예정 비용</h2><p>현재 심볼은 API로 불러오고, 목표까지 확인한 메소 비용을 준비금으로 관리합니다.</p></div>' +
      '<div class="lp-note">API는 현재 레벨·성장량을 제공하며 미래 강화 비용을 직접 제공하지 않습니다. 게임에서 확인한 총비용 또는 단계별 비용을 입력하세요. 미확인 비용은 0 메소로 자동 계산하지 않습니다. 이 계획은 실제 지출 통계에 합산되지 않습니다.</div>' +
      '<p class="lp-summary">미완료 계획 <strong>' + summary.pendingCount + '개</strong> · 확인한 예정 비용 <strong>' + moneyView(bridge, summary.planned) + '</strong>' + (summary.missingCount ? ' · 비용 미확인 ' + summary.missingCount + '개' : '') + '</p><div data-la-message role="status"></div>' +
      '<form class="lp-form" data-la-form><h3>' + (editing ? '심볼 계획 수정' : '심볼 계획 만들기') + '</h3><div class="lp-form-grid">' +
      field('캐릭터', '<select name="charId"' + (!chars.length ? ' disabled' : '') + '>' + options(chars, character?.id) + '</select>') +
      field('심볼 이름', input('symbolName', value.symbolName || '', 'text', 'required maxlength="100"')) +
      field('현재 레벨', input('currentLevel', value.currentLevel ?? '', 'number', 'required min="0" max="100" step="1"')) +
      field('목표 레벨', input('targetLevel', value.targetLevel ?? '', 'number', 'required min="1" max="100" step="1"')) +
      field('현재 성장량(선택)', input('growthCount', value.growthCount ?? '', 'number', 'min="0" step="1"')) +
      field('예정일', input('dueDate', value.dueDate || context.today, 'date', 'required')) +
      field('비용 입력 방식', '<select name="costMode"><option value="total"' + (value.costMode !== 'steps' ? ' selected' : '') + '>확인한 총비용</option><option value="steps"' + (value.costMode === 'steps' ? ' selected' : '') + '>단계별 비용 합계</option></select>') +
      field('확인한 총 예정 메소', input('plannedCost', value.plannedCost ?? '', 'text', 'inputmode="numeric" pattern="[0-9,]*" placeholder="비용을 확인한 뒤 입력"'), '총비용 방식에서 사용합니다. 무료라면 0을 직접 입력하세요.') +
      field('단계별 메소(한 줄에 한 단계)', '<textarea name="stepCosts" rows="4" maxlength="5000" placeholder="예: 1000000&#10;2000000">' + esc((value.stepCosts || []).join('\n')) + '</textarea>', '단계별 방식에서는 목표 레벨 − 현재 레벨 개수만큼 입력합니다.') +
      field('비용 확인 메모', input('memo', value.memo || '', 'text', 'maxlength="300" placeholder="예: 게임 심볼 창에서 확인, 할인권 적용"')) +
      '</div>' + (value.sourceDate || value.sourceFetchedAt ? '<p class="muted">' + esc(apiSourceLabel(value.sourceDate, value.sourceFetchedAt)) + ' · 자료 기준일과 조회 시각은 다를 수 있습니다.</p>' : '') +
      '<div class="lp-actions"><button type="submit">' + (editing ? '계획 수정 저장' : '예정 비용 저장') + '</button><button type="button" class="ghost" data-la-import' + (!chars.length ? ' disabled' : '') + '>선택 캐릭터 심볼 불러오기</button>' + (editing || imported ? '<button type="button" class="ghost" data-la-cancel>취소</button>' : '') + '</div></form><div data-la-imported></div>' +
      '<section><h3>캐릭터별 예정 비용</h3>' + (plans.length ? '<div class="lp-list">' + plans.slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).map(plan => {
        const cost = symbolCost(plan), icon = safeImage(plan.icon), char = chars.find(c => String(c.id) === String(plan.charId));
        return '<article class="lp-item"><h4>' + (icon ? '<img class="lp-item-icon" src="' + esc(icon) + '" alt=""> ' : '') + esc(plan.symbolName) + ' · ' + esc(char?.name || plan.charName || '캐릭터 미지정') + '</h4><p>Lv.' + esc(plan.currentLevel) + ' → Lv.' + esc(plan.targetLevel) + ' · ' + esc(plan.dueDate) + ' · ' + (plan.status === 'done' ? '계획 완료' : '예정') + '</p><p><strong>' + (cost.valid ? moneyView(bridge, cost.total) : '비용 확인 필요') + '</strong>' + (plan.memo ? ' · ' + esc(plan.memo) : '') + '</p><div class="lp-actions"><button type="button" class="ghost" data-la-edit="' + esc(plan.id) + '">수정</button><button type="button" class="ghost" data-la-done="' + esc(plan.id) + '">' + (plan.status === 'done' ? '예정으로 되돌리기' : '계획 완료 표시') + '</button><button type="button" class="ghost" data-la-delete="' + esc(plan.id) + '">계획 삭제</button></div></article>';
      }).join('') + '</div><p class="muted">완료 표시는 준비금 계획만 변경합니다. 실제 강화 비용은 지출 기록에서 한 번만 확정하세요.</p>' : empty('아직 심볼 계획이 없습니다. 캐릭터를 등록하지 않아도 이름과 비용을 직접 입력할 수 있습니다.')) + '</section>';
    const form = el.querySelector('[data-la-form]');
    form.addEventListener('submit', event => { event.preventDefault(); attempt(el, () => {
      const data = Object.fromEntries(new FormData(form)), char = (bridge.getContext().characters || []).find(c => String(c.id) === data.charId);
      const entry = { ...value, id: editing?.id || uid('symbolplan'), charId: char?.id || '', charName: char?.name || '', symbolName: data.symbolName.trim(), currentLevel: integer(data.currentLevel, 0, 100), targetLevel: integer(data.targetLevel, 1, 100), growthCount: data.growthCount === '' ? '' : integer(data.growthCount), dueDate: date(data.dueDate), costMode: data.costMode, plannedCost: money(data.plannedCost), stepCosts: data.stepCosts.trim() ? data.stepCosts.trim().split(/\r?\n/).map(v => v.trim()) : [], memo: data.memo.trim(), status: editing?.status || 'planned' };
      const cost = symbolCost(entry);
        if (!entry.symbolName || !entry.dueDate || entry.growthCount === null || !cost.valid) throw new Error(cost.reason || '이름·날짜·성장량을 확인해 주세요.');
      entry.plannedCost = cost.total; entry.stepCosts = cost.steps;
      upsert(bridge, 'symbolPlans', entry);
    }); });
    el.querySelector('[data-la-import]')?.addEventListener('click', async event => {
      const button = event.currentTarget, charId = form.elements.charId.value;
      if (!charId || !bridge.fetchEquipment) { message(el, '연결된 캐릭터를 먼저 선택해 주세요.', true); return; }
      button.disabled = true; message(el, '심볼 정보를 확인하고 있습니다.');
      try {
        const result = await bridge.fetchEquipment(charId, 'symbols');
        if (!button.isConnected) return;
        const symbols = Array.isArray(result.symbols) ? result.symbols : [];
        const box = el.querySelector('[data-la-imported]');
        if (!symbols.length) { message(el, '불러온 장착 심볼이 없습니다. 직접 입력할 수 있습니다.' + (result.warning ? ' ' + result.warning : '')); return; }
        box.innerHTML = '<section class="lp-results"><h3>불러온 심볼</h3><p>' + esc(apiSourceLabel(result.date, result.fetchedAt)) + ' · 선택하면 현재 레벨과 성장량을 입력합니다.</p><div class="lp-list">' + symbols.map((symbol, index) => {
          const icon = safeImage(symbol.symbol_icon || symbol.icon);
          return '<article class="lp-item"><h4>' + (icon ? '<img class="lp-item-icon" src="' + esc(icon) + '" alt=""> ' : '') + esc(symbol.symbol_name || symbol.name || '심볼') + '</h4><p>Lv.' + esc(symbol.symbol_level ?? symbol.level ?? '미확인') + ' · 성장량 ' + esc(symbol.symbol_growth_count ?? symbol.growthCount ?? '미확인') + '</p><button type="button" class="ghost" data-la-symbol="' + index + '">이 심볼로 계획 만들기</button></article>';
        }).join('') + '</div></section>';
        box.querySelectorAll('[data-la-symbol]').forEach(b => b.addEventListener('click', () => {
          const s = symbols[Number(b.dataset.laSymbol)], level = integer(s.symbol_level ?? s.level, 0, 100);
          renderSymbols(el, bridge, '', { charId, symbolName: s.symbol_name || s.name || '', currentLevel: level ?? '', targetLevel: level === null ? '' : level + 1, growthCount: s.symbol_growth_count ?? s.growthCount ?? '', icon: safeImage(s.symbol_icon || s.icon), sourceDate: result.date || '', sourceFetchedAt: result.fetchedAt || 0 });
        }));
        message(el, '심볼을 선택한 뒤 목표와 확인한 비용을 입력해 주세요.' + (result.warning ? ' ' + result.warning : ''));
      } catch (error) { if (button.isConnected) message(el, error?.message || '심볼을 불러오지 못했습니다. 직접 입력할 수 있습니다.', true); }
      finally { if (button.isConnected) button.disabled = false; }
    });
    el.querySelector('[data-la-cancel]')?.addEventListener('click', () => renderSymbols(el, bridge));
    el.querySelectorAll('[data-la-edit]').forEach(b => b.addEventListener('click', () => renderSymbols(el, bridge, b.dataset.laEdit)));
    el.querySelectorAll('[data-la-done]').forEach(b => b.addEventListener('click', () => attempt(el, () => {
      const plan = rows(bridge, 'symbolPlans').find(p => String(p.id) === b.dataset.laDone);
      if (plan) upsert(bridge, 'symbolPlans', { ...plan, status: plan.status === 'done' ? 'planned' : 'done' });
    })));
    deleteButtons(el, bridge, 'symbolPlans');
    // Imported form values are still unsaved user work. Notify the controller
    // just as a manual edit does, so background refreshes cannot erase them.
    if (imported) form.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const api = { render: mount, money, date, perHour, huntMetrics, huntComparisons, optimizeBosses, symbolCost, symbolSummary };
  root.MapleLedgerActivity = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
