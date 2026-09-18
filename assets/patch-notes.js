/* 공지 표시 설정만 관리합니다. 장부·클라우드·복구·인증 저장값은 변경하지 않습니다. */
(() => {
  'use strict';
  const storageKey = 'maple_ui_patch_notes_hidden_v1';
  const seenKey = 'maple_ui_patch_notes_seen_v1';
  const releases = window.MaplePatchNotesData?.releases || [];
  if (!releases.length) return;
  // 프렌즈 로그인 복귀 시 인증 화면을 가리지 않습니다. 인증 값은 저장하지 않습니다.
  const originalUrl = new URL(location.href);
  const nestedQuery = (originalUrl.searchParams.get('page') || '').split('?').slice(1).join('?');
  const nestedParams = new URLSearchParams(nestedQuery);
  const authReturn = ['code','state','error','error_description'].some(key => originalUrl.searchParams.has(key) || nestedParams.has(key));
  const readHidden = () => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : [];
    } catch { return []; }
  };
  const readSeen = () => {
    try { return localStorage.getItem(seenKey) || ''; }
    catch { return ''; }
  };
  const rememberSeen = id => {
    try { localStorage.setItem(seenKey,id); return true; }
    catch { return false; }
  };
  function init() {
    const trigger = document.getElementById('patch-notes-open');
    if (!trigger) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'patch-notes-dialog';
    dialog.className = 'patch-notes-dialog';
    dialog.setAttribute('aria-labelledby','patch-notes-title');
    dialog.setAttribute('aria-describedby','patch-notes-intro');
    dialog.innerHTML = '<header class="patch-notes-header"><img class="patch-notes-logo" src="assets/icon.png?v=20260908" alt=""><div class="patch-notes-heading"><time class="patch-notes-date" id="patch-notes-date"></time><h2 id="patch-notes-title" tabindex="-1"></h2></div><button type="button" class="ghost patch-notes-close" data-patch-notes-close aria-label="패치노트 닫기">×</button></header>'+
      '<div id="patch-notes-content" class="patch-notes-content" tabindex="0" role="region" aria-label="업데이트 내용"><p class="patch-notes-intro" id="patch-notes-intro">메계부에 새롭게 반영된 내용을 확인해 보세요.</p><div class="patch-notes-picker" hidden><label for="patch-notes-release">업데이트 날짜</label><select id="patch-notes-release"></select></div><div id="patch-notes-sections"></div><p class="patch-notes-footnote" id="patch-notes-footnote"></p></div>'+
      '<footer class="patch-notes-footer"><label class="patch-notes-preference"><input type="checkbox" id="patch-notes-hide" aria-describedby="patch-notes-hint">이 패치노트 다시 보지 않기</label><p class="patch-notes-hint" id="patch-notes-hint">확인을 누르면 이 브라우저에 저장됩니다. 새 패치노트는 다시 알려드려요.</p><button type="button" class="patch-notes-confirm" id="patch-notes-confirm">확인</button><p class="patch-notes-status" id="patch-notes-status" role="status" aria-live="polite"></p></footer>';
    document.body.appendChild(dialog);
    const get = id => dialog.querySelector('#'+id);
    const picker = get('patch-notes-release'), checkbox = get('patch-notes-hide');
    const status = get('patch-notes-status'), content = get('patch-notes-content');
    let selected = releases[0], returnFocus = null, outsidePress = false;
    for (const release of releases) {
      const option = document.createElement('option');
      option.value = release.id;
      option.textContent = release.date.replaceAll('-','.')+' '+release.title;
      picker.appendChild(option);
    }
    dialog.querySelector('.patch-notes-picker').hidden = releases.length < 2;
    function render(release) {
      selected = release;
      picker.value = release.id;
      get('patch-notes-title').textContent = release.title;
      get('patch-notes-date').textContent = release.date.replaceAll('-','.');
      get('patch-notes-date').dateTime = release.date;
      const sections = get('patch-notes-sections');
      sections.replaceChildren();
      for (const entry of release.sections) {
        const section = document.createElement('section');
        section.className = 'patch-note-section';
        const heading = document.createElement('h3'), tag = document.createElement('span');
        tag.className = 'patch-note-tag'; tag.textContent = entry.tag;
        const title = document.createElement('span'); title.textContent = entry.title;
        heading.append(tag,title);
        const list = document.createElement('ul');
        for (const text of entry.items) {
          const item = document.createElement('li'); item.textContent = text; list.appendChild(item);
        }
        section.append(heading,list); sections.appendChild(section);
      }
      get('patch-notes-footnote').textContent = release.footer || '';
      checkbox.checked = readHidden().includes(release.id);
      status.textContent = '';
      content.scrollTop = 0;
    }
    function open() {
      if (dialog.open) return;
      rememberSeen(releases[0].id);
      returnFocus = document.activeElement;
      if (document.body.classList.contains('menu-open')) {
        document.querySelector('[data-menu-close]')?.click();
        returnFocus = document.querySelector('.workspace-header [data-menu-toggle]');
      }
      render(releases[0]);
      dialog.showModal();
      document.body.classList.add('patch-notes-open');
      get('patch-notes-title').focus({preventScroll:true});
    }
    function close() { dialog.close(); }
    trigger.hidden = false;
    trigger.addEventListener('click',open);
    picker.addEventListener('change',() => render(releases.find(release => release.id === picker.value) || releases[0]));
    dialog.querySelector('[data-patch-notes-close]').addEventListener('click',close);
    get('patch-notes-confirm').addEventListener('click',() => {
      const hidden = readHidden(), wasHidden = hidden.includes(selected.id);
      if (checkbox.checked !== wasHidden) {
        try {
          const next = checkbox.checked ? hidden.concat(selected.id) : hidden.filter(id => id !== selected.id);
          if (next.length) localStorage.setItem(storageKey,JSON.stringify(next));
          else localStorage.removeItem(storageKey);
        } catch {
          status.textContent = '설정을 저장하지 못했습니다. 다음 접속 때 다시 표시될 수 있습니다. 닫기 버튼으로 계속 이용할 수 있습니다.';
          return;
        }
      }
      close();
    });
    dialog.addEventListener('cancel',event => { event.preventDefault(); close(); });
    dialog.addEventListener('close',() => {
      document.body.classList.remove('patch-notes-open');
      const target = returnFocus?.isConnected && returnFocus.getClientRects().length && !returnFocus.closest('[inert]') && returnFocus !== document.body ? returnFocus : document.getElementById('workspace-title');
      target?.focus({preventScroll:true});
    });
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
    };
    dialog.addEventListener('pointerdown',event => { outsidePress = outside(event); });
    dialog.addEventListener('click',event => { if (outsidePress && outside(event)) close(); outsidePress = false; });
    dialog.addEventListener('keydown',event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element => element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
    // 첫 방문에는 본문을 가리지 않는 안내만 표시합니다. 장부나 로그인 상태로 이용자를 판별하지 않습니다.
    function showNotice() {
      const welcome = document.querySelector('#page-home .home-welcome');
      if (!welcome) return;
      const notice = document.createElement('section');
      notice.id = 'patch-notes-notice';
      notice.className = 'patch-notes-notice';
      notice.setAttribute('aria-label','최신 업데이트');
      const text = document.createElement('p');
      const label = document.createElement('span');
      label.className = 'patch-notes-notice-label';
      label.textContent = '최신 업데이트';
      const title = document.createElement('span');
      title.textContent = releases[0].date.replaceAll('-','.')+' · '+releases[0].title;
      text.append(label,title);
      const actions = document.createElement('div');
      actions.className = 'patch-notes-notice-actions';
      const details = document.createElement('button');
      details.type = 'button'; details.textContent = '내용 보기';
      details.setAttribute('data-patch-notes-details','');
      details.addEventListener('click',open);
      const dismiss = document.createElement('button');
      dismiss.type = 'button'; dismiss.textContent = '닫기';
      dismiss.className = 'ghost';
      dismiss.setAttribute('aria-label','최신 업데이트 안내 닫기');
      dismiss.addEventListener('click',() => {
        rememberSeen(releases[0].id);
        notice.remove();
        document.getElementById('workspace-title')?.focus({preventScroll:true});
      });
      actions.append(details,dismiss); notice.append(text,actions);
      welcome.after(notice);
    }
    window.MaplePatchNotes = Object.freeze({open,latestId:releases[0].id,storageKey,seenKey});
    if (authReturn) return;
    const hidden = readHidden(), seen = readSeen(), latestId = releases[0].id;
    if (hidden.includes(latestId)) { rememberSeen(latestId); return; }
    if (seen === latestId) return;
    const returning = Boolean(seen || hidden.length);
    // 저장소를 사용할 수 없으면 자동 팝업이 반복되지 않도록 안내 배너로만 알립니다.
    const remembered = rememberSeen(latestId);
    const mayOpen = !document.body.classList.contains('menu-open') && !document.querySelector('.guide-modal.open,dialog[open]');
    if (returning && remembered && mayOpen) open();
    else showNotice();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
