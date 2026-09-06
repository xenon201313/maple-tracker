/* Navigation is deliberately independent from the ledger and its storage. */
(() => {
  'use strict';
  const sidebar = document.getElementById('workspace-sidebar');
  const scrim = document.querySelector('.sidebar-scrim');
  const heading = document.getElementById('workspace-title');
  const mobile = matchMedia('(max-width: 900px)');
  let menuTrigger = null;
  let navigatingHistory = false;
  const background = () => [
    document.querySelector('.workspace-header'),
    document.querySelector('.workspace-main'),
    document.querySelector('.mobile-nav'),
    document.querySelector('.site-footer')
  ].filter(Boolean);
  const imageFallback = new URL('assets/image-unavailable.svg', document.baseURI).href;
  function showImageFallback(image) {
    if (!(image instanceof HTMLImageElement) || image.dataset.imageUnavailable || !image.getAttribute('src')) return;
    image.dataset.imageUnavailable = 'true';
    image.title = (image.alt ? image.alt + ': ' : '') + '원본 이미지를 불러올 수 없습니다.';
    image.src = imageFallback;
  }
  document.addEventListener('error', event => showImageFallback(event.target), true);

  function setMenu(open, restoreFocus = true) {
    const expanded = open && mobile.matches;
    sidebar.classList.toggle('is-open', expanded);
    document.body.classList.toggle('menu-open', expanded);
    scrim.hidden = !expanded;
    background().forEach(element => { element.inert = expanded; });
    document.querySelectorAll('[data-menu-toggle]').forEach(button => {
      button.setAttribute('aria-expanded', String(expanded));
    });
    if (expanded) sidebar.querySelector('.tab.active').focus();
    else if (restoreFocus && menuTrigger) menuTrigger.focus({preventScroll: true});
  }

  document.querySelectorAll('[data-menu-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      menuTrigger = button;
      setMenu(!sidebar.classList.contains('is-open'));
    });
  });
  document.querySelectorAll('[data-menu-close]').forEach(button => {
    button.addEventListener('click', () => setMenu(false));
  });
  mobile.addEventListener('change', () => setMenu(false, false));
  document.addEventListener('keydown', event => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false); }
    if (event.key !== 'Tab') return;
    const focusable = [...sidebar.querySelectorAll('a[href],button:not(:disabled)')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });

  function labelFields(root) {
    root.querySelectorAll('label:not([for])').forEach(label => {
      if (label.querySelector('input,select,textarea')) return;
      const control = label.nextElementSibling;
      if (control?.matches('input,select,textarea') && control.id) label.htmlFor = control.id;
    });
  }
  function enhanceActivePage() {
    const active = document.querySelector('.page.active');
    if (!active) return;
    labelFields(active);
    active.querySelectorAll('img').forEach(image => {
      if (image.complete && !image.naturalWidth) showImageFallback(image);
    });
    const list = active.querySelector('#charlist,#monthlyboss-list,#dailyboss-list');
    if (list && !list.children.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state boss-empty-state';
      const text = document.createElement('p');
      text.textContent = '보스를 기록할 캐릭터를 등록해 주세요.';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '캐릭터 등록';
      button.onclick = () => openPage('character');
      empty.append(text, button);
      list.appendChild(empty);
    }
  }
  function updatePage(page, initial = false) {
    const selected = document.querySelector('.tab[data-page="' + page + '"]');
    if (!selected) return;
    heading.textContent = selected.textContent.trim();
    document.title = heading.textContent + ' | 나만의 메계부';
    document.querySelectorAll('[data-page],[data-mobile-page]').forEach(button => {
      const active = (button.dataset.page || button.dataset.mobilePage) === page;
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    enhanceActivePage();
    setMenu(false, false);
    if (!initial) {
      heading.focus({preventScroll: true});
      if (!navigatingHistory) {
        const url = new URL(location.href);
        if (url.searchParams.get('page') !== page) {
          url.searchParams.set('page', page);
          history.pushState(null, '', url);
        }
      }
    }
  }
  document.addEventListener('workspace:page', event => updatePage(event.detail.page));
  document.addEventListener('workspace:render', enhanceActivePage);
  document.querySelectorAll('[data-mobile-page]').forEach(button => {
    button.addEventListener('click', () => openPage(button.dataset.mobilePage));
  });
  document.querySelector('.workspace-brand').addEventListener('click', event => {
    event.preventDefault(); openPage('home');
  });
  window.addEventListener('popstate', () => {
    const requested = new URL(location.href).searchParams.get('page');
    const page = document.getElementById('page-' + requested) ? requested : 'home';
    navigatingHistory = true;
    try { openPage(page); } finally { navigatingHistory = false; }
  });
  document.getElementById('workspace-backup').addEventListener('click', () => {
    document.getElementById('btn-export').click();
  });
  labelFields(document);
  updatePage(document.querySelector('.page.active')?.id.replace('page-', '') || 'home', true);
})();
