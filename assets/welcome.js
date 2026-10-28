/* 공개 입력만 계산합니다. 장부·인증·스토리지·네트워크에는 접근하지 않습니다. */
(() => {
  'use strict';
  const root=document.querySelector('[data-welcome-calculator]');if(!root)return;
  const form=root.querySelector('[data-welcome-form]'),fields=form.elements,answer=root.querySelector('[data-welcome-answer]');
  const target=name=>root.querySelector('[data-welcome-'+name+']');
  const amount=value=>value.toLocaleString('ko-KR')+' 메소';
  function integer(name,label){
    const input=fields.namedItem(name),text=input.value.trim();
    if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)||text.replaceAll(',','').length>30){input.setAttribute('aria-invalid','true');throw Error(label+'에는 30자리 이하의 0 이상 정수를 입력하세요. 쉼표는 세 자리마다 넣을 수 있습니다.');}
    return BigInt(text.replaceAll(',',''));
  }
  function feeRate(){
    const input=fields.namedItem('fee'),text=input.value.trim();
    if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)){input.setAttribute('aria-invalid','true');throw Error('판매 수수료는 0~100%, 소수 둘째 자리까지 입력하세요.');}
    const [whole,fraction='']=text.split('.'),value=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
    if(value>10000n){input.setAttribute('aria-invalid','true');throw Error('판매 수수료는 100%를 넘을 수 없습니다.');}return value;
  }
  function percent(value){return (value/100n).toString()+(value%100n?'.'+(value%100n).toString().padStart(2,'0').replace(/0$/,''):'');}
  function korean(value){const n=value<0n?-value:value,parts=[];if(n/100000000n)parts.push((n/100000000n).toLocaleString('ko-KR')+'억');if(n%100000000n/10000n)parts.push((n%100000000n/10000n).toLocaleString('ko-KR')+'만');if(n%10000n||!parts.length)parts.push((n%10000n).toLocaleString('ko-KR'));return (value<0n?'-':'')+parts.join(' ')+' 메소';}
  function render(){
    form.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));target('error').textContent='';answer.classList.remove('is-loss','is-invalid');
    try{
      const cost=integer('cost','구입비'),sale=integer('sale','판매가'),rate=feeRate(),sold=fields.namedItem('sold').checked;
      const saleNet=sale*(10000n-rate)/10000n,revenue=sold?saleNet:0n,fee=sold?sale-saleNet:0n,net=revenue-cost;
      target('net').replaceChildren(document.createTextNode(net.toLocaleString('ko-KR')+' '));const unit=document.createElement('span');unit.textContent='메소';target('net').append(unit);
      target('korean').textContent=net>0n?korean(net)+'가 남습니다.':net<0n?korean(-net)+'만큼 지출이 더 큽니다.':'수입과 지출이 같습니다.';
      target('state').textContent=sold?'판매 완료':'미판매';target('revenue').textContent=amount(revenue);target('cost').textContent=amount(cost);target('fee').textContent=sold?amount(fee):'미판매 · 0 메소';
      target('formula').textContent=sold?sale.toLocaleString('ko-KR')+' × '+percent(10000n-rate)+'% − '+cost.toLocaleString('ko-KR')+' = '+amount(net):'미판매 수입 0 − 구입비 '+cost.toLocaleString('ko-KR')+' = '+amount(net);
      target('note').textContent=sold?'판매 수입에서 구입비를 뺀 결과입니다. 파티 분배와 송금 수수료는 포함하지 않습니다.':'지금은 구입 지출만 반영합니다. 예상 판매가는 확정 수입에 넣지 않습니다.';
      answer.classList.toggle('is-loss',net<0n);
    }catch(error){answer.classList.add('is-invalid');target('error').textContent=error.message;target('net').textContent='입력 확인 필요';target('korean').textContent='입력 조건을 확인하면 다시 계산합니다.';target('state').textContent='계산 보류';for(const name of ['revenue','cost','fee'])target(name).textContent='—';target('formula').textContent='유효한 입력값으로 계산합니다.';target('note').textContent='알 수 없는 금액을 0메소로 계산하지 않습니다.';}
  }
  form.addEventListener('input',render);form.addEventListener('change',render);form.addEventListener('submit',event=>{event.preventDefault();render();form.querySelector('[aria-invalid=true]')?.focus();});
  // reset 이벤트의 기본 동작으로 필드가 복원된 다음 결과를 계산합니다.
  form.addEventListener('reset',()=>setTimeout(render,0));root.querySelector('[data-welcome-ready]').disabled=false;render();
})();
