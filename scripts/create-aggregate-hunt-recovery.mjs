import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath, date, rangeStart, rangeEnd, amount] = process.argv.slice(2);

if (!inputPath || !outputPath || !date || !rangeStart || !rangeEnd || !/^\d+$/.test(String(amount || ''))) {
  throw new Error('Usage: node scripts/create-aggregate-hunt-recovery.mjs <input> <output> <date> <range-start> <range-end> <amount>');
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!data.records || typeof data.records !== 'object') throw new Error('Invalid MapleTracker backup');

const id = `hunt_server_recovery_${rangeStart.replaceAll('-', '')}_${rangeEnd.replaceAll('-', '')}`;
const existingSessions = Array.isArray(data.records[date]?.sessions) ? data.records[date].sessions : [];
const alreadyExists = Object.values(data.records).some(record =>
  Array.isArray(record?.sessions) && record.sessions.some(session => session?.id === id)
);
if (alreadyExists) throw new Error('This aggregate recovery is already present');

const serverSavedAt = Date.parse(`${rangeEnd}T21:10:32.273+09:00`);
const label = `${rangeStart.slice(5)}~${rangeEnd.slice(5)} 서버 집계 복구 (날짜별 원본 소실 · 조각 환산 포함 합계)`;
const session = {
  id,
  kind: 'recovery-adjustment',
  runs: 0,
  label,
  meso: String(amount),
  erda: 0,
  erdaSettled: 0,
  erdaUnitPrice: '0',
  erdaFee: 3,
  extraIncome: '0',
  charName: '',
  createdAt: `${rangeEnd}T21:10:32.273+09:00`,
  updatedAt: serverSavedAt,
  settlementFrom: '',
  settlementTo: '',
  settlementSources: []
};

const sessions = [...existingSessions, session];
data.records[date] = {
  meso: sessions
    .filter(item => item?.kind !== 'erda-settlement')
    .reduce((sum, item) => sum + BigInt(String(item?.meso || '0')), 0n)
    .toString(),
  erda: sessions
    .filter(item => item?.kind === 'hunt')
    .reduce((sum, item) => sum + Math.max(0, Number(item?.erda) || 0), 0),
  erdaUnitPrice: '0',
  erdaFee: 3,
  extraIncome: sessions
    .reduce((sum, item) => sum + BigInt(String(item?.extraIncome || '0')), 0n)
    .toString(),
  charName: '',
  sessions
};

data.huntJournal = Array.isArray(data.huntJournal) ? data.huntJournal : [];
data.huntJournal.push({ date, session });

data.huntRecovery = Array.isArray(data.huntRecovery) ? data.huntRecovery : [];
data.huntRecovery.unshift({
  id: `hunt_recovery_server_aggregate_${rangeStart.replaceAll('-', '')}_${rangeEnd.replaceAll('-', '')}`,
  createdAt: new Date().toISOString(),
  reason: `${rangeStart}~${rangeEnd} Cloudflare 익명 주간 집계 복구`,
  data: {
    updatedAt: Date.now(),
    settings: {
      erdaPrice: String(data.settings?.erdaPrice || '0'),
      erdaFee: Number(data.settings?.erdaFee) || 3,
      includeErdaMeso: Boolean(data.settings?.includeErdaMeso)
    },
    records: { [date]: data.records[date] },
    huntTombstones: []
  }
});
data.huntRecovery = data.huntRecovery.slice(0, 8);
data.updatedAt = Date.now();

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(outputPath);
