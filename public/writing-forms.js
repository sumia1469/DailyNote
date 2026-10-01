(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function icon(name, label) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'shell-icon'; b.dataset.icon = name;
    b.setAttribute('aria-label', label); b.title = label;
    return b;
  }
  // Preserve the shell's common nonmodal dropdown adapter.
  UIShell.actionMenu = (menu, opener) => { window.AppIcons?.render(menu); UIShell.dropdown.open(menu, opener); };

  // Registration is a navigable page, not a modal dialog. Keep adapter methods
  // so existing validation, permissions and submit handlers continue to own data.
  let activePage = null;
  function pageHost(element) {
    let host = element;
    if (host.tagName !== 'SECTION') {
      const section = document.createElement('section');
      [...host.attributes].forEach(a => section.setAttribute(a.name, a.value));
      section.removeAttribute('data-ui-bound');
      section.append(...host.childNodes); host.replaceWith(section); host = section;
    }
    host.setAttribute('role', 'region'); host.removeAttribute('aria-modal');
    host.classList.add('ui-writing-page');
    const viewport = () => {
      host.style.setProperty('--writing-height',(window.visualViewport?.height || innerHeight)+'px');
      host.style.setProperty('--writing-top',(window.visualViewport?.offsetTop || 0)+'px');
    };
    window.visualViewport?.addEventListener('resize',viewport);
    window.visualViewport?.addEventListener('scroll',viewport);
    window.addEventListener('resize',viewport); viewport();
    Object.defineProperty(host, 'open', {get: () => host.hasAttribute('open')});
    const heading = () => host.querySelector('h2')?.textContent || '등록';
    function busy() { return Boolean(host.querySelector('[type=submit]:disabled') || host.dataset.submitting === 'true'); }
    function requestClose() {
      if (busy()) return;
      const cancel = new Event('cancel', {cancelable:true});
      if (host.dispatchEvent(cancel)) host.close();
    }
    host.showModal = host.show = () => {
      if (host.open) return;
      if (activePage) return;
      const opener = document.activeElement;
      const returnURL = location.href, returnState = history.state, title = document.title;
      const scroll = [...document.querySelectorAll('#main-section,.admin-main')].map(x => [x,x.scrollTop]);
      const hidden = [];
      // Hide only siblings along the page's ancestry. Supplementary dialogs may
      // still open over the page without losing its input or editor selection.
      let child = host;
      while (child.parentElement) {
        for (const sibling of child.parentElement.children) {
          if (sibling === child || sibling.tagName === 'DIALOG' || sibling.matches('script,style,link,#loading-overlay')) continue;
          hidden.push([sibling,sibling.inert,sibling.getAttribute('aria-hidden')]); sibling.classList.add('ui-writing-covered');
          sibling.inert = true; sibling.setAttribute('aria-hidden','true');
        }
        if (child.parentElement === document.body) break;
        child = child.parentElement;
      }
      activePage = {host, returnURL, returnState, title, opener, scroll, hidden, requestClose};
      const url = new URL(returnURL); url.searchParams.set('write', host.id);
      history.pushState({...returnState, writingPage:host.id}, '', url);
      document.title = heading() + ' · DailyNote';
      document.body.classList.add('ui-writing-open');
      host.setAttribute('open',''); host.setAttribute('aria-hidden','false'); host.classList.add('open');
      host.querySelector('.ui-writing-paper,.memo-paper')?.scrollTo(0,0);
      requestAnimationFrame(() => host.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,[contenteditable],button')?.focus({preventScroll:true}));
    };
    host.close = () => {
      if (!host.open) return;
      const state = activePage;
      host.removeAttribute('open'); host.classList.remove('open'); host.setAttribute('aria-hidden','true');
      document.body.classList.remove('ui-writing-open','modal-open');
      if (state?.host === host) {
        activePage = null;
        if (history.state?.writingPage === host.id) history.replaceState(state.returnState, '', state.returnURL);
        document.title = state.title;
        for (const [node,inert,aria] of state.hidden) { node.classList.remove('ui-writing-covered'); node.inert = inert; if (aria === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden',aria); }
        requestAnimationFrame(() => { state.scroll.forEach(([node,top]) => node.scrollTop = top); if (!activePage && !document.querySelector('dialog[open]') && state.opener?.isConnected) state.opener.focus({preventScroll:true}); });
      }
      host.dispatchEvent(new Event('close'));
    };
    host.addEventListener('click', e => {
      if (e.target.closest('.ui-writing-left button:first-child,#memo-close,[data-close-dialog],#modal-cancel-btn,#notification-reset')) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!busy()) history.back();
      }
    }, true);
    document.addEventListener('keydown', e => {
      if (!host.open || document.querySelector('dialog[open]') || e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation(); if (!busy()) history.back();
    }, true);
    return host;
  }
  window.addEventListener('popstate', e => {
    if (!activePage) {
      // An old completed form history entry never reopens a stale draft.
      if (e.state?.writingPage) {
        const url = new URL(location.href); url.searchParams.delete('write');
        const state = {...e.state}; delete state.writingPage; history.replaceState(state,'',url);
      }
      return;
    }
    e.stopImmediatePropagation();
    const page = activePage;
    page.requestClose();
    if (activePage === page) {
      // Busy forms and asynchronous memo saves retain their current draft route.
      const url = new URL(page.returnURL); url.searchParams.set('write',page.host.id);
      history.pushState({...page.returnState,writingPage:page.host.id},'',url);
    }
  }, true);
  // Reloads return safely to the source menu. Unsaved forms are not shareable URLs.
  if (new URL(location.href).searchParams.has('write')) {
    const url = new URL(location.href); url.searchParams.delete('write');
    const state = {...history.state}; delete state.writingPage; history.replaceState(state,'',url);
  }

  function writingForm({id, formId, headerSelector, closeSelector, nativeHistory=false, recordHistory=true}) {
    let host = $(id); const form = $(formId);
    if (!host || !form || host.dataset.writingBound) return;
    host = pageHost(host);
    host.dataset.writingBound = 'true'; host.classList.add('ui-writing-screen');
    // Boards already own their content/attachment history through EditorCore.
    if (nativeHistory && form.querySelector('#board-undo')) {
      host.querySelector(headerSelector).classList.add('ui-writing-header');
      host.querySelector('.editor-history').classList.add('ui-writing-left');
      host.querySelector('.editor-paper').classList.add('ui-writing-paper');
      form.addEventListener('focusin', () => { host.dataset.editing='true'; });
      form.addEventListener('focusout', () => queueMicrotask(() => { if(!form.contains(document.activeElement))host.dataset.editing='false'; }));
      new MutationObserver(() => { if(!host.open)host.dataset.editing='false'; }).observe(host,{attributes:true,attributeFilter:['open']});
      return;
    }
    const container = host.querySelector('.modal-dialog') || host;
    const header = host.querySelector(headerSelector), closer = host.querySelector(closeSelector);
    header.classList.add('ui-writing-header');
    const heading = header.querySelector('h2');
    const left = document.createElement('div'), right = document.createElement('div');
    left.className = 'ui-writing-left'; right.className = 'ui-writing-right';
    closer.querySelector(':scope > .app-icon')?.remove(); closer.dataset.icon = 'back'; closer.setAttribute('aria-label', '목록으로 돌아가기'); closer.classList.add('shell-icon');
    left.append(closer);
    const undo = nativeHistory ? form.querySelector('[data-board-command=undo]') : icon('undo','실행 취소');
    const redo = nativeHistory ? form.querySelector('[data-board-command=redo]') : icon('redo','다시 실행');
    [undo,redo].forEach((b,i) => { b.classList.add('shell-icon'); b.dataset.icon = i ? 'redo' : 'undo'; b.textContent = ''; if (recordHistory) left.append(b); });
    // Keep the submit inside the form: existing adapters query it and own validation/saving.
    const save = form.querySelector('[type=submit]'); right.append(save);
    header.replaceChildren(left,heading,right);
    if (form.contains(header)) header.remove();
    const paper = document.createElement('div'); paper.className = 'ui-writing-paper';
    [...form.children].forEach(x => paper.append(x));
    form.append(header,paper); container.append(form);
    host.querySelectorAll('.admin-card').forEach(x => { if (!x.children.length) x.remove(); });
    form.querySelectorAll('.journal-dialog-actions,.admin-actions,.modal-actions').forEach(x => x.classList.add('ui-writing-secondary'));
    const toolbar = form.querySelector('.board-toolbar');
    if (toolbar) {
      toolbar.classList.add('ui-writing-tools'); form.append(toolbar);
      form.addEventListener('focusin', e => { if (e.target.closest('[contenteditable],input,textarea,.ui-writing-tools,.ui-writing-left')) host.dataset.editing = 'true'; });
      form.addEventListener('focusout', () => queueMicrotask(() => {
        if (!form.contains(document.activeElement)) host.dataset.editing = 'false';
      }));
      // Toolbar interactions retain the text selection when moved out of the paper.
      left.addEventListener('mousedown', e => { if (e.target.closest('[data-board-command]')) e.preventDefault(); });
    }
    const viewport = () => {
      const v = window.visualViewport;
      host.style.setProperty('--writing-height', (v?.height || innerHeight) + 'px');
      host.style.setProperty('--writing-top', (v?.offsetTop || 0) + 'px');
    };
    window.visualViewport?.addEventListener('resize', viewport); window.visualViewport?.addEventListener('scroll', viewport);
    window.addEventListener('resize', viewport); viewport();
    const fields = [...form.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=password]),textarea,select')];
    let history = [], cursor = -1, restoring = false;
    const snapshot = () => fields.map(x => x.type === 'checkbox' ? x.checked : x.value);
    const busy = () => save.disabled;
    function update() { if (!nativeHistory) { const a=cursor<=0||busy(),b=cursor>=history.length-1||busy(); if(undo.disabled!==a)undo.disabled=a; if(redo.disabled!==b)redo.disabled=b; } }
    function checkpoint() {
      if (nativeHistory || !recordHistory || restoring) return;
      const state = snapshot();
      if (JSON.stringify(state) === JSON.stringify(history[cursor])) return;
      history = history.slice(0,cursor+1); history.push(state); if (history.length > 100) history.shift(); cursor = history.length-1; update();
    }
    function travel(step) {
      if (busy() || cursor+step < 0 || cursor+step >= history.length) return;
      cursor += step; restoring = true;
      fields.forEach((x,i) => { if (x.type === 'checkbox') x.checked = history[cursor][i]; else x.value = history[cursor][i]; x.dispatchEvent(new Event('input',{bubbles:true})); });
      restoring = false; update();
    }
    if (!nativeHistory) { undo.onclick = () => travel(-1); redo.onclick = () => travel(1); form.addEventListener('input',checkpoint); form.addEventListener('change',checkpoint); }
    host.addEventListener('close', () => { history=[]; cursor=-1; update(); });
    new MutationObserver(changes => {
      if (changes.some(x => x.attributeName === 'open' || x.attributeName === 'aria-hidden')) {
        if (host.open || host.classList.contains('open')) { history=[]; cursor=-1; checkpoint(); host.dataset.editing='false'; viewport(); }
      }
      update();
    }).observe(host,{attributes:true,subtree:true,attributeFilter:['open','aria-hidden','disabled']});
    window.AppIcons?.render(host);
  }
  writingForm({id:'board-editor',formId:'board-form',headerSelector:'.journal-dialog-header',closeSelector:'[data-board-close=board-editor]',nativeHistory:true});
  writingForm({id:'notification-dialog',formId:'notification-form',headerSelector:'.admin-dialog-header',closeSelector:'[data-close-dialog=notification-dialog]'});
  writingForm({id:'worklog-modal',formId:'worklog-form',headerSelector:'.modal-header',closeSelector:'#modal-close-btn'});
  writingForm({id:'calendar-event-dialog',formId:'calendar-event-form',headerSelector:'.journal-dialog-header',closeSelector:'#calendar-event-close'});
  writingForm({id:'harness-dialog',formId:'harness-form',headerSelector:'.admin-dialog-header',closeSelector:'#harness-dialog-close'});
  writingForm({id:'board-manage-dialog',formId:'board-manage-form',headerSelector:'.journal-dialog-header',closeSelector:'#board-manage-close'});
  writingForm({id:'user-dialog',formId:'user-form',headerSelector:'.admin-dialog-header',closeSelector:'[data-close-dialog=user-dialog]'});
  writingForm({id:'admin-upload-dialog',formId:'admin-upload-form',headerSelector:'.admin-dialog-header',closeSelector:'[data-close-dialog=admin-upload-dialog]',recordHistory:false});
  writingForm({id:'upload-dialog',formId:'upload-form',headerSelector:'.journal-dialog-header',closeSelector:'#upload-close'});
  const memo = $('memo-editor') ? pageHost($('memo-editor')) : null;
  if (memo) {
    memo.classList.add('ui-writing-screen','ui-writing-memo');
    const viewport=()=>{memo.style.setProperty('--writing-height',(window.visualViewport?.height||innerHeight)+'px');memo.style.setProperty('--writing-top',(window.visualViewport?.offsetTop||0)+'px');};
    window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);viewport();
  }
  window.WritingForms = {register:writingForm};
})();


