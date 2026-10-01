(function(){
 const rows=new WeakMap();let active=null;
 function blocked(){return !!document.querySelector('[data-todo-saving],[data-todo-editing]');}
 function clearTarget(state){state.targetRow?.classList.remove('todo-drop-before','todo-drop-after');state.slot?.remove();state.targetRow=null;state.target=null;}
 function cancel(){if(!active)return;const state=active;active=null;clearTarget(state);state.group.forEach(row=>row.classList.remove('todo-dragging'));state.ghost?.remove();document.body.classList.remove('todo-drag-active');clearInterval(state.scroll);try{state.handle.releasePointerCapture(state.pointerId);}catch{}state.handle.setAttribute('aria-pressed','false');}
 document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){event.preventDefault();cancel();}});
 window.addEventListener('blur',cancel);window.addEventListener('hashchange',cancel);
 document.addEventListener('pointermove',event=>{const current=active;if(!current||event.pointerId!==current.pointerId)return;current.x=event.clientX;current.y=event.clientY;current.moved ||= Math.hypot(event.clientX-current.startX,event.clientY-current.startY)>6;if(current.moved){event.preventDefault();preview(current);current.update(event.clientX,event.clientY);}}, {passive:false});
 document.addEventListener('pointerup',event=>{const current=active;if(!current||event.pointerId!==current.pointerId)return;if(current.moved)current.update(event.clientX,event.clientY);const target=current.target,after=current.after;cancel();if(current.moved)save(current,target,after);});
 document.addEventListener('pointercancel',event=>{if(active?.pointerId===event.pointerId)cancel();});
 function preview(state){
  if(!state.ghost){const ghost=document.createElement('div');ghost.className='todo-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.style.width=Math.min(state.row.getBoundingClientRect().width,innerWidth-24)+'px';for(const row of state.group){const clone=row.cloneNode(true);clone.classList.remove('todo-dragging');const indent=Math.max(0,row.getBoundingClientRect().left-state.row.getBoundingClientRect().left);clone.style.marginLeft=indent+'px';clone.style.width='calc(100% - '+indent+'px)';clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));ghost.append(clone);row.classList.add('todo-dragging');}state.ghost=ghost;document.body.append(ghost);document.body.classList.add('todo-drag-active');}
  state.ghost.style.transform=`translate(${Math.max(8,Math.min(innerWidth-state.ghost.offsetWidth-8,state.x-state.offsetX))}px,${Math.max(76,Math.min(innerHeight-state.ghost.offsetHeight-8,state.y+14))}px)`;
 }
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
  handle.addEventListener('contextmenu',event=>event.preventDefault());
  const state={row,todo,worklog,onSave,handle};rows.set(row,state);
  handle.addEventListener('pointerdown',event=>{if((event.pointerType==='mouse'&&event.button!==0)||blocked()||active)return;event.preventDefault();const list=row.closest('.todo-list')||row.parentElement;list.querySelectorAll('.todo-drag-status').forEach(node=>node.remove());const group=[...list.querySelectorAll('.todo-item')].filter(candidate=>{const next=rows.get(candidate);return next&&(next.todo===todo||TodoTree.locate(todo.children||[],next.todo));});active={...state,list,group,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-row.getBoundingClientRect().left,moved:false,update};try{handle.setPointerCapture(event.pointerId);}catch{}handle.setAttribute('aria-pressed','true');active.scroll=setInterval(()=>{if(active?.moved){const delta=active.y<76?-12:active.y>innerHeight-64?12:0;if(delta){window.scrollBy(0,delta);update(active.x,active.y);}}},50);});
  function update(x,y){
   const current=active;if(!current)return;
   const slotBox=current.slot?.getBoundingClientRect();if(slotBox&&x>=slotBox.left&&x<=slotBox.right&&y>=slotBox.top&&y<=slotBox.bottom)return;
   clearTarget(current);const bounds=current.list.getBoundingClientRect();if(x<bounds.left-12||x>bounds.right+12||y<bounds.top-12||y>bounds.bottom+12)return;
   const candidates=[...current.list.querySelectorAll('.todo-item')];let candidate=null,distance=Infinity;
   for(const row of candidates){const rect=row.getBoundingClientRect(),gap=Math.max(rect.top-y,y-rect.bottom,0);if(gap<distance){candidate=row;distance=gap;}}
   if(current.group.includes(candidate)&&distance>0){candidate=null;distance=Infinity;for(const row of candidates){if(current.group.includes(row))continue;const rect=row.getBoundingClientRect(),gap=Math.max(rect.top-y,y-rect.bottom,0);if(gap<distance){candidate=row;distance=gap;}}}
   const next=rows.get(candidate);if(!next||next.worklog!==worklog||current.group.includes(candidate))return;
   current.target=next.todo;current.after=y>candidate.getBoundingClientRect().top+candidate.getBoundingClientRect().height/2;
   const descendants=candidates.filter(row=>{const entry=rows.get(row);return entry&&TodoTree.locate(next.todo.children||[],entry.todo);});
   const edge=current.after?(descendants.at(-1)||candidate):candidate;current.targetRow=edge;edge.classList.add(current.after?'todo-drop-after':'todo-drop-before');
   const slot=document.createElement('div');slot.className='todo-drop-slot';slot.textContent='여기에 이동';slot.setAttribute('aria-hidden','true');slot.style.marginLeft=edge.parentElement.style.marginLeft;const wrapper=edge.closest('.todo-node')||edge;current.after?wrapper.after(slot):wrapper.before(slot);current.slot=slot;
  }
  handle.addEventListener('keydown',event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||blocked())return;event.preventDefault();const position=TodoTree.locate(worklog.todo,todo),next=position.items[position.index+(event.key==='ArrowUp'?-1:1)];if(next)save(state,next,event.key==='ArrowDown');});
 }
 window.TodoDrag={attach};
})();
