(function () {
  const upload = document.getElementById('upload-dialog');
  const search = document.getElementById('search-dialog');
  const menu = document.getElementById('card-menu-dialog');
  const deletion = document.getElementById('delete-journal-dialog');
  const collapsed = new Set();
  let activeButton;
  function outside(dialog) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
  }
  [search,menu,deletion,upload].forEach(outside);
  menu.addEventListener('close', () => { activeButton?.setAttribute('aria-expanded','false'); });
  menu.addEventListener('keydown', event => {
    const buttons = Array.from(menu.querySelectorAll('button'));
    const index = buttons.indexOf(document.activeElement);
    let next;
    if(event.key==='ArrowDown')next=(index+1)%buttons.length;
    if(event.key==='ArrowUp')next=(index+buttons.length-1)%buttons.length;
    if(event.key==='Home')next=0;
    if(event.key==='End')next=buttons.length-1;
    if(next !== undefined){event.preventDefault();buttons[next]?.focus();}
  });
  document.getElementById('open-search-btn').addEventListener('click', () => { search.showModal(); document.getElementById('filter-date').focus(); });
  document.getElementById('open-upload-btn').addEventListener('click',()=>upload.showModal());
  document.getElementById('upload-close').addEventListener('click',()=>upload.close());
  document.getElementById('search-close').addEventListener('click', () => search.close());
  document.getElementById('filter-date').addEventListener('keydown', event => { if(event.key==='Enter'){event.preventDefault();document.getElementById('filter-btn').click();} });
  function textFor(worklog) {
    function lines(items,depth=0){return (Array.isArray(items)?items:[]).filter(Boolean).flatMap(item=>typeof item==='string'?[item]:['  '.repeat(depth)+(item.checked?'[x] ':'[ ] ')+(item.task||''),...lines(item.children,depth+1)]);}
    return [worklog.workDate,'TODO',...lines(worklog.todo),'','익일 계획',...lines(worklog.nextDayPlan),'','비고',worklog.remarks||'','메모',worklog.memo||''].join('\n');
  }
  async function copyText(worklog) {
    const text = textFor(worklog);
    try {
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
      else {
        const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();
        try{if(!document.execCommand('copy'))throw Error('copy failed');}finally{field.remove();}
      }
      document.getElementById('worklog-action-msg').textContent='일지 내용을 복사했습니다.';
    } catch { document.getElementById('worklog-action-msg').textContent='내용을 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.'; }
  }
  function fold(card, id) {
    const hidden=collapsed.has(id);
    card.querySelectorAll('.card-body,.card-footer').forEach(node=>{node.hidden=hidden;});
  }
  window.JournalControls = {
    close(){[search,menu,deletion,upload].forEach(dialog=>{if(dialog.open)dialog.close();});},
    updateFilter(date){const node=document.getElementById('active-filter');node.hidden=!date;node.textContent=date?date+' 일지 조회 중':'';},
    confirmDelete(date){
      document.getElementById('delete-journal-message').textContent=(date||'선택한 날짜')+'의 일지를 삭제합니다. 삭제한 내용은 복구할 수 없습니다.';
      return new Promise(resolve=>{
        let confirmed=false;
        document.getElementById('delete-journal-confirm').onclick=()=>{confirmed=true;deletion.close();};
        document.getElementById('delete-journal-cancel').onclick=()=>deletion.close();
        deletion.addEventListener('close',()=>resolve(confirmed),{once:true});deletion.showModal();
      });
    },
    addCardMenu(card,worklog,actions,rights){
      const id=String(worklog.id);fold(card,id);
      const trigger=document.createElement('button');trigger.type='button';trigger.className='shell-icon card-menu-trigger';trigger.dataset.icon='more';trigger.setAttribute('aria-label',(worklog.workDate||'')+' 일지 메뉴');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
      card.querySelector('.card-actions').append(trigger);
      trigger.addEventListener('click',()=>{
        activeButton=trigger;trigger.setAttribute('aria-expanded','true');
        document.getElementById('card-menu-title').textContent=(worklog.workDate||'업무')+' 일지';
        const items=document.getElementById('card-menu-items');items.replaceChildren();
        function item(label,icon,action,danger=false){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.icon=icon;if(danger)button.className='menu-danger';button.addEventListener('click',()=>{menu.close();action();});items.append(button);}
        if(rights.create)item('오늘 날짜로 복제','copy',actions.duplicate);
        if(rights.edit)item('수정','edit',actions.edit);
        item('내용 복사','copy',()=>copyText(worklog));
        item(collapsed.has(id)?'내용 펼치기':'내용 접기','journal',()=>{if(collapsed.has(id))collapsed.delete(id);else collapsed.add(id);fold(card,id);});
        if(rights.remove)item('삭제','trash',actions.remove,true);
        AppIcons.render(items);menu.showModal();
        const r=trigger.getBoundingClientRect();const width=menu.offsetWidth,height=menu.offsetHeight;
        menu.style.left=Math.max(12,Math.min(innerWidth-width-12,r.right-width))+'px';
        menu.style.top=Math.max(12,Math.min(innerHeight-height-12,r.bottom+8))+'px';
      });
    }
  };
})();
