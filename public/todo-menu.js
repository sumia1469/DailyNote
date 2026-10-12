/* Item actions share the shell dropdown and the worklog edit permission. */
(function(){
 let menu,activeRow;
 const observer=new MutationObserver(()=>{if(activeRow&&!activeRow.isConnected){UIShell.dropdown.close();activeRow=null;}});
 observer.observe(document.documentElement,{childList:true,subtree:true});
 function blocked(){return !!document.querySelector('[data-todo-saving],[data-todo-editing],.todo-drag-active');}
 function attach(row,text,item,model,persist,edit,title='TODO',checkable=true){
  const trigger=document.createElement('button');trigger.type='button';trigger.className='shell-icon todo-menu-trigger';trigger.dataset.icon='more';trigger.setAttribute('aria-label',title+' '+(item.task||'내용 없는 항목')+' 메뉴');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');row.append(trigger);
  function open(event){
   if(blocked()||trigger.disabled||!row.isConnected)return;
   event?.preventDefault();event?.stopPropagation();
   if(!menu){menu=document.createElement('div');menu.id='todo-item-menu';menu.className='todo-item-menu';menu.hidden=true;document.body.append(menu);}
   if(trigger.getAttribute('aria-expanded')==='true'){UIShell.dropdown.close(true);return;}
   activeRow=row;menu.replaceChildren();menu.setAttribute('aria-label',title+' 항목 메뉴');
   function choice(label,action,danger=false){const button=document.createElement('button');button.type='button';button.textContent=label;if(danger)button.className='menu-danger';button.addEventListener('click',event=>{event.stopPropagation();if(!blocked()&&row.isConnected)action();});menu.append(button);}
   choice('수정',()=>{UIShell.dropdown.close();edit();});
   if(checkable)choice(item.checked?'미완료로 변경':'완료로 변경',()=>save('toggle',menu));
   choice('복제',()=>save('duplicate',menu));
   choice('삭제',confirmDelete,true);
   UIShell.dropdown.open(menu,trigger);
  }
  async function save(action,host){
   if(blocked()||!row.isConnected)return;
   const copy=JSON.parse(JSON.stringify(model.todo));
   const locate=TodoTree.locate(model.todo,item);if(!locate)return;
   const original=flatten(model.todo),target=flatten(copy)[original.indexOf(item)];
   if(action==='duplicate')TodoTree.duplicate(copy,target);
   else if(action==='remove')TodoTree.remove(copy,target);
   else flatten([target]).forEach(node=>node.checked=!item.checked);
   const list=row.closest('.todo-list'),listIndex=[...document.querySelectorAll('.todo-list')].indexOf(list),rowIndex=[...list.querySelectorAll('.todo-item')].indexOf(row);
   const card=row.closest('.worklog-card');card.dataset.todoSaving='true';
   const controls=[...document.querySelectorAll('.worklog-card button,.worklog-card input,#open-worklog-btn,#open-search-btn,#duplicate-worklog-btn'),...host.querySelectorAll('button')].map(element=>({element,disabled:element.disabled}));controls.forEach(({element})=>element.disabled=true);
   let status=host.querySelector('.todo-menu-status');if(!status){status=document.createElement('p');status.className='todo-menu-status todo-inline-message';status.setAttribute('role','status');host.append(status);}status.textContent='저장 중…';
   try{await persist(copy);UIShell.dropdown.close();if(host instanceof HTMLDialogElement){host.close();host.remove();}const nextList=document.querySelectorAll('.todo-list')[listIndex],nextRows=nextList?.querySelectorAll('.todo-item');const next=nextRows?.[Math.min(rowIndex,nextRows.length-1)]?.querySelector('.todo-menu-trigger')||nextList?.closest('section')?.querySelector('.worklog-field-add');next?.focus({preventScroll:true});}
   catch(error){status.textContent=error.message||'저장하지 못했습니다. 다시 시도해 주세요.';if(host===menu&&menu.hidden&&row.isConnected){const notice=document.createElement('p');notice.className='todo-inline-message';notice.setAttribute('role','status');notice.textContent=status.textContent;row.after(notice);}}
   finally{delete card.dataset.todoSaving;controls.forEach(({element,disabled})=>{if(element.isConnected)element.disabled=disabled;});}
  }
  function confirmDelete(){
   UIShell.dropdown.close();
   const dialog=document.createElement('dialog');dialog.className='journal-dialog todo-delete-dialog';dialog.dataset.uiBound='true';dialog.setAttribute('aria-label',title+' 항목 삭제 확인');
   const heading=document.createElement('h3');heading.textContent='항목 삭제';const message=document.createElement('p');const count=flatten([item]).length;message.textContent='“'+item.task+'”'+(count>1?' 및 하위 항목 '+(count-1)+'개':'')+'를 삭제합니다. 삭제한 내용은 복구할 수 없습니다.';
   const actions=document.createElement('div');actions.className='journal-dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary-btn';cancel.textContent='취소';const confirm=document.createElement('button');confirm.type='button';confirm.className='danger-btn';confirm.textContent='삭제';actions.append(cancel,confirm);dialog.append(heading,message,actions);document.body.append(dialog);
   function close(){if(blocked())return;dialog.close();dialog.remove();if(trigger.isConnected)trigger.focus({preventScroll:true});}
   cancel.addEventListener('click',close);confirm.addEventListener('click',()=>save('remove',dialog));dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close();});dialog.showModal();cancel.focus();
  }
  trigger.addEventListener('pointerdown',event=>event.stopPropagation());trigger.addEventListener('dblclick',event=>event.stopPropagation());trigger.addEventListener('click',open);
  row.addEventListener('contextmenu',event=>{if(event.target.closest('a,textarea,input,.todo-inline-editor'))return;open(event);});
  row.addEventListener('keydown',event=>{if((event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))&&!event.target.closest('textarea,input'))open(event);});
 }
 function flatten(items){return items.flatMap(item=>[item,...flatten(item.children||[])]);}
 window.TodoMenu={attach};
})();
