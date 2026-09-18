const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 기존 화면 회귀 테스트는 현재 공지를 이미 숨긴 이용자 상태로 실행합니다.
// 공지 자체의 동작은 test-patch-notes.cjs에서 별도로 검증합니다.
async function fixtureDismissPatchNotes(context) {
  const sandbox = {};
  const source = fs.readFileSync(path.join(__dirname, '../../assets/patch-notes-data.js'), 'utf8');
  vm.runInNewContext(source, sandbox);
  const ids = Array.from(sandbox.MaplePatchNotesData.releases, release => release.id);
  await context.addInitScript(ids => {
    localStorage.setItem('maple_ui_patch_notes_hidden_v1', JSON.stringify(ids));
    localStorage.setItem('maple_ui_patch_notes_seen_v1', ids[0]);
  }, ids);
}

module.exports = { fixtureDismissPatchNotes };
