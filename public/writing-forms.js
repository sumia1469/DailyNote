(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  function icon(name, label) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'shell-icon'; b.dataset.icon = name;
    b.setAttribute('aria-label', label); b.title = label;
    return b;
  }
  // A shared anchored menu. Its backdrop only catches outside taps; it never blurs the page.
  function actionMenu(menu, opener) {
    menu.classList.add('ui-action-menu');
    opener.setAttribute('aria-haspopup', 'menu'); opener.setAttribute('aria-expanded', 'true');
    const items = [...menu.querySelectorAll('button,a')].filter(x => !x.closest('.journal-dialog-header'));
    items.forEach(x => x.setAttribute('role', 'menuitem'));
    function place() {
      const v = window.visualViewport, left = v?.offsetLeft || 0, top = v?.offsetTop || 0;
      const width = v?.width || innerWidth, height = v?.height || innerHeight;
      const r = opener.getBoundingClientRect(), gap = 8;
      menu.style.maxHeight = Math.max(80, height - 24) + 'px';
      menu.style.left = Math.max(left + 12, Math.min(left + width - menu.offsetWidth - 12, r.right - menu.offsetWidth)) + 'px';
      const below = r.bottom + gap;
      const y = below + menu.offsetHeight <= top + height - 12 ? below : r.top - menu.offsetHeight - gap;
      menu.style.top = Math.max(top + 12, Math.min(top + height - menu.offsetHeight - 12, y)) + 'px';
    }
    if (!menu.dataset.menuBound) {
      menu.dataset.menuBound = 'true';
      menu.addEventListener('keydown', e => {
        const nodes = [...menu.querySelectorAll('[role=menuitem]')].filter(x => !x.disabled && !x.hidden);
        let i = nodes.indexOf(document.activeElement), next;
        if (e.key === 'ArrowDown') next = (i + 1) % nodes.length;
        if (e.key === 'ArrowUp') next = (i - 1 + nodes.length) % nodes.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = nodes.length - 1;
        if (next !== undefined) { e.preventDefault(); e.stopImmediatePropagation(); nodes[next]?.focus(); }
      }, true);
    }
    menu.showModal(); place();
    window.addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place);
    menu.addEventListener('close', () => {
      window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place);
      opener.setAttribute('aria-expanded', 'false');
      requestAnimationFrame(() => { if (!document.querySelector('dialog[open]') && opener.isConnected) opener.focus({preventScroll:true}); });
    }, {once:true});
    window.AppIcons?.render(menu);
  }
  UIShell.actionMenu = actionMenu;

  function writingForm({id, formId, headerSelector, closeSelector, nativeHistory=false}) {
    const host = $(id), form = $(formId);
    if (!host || !form || host.dataset.writingBound) return;
    host.dataset.writingBound = 'true'; host.classList.add('ui-writing-screen');
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
    [undo,redo].forEach((b,i) => { b.classList.add('shell-icon'); b.dataset.icon = i ? 'redo' : 'undo'; b.textContent = ''; left.append(b); });
    // Keep the submit inside the form: existing adapters query it and own validation/saving.
    const save = form.querySelector('[type=submit]'); right.append(save);
    header.replaceChildren(left,heading,right);
    if (form.contains(header)) header.remove();
    const paper = document.createElement('div'); paper.className = 'ui-writing-paper';
    [...form.children].forEach(x => paper.append(x));
    form.append(header,paper); container.append(form);
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
    const fields = [...form.querySelectorAll('input:not([type=hidden]):not([type=file]),textarea,select')];
    let history = [], cursor = -1, restoring = false;
    const snapshot = () => fields.map(x => x.type === 'checkbox' ? x.checked : x.value);
    const busy = () => save.disabled;
    function update() { if (!nativeHistory) { const a=cursor<=0||busy(),b=cursor>=history.length-1||busy(); if(undo.disabled!==a)undo.disabled=a; if(redo.disabled!==b)redo.disabled=b; } }
    function checkpoint() {
      if (nativeHistory || restoring) return;
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
  const memo = $('memo-editor');
  if (memo) {
    memo.classList.add('ui-writing-screen','ui-writing-memo');
    const viewport=()=>{memo.style.setProperty('--writing-height',(window.visualViewport?.height||innerHeight)+'px');memo.style.setProperty('--writing-top',(window.visualViewport?.offsetTop||0)+'px');};
    window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);viewport();
  }
  window.WritingForms = {register:writingForm};
})();
