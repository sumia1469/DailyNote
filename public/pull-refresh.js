(function () {
  'use strict';
  const instances = new WeakMap();
  let jobs = 0;
  const ignored = 'input,textarea,select,button,a,[contenteditable],[data-todo-drag],.todo-drag-handle';
  function mount(viewport) {
    if (!viewport) return null;
    if (instances.has(viewport)) return instances.get(viewport);
    let refresh, enabled = () => true, route, gesture, running = false, version = 0, timer;
    const indicator = document.createElement('div');
    indicator.className = 'ui-pull-refresh'; indicator.hidden = true;
    indicator.setAttribute('role', 'status'); indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = '<span class="ui-pull-refresh-icon" aria-hidden="true">↻</span><span class="ui-pull-refresh-text"></span>';
    document.body.append(indicator);
    const icon = indicator.firstElementChild, label = indicator.lastElementChild;
    viewport.classList.add('ui-pull-refresh-viewport');
    function blocked() {
      return !refresh || !enabled() || running || viewport.hidden || viewport.inert || !viewport.getClientRects().length ||
        window.AppLoading?.pending > 0 || document.body.matches('.ui-writing-open,.ui-drawer-open,.modal-open,.todo-drag-active') ||
        Boolean(document.querySelector('dialog[open],.ui-settings-menu:not([hidden]),.todo-inline-input'));
    }
    function hide() { gesture = null; indicator.hidden = true; indicator.classList.remove('is-refreshing'); }
    function display(distance, text) {
      const rect = viewport.getBoundingClientRect();
      indicator.style.left = Math.max(0, rect.left) + 'px'; indicator.style.width = rect.width + 'px';
      indicator.style.top = Math.max(0, rect.top) + (parseFloat(getComputedStyle(viewport).paddingTop) || 0) + 'px';
      indicator.style.setProperty('--pull-distance', Math.min(distance, 88) + 'px');
      icon.style.transform = 'rotate(' + distance * 4 + 'deg)'; label.textContent = text; indicator.hidden = false;
    }
    function nested(target) {
      for (let node = target; node && node !== viewport; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
      }
      return false;
    }
    function start(event) {
      if (event.touches.length !== 1) { if (!running) hide(); return; }
      if (event.touches.length !== 1 || viewport.scrollTop > 0 || blocked() || event.target.closest(ignored) || nested(event.target)) return;
      clearTimeout(timer); hide();
      const touch = event.touches[0]; gesture = {x:touch.clientX,y:touch.clientY,id:touch.identifier,distance:0,version};
    }
    function move(event) {
      if (!gesture) return;
      if (event.touches.length !== 1 || blocked() || gesture.version !== version || viewport.scrollTop > 0) { hide(); return; }
      const touch = event.touches[0], dx = Math.abs(touch.clientX - gesture.x), dy = touch.clientY - gesture.y;
      if (touch.identifier !== gesture.id || dx > Math.max(12, Math.abs(dy) * .7) || dy < -8) { hide(); return; }
      if (dy <= 8) { gesture.distance = 0; indicator.hidden = true; return; }
      if (!event.cancelable) { hide(); return; }
      event.preventDefault(); gesture.distance = Math.max(0, (dy - 8) * .5);
      display(gesture.distance, gesture.distance >= 72 ? '놓으면 새로고침' : '당겨서 새로고침');
    }
    async function execute() {
      if (blocked()) return false;
      const current = version;
      running = true; jobs++; gesture = null; display(72, '새로고침 중…'); indicator.classList.add('is-refreshing');
      try { await refresh(); if (current === version) label.textContent = '새로고침 완료'; return true; }
      catch (error) { if (current === version) label.textContent = '새로고침 실패 · 다시 당겨 주세요'; return false; }
      finally {
        running = false; jobs--; indicator.classList.remove('is-refreshing');
        if (current === version) timer = setTimeout(hide, 900); else hide();
      }
    }
    function end(event) { if (event.touches.length) { if (!running) hide(); return; } const ready = gesture?.distance >= 72; gesture = null; if (ready) execute(); else if (!running) hide(); }
    viewport.addEventListener('touchstart', start, {passive:true});
    viewport.addEventListener('touchmove', move, {passive:false});
    viewport.addEventListener('touchend', end, {passive:true});
    viewport.addEventListener('touchcancel', hide, {passive:true});
    const api = {configure(action, canRefresh = () => true) { refresh = action; enabled = canRefresh; },
      activate(key) { if (key !== route) { route = key; version++; clearTimeout(timer); hide(); } },
      reset() { version++; route = undefined; clearTimeout(timer); hide(); }, refresh:execute};
    window.addEventListener('pagehide', api.reset);
    instances.set(viewport, api); return api;
  }
  window.PullRefresh = {mount, get refreshing() { return jobs > 0; }};
})();
