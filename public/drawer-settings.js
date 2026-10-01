(function(){
  // A modal lives outside the drawer so it remains focusable above the drawer.
  function mount({nav,guide=false}){
    const opener=nav.querySelector('[data-settings-open]');
    const dialog=document.createElement('dialog');dialog.id='drawer-settings-dialog';dialog.className='ui-settings-dialog';dialog.setAttribute('aria-labelledby','drawer-settings-title');
    const header=document.createElement('div');header.className='journal-dialog-header';
    const title=document.createElement('h2');title.id='drawer-settings-title';title.textContent='설정';
    const closer=document.createElement('button');closer.type='button';closer.className='shell-icon';closer.dataset.icon='close';closer.setAttribute('aria-label','설정 닫기');
    header.append(title,closer);dialog.append(header);
    const items=document.createElement('div');items.className='ui-settings-items';
    const links=[['시작 가이드','onboarding.html','journal'],['바로가기 만들기','local-start.html','download']];
    if(guide)links.push(['디자인 하네스','design-harness.html','appearance'],['로고 하네스','brand-harness.html','appearance']);
    else links.push(['비밀번호 변경','change-password.html?returnTo='+encodeURIComponent(location.pathname+location.hash),'password']);
    links.forEach(([label,href,icon])=>{const link=document.createElement('a');link.href=href;link.textContent=label;link.dataset.icon=icon;items.append(link);});
    dialog.append(items);document.body.append(dialog);UIShell.dialogs();
    function close(){dialog.close();}
    opener.addEventListener('click',()=>{if(dialog.open)return;dialog.showModal();opener.setAttribute('aria-expanded','true');closer.focus();});
    closer.addEventListener('click',close);
    dialog.addEventListener('close',()=>{opener.setAttribute('aria-expanded','false');if(!nav.inert)opener.focus();});
    return {dialog,close};
  }
  window.DrawerSettings={mount};
})();
