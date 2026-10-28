/* 계정 장부 보관본은 현재 장부와 별도인 IndexedDB에 저장합니다. */
(() => {
  'use strict';
  const DB_NAME='maple-account-ledger', STORE='preserved';
  const PREFIXES=['maple:account-ledger:vault:v1:','maple:account-ledger:archive:v1:'];
  const migratable=key=>typeof key==='string'&&PREFIXES.some(prefix=>key.startsWith(prefix));
  let database,readiness;
  function unavailable(cause){const error=new Error('장부 보관함을 열지 못했습니다. 브라우저의 사이트 저장 권한을 확인한 뒤 다시 시도해 주세요.');error.code='STORAGE_UNAVAILABLE';error.cause=cause;return error;}
  function parse(text){try{return JSON.parse(text);}catch(cause){const error=new Error('기존 장부 보관본을 읽지 못했습니다. 원본은 그대로 유지됩니다.');error.code='STORAGE_INVALID_DATA';error.cause=cause;throw error;}}
  const serialized=value=>JSON.stringify(value);
  function newest(value){
    let result=Math.max(Number(value?.createdAt)||0,Number(value?.updatedAt)||0,Number(value?.meta?.updatedAt)||0);
    try{result=Math.max(result,Number(JSON.parse(value?.values?.['mapleTracker.v2']||'null')?.updatedAt)||0);}catch{}
    return result;
  }
  const prefer=(legacy,stored)=>stored===null||newest(legacy)>=newest(stored)?legacy:stored;
  const metadata=value=>value&&typeof value==='object'?Object.fromEntries(['owner','label','createdAt','meta'].filter(key=>key in value).map(key=>[key,value[key]])):value;
  function open(){return new Promise((resolve,reject)=>{
    let request,settled=false;
    try{if(!window.indexedDB)throw new Error('IndexedDB unavailable');request=indexedDB.open(DB_NAME,1);}catch(error){reject(unavailable(error));return;}
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
    request.onerror=()=>{settled=true;reject(unavailable(request.error));};
    request.onblocked=()=>{settled=true;reject(unavailable());};
    request.onsuccess=()=>{
      if(settled){request.result.close();return;}
      database=request.result;database.onversionchange=()=>database.close();resolve();
    };
  });}
  function transaction(mode,operation){return new Promise((resolve,reject)=>{
    let tx,result,failure;
    try{tx=database.transaction(STORE,mode);}catch(error){reject(unavailable(error));return;}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(failure||tx.error||unavailable());
    tx.onerror=event=>{failure=event.target?.error||tx.error;};
    try{operation(tx.objectStore(STORE),value=>{result=value;});}catch(error){failure=error;try{tx.abort();}catch{reject(error);}}
  });}
  const getStored=key=>transaction('readonly',(store,done)=>{const request=store.get(key);request.onsuccess=()=>done(request.result===undefined?null:request.result);});
  const putStored=(key,value)=>transaction('readwrite',store=>{store.put(value,key);});
  const removeStored=key=>transaction('readwrite',store=>{store.delete(key);});
  const listStored=(prefix,metadataOnly)=>transaction('readonly',(store,done)=>{
    const rows=[],request=store.openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){done(rows);return;}if(typeof cursor.key==='string'&&cursor.key.startsWith(prefix)){const value=cursor.value;rows.push({key:cursor.key,value:metadataOnly?metadata(value):value,stamp:newest(value)});}cursor.continue();};
  });
  async function verifiedPut(key,value){
    await putStored(key,value);
    if(serialized(await getStored(key))!==serialized(value)){const error=new Error('장부 보관본의 저장 결과를 확인하지 못했습니다. 기존 원본은 유지됩니다.');error.code='STORAGE_VERIFY_FAILED';throw error;}
  }
  async function migrate(){
    const keys=Object.keys(localStorage).filter(migratable);
    for(const key of keys){
      const original=localStorage.getItem(key);if(original===null)continue;
      const value=parse(original),stored=await getStored(key);
      let preservedKey=key;
      if(stored!==null&&serialized(stored)!==serialized(value)){
        // 중단된 이전 이관 뒤 두 저장소가 각각 바뀐 경우 양쪽 사본을 모두 남깁니다.
        const copyKey=key+':preserved-copy:'+Date.now()+':'+crypto.randomUUID();
        if(prefer(value,stored)===value){await verifiedPut(copyKey,stored);await verifiedPut(key,value);}
        else{preservedKey=copyKey;await verifiedPut(copyKey,value);}
      }else await verifiedPut(key,value);
      if(serialized(await getStored(preservedKey))!==serialized(value)){const error=new Error('장부 보관본의 이관 결과를 확인하지 못했습니다. 기존 원본은 유지됩니다.');error.code='STORAGE_VERIFY_FAILED';throw error;}
      // 다른 탭이 이관 중 원본을 갱신했다면 그 새 값은 다음 확인까지 남겨 둡니다.
      if(localStorage.getItem(key)===original){try{localStorage.removeItem(key);}catch{/* 삭제 권한이 없어도 검증된 보관본과 원본을 모두 유지합니다. */}}
    }
  }
  function ready(){
    if(!readiness){
      readiness=(async()=>{await open();if(navigator.locks)await navigator.locks.request('maple-account-ledger-migration-v1',migrate);else await migrate();})();
      // 시작 시 선행 준비하더라도 호출자가 오류를 처리할 때까지 전역 오류를 만들지 않습니다.
      readiness.catch(()=>{});
    }
    return readiness;
  }
  window.MapleAccountStorage=Object.freeze({
    ready,
    async get(key){await ready();const stored=await getStored(key),text=migratable(key)?localStorage.getItem(key):null;return text===null?stored:prefer(parse(text),stored);},
    async put(key,value){await ready();await verifiedPut(key,value);},
    async remove(key){await ready();await removeStored(key);},
    async list(prefix='',options={}){
      await ready();const metadataOnly=!!options?.metadataOnly,rows=new Map((await listStored(prefix,metadataOnly)).map(row=>[row.key,{value:row.value,stamp:row.stamp}]));
      for(const key of Object.keys(localStorage).filter(key=>migratable(key)&&key.startsWith(prefix))){
        const text=localStorage.getItem(key);if(text===null)continue;
        const value=parse(text),stamp=newest(value);if(!rows.has(key)||stamp>=rows.get(key).stamp)rows.set(key,{value:metadataOnly?metadata(value):value,stamp});
      }
      return [...rows].map(([key,row])=>({key,value:row.value})).sort((a,b)=>a.key.localeCompare(b.key));
    }
  });
  ready();
})();
