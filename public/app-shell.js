(function () {
  const views = {worklogs: document.getElementById('worklog-section'), notifications: document.getElementById('view-notifications'), files: document.getElementById('view-files')};
  const titles = {worklogs:'일일리스트',notifications:'알림',files:'파일관리'};
  let allowed = [], ready = false;
  const sidebar = document.getElementById('app-sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  const opener = document.getElementById('sidebar-open');
  function closeMenu(restoreFocus = false) {
    sidebar.classList.remove('is-open'); scrim.hidden = true; opener.setAttribute('aria-expanded','false');
    sidebar.inert = true;
    if (restoreFocus) opener.focus();
  }
  function show(view) {
    if (!ready) return;
    if (!allowed.includes(view)) view = allowed[0];
    Object.entries(views).forEach(([key, node]) => { node.hidden = key !== view; });
    document.querySelectorAll('[data-view]').forEach(node => { if (node.dataset.view === view) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current'); });
    document.getElementById('shell-title').textContent = titles[view] || 'DailyNote';
    document.title = (titles[view] || 'DailyNote') + ' · DailyNote';
    document.getElementById('no-access').hidden = allowed.length > 0;
    document.getElementById('open-search-btn').hidden = view !== 'worklogs' || !allowed.includes('worklogs') || document.getElementById('worklog-list').hidden;
    document.getElementById('open-worklog-btn').hidden = view !== 'worklogs' || !window.AppShell.canCreate;
    document.getElementById('open-upload-btn').hidden = view !== 'files' || !window.AppShell.canUpload;
    if (view && location.hash !== '#'+view) history.replaceState(null,'','#'+view);
    closeMenu();
  }
  document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click', event => {
    event.preventDefault();
    if (!allowed.includes(node.dataset.view)) return;
    if (location.hash !== '#'+node.dataset.view) location.hash = node.dataset.view; else show(node.dataset.view);
  }));
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  opener.addEventListener('click', () => { sidebar.inert = false; sidebar.classList.add('is-open'); scrim.hidden = false; opener.setAttribute('aria-expanded','true'); document.getElementById('sidebar-close').focus(); });
  document.getElementById('sidebar-close').addEventListener('click', () => closeMenu(true));
  scrim.addEventListener('click', () => closeMenu(true));
  document.addEventListener('keydown', event => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') closeMenu(true);
    if (event.key === 'Tab') {
      const controls = Array.from(sidebar.querySelectorAll('a,button')).filter(node => !node.hidden && node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  const list = document.getElementById('noti-list');
  new MutationObserver(() => {
    const count = list.querySelectorAll('.notification-item.unread').length;
    const badge = document.getElementById('notification-count'); badge.textContent = count; badge.hidden = !count;
  }).observe(list,{childList:true,subtree:true});
  window.AppShell = {
    configure(user) {
      const p = user.permissions || {}, can = key => p[key] !== false;
      allowed = Object.keys(views).filter(key => key === 'worklogs' ? can('worklogRead') || can('worklogCreate') : key === 'files' ? can('fileRead') || can('fileUpload') : can('notificationRead'));
      document.querySelectorAll('[data-view]').forEach(node => { node.hidden = !allowed.includes(node.dataset.view); });
      document.getElementById('open-search-btn').hidden = !can('worklogRead');
      document.getElementById('shell-account').textContent = user.username || '내 업무 공간';
      window.AppShell.canCreate = can('worklogCreate');
      window.AppShell.canUpload = can('fileUpload');
      ready = true; show(location.hash.slice(1));
    },
    reset() { ready = false; allowed = []; closeMenu(); window.JournalControls?.close(); }
  };
  closeMenu();
})();
