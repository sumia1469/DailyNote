(function(){
 const rows=new WeakMap();let active=null;
 function blocked(){return !!document.querySelector('[data-todo-saving],[data-todo-editing]');}
 function clearTarget(state){state.targetRow?.classList.remove('todo-drop-before','todo-drop-after');state.targetRow=null;state.target=null;}
 function cancel(){if(!active)return;const state=active;active=null;clearTarget(state);state.row.classList.remove('todo-dragging');clearInterval(state.scroll);try{state.handle.releasePointerCapture(state.pointerId);}catch{}state.handle.setAttribute('aria-pressed','false');}
 document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){event.preventDefault();cancel();}});
 window.addEventListener('blur',cancel);window.addEventListener('hashchange',cancel);
 function flatten(items){return items.flatMap(item=>[item,...flatten(item.children||[])]);}
 async function save(state,target,after){
  if(blocked()||!state.row.isConnected||!target)return;
  const original=flatten(state.worklog.todo),copy=JSON.parse(JSON.stringify(state.worklog.todo));
  const nodes=flatten(copy),source=nodes[original.indexOf(state.todo)],destination=nodes[original.indexOf(target)];
  if(!source||!destination||!TodoTree.reposition(copy,source,destination,after)||JSON.stringify(copy)===JSON.stringify(state.worklog.todo))return;
  const card=state.row.closest('.worklog-card');card.dataset.todoSaving='true';
  const controls=[...document.querySelectorAll('.worklog-card button,.worklog-card input,#open-worklog-btn')].map(element=>({element,disabled:element.disabled}));controls.forEach(({element})=>element.disabled=true);
  const message=document.createElement('p');message.className='todo-drag-status';message.setAttribute('role','status');message.textContent='위치 저장 중…';state.row.after(message);
  try{await state.onSave(copy);}catch(error){message.textContent=(error.message||'위치를 저장하지 못했습니다.')+' 기존 위치를 유지했습니다.';}
  finally{delete card.dataset.todoSaving;controls.forEach(({element,disabled})=>{if(element.isConnected)element.disabled=disabled;});}
 }
 function attach(row,todo,worklog,onSave){
  const handle=document.createElement('button');handle.type='button';handle.className='todo-drag-handle';handle.setAttribute('aria-label','TODO 위치 이동');handle.title='드래그로 위치 이동 · Alt+↑/↓ 순서 변경';handle.setAttribute('aria-pressed','false');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');for(const x of [8,16])for(const y of [5,12,19]){const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','1.7');dot.setAttribute('fill','currentColor');svg.append(dot);}handle.append(svg);row.append(handle);
  const state={row,todo,worklog,onSave,handle};rows.set(row,state);
  handle.addEventListener('pointerdown',event=>{if(event.button!==0||blocked()||active)return;event.preventDefault();row.parentElement.querySelectorAll('.todo-drag-status').forEach(node=>node.remove());active={...state,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};handle.setPointerCapture(event.pointerId);handle.setAttribute('aria-pressed','true');row.classList.add('todo-dragging');active.scroll=setInterval(()=>{if(active?.moved){const delta=active.y<64?-12:active.y>innerHeight-64?12:0;if(delta){window.scrollBy(0,delta);update(active.x,active.y);}}},50);});
  function update(x,y){const current=active;if(!current)return;clearTarget(current);const candidate=document.elementFromPoint(x,y)?.closest('.todo-item'),next=rows.get(candidate);if(!next||next.worklog!==worklog||next.todo===todo||TodoTree.locate(todo.children||[],next.todo))return;current.target=next.todo;current.targetRow=candidate;current.after=y>candidate.getBoundingClientRect().top+candidate.getBoundingClientRect().height/2;candidate.classList.add(current.after?'todo-drop-after':'todo-drop-before');}
  handle.addEventListener('pointermove',event=>{if(active?.handle!==handle)return;active.x=event.clientX;active.y=event.clientY;active.moved ||= Math.hypot(event.clientX-active.startX,event.clientY-active.startY)>6;if(active.moved)update(event.clientX,event.clientY);});
  handle.addEventListener('pointerup',event=>{if(active?.handle!==handle)return;const current=active,target=current.target,after=current.after;cancel();if(current.moved)save(state,target,after);});
  handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',()=>{if(active?.handle===handle)cancel();});
  handle.addEventListener('keydown',event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||blocked())return;event.preventDefault();const position=TodoTree.locate(worklog.todo,todo),next=position.items[position.index+(event.key==='ArrowUp'?-1:1)];if(next)save(state,next,event.key==='ArrowDown');});
 }
 window.TodoDrag={attach};
})();
