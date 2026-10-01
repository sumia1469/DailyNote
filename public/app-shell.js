(function(){
  const menus=UIConfig.menus.user,panels=Object.fromEntries(menus.map(menu=>[menu.id,document.getElementById(menu.panel)]));
  const detail=document.getElementById('view-notification-detail'),back=document.getElementById('notification-back'),opener=document.getElementById('sidebar-open');
  const controls=['open-search-btn','open-worklog-btn','open-upload-btn','open-memo-btn','open-memo-search-btn'].map(id=>document.getElementById(id));
  let user=null,allowed=[],ready=false;
  const drawer=UIShell.drawer({nav:document.getElementById('app-sidebar'),opener,closer:document.getElementById('sidebar-close'),scrim:document.getElementById('sidebar-scrim'),select:'[data-view]'});
  function show(){
    if(!ready)return;
    document.getElementById('change-password-link').href='/change-password.html?returnTo='+encodeURIComponent(location.pathname+location.hash);
    const route=location.hash.slice(1),detailId=route.match(/^notifications\/(\d+)$/)?.[1];
    let key=detailId?'notifications':route;if(!allowed.includes(key))key=allowed[0];
    const isDetail=Boolean(detailId&&key==='notifications');
    Object.entries(panels).forEach(([id,panel])=>panel.hidden=isDetail||id!==key);detail.hidden=!isDetail;back.hidden=!isDetail;opener.hidden=isDetail;
    document.querySelectorAll('[data-view]').forEach(node=>{if(node.dataset.view===key)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});
    UIShell.title(document.getElementById('shell-title'),isDetail?'공지 상세':menus.find(menu=>menu.id===key)?.title||'DailyNote');
    UIShell.actions('user',isDetail?'detail':key,user.permissions||{},controls);
    document.getElementById('no-access').hidden=allowed.length>0;
    if(isDetail)window.NotificationPage?.load(detailId);else window.NotificationPage?.cancel();
    const canonical=isDetail?'notifications/'+detailId:key;if(canonical&&location.hash!=='#'+canonical)history.replaceState(null,'','#'+canonical);
    window.JournalControls?.close();drawer.close();window.MemoApp?.activate(key,user);
    if(isDetail){document.getElementById('shell-title').setAttribute('tabindex','-1');document.getElementById('shell-title').focus();}
  }
  document.querySelectorAll('[data-view]').forEach(node=>node.addEventListener('click',event=>{event.preventDefault();if(!allowed.includes(node.dataset.view))return;if(location.hash==='#'+node.dataset.view)show();else location.hash=node.dataset.view;}));
  back.addEventListener('click',()=>{location.hash='notifications';});window.addEventListener('hashchange',show);
  const list=document.getElementById('noti-list');new MutationObserver(()=>{const count=list.querySelectorAll('.notification-item.unread').length,badge=document.getElementById('notification-count');badge.textContent=count;badge.hidden=!count;}).observe(list,{childList:true,subtree:true});
  window.AppShell={configure(value){user=value;allowed=UIConfig.allowed('user',user.permissions||{}).map(menu=>menu.id);document.querySelectorAll('[data-view]').forEach(node=>node.hidden=!allowed.includes(node.dataset.view));document.getElementById('shell-account').textContent=user.username||'내 업무 공간';ready=true;show();},reset(){window.MemoApp?.reset();ready=false;user=null;allowed=[];window.NotificationPage?.cancel();drawer.close();window.JournalControls?.close();}};
  UIShell.dialogs();
})();
