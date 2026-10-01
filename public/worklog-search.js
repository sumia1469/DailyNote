(function(){
 const query=document.getElementById('worklog-query');
 const nav=document.getElementById('worklog-search-nav');
 const status=document.getElementById('worklog-search-count');
 const previous=document.getElementById('worklog-search-prev');
 const next=document.getElementById('worklog-search-next');
 let term='',matches=[],active=-1,busy=false;
 function unmark(){document.querySelectorAll('#worklog-list mark[data-worklog-match]').forEach(mark=>{const parent=mark.parentNode;mark.replaceWith(document.createTextNode(mark.textContent));parent.normalize();});}
 function update(){nav.hidden=!term;status.textContent=matches.length?`“${term}” ${active+1} / ${matches.length}곳`:`“${term}” 일치하는 내용이 없습니다.`;previous.disabled=next.disabled=matches.length===0||busy;}
 function select(index,scroll=true){
  matches.forEach(mark=>mark.classList.remove('search-current'));
  if(!matches.length){active=-1;update();return;}
  active=(index+matches.length)%matches.length;const mark=matches[active];mark.classList.add('search-current');
  const card=mark.closest('.worklog-card');card?.querySelectorAll('.card-body,.card-footer').forEach(node=>node.hidden=false);
  update();if(scroll)mark.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function refresh(){
  unmark();matches=[];if(!term){nav.hidden=true;return;}
  const pattern=new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
  document.querySelectorAll('#worklog-list .todo-text-btn,#worklog-list .plan-tree-text,#worklog-list .card-info-list li,#worklog-list .card-date').forEach(element=>{
   if(window.References)window.References.render(element,element.dataset.referenceSource||element.textContent);
   const value=element.textContent;let from=0;const found=Array.from(value.matchAll(pattern));if(!found.length)return;
   if(document.createTreeWalker){
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),texts=[];let node;while(node=walker.nextNode())texts.push(node);
    for(const textNode of texts){const local=textNode.textContent,hits=[...local.matchAll(pattern)];if(!hits.length)continue;const frag=document.createDocumentFragment();let at=0;for(const hit of hits){frag.append(document.createTextNode(local.slice(at,hit.index)));const mark=document.createElement('mark');mark.dataset.worklogMatch='';mark.textContent=hit[0];frag.append(mark);matches.push(mark);at=hit.index+hit[0].length;}frag.append(document.createTextNode(local.slice(at)));textNode.replaceWith(frag);}
    return;
   }
   const fragment=document.createDocumentFragment();
   found.forEach(result=>{const index=result.index;fragment.append(document.createTextNode(value.slice(from,index)));const mark=document.createElement('mark');mark.dataset.worklogMatch='';mark.textContent=result[0];fragment.append(mark);matches.push(mark);from=index+result[0].length;});
   fragment.append(document.createTextNode(value.slice(from)));element.replaceChildren(fragment);
  });select(Math.max(active,0),false);
 }
 async function run(){
  if(busy||document.querySelector('[data-todo-saving],[data-todo-editing]'))return;
  term=query.value.trim();active=0;
  if(!term){clear();return;}
  busy=true;const button=document.getElementById('worklog-search-submit');button.disabled=true;
  try{
   document.getElementById('filter-date').value='';document.getElementById('search-dialog').close();
   await loadList('');refresh();select(0);
  }finally{busy=false;button.disabled=false;update();}
 }
 function clear(){term='';active=-1;unmark();matches=[];nav.hidden=true;query.value='';}
 document.getElementById('worklog-search-submit').addEventListener('click',run);
 query.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();run();}});
 previous.addEventListener('click',()=>select(active-1));next.addEventListener('click',()=>select(active+1));
 document.getElementById('worklog-search-clear').addEventListener('click',clear);
 document.getElementById('logout-btn')?.addEventListener('click',clear);
 window.WorklogSearch={run,refresh,clear};
})();


