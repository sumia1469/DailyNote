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
  // Action menus are nonmodal, anchored dropdowns. Forms retain modal dialogs.
  let currentMenu=null;
  function menuItems(menu){return [...menu.querySelectorAll('button,a[href],select,input')].filter(n=>!n.disabled&&!n.hidden&&n.getClientRects().length);}
  function closeDropdown(restore=false){
    if(!currentMenu)return;
    const {menu,opener}=currentMenu;currentMenu=null;
    if(menu instanceof HTMLDialogElement){if(menu.open)menu.close();}else menu.hidden=true;
    opener.setAttribute('aria-expanded','false');
    if(restore&&opener.isConnected)opener.focus({preventScroll:true});
  }
  function openDropdown(menu,opener){
    if(currentMenu?.menu===menu&&currentMenu.opener===opener){closeDropdown(true);return;}
    bindDropdownEvents();closeDropdown();menu.classList.add('ui-dropdown');
    menu.setAttribute('role','menu');menu.setAttribute('aria-modal','false');
    opener.setAttribute('aria-haspopup','menu');opener.setAttribute('aria-controls',menu.id);opener.setAttribute('aria-expanded','true');
    menu.hidden=false;
    if(menu instanceof HTMLDialogElement)menu.show();
    currentMenu={menu,opener};
    const viewport=window.visualViewport, left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
    const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
    menu.style.maxHeight=Math.max(44,height-24)+'px';
    const r=opener.getBoundingClientRect(),m=menu.getBoundingClientRect();
    menu.style.left=Math.max(left+12,Math.min(left+width-m.width-12,r.right-m.width))+'px';
    const y=r.bottom+6+m.height<=top+height-12?r.bottom+6:r.top-m.height-6;
    menu.style.top=Math.max(top+12,Math.min(top+height-m.height-12,y))+'px';
    menuItems(menu).forEach(n=>{if(n.matches('button,a'))n.setAttribute('role','menuitem');if(n.matches('input[type=checkbox]')){n.setAttribute('role','menuitemcheckbox');n.setAttribute('aria-checked',String(n.checked));if(!n.dataset.menuCheckboxBound){n.dataset.menuCheckboxBound='true';n.addEventListener('change',()=>n.setAttribute('aria-checked',String(n.checked)));}}});
    menuItems(menu)[0]?.focus({preventScroll:true});
    if(!menu.dataset.dropdownBound){menu.dataset.dropdownBound='true';menu.addEventListener('close',()=>{if(currentMenu?.menu===menu&&!menu.open)closeDropdown();});}
  }
  let dropdownEventsBound=false;
  function bindDropdownEvents(){if(dropdownEventsBound)return;dropdownEventsBound=true;
  document.addEventListener('pointerdown',event=>{if(currentMenu&&!currentMenu.menu.contains(event.target)&&!currentMenu.opener.contains(event.target))closeDropdown();},true);
  document.addEventListener('focusin',event=>{if(currentMenu&&!currentMenu.menu.contains(event.target)&&!currentMenu.opener.contains(event.target))closeDropdown();});
  document.addEventListener('keydown',event=>{
    if(!currentMenu)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeDropdown(true);return;}
    if(event.key==='Tab'){closeDropdown();return;}
    if(event.target.matches('input:not([type=checkbox]),select,textarea'))return;
    const nodes=menuItems(currentMenu.menu),i=nodes.indexOf(document.activeElement);
    const next=event.key==='ArrowDown'?(i+1)%nodes.length:event.key==='ArrowUp'?(i+nodes.length-1)%nodes.length:event.key==='Home'?0:event.key==='End'?nodes.length-1:null;
    if(next!==null){event.preventDefault();event.stopImmediatePropagation();nodes[next]?.focus();}
  },true);
  window.addEventListener('resize',()=>closeDropdown());
  document.addEventListener('scroll',event=>{if(currentMenu&&!currentMenu.menu.contains(event.target))closeDropdown();},true);
  window.addEventListener('hashchange',()=>closeDropdown());
  }
  window.UIShell={title,actions,drawer,dialogs,searchDialog,settingsMenu,actionMenu:openDropdown,dropdown:{open:openDropdown,close:closeDropdown}};
})();



