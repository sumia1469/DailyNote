(function(){
  const nav=document.getElementById('guide-navigation');
  const drawer=UIShell.drawer({nav,opener:document.getElementById('guide-menu-toggle'),closer:document.getElementById('guide-menu-close'),scrim:document.getElementById('guide-menu-scrim'),select:'[data-guide-section]'});
  DrawerSettings.mount({nav,guide:true});
  nav.querySelectorAll('[data-guide-section]').forEach(link=>link.addEventListener('click',()=>{
    const section=document.querySelector(link.getAttribute('href'));
    section.setAttribute('tabindex','-1');section.focus({preventScroll:true});section.scrollIntoView({block:'start'});
  }));
  UIShell.dialogs();
})();
