const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('function createHuntSessionId');
const end = html.indexOf('const EXPENSE_CATEGORIES', start);
assert(start >= 0 && end > start, '재획 데이터 함수 구간을 찾지 못했습니다.');

const stubs = String.raw`
const HUNT_RECOVERY_KEY='mapleTracker.huntRecovery.v1';
const HUNT_TOMBSTONE_LIMIT=500;
let db={settings:{erdaPrice:'6777777',erdaFee:3},records:{},huntTombstones:[]};
let startupRawDbSnapshot=null;
let startupLegacyDbSnapshot=null;
function ensureObj(value){ return value && typeof value==='object' && !Array.isArray(value) ? value : {}; }
function normalizeDateInput(value){
  const match=String(value||'').trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  return match ? match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0') : '';
}
function mesoValueFromDigits(value){ const digits=String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,''); return digits || '0'; }
function toMesoBig(value){ try{return BigInt(mesoValueFromDigits(value));}catch{return 0n;} }
function validDropFee(value){ const fee=Number(value); return [0,3,5].includes(fee) ? fee : 5; }
function normalizeSettings(value){ const settings=Object.assign({},ensureObj(value)); settings.erdaPrice=mesoValueFromDigits(settings.erdaPrice||0); settings.erdaFee=validDropFee(settings.erdaFee); return settings; }
function todayStr(){ return '2026-07-22'; }
function normalizeBackupSnapshots(){ return []; }
function alert(){}
function confirm(){ return true; }
const localStorage={getItem(){return null;},setItem(){},length:0,key(){return null;}};
`;

const tests = String.raw`
function makeSession(id,date,meso,updatedAt){
  const at=new Date(date+'T12:00:00+09:00').getTime();
  return {id,kind:'hunt',runs:2.5,label:'2.5재획',meso:String(meso),erda:330,erdaSettled:0,erdaUnitPrice:'6777777',erdaFee:3,extraIncome:'0',charName:'테스트',createdAt:String(at),updatedAt:updatedAt||at,settlementSources:[]};
}
function makeStore(dates){
  return {settings:{erdaPrice:'6777777',erdaFee:3},records:Object.fromEntries(dates.map((date,index)=>[date,{sessions:[makeSession('hunt_'+date,date,1000000000+index)]}]))};
}
const local=makeStore(['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-12','2026-07-15','2026-07-16']);
const staleRemote=makeStore(['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-12']);
const merged=mergeHuntRecordStores(local,staleRemote,[]);
assert.deepStrictEqual(Object.keys(merged).sort(),Object.keys(local.records).sort());
assert.strictEqual(huntRecordEntries({settings:local.settings,records:merged}).length,8);

const duplicate={settings:local.settings,records:{'2026-07-16':{sessions:[makeSession('duplicate-a','2026-07-16',123),makeSession('duplicate-b','2026-07-16',123)]}}};
assert.strictEqual(huntRecordEntries({settings:local.settings,records:mergeHuntRecordStores(duplicate,{records:{}},[])}).length,2);

const movedLocal={settings:local.settings,records:{'2026-07-22':{sessions:[makeSession('move-me','2026-07-22',777,Date.now())]}}};
const oldRemote={settings:local.settings,records:{'2026-07-16':{sessions:[makeSession('move-me','2026-07-16',555,1)]}}};
const moved=mergeHuntRecordStores(movedLocal,oldRemote,[]);
assert(moved['2026-07-22'] && !moved['2026-07-16']);

const deleted=mergeHuntRecordStores(local,staleRemote,[{id:'hunt_2026-07-15',date:'2026-07-15',deletedAt:Date.now()}]);
assert(!deleted['2026-07-15']);

const normalized=normalizeRecords({'2026-7-6':{sessions:[makeSession('one','2026-07-06',1)]},'2026/7/6':{sessions:[makeSession('two','2026-07-06',2)]}},local.settings);
assert.strictEqual(normalized['2026-07-06'].sessions.length,2);

const recoveryPayload={type:'maple-tracker-hunt-recovery',data:{settings:local.settings,records:{'2026-07-15':{sessions:[makeSession('recovery-15','2026-07-15',2019023948)]}}}};
assert.strictEqual(Object.keys(decodeHuntRecoveryPackage(JSON.stringify(recoveryPayload)).data.records)[0],'2026-07-15');
console.log('hunt data safety: OK');
`;

vm.runInNewContext(stubs + '\n' + html.slice(start, end) + '\n' + tests, {
  assert,
  console,
  Date,
  Map,
  Set,
  JSON,
  BigInt,
  Math,
  Object,
  Array,
  String,
  Number,
  Uint8Array,
  TextDecoder,
  atob,
  URL
}, { filename: 'hunt-data-safety.vm.js' });
