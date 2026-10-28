/* 계획과 실제 장부를 분리합니다. 기존 통계·원본 기록을 다시 쓰지 않습니다. */
(function(root){
  'use strict';
  const sections=Object.freeze(['investments','trades','funds','adjustments','transfers','opening','huntNotes','bossPlans','symbolPlans']);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const stamp=value=>Math.max(Number(value?.updatedAt)||0,Number(value?.deletedAt)||0);
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
  const withoutSales=value=>{const {sales,...fields}=value;return fields;};
  function preferred(a,b,trade=false){
    if(stamp(a)!==stamp(b))return stamp(a)>stamp(b)?a:b;
    if((Number(a.deletedAt)||0)!==(Number(b.deletedAt)||0))return (Number(a.deletedAt)||0)>(Number(b.deletedAt)||0)?a:b;
    return canonical(trade?withoutSales(a):a)>canonical(trade?withoutSales(b):b)?a:b;
  }
  function mergeSales(a,b,winner){
    const ids=new Map();
    for(const row of [...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])]){
      if(!row||typeof row!=='object'||Array.isArray(row)||!String(row.id||'').trim())continue;
      const item=clone(row);item.id=String(item.id).slice(0,240);
      ids.set(item.id,ids.has(item.id)?preferred(item,ids.get(item.id)):item);
    }
    // 식별자가 없는 비정상 복구 자료도 최신 부모 행에 있으면 버리지 않습니다.
    const unidentified=(Array.isArray(winner.sales)?winner.sales:[]).filter(row=>!row||typeof row!=='object'||Array.isArray(row)||!String(row.id||'').trim()).map(clone);
    return [...ids.values()].sort((a,b)=>a.id.localeCompare(b.id)).concat(unidentified);
  }
  function normalize(value){
    const source=object(value),out={...source,version:1};
    for(const key of sections){
      const ids=new Map();
      for(const row of Array.isArray(source[key])?source[key]:[]){
        if(!row||typeof row!=='object'||Array.isArray(row)||!String(row.id||'').trim())continue;
        const item=clone(row),id=String(item.id).slice(0,240);item.id=id;
        if(key==='investments'&&item.equipment?.fetchedAt&&Date.now()-Number(item.equipment.fetchedAt)>30*86400000)delete item.equipment;
        const previous=ids.get(id);
        const winner=previous?preferred(item,previous,key==='trades'):item;
        if(key==='trades')winner.sales=mergeSales(previous?.sales,item.sales,winner);
        ids.set(id,winner);
      }
      out[key]=[...ids.values()].sort((a,b)=>a.id.localeCompare(b.id));
    }
    return out;
  }
  function merge(...values){
    const out=normalize();
    for(const source of values){
      const next=normalize(source);
      for(const key of Object.keys(next))if(!sections.includes(key)&&!['__proto__','constructor','prototype'].includes(key))out[key]=next[key];
      for(const key of sections)out[key]=normalize({[key]:out[key].concat(next[key])})[key];
    }
    return normalize(out);
  }
  function dateKst(value=Date.now()){return new Date(Number(value)+9*3600000).toISOString().slice(0,10);}
  function weekKst(date=dateKst()){
    const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime()))throw new Error('올바른 날짜가 아닙니다.');
    d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+3)%7));return d.toISOString().slice(0,10);
  }
  const api={sections,normalize,merge,dateKst,weekKst,active:rows=>(Array.isArray(rows)?rows:[]).filter(row=>!row.deletedAt)};
  root.MaplePlannerState=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
