(function(){
 let menuId=0;
 function attach(row,text,todo,onSave,items,title='TODO'){
  text.classList.add('todo-text-btn');
  text.title='더블클릭 또는 두 번 탭으로 '+title+' 수정';
  text.setAttribute('aria-label',(todo.task||'내용 없는 항목')+' 수정');
  function begin(){
   const card=row.closest('.worklog-card');
   if(document.querySelector('[data-todo-saving],[data-todo-editing]'))return;
   card.dataset.todoEditing='true';
   const controls=Array.from(document.querySelectorAll('.worklog-card button,.worklog-card input,#duplicate-worklog-btn,#open-worklog-btn,#filter-btn,#reset-filter-btn,#filter-date,#open-search-btn,#worklog-search-submit,#worklog-search-nav button')).map(element=>({element,disabled:element.disabled}));
   controls.forEach(({element})=>element.disabled=true);
   const editor=document.createElement('div');editor.className='todo-inline-editor';
   const input=document.createElement('textarea');input.rows=2;input.value=todo.task||'';input.setAttribute('aria-label',title+' 내용 수정');
   const actions=document.createElement('div');actions.className='todo-inline-actions';
   const additions=[];
   const drafts=document.createElement('div');
   function addDraft(kind){const wrap=document.createElement('label');wrap.className='todo-inline-draft';wrap.textContent=kind==='child'?'새 하위 항목':'새 같은 단계 항목';const field=document.createElement('textarea');field.rows=1;field.setAttribute('aria-label',wrap.textContent);const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.addEventListener('click',()=>{additions.splice(additions.findIndex(a=>a.field===field),1);wrap.remove();});wrap.append(field,remove);drafts.append(wrap);additions.push({kind,field});field.focus();}
   const inputRow=document.createElement('div');inputRow.className='todo-inline-input-row';
   const plus=document.createElement('button');plus.type='button';plus.className='todo-add-trigger';plus.textContent='＋';plus.setAttribute('aria-label','같은 단계 또는 하위 항목 추가');plus.setAttribute('aria-haspopup','dialog');plus.setAttribute('aria-expanded','false');
   const addMenu=document.createElement('dialog');addMenu.dataset.uiBound='true';addMenu.className='todo-inline-add-menu';addMenu.id='todo-add-menu-'+(++menuId);addMenu.setAttribute('role','menu');addMenu.hidden=true;plus.setAttribute('aria-controls',addMenu.id);
   function hideMenu(){if(addMenu.open)addMenu.close();addMenu.hidden=true;plus.setAttribute('aria-expanded','false');}
   for(const [kind,label] of [['sibling','같은 단계 추가'],['child','하위 항목 추가']]){const choice=document.createElement('button');choice.type='button';choice.setAttribute('role','menuitem');choice.textContent=label;choice.addEventListener('click',()=>{hideMenu();addDraft(kind);});addMenu.append(choice);}
   plus.addEventListener('click',()=>{if(!addMenu.hidden){hideMenu();return;}addMenu.hidden=false;plus.setAttribute('aria-expanded','true');addMenu.showModal();const r=plus.getBoundingClientRect();addMenu.style.left=Math.max(12,Math.min(innerWidth-addMenu.offsetWidth-12,r.right-addMenu.offsetWidth))+'px';addMenu.style.top=Math.max(12,Math.min(innerHeight-addMenu.offsetHeight-12,r.bottom+6))+'px';addMenu.querySelector('button').focus();});
   addMenu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideMenu();plus.focus();}else if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const choices=[...addMenu.children];choices[(choices.indexOf(document.activeElement)+1)%choices.length].focus();}});
   addMenu.addEventListener('cancel',event=>{event.preventDefault();hideMenu();plus.focus();});
   function outside(event){if(!addMenu.open)return;const r=addMenu.getBoundingClientRect();if(!inputRow.contains(event.target)||(addMenu.open&&event.target===addMenu&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))){hideMenu();plus.focus({preventScroll:true});}}document.addEventListener('pointerdown',outside);
   inputRow.append(input,plus,addMenu);
   const save=document.createElement('button');save.type='button';save.className='primary-btn';save.textContent='저장';
   const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary-btn';cancel.textContent='취소';
   const message=document.createElement('p');message.className='todo-inline-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
   const hint=document.createElement('small');hint.textContent='Enter는 현재 항목 안 줄바꿈 · Ctrl/⌘+Enter 저장 · Esc 취소. 새 항목은 추가 버튼을 누르세요.';
   actions.append(save,cancel);editor.append(inputRow,drafts,actions,hint,message);text.hidden=true;row.append(editor);
   let saving=false;
   function close(){hideMenu();document.removeEventListener('pointerdown',outside);editor.remove();text.hidden=false;delete card.dataset.todoEditing;delete card.dataset.todoSaving;controls.forEach(({element,disabled})=>element.disabled=disabled);if(text.isConnected)text.focus({preventScroll:true});}
   async function submit(){
    if(saving)return;
    const value=input.value.trim();
    if(!value){message.textContent=title+' 내용을 입력하세요.';input.focus();return;}
    if(additions.some(a=>!a.field.value.trim())){message.textContent='추가할 항목 내용을 입력하세요.';return;}
    if(value===(todo.task||'')&&!additions.length){close();return;}
    saving=true;card.dataset.todoSaving='true';editor.querySelectorAll('button,textarea').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});save.textContent='저장 중…';message.textContent='';
    try{await onSave(value,{additions:additions.map(a=>({kind:a.kind,task:a.field.value.trim()}))});close();}
    catch(error){message.textContent=error.message||'저장하지 못했습니다. 다시 시도해 주세요.';editor.querySelectorAll('button,textarea').forEach(el=>el.disabled=el.dataset.wasDisabled==='true');save.textContent='저장';delete card.dataset.todoSaving;input.focus();}
    finally{saving=false;}
   }
   save.addEventListener('click',submit);
   cancel.addEventListener('click',()=>{if(!saving)close();});
   editor.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();if(!addMenu.hidden){hideMenu();plus.focus();}else if(!saving)close();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submit();}});
   input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);
  }
  let lastTap=0;
  text.addEventListener('pointerup',event=>{if(event.pointerType!=='touch'||event.target.closest('a')){lastTap=0;return;}const now=performance.now();if(lastTap&&now-lastTap<350){lastTap=0;event.preventDefault();begin();}else lastTap=now;});
  text.addEventListener('dblclick',event=>{if(!event.target.closest('a'))begin();});
  text.addEventListener('keydown',event=>{if(event.target===text&&!event.isComposing&&['Enter','F2'].includes(event.key)){event.preventDefault();begin();}});
 }
 window.TodoInline={attach};
})();

