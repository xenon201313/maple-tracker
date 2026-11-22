// Only an opaque bookmark is visible to localStorage. The browser owns the
// non-extractable key and the encrypted Friends session in a separate database.
(() => {
  'use strict';
  const marker='maple:friends:remembered-device:v1', store='sessions';
  const lifetime=14*24*60*60*1000;
  const idPattern=/^[0-9a-f]{32}$/;
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  function current() {
    try {const id=localStorage.getItem(marker);return idPattern.test(id)?id:'';}
    catch {return '';}
  }
  let dbPromise;
  function open() {
    if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open('maple-device-login',1);
      request.onupgradeneeded=()=>request.result.createObjectStore(store);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();dbPromise=null;};
        resolve(db);
      };
    }).catch(error=>{dbPromise=null;throw error;});
    return dbPromise;
  }
  async function operation(mode,run) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,mode), request=run(tx.objectStore(store));
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error||Error('Device storage unavailable'));
    });
  }
  async function forget(id) {
    if(!idPattern.test(id)) return;
    // Remove the bookmark synchronously so another tab cannot start restoring it.
    try {if(current()===id) localStorage.removeItem(marker);}
    finally {await operation('readwrite',s=>s.delete(id));}
  }
  async function restore(id) {
    if(!id || id!==current()) return null;
    const row=await operation('readonly',s=>s.get(id));
    if(!row || !Number.isFinite(row.until) || Date.now()>=row.until) {await forget(id);return null;}
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:new TextEncoder().encode(id)},row.key,row.cipher);
    const session=JSON.parse(new TextDecoder().decode(clear));
    if(!/^[a-f0-9]{64}$/.test(session.state)||!/^[a-f0-9]{64}$/.test(session.proof)||typeof session.account!=='string'||!session.account||session.until!==row.until) {
      await forget(id);return null;
    }
    return id===current()?{state:session.state,proof:session.proof,account:session.account,deviceId:id,deviceUntil:row.until}:null;
  }
  async function remember(session,stillCurrent) {
    const previous=current(), id=hex(crypto.getRandomValues(new Uint8Array(16)));
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12)), until=Date.now()+lifetime;
    const payload={state:session.state,proof:session.proof,account:session.account,until};
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},key,new TextEncoder().encode(JSON.stringify(payload)));
    await operation('readwrite',s=>s.put({key,iv,cipher,until},id));
    try {
      if(!stillCurrent() || current()!==previous) return null;
      localStorage.setItem(marker,id);
    } finally {
      if(current()!==id) await operation('readwrite',s=>s.delete(id));
    }
    if(previous) await operation('readwrite',s=>s.delete(previous)).catch(()=>{});
    return {deviceId:id,deviceUntil:until};
  }
  window.MapleDeviceLogin=Object.freeze({current,restore,remember,forget,marker});
})();
