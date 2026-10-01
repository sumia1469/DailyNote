(function () {
  'use strict';
  if (window.AppLoading) return;
  const nativeFetch = window.fetch.bind(window), tasks = new Map();
  const backgroundTasks = new Set();
  function beginBackground() { const id = ++sequence; backgroundTasks.add(id); return () => backgroundTasks.delete(id); }
  let sequence = 0, epoch = 0, timer, shownAt = 0, overlay;
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
    // A manual popover can appear above native modal dialogs without stealing focus.
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
    busy(false);
  }
  function begin(message = '불러오는 중입니다…') {
    clearTimeout(timer);
    const node = mount(), id = ++sequence;
    tasks.set(id, message);
    if (node.hidden) shownAt = Date.now();
    node.hidden = false;
    node.querySelector('p').textContent = message;
    if (node.hasAttribute('popover') && !node.matches(':popover-open')) node.showPopover();
    busy(true);
    let ended = false;
    return () => {
      if (ended) return; ended = true;
      if (!tasks.delete(id)) return;
      if (tasks.size) { node.querySelector('p').textContent = Array.from(tasks.values()).pop(); return; }
      timer = setTimeout(() => { if (!tasks.size) hide(); }, Math.max(100, 360 - (Date.now() - shownAt)));
    };
  }
  async function run(message, action) { const finish = begin(message); try { return await action(); } finally { finish(); } }
  function clear() { epoch++; tasks.clear(); backgroundTasks.clear(); clearTimeout(timer); hide(); }
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
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/') || url.searchParams.get('reminders') === '1' || (url.pathname.startsWith('/api/memos') && ['POST','PUT','PATCH'].includes(method))) return nativeFetch(input, options);
    const requestEpoch = epoch, message = messageFor(url.pathname, method);
    const start = method === 'GET' && window.PullRefresh?.refreshing ? beginBackground : begin;
    const finish = start(message);
    try {
      const response = await nativeFetch(input, options);
      // Headers can arrive before a large JSON/file body. Hold the indicator through body reads.
      let reading = false;
      const release = setTimeout(() => { if (!reading) finish(); }, 0);
      for (const key of ['json','text','blob','arrayBuffer','formData']) {
        const consume = response[key].bind(response);
        response[key] = async (...args) => {
          reading = true; clearTimeout(release);
          const bodyFinish = requestEpoch === epoch ? start(message) : () => {};
          try { return await consume(...args); } finally { finish(); bodyFinish(); }
        };
      }
      return response;
    } catch (error) { finish(); throw error; }
  }
  window.AppLoading = {begin, run, clear, fetch:trackedFetch, get pending() { return tasks.size + backgroundTasks.size; }};
  window.fetch = trackedFetch;
  window.addEventListener('pagehide', clear);
})();
