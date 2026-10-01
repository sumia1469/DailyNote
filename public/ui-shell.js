(function(){
  function title(node,text){node.textContent=text;document.title=text+' · DailyNote';}
  function actions(scope,key,permissions,buttons){document.querySelector('.ui-header')?.classList.toggle('ui-header-wide',UIConfig.actions(scope,key,permissions).length>=3);buttons.forEach(button=>button.hidden=true);UIConfig.actions(scope,key,permissions).forEach(action=>{const button=document.getElementById(action.id);if(!button)return;button.hidden=false;button.setAttribute('aria-label',action.label);button.title=action.label;button.dataset.icon=action.kind==='search'?'search':action.kind==='more'?'more':'plus';});}
  function drawer({nav,opener,closer,scrim,select}){
    function close(restore=false){nav.classList.remove('is-open');nav.inert=true;scrim.hidden=true;opener.setAttribute('aria-expanded','false');document.body.classList.remove('ui-drawer-open');if(restore)opener.focus();}
    opener.addEventListener('click',()=>{nav.inert=false;nav.classList.add('is-open');scrim.hidden=false;opener.setAttribute('aria-expanded','true');document.body.classList.add('ui-drawer-open');closer.focus();});
    closer.addEventListener('click',()=>close(true));scrim.addEventListener('click',()=>close(true));
    nav.addEventListener('click',event=>{if(select&&event.target.closest(select))close(true);});
    document.addEventListener('keydown',event=>{if(!nav.classList.contains('is-open'))return;if(event.key==='Escape')close(true);if(event.key==='Tab'){const nodes=Array.from(nav.querySelectorAll('button,a,input,select')).filter(node=>!node.hidden&&!node.disabled&&node.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
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
  window.UIShell={title,actions,drawer,dialogs,searchDialog};
})();

