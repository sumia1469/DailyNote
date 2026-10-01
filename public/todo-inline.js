(function(){
 function attach(row,text,todo,onSave,items){
  text.classList.add('todo-text-btn');
  text.type='button';
  text.title='클릭해서 TODO 수정';
  text.setAttribute('aria-label',(todo.task||'내용 없는 항목')+' 수정');
  text.addEventListener('click',()=>{
   const card=row.closest('.worklog-card');
   if(document.querySelector('[data-todo-saving],[data-todo-editing]'))return;
   card.dataset.todoEditing='true';
   const controls=Array.from(document.querySelectorAll('.worklog-card button,.worklog-card input,#duplicate-worklog-btn,#open-worklog-btn,#filter-btn,#reset-filter-btn,#filter-date,#open-search-btn,#worklog-search-submit,#worklog-search-nav button')).map(element=>({element,disabled:element.disabled}));
   controls.forEach(({element})=>element.disabled=true);
   const editor=document.createElement('div');editor.className='todo-inline-editor';
   const input=document.createElement('textarea');input.rows=2;input.value=todo.task||'';input.setAttribute('aria-label','TODO 내용 수정');
   const actions=document.createElement('div');actions.className='todo-inline-actions';
   const tools=document.createElement('div');tools.className='todo-inline-tools';
   let direction=null;const additions=[];
   function button(label,action){const b=document.createElement('button');b.type='button';b.className='secondary-btn';b.textContent=label;b.addEventListener('click',action);tools.append(b);return b;}
   const up=button('상위로',()=>{direction=direction==='outdent'?null:'outdent';updateDepth();});
   const down=button('하위로',()=>{direction=direction==='indent'?null:'indent';updateDepth();});
   up.disabled=!TodoTree.canMove(items,todo,'outdent');down.disabled=!TodoTree.canMove(items,todo,'indent');
   function updateDepth(){up.setAttribute('aria-pressed',direction==='outdent');down.setAttribute('aria-pressed',direction==='indent');depthHint.textContent=direction==='outdent'?'저장하면 상위 단계로 이동합니다.':direction==='indent'?'저장하면 바로 앞 항목의 하위로 이동합니다.':'';}
   const depthHint=document.createElement('small');
   const drafts=document.createElement('div');
   function addDraft(kind){const wrap=document.createElement('label');wrap.className='todo-inline-draft';wrap.textContent=kind==='child'?'새 하위 항목':'새 같은 단계 항목';const field=document.createElement('textarea');field.rows=1;field.setAttribute('aria-label',wrap.textContent);const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.addEventListener('click',()=>{additions.splice(additions.findIndex(a=>a.field===field),1);wrap.remove();});wrap.append(field,remove);drafts.append(wrap);additions.push({kind,field});field.focus();}
   button('＋ 같은 단계',()=>addDraft('sibling'));button('＋ 하위 항목',()=>addDraft('child'));
   const save=document.createElement('button');save.type='button';save.className='primary-btn';save.textContent='저장';
   const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary-btn';cancel.textContent='취소';
   const message=document.createElement('p');message.className='todo-inline-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
   const hint=document.createElement('small');hint.textContent='Enter는 현재 항목 안 줄바꿈 · Ctrl/⌘+Enter 저장 · Esc 취소. 새 항목은 추가 버튼을 누르세요.';
   actions.append(save,cancel);editor.append(input,tools,depthHint,drafts,actions,hint,message);text.hidden=true;row.append(editor);
   let saving=false;
   function close(){editor.remove();text.hidden=false;delete card.dataset.todoEditing;delete card.dataset.todoSaving;controls.forEach(({element,disabled})=>element.disabled=disabled);if(text.isConnected)text.focus({preventScroll:true});}
   async function submit(){
    if(saving)return;
    const value=input.value.trim();
    if(!value){message.textContent='TODO 내용을 입력하세요.';input.focus();return;}
    if(additions.some(a=>!a.field.value.trim())){message.textContent='추가할 항목 내용을 입력하세요.';return;}
    if(value===(todo.task||'')&&!direction&&!additions.length){close();return;}
    saving=true;card.dataset.todoSaving='true';editor.querySelectorAll('button,textarea').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});save.textContent='저장 중…';message.textContent='';
    try{await onSave(value,{direction,additions:additions.map(a=>({kind:a.kind,task:a.field.value.trim()}))});close();}
    catch(error){message.textContent=error.message||'저장하지 못했습니다. 다시 시도해 주세요.';editor.querySelectorAll('button,textarea').forEach(el=>el.disabled=el.dataset.wasDisabled==='true');save.textContent='저장';delete card.dataset.todoSaving;input.focus();}
    finally{saving=false;}
   }
   save.addEventListener('click',submit);
   cancel.addEventListener('click',()=>{if(!saving)close();});
   editor.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();if(!saving)close();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submit();}});
   input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);
  });
 }
 window.TodoInline={attach};
})();

