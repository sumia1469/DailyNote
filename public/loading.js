(function () {
  'use strict';
  if (window.AppLoading) return;
  const nativeFetch = window.fetch.bind(window), tasks = new Map();
  let sequence = 0, epoch = 0, timer, shownAt = 0, overlay, locked = false, savedFocus, observer;
  const inertBefore = new Map();
  let bodyOverflow;
  const blockingTasks = () => Array.from(tasks.values()).filter(task => task.blocking);
  function lockNode(node) {
    if (node === overlay || !(node instanceof HTMLElement) || inertBefore.has(node)) return;
    inertBefore.set(node, node.inert); node.inert = true;
  }
  function lock() {
    if (locked) return;
    locked = true; savedFocus = document.activeElement;
    bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    Array.from(document.body.children).forEach(lockNode);
    observer = new MutationObserver(records => records.forEach(record => Array.from(record.addedNodes).forEach(lockNode)));
    observer.observe(document.body, {childList:true});
    overlay.focus({preventScroll:true});
  }
  function unlock() {
    if (!locked) return;
    locked = false; observer?.disconnect();
    inertBefore.forEach((value,node) => { node.inert = value; }); inertBefore.clear();
    document.body.style.overflow = bodyOverflow;
    if (savedFocus?.isConnected && !savedFocus.closest('[inert]')) savedFocus.focus({preventScroll:true});
    savedFocus = null;
  }
  // Capture before application handlers, including browsers without native inert.
  function blockInput(event) {
    if (!locked) return;
    if (event.type === 'focusin') { if (event.target !== overlay) overlay.focus({preventScroll:true}); return; }
    event.preventDefault(); event.stopImmediatePropagation();
  }
  ['click','dblclick','pointerdown','pointerup','mousedown','mouseup','touchstart','touchmove','wheel','keydown','keyup','submit','cancel','focusin'].forEach(type => window.addEventListener(type, blockInput, {capture:true,passive:false}));
  function mount() {
    if (overlay) return overlay;
    overlay = document.getElementById('loading-overlay') || document.getElementById('admin-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay'; overlay.className = 'loading-overlay'; overlay.hidden = true;
      overlay.innerHTML = '<div class="loading-panel" role="status" aria-live="polite" aria-atomic="true"><div class="orbit-spinner" aria-hidden="true">' + Array.from({length:8}, (_,i) => '<span style="--dot:'+i+'"></span>').join('') + '</div><p id="loading-message"></p><small>잠시만 기다려 주세요.</small></div>';
      document.body.append(overlay);
      if (window.LoadingMotion) {
        let motion;
        try { motion = JSON.parse(localStorage.getItem('dailynote-screen-settings') || '{}').loadingMotion; } catch {}
        overlay.querySelector('.loading-panel').classList.add('dn-loading');
        window.LoadingMotion.render(overlay.querySelector('.orbit-spinner'), motion);
      }
    }
    overlay.classList.add('app-loading');
    overlay.tabIndex = -1; overlay.setAttribute('aria-label', '처리 중입니다. 잠시만 기다려 주세요.');
    // A manual popover keeps the blocker above dialogs and writing pages.
    if (typeof overlay.showPopover === 'function') overlay.setAttribute('popover', 'manual');
    return overlay;
  }
  function busy(value) {
    document.querySelectorAll('#main-section,#login-section,.admin-shell,.login-container').forEach(node => {
      if (value) node.setAttribute('aria-busy', 'true'); else node.removeAttribute('aria-busy');
    });
  }
  function hide() {
    if (overlay) { if (typeof overlay.hidePopover === 'function' && overlay.matches(':popover-open')) overlay.hidePopover(); overlay.hidden = true; }
    unlock(); busy(false);
  }
  function begin(message = '불러오는 중입니다…', options = {}) {
    const blocking = options.mode !== 'background' && options.mode !== 'silent';
    const id = ++sequence;
    tasks.set(id, {message,blocking});
    if (blocking) {
      clearTimeout(timer);
      const node = mount();
      if (node.hidden) shownAt = Date.now();
      node.hidden = false; node.querySelector('p').textContent = message;
      if (node.hasAttribute('popover') && !node.matches(':popover-open')) node.showPopover();
      busy(true); lock();
    }
    let ended = false;
    return () => {
      if (ended) return; ended = true;
      if (!tasks.delete(id) || !blocking) return;
      const remaining = blockingTasks();
      if (remaining.length) { overlay.querySelector('p').textContent = remaining.at(-1).message; return; }
      timer = setTimeout(() => { if (!blockingTasks().length) hide(); }, Math.max(100, 360 - (Date.now() - shownAt)));
    };
  }
  async function run(message, action, options = {}) { const finish = begin(message, options); try { return await action(); } finally { finish(); } }
  function clear() { epoch++; tasks.clear(); clearTimeout(timer); hide(); }
  function messageFor(url, method) {
    if (url.includes('/auth/login')) return '로그인 중입니다…';
    if (method === 'DELETE') return '삭제 중입니다…';
    if (method !== 'GET' && url.includes('/upload')) return '파일을 업로드하고 있습니다…';
    if (method !== 'GET') return '저장 중입니다…';
    const name = url.includes('/calendar') ? '캘린더' : url.includes('/memos') ? '메모' : url.includes('/notifications') ? '공지사항' : url.includes('/files') || url.includes('/upload') ? '파일' : url.includes('/worklog') ? '업무일지' : url.includes('/boards') ? '게시판' : '';
    return name ? name + ' 불러오는 중입니다…' : '불러오는 중입니다…';
  }
  async function trackedFetch(input, options = {}) {
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); } catch { return nativeFetch(input, options); }
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    // Polling and editor autosaves keep their existing inline status indicators.
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/') || (method === 'GET' && url.searchParams.get('reminders') === '1') || (url.pathname.startsWith('/api/memos') && ['POST','PUT','PATCH'].includes(method))) return nativeFetch(input, options);
    const {appLoading = 'blocking', ...fetchOptions} = options;
    const mode = method === 'GET' ? appLoading : 'blocking';
    const requestEpoch = epoch, message = messageFor(url.pathname, method), finish = begin(message, {mode});
    try {
      const response = await nativeFetch(input, fetchOptions);
      // Headers can arrive before a large JSON/file body. Hold the indicator through body reads.
      let reading = false;
      const release = setTimeout(() => { if (!reading) finish(); }, 0);
      for (const key of ['json','text','blob','arrayBuffer','formData']) {
        const consume = response[key].bind(response);
        response[key] = async (...args) => {
          reading = true; clearTimeout(release);
          const bodyFinish = requestEpoch === epoch ? begin(message, {mode}) : () => {};
          try { return await consume(...args); } finally { finish(); bodyFinish(); }
        };
      }
      return response;
    } catch (error) { finish(); throw error; }
  }
  window.AppLoading = {begin, run, clear, fetch:trackedFetch, get pending() { return tasks.size; }, get blocking() { return locked; }};
  window.fetch = trackedFetch;
  window.addEventListener('pagehide', clear);
})();

