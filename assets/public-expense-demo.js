/* 공개 예시 계산기. 입력값은 이 페이지 안에서만 계산하고 저장하거나 전송하지 않습니다. */
(() => {
  'use strict';

  const labels = {
    cost: '구입 비용', sale: '판매 금액', fee: '판매 수수료',
    price: '재료 구입 단가', count: '재료 수량',
    direct: '직접 사용한 메소', extra: '잠재능력 재설정 메소'
  };
  const money = value => value.toLocaleString('ko-KR') + ' 메소';
  const number = value => value.toLocaleString('ko-KR');

  function readInteger(form, name) {
    const field = form.elements.namedItem(name);
    const text = field.value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) {
      field.setAttribute('aria-invalid', 'true');
      throw new Error(labels[name] + '에 0 이상의 정수를 입력해 주세요. 빈칸·음수·소수·지수 표기는 사용할 수 없습니다.');
    }
    const value = BigInt(text.replaceAll(',', ''));
    if (name === 'count' && value > 1000000n) {
      field.setAttribute('aria-invalid', 'true');
      throw new Error('재료 수량은 0~1,000,000개로 입력해 주세요.');
    }
    return value;
  }

  function calculate(form) {
    const mode = form.dataset.demoForm;
    const put = (name, value) => {
      const output = form.querySelector('[data-demo-' + name + ']');
      if (output) output.textContent = value;
    };
    form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
    put('error', '');
    try {
      let cost;
      if (mode === 'profit') {
        cost = readInteger(form, 'cost');
        const sale = readInteger(form, 'sale');
        const fee = readInteger(form, 'fee');
        if (fee !== 3n && fee !== 5n) throw new Error('판매 수수료를 3% 또는 5%로 선택해 주세요.');
        const sold = form.elements.namedItem('sold').checked;
        const revenue = sold ? sale * (100n - fee) / 100n : 0n;
        const net = revenue - cost;
        put('revenue', money(revenue));
        put('net', (net > 0n ? '+' : '') + money(net));
        put('formula', sold
          ? '판매 실수령액 = ' + number(sale) + ' × (100 − ' + number(fee) + ') ÷ 100 = ' + money(revenue) + ' (1메소 미만 버림). 순손익 = 실수령액 − 구입 비용 = ' + money(net) + '.'
          : '아직 판매하지 않았으므로 수입은 0 메소입니다. 순손익 = 0 − ' + number(cost) + ' = ' + money(net) + '.');
      } else if (mode === 'soul' || mode === 'ability') {
        const price = readInteger(form, 'price');
        const count = readInteger(form, 'count');
        const direct = readInteger(form, 'direct');
        const extra = mode === 'soul' ? readInteger(form, 'extra') : 0n;
        const materials = price * count;
        cost = materials + direct + extra;
        put('formula', '재료 구입비 ' + number(price) + ' × ' + number(count) + ' = ' + money(materials)
          + '. 총지출 = ' + number(materials) + ' + ' + number(direct)
          + (mode === 'soul' ? ' + ' + number(extra) : '') + ' = ' + money(cost) + '.');
      } else {
        return;
      }
      put('cost', money(cost));
    } catch (error) {
      for (const name of ['cost', 'revenue', 'net', 'formula']) put(name, '—');
      put('error', error.message);
    }
  }

  function init(root) {
    const tabs = [...root.querySelectorAll('[data-demo-mode]')];
    const panels = [...root.querySelectorAll('[data-demo-panel]')];
    const activate = tab => {
      for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      }
      for (const panel of panels) panel.hidden = panel.dataset.demoPanel !== tab.dataset.demoMode;
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        activate(tabs[next]);
        tabs[next].focus();
      });
    });
    if (tabs.length) activate(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
    for (const form of root.querySelectorAll('[data-demo-form]')) {
      form.addEventListener('input', () => calculate(form));
      form.addEventListener('change', () => calculate(form));
      form.addEventListener('submit', event => { event.preventDefault(); calculate(form); });
      // reset의 기본 동작이 입력값을 되돌린 다음 결과를 다시 계산합니다.
      form.addEventListener('reset', () => setTimeout(() => calculate(form), 0));
      calculate(form);
    }
  }

  function start() { document.querySelectorAll('[data-expense-demo]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
