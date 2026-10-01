(function(){
  const menus=UIConfig.menus.user,panels=Object.fromEntries(menus.map(menu=>[menu.id,document.getElementById(menu.panel)]));
  const detail=document.getElementById('view-notification-detail'),back=document.getElementById('notification-back'),opener=document.getElementById('sidebar-open');
  const controls=['board-search','board-more','board-create','open-calendar-search-btn','open-calendar-more-btn','open-calendar-btn','open-search-btn','open-worklog-btn','open-upload-btn','open-memo-btn','open-memo-search-btn'].map(id=>document.getElementById(id));
  const scroll=ListScroll.mount(document.getElementById('main-section'));
  let user=null,allowed=[],ready=false,revision=0;
  scroll.setRefresh(async()=>{
    const route=location.hash.slice(1),key=route.split('/')[0];
    const notice=route.match(/^notifications\/(\d+)$/),ref=route.match(/^(files|memos|worklogs)\/([1-9]\d*)$/);
    if(notice)return window.NotificationPage.load(notice[1],true);
    if(ref)return window.References.loadDetail(ref[1],ref[2],true);
    if(key==='calendar')return window.CalendarApp.refresh();
    if(key==='memos')return window.MemoApp.refresh();
    if(key==='boards')return window.BoardApp.refresh();
    if(key==='files')return loadFiles(true);
    if(key==='notifications')return loadNoti(true);
    if(key==='worklogs'){await loadList(currentFilterDate,true);window.WorklogSearch?.refresh();}
  },()=>ready&&!document.querySelector('[data-todo-saving],[data-todo-editing]'));
  function openReference(hash){
    history.replaceState({...history.state,referenceScroll:scroll.top},'',location.href);
    history.pushState({referenceReturn:location.hash},'',hash);
    show();
  }
  function goBack(){
    if(/^#boards\/\d+\/posts\/\d+$/.test(location.hash)){location.hash=location.hash.split('/').slice(0,2).join('/');return;}
    if(history.state?.referenceReturn){history.back();return;}
    location.hash=location.hash.match(/^(?:#)(files|memos|worklogs)\//)?.[1]||'notifications';
  }
  const drawer=UIShell.drawer({nav:document.getElementById('app-sidebar'),opener,closer:document.getElementById('sidebar-close'),scrim:document.getElementById('sidebar-scrim'),select:'[data-view]'});
  function show(){
    if(!ready)return;
    revision++;
    AppLoading.clear();
    AppLoading.run('화면을 불러오는 중입니다…',()=>new Promise(requestAnimationFrame));
    scroll.capture();
    document.getElementById('change-password-link').href='/change-password.html?returnTo='+encodeURIComponent(location.pathname+location.hash);
    const route=location.hash.slice(1),boardRoute=/^boards(?:\/\d+(?:\/posts\/\d+)?)?$/.test(route),boardDetail=/^boards\/\d+\/posts\/\d+$/.test(route),detailId=route.match(/^notifications\/(\d+)$/)?.[1],ref=route.match(/^(files|memos|worklogs)\/([1-9]\d*)$/);
    let key=boardRoute?'boards':ref?ref[1]:detailId?'notifications':route;if(!ref&&!allowed.includes(key))key=allowed[0];
    const isNotice=Boolean(detailId&&key==='notifications'),isDetail=isNotice||Boolean(ref);
    Object.entries(panels).forEach(([id,panel])=>panel.hidden=isDetail||id!==key);detail.hidden=!isNotice;window.References.panel.hidden=!ref;back.hidden=!(isDetail||(boardDetail&&key==='boards'));opener.hidden=isDetail||(boardDetail&&key==='boards');
    document.querySelectorAll('[data-view]').forEach(node=>{if(node.dataset.view===key)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});
    UIShell.title(document.getElementById('shell-title'),isDetail?(ref?'참조 상세':'공지 상세'):menus.find(menu=>menu.id===key)?.title||'DailyNote');
    document.querySelector('.ui-header').classList.toggle('calendar-header',key==='calendar'&&!isDetail);
    UIShell.actions('user',isDetail?'detail':key,user.permissions||{},controls);
    document.getElementById('no-access').hidden=allowed.length>0;
    if(isNotice)window.NotificationPage?.load(detailId);else window.NotificationPage?.cancel();
    if(ref)window.References.loadDetail(ref[1],ref[2]);else window.References.cancelDetail();
    const canonical=boardRoute&&key==='boards'?route:ref?ref[0]:isNotice?'notifications/'+detailId:key;if(canonical&&location.hash!=='#'+canonical)history.replaceState(null,'','#'+canonical);
    window.JournalControls?.close();drawer.close();window.MemoApp?.activate(key,user);window.CalendarApp?.activate(key,user);window.BoardApp?.activate(key,user);
    window.DataTools?.activate();
    scroll.activate(canonical||'empty',!isDetail?history.state?.referenceScroll:undefined);
    if(isDetail){document.getElementById('shell-title').setAttribute('tabindex','-1');document.getElementById('shell-title').focus();}
  }
  document.querySelectorAll('[data-view]').forEach(node=>node.addEventListener('click',event=>{event.preventDefault();if(!allowed.includes(node.dataset.view))return;if(location.hash==='#'+node.dataset.view)show();else location.hash=node.dataset.view;}));
  back.addEventListener('click',goBack);window.addEventListener('hashchange',show);
  window.addEventListener('popstate',event=>{if(!event.state?.referenceImage)show();});
  const list=document.getElementById('noti-list');new MutationObserver(()=>{const count=list.querySelectorAll('.notification-item.unread').length,badge=document.getElementById('notification-count');badge.textContent=count;badge.hidden=!count;}).observe(list,{childList:true,subtree:true});
  window.AppShell={scroll,get revision(){return revision;},refresh:show,openReference,goBack,get user(){return user;},configure(value){user=value;window.DataTools?.configure(value);window.References.configure(value);allowed=UIConfig.allowed('user',user.permissions||{}).map(menu=>menu.id);document.querySelectorAll('[data-view]').forEach(node=>node.hidden=!allowed.includes(node.dataset.view));document.getElementById('board-nav-caption').hidden=!allowed.includes('boards');window.AccountMenu.configure(user);ready=true;show();},reset(){window.DataTools?.reset();revision++;AppLoading.clear();window.AccountMenu.reset();scroll.reset();window.CalendarApp?.reset();window.References.reset();window.MemoApp?.reset();window.BoardApp?.reset();ready=false;user=null;allowed=[];window.NotificationPage?.cancel();drawer.close();window.JournalControls?.close();}};
  UIShell.dialogs();
})();

