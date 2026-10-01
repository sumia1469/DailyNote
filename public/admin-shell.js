(function () {
  const nav = document.querySelector('.admin-nav'), button = document.getElementById('admin-menu-toggle'), scrim = document.getElementById('admin-menu-scrim');
  const media = matchMedia('(max-width:767px)');
  function close(focus) { nav.classList.remove('is-open'); nav.inert = media.matches; scrim.hidden = true; button.setAttribute('aria-expanded','false'); if (focus) button.focus(); }
  button.addEventListener('click', () => { const open = !nav.classList.contains('is-open'); if (!open) {close(true);return;} nav.inert=false; nav.classList.add('is-open'); scrim.hidden=false; button.setAttribute('aria-expanded','true'); nav.querySelector('button:not([hidden])')?.focus(); });
  scrim.addEventListener('click', () => close(true));
  nav.addEventListener('click', e => {if(e.target.closest('button')) close(true);});
  document.addEventListener('keydown', e => {if(!nav.classList.contains('is-open')) return; if(e.key==='Escape')close(true);if(e.key==='Tab'){const items=Array.from(nav.querySelectorAll('button')).filter(n=>!n.hidden);if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}}});
  media.addEventListener('change', () => close()); close();
})();
