(function(){
 function attach(row,text,todo,onSave){
  text.classList.add('todo-text-btn');
  text.type='button';
  text.title='클릭해서 TODO 수정';
  text.setAttribute('aria-label',(todo.task||'내용 없는 항목')+' 수정');
  text.addEventListener('click',()=>{
   const card=row.closest('.worklog-card');
   if(document.querySelector('[data-todo-saving],[data-todo-editing]'))return;
   card.dataset.todoEditing='true';
   const controls=Array.from(document.querySelectorAll('.worklog-card button,.worklog-card input,#duplicate-worklog-btn,#open-worklog-btn,#filter-btn,#reset-filter-btn,#filter-date')).map(element=>({element,disabled:element.disabled}));
   controls.forEach(({element})=>element.disabled=true);
   const editor=document.createElement('div');editor.className='todo-inline-editor';
   const input=document.createElement('textarea');input.rows=2;input.value=todo.task||'';input.setAttribute('aria-label','TODO 내용 수정');
   const actions=document.createElement('div');actions.className='todo-inline-actions';
   const save=document.createElement('button');save.type='button';save.className='primary-btn';save.textContent='저장';
   const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary-btn';cancel.textContent='취소';
   const message=document.createElement('p');message.className='todo-inline-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
   const hint=document.createElement('small');hint.textContent='Enter 저장 · Shift+Enter 줄바꿈 · Esc 취소';
   actions.append(save,cancel);editor.append(input,actions,hint,message);text.hidden=true;row.append(editor);
   let saving=false;
   function close(){editor.remove();text.hidden=false;delete card.dataset.todoEditing;delete card.dataset.todoSaving;controls.forEach(({element,disabled})=>element.disabled=disabled);if(text.isConnected)text.focus({preventScroll:true});}
   async function submit(){
    if(saving)return;
    const value=input.value.trim();
    if(!value){message.textContent='TODO 내용을 입력하세요.';input.focus();return;}
    if(value===(todo.task||'')){close();return;}
    saving=true;card.dataset.todoSaving='true';input.disabled=true;save.disabled=true;cancel.disabled=true;save.textContent='저장 중…';message.textContent='';
    try{await onSave(value);close();}
    catch(error){message.textContent=error.message||'저장하지 못했습니다. 다시 시도해 주세요.';input.disabled=false;save.disabled=false;cancel.disabled=false;save.textContent='저장';delete card.dataset.todoSaving;input.focus();}
    finally{saving=false;}
   }
   save.addEventListener('click',submit);
   cancel.addEventListener('click',()=>{if(!saving)close();});
   input.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();if(!saving)close();}else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit();}});
   input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);
  });
 }
 window.TodoInline={attach};
})();
