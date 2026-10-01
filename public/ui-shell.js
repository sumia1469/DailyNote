(function(){
  function title(node,text){node.textContent=text;document.title=text+' · DailyNote';}
  function actions(scope,key,permissions,buttons){document.querySelector('.ui-header')?.classList.toggle('ui-header-wide',UIConfig.actions(scope,key,permissions).length>=3);buttons.forEach(button=>button.hidden=true);UIConfig.actions(scope,key,permissions).forEach(action=>{const button=document.getElementById(action.id);if(!button)return;button.hidden=false;button.setAttribute('aria-label',action.label);button.title=action.label;button.dataset.icon=action.kind==='search'?'search':action.kind==='more'?'more':'plus';});}
  function drawer({nav,opener,closer,scrim,select}){
    function close(restore=false){nav.classList.remove('is-open');nav.inert=true;scrim.hidden=true;opener.setAttribute('aria-expanded','false');document.body.classList.remove('ui-drawer-open');if(restore)opener.focus();}
    opener.addEventListener('click',()=>{nav.inert=false;nav.classList.add('is-open');scrim.hidden=false;opener.setAttribute('aria-expanded','true');document.body.classList.add('ui-drawer-open');closer.focus();});
    closer.addEventListener('click',()=>close(true));scrim.addEventListener('click',()=>close(true));
    nav.addEventListener('click',event=>{if(select&&event.target.closest(select))close(true);});
    document.addEventListener('keydown',event=>{if(!nav.classList.contains('is-open')||document.querySelector?.('dialog[open], .ui-settings-menu:not([hidden])'))return;if(event.key==='Escape')close(true);if(event.key==='Tab'){const nodes=Array.from(nav.querySelectorAll('button,a,input,select')).filter(node=>!node.hidden&&!node.disabled&&node.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
    close();return {close};
  }
  function dialogs(root=document){root.querySelectorAll('dialog').forEach(dialog=>{if(dialog.dataset.uiBound)return;dialog.dataset.uiBound='true';dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){if(!dialog.querySelector('[type=submit]:disabled'))dialog.close();}});dialog.addEventListener('cancel',event=>{if(dialog.querySelector('[type=submit]:disabled'))event.preventDefault();});});}
  // Search dialogs share the same open/apply/reset lifecycle across menu adapters.
  function searchDialog({dialog,opener,closer,form,resetter,read,write,defaults,onApply}){
    let applied={...defaults};
    function open(){write({...applied});dialog.showModal();}
    function apply(value){applied={...value};onApply({...applied});dialog.close();opener.focus();}
    function reset(){write({...defaults});apply(defaults);}
    opener.addEventListener('click',open);
    closer.addEventListener('click',()=>dialog.close());
    form.addEventListener('submit',event=>{event.preventDefault();apply(read());});
    resetter.addEventListener('click',reset);
    return {open,reset,get value(){return {...applied};}};
  }
  function settingsMenu({opener,id,links,canOpen=()=>true,beforeOpen=()=>{}}){
    const nav=opener.closest('.app-sidebar,.admin-nav');
    const menu=document.createElement('div');menu.id=id;menu.className='ui-settings-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','설정 메뉴');
    links.forEach(({label,href,icon,id:linkId,hidden=false})=>{const link=document.createElement('a');link.textContent=label;link.href=href;link.dataset.icon=icon;link.setAttribute('role','menuitem');link.tabIndex=-1;link.hidden=hidden;if(linkId)link.id=linkId;menu.append(link);});
    nav.append(menu);opener.setAttribute('aria-haspopup','menu');opener.setAttribute('aria-controls',id);opener.setAttribute('aria-expanded','false');
    const items=()=>Array.from(menu.querySelectorAll('a')).filter(link=>!link.hidden);
    function place(){if(menu.hidden)return;const anchor=opener.getBoundingClientRect(),frame=nav.getBoundingClientRect();menu.style.maxHeight=Math.max(44,frame.height-24)+'px';const box=menu.getBoundingClientRect();menu.style.left=Math.max(frame.left+12,Math.min(anchor.left,frame.right-box.width-12))-frame.left+nav.scrollLeft+'px';menu.style.top=Math.max(frame.top+12,Math.min(anchor.top-box.height-8,frame.bottom-box.height-12))-frame.top+nav.scrollTop+'px';}
    function close(restore=true){if(menu.hidden)return;menu.hidden=true;opener.setAttribute('aria-expanded','false');if(restore&&!nav.inert)opener.focus();}
    function open(last=false){if(!canOpen()||nav.inert)return;beforeOpen();menu.hidden=false;opener.setAttribute('aria-expanded','true');place();const choices=items();(last?choices.at(-1):choices[0])?.focus();}
    opener.addEventListener('click',()=>menu.hidden?open():close());
    opener.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(event.key==='ArrowUp');}});
    menu.addEventListener('click',event=>{if(event.target.closest('a'))close(false);});
    document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!opener.contains(event.target))close();});
    document.addEventListener('keydown',event=>{if(menu.hidden)return;const choices=items(),index=choices.indexOf(document.activeElement);let next;if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();close();return;}if(event.key==='ArrowDown')next=(index+1)%choices.length;else if(event.key==='ArrowUp')next=(index-1+choices.length)%choices.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=choices.length-1;if(next!==undefined){event.preventDefault();choices[next]?.focus();}});
    nav.addEventListener('scroll',place);window.addEventListener('resize',place);
    new MutationObserver(()=>{if(nav.inert||!nav.classList.contains('is-open'))close(false);}).observe(nav,{attributes:true,attributeFilter:['inert','class']});
    return {menu,open,close};
  }
  // Compatibility adapter for existing board action dialogs: use a nonmodal menu.
  function actionMenu(dialog,opener){
    dialog._menuOpener=opener;
    if(!dialog.dataset.actionMenuBound){
      dialog.dataset.actionMenuBound='true';
      dialog.addEventListener('close',()=>{dialog._menuOpener?.setAttribute('aria-expanded','false');dialog._menuOpener?.focus();});
      dialog.addEventListener('keydown',event=>{const items=Array.from(dialog.querySelectorAll('button:not([hidden]),a:not([hidden])')).filter(item=>!item.disabled),index=items.indexOf(document.activeElement);let next;if(event.key==='Escape'){event.preventDefault();dialog.close();return;}if(event.key==='ArrowDown')next=(index+1)%items.length;else if(event.key==='ArrowUp')next=(index-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;if(next!==undefined){event.preventDefault();items[next]?.focus();}});
      document.addEventListener('pointerdown',event=>{if(dialog.open&&!dialog.contains(event.target)&&!dialog._menuOpener?.contains(event.target))dialog.close();});
    }
    opener.setAttribute('aria-haspopup','menu');opener.setAttribute('aria-expanded','true');dialog.setAttribute('role','menu');
    dialog.querySelectorAll('button,a').forEach(item=>item.setAttribute('role','menuitem'));
    if(!dialog.open)dialog.show();
    dialog.style.position='fixed';dialog.style.inset='auto';dialog.style.margin='0';
    const anchor=opener.getBoundingClientRect(),box=dialog.getBoundingClientRect();
    dialog.style.left=Math.max(12,Math.min(anchor.right-box.width,innerWidth-box.width-12))+'px';
    dialog.style.top=Math.max(12,Math.min(anchor.bottom+8,innerHeight-box.height-12))+'px';
    dialog.querySelector('button:not([hidden]):not(:disabled),a:not([hidden])')?.focus();
  }
  window.UIShell={title,actions,drawer,dialogs,searchDialog,settingsMenu,actionMenu};
})();


