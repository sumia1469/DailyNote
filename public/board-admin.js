(function(){
'use strict';
const $=id=>document.getElementById(id),context=()=>window.AdminBoardContext;
let records=[],current=null;
function node(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
async function load(){if(!context()?.user?.permissions.boards)return;try{records=await context().api('/api/admin/boards');render();}catch(e){$('board-admin-status').textContent=e.message;}}
let menuBoard=null,menuOpener=null,deleteTarget=null;
function control(text,icon,action){const b=node('button',text);b.type='button';b.dataset.icon=icon;b.onclick=action;return b;}
function dialog(id,title){
 const d=node('dialog');d.id=id;d.className='journal-dialog board-admin-popup';d.setAttribute('aria-labelledby',id+'-title');
 const header=node('div');header.className='journal-dialog-header';const heading=node('h2',title);heading.id=id+'-title';
 const close=control('','close',()=>d.close());close.className='shell-icon';close.setAttribute('aria-label','닫기');header.append(heading,close);d.append(header);document.body.append(d);return d;
}
const menu=dialog('board-admin-menu','게시판 메뉴'),menuItems=node('div');menuItems.className='board-admin-menu-items';menu.append(menuItems);
const settings=control('설정','appearance',()=>{const board=menuBoard;menu.close();open(board);});
const view=node('a','게시판 열기');view.dataset.icon='journal';view.onclick=()=>menu.close();
const remove=control('삭제','trash',()=>{deleteTarget=menuBoard;menu.close();deleteName.textContent=deleteTarget.name+' 게시판을 삭제할까요?';deleteError.textContent='';deleteDialog.showModal();});remove.className='board-admin-danger';menuItems.append(settings,view,remove);
const deleteDialog=dialog('board-admin-delete-dialog','게시판 삭제'),deleteName=node('p'),deleteHint=node('p','빈 게시판만 삭제할 수 있습니다. 게시글이 있다면 설정에서 비활성화하여 보관하세요.'),deleteError=node('p');
deleteHint.className='board-hint';deleteError.id='board-admin-delete-error';deleteError.setAttribute('role','alert');
const deleteActions=node('div');deleteActions.className='journal-dialog-actions';const cancel=control('취소','close',()=>deleteDialog.close());
const confirmDelete=control('삭제','trash',async()=>{
 if(confirmDelete.disabled||!deleteTarget)return;confirmDelete.disabled=true;deleteError.textContent='';
 try{await context().api('/api/admin/boards/'+deleteTarget.id,'DELETE');deleteDialog.close();await load();}
 catch(error){deleteError.textContent=error.message;}
 finally{confirmDelete.disabled=false;}
});confirmDelete.id='board-admin-delete-confirm';confirmDelete.className='danger-btn';deleteActions.append(cancel,confirmDelete);deleteDialog.append(deleteName,deleteHint,deleteError,deleteActions);
deleteDialog.addEventListener('cancel',event=>{if(confirmDelete.disabled)event.preventDefault();});
deleteDialog.addEventListener('click',event=>{if(confirmDelete.disabled&&event.target.closest('button')!==confirmDelete)event.stopImmediatePropagation();},true);
for(const d of [menu,deleteDialog])d.addEventListener('close',()=>requestAnimationFrame(()=>{if(!document.querySelector('dialog[open]')&&menuOpener?.isConnected)menuOpener.focus();}));
function render(){
 $('board-admin-list').replaceChildren();
 for(const board of records){
  const row=node('div');row.className='board-admin-row';const content=node('div');content.className='board-admin-content';
  const title=node('strong',board.name);title.className='board-admin-title';
  const meta=node('small',[board.group,board.active?'활성':'보관',board.inMenu?'메뉴 표시':'메뉴 숨김'].join(' · '));meta.className='board-admin-meta';
  const categories=node('small','분류 · '+(board.categories.join(', ')||'미분류'));categories.className='board-admin-meta';content.append(title,meta,categories);
  if(board.description){const description=node('p',board.description);description.className='board-admin-description';content.append(description);}
  const more=control('','more',()=>{menuBoard=board;menuOpener=more;$('board-admin-menu-title').textContent=board.name;view.href='/#boards/'+board.id;UIShell.dropdown.open(menu,more);});
  more.className='shell-icon board-admin-more';more.setAttribute('aria-label',board.name+' 게시판 메뉴');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-controls','board-admin-menu');
  row.append(content,more);$('board-admin-list').append(row);
 }
 if(!records.length)$('board-admin-list').append(node('p','게시판을 만들어 메뉴에 추가하세요.'));
}
function open(board){current=board;$('board-manage-form').reset();$('board-manage-name').value=board?.name||'';$('board-manage-group').value=board?.group||'공유게시판';$('board-manage-description').value=board?.description||'';$('board-manage-categories').value=(board?.categories||[]).join('\n');$('board-manage-order').value=board?.order||0;$('board-manage-menu').checked=board?.inMenu!==false;$('board-manage-active').checked=board?.active!==false;$('board-manage-delete').hidden=!board;$('board-manage-heading').textContent=board?'게시판 설정':'게시판 만들기';$('board-manage-error').textContent='';$('board-manage-delete').textContent='빈 게시판 삭제';$('board-manage-delete').dataset.confirm='';$('board-manage-dialog').showModal();}
$('admin-create').addEventListener('click',()=>{if(context()?.activePanel==='boards'&&context()?.user?.permissions.boards)open();});
$('board-manage-form').onsubmit=async e=>{e.preventDefault();const b=$('board-manage-save');if(b.disabled)return;b.disabled=true;try{const value={name:$('board-manage-name').value,group:$('board-manage-group').value,description:$('board-manage-description').value,categories:$('board-manage-categories').value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean),order:Number($('board-manage-order').value),inMenu:$('board-manage-menu').checked,active:$('board-manage-active').checked};await context().api('/api/admin/boards'+(current?'/'+current.id:''),current?'PUT':'POST',value);$('board-manage-dialog').close();await load();}catch(e){$('board-manage-error').textContent=e.message;}finally{b.disabled=false;}};
$('board-manage-delete').onclick=async()=>{const b=$('board-manage-delete');if(b.disabled)return;if(b.dataset.confirm!=='yes'){b.dataset.confirm='yes';b.textContent='삭제 확인 · 다시 눌러 삭제';return;}b.disabled=true;try{await context().api('/api/admin/boards/'+current.id,'DELETE');$('board-manage-dialog').close();await load();}catch(e){$('board-manage-error').textContent=e.message;}finally{b.disabled=false;}};
$('board-manage-close').onclick=()=>{if(!$('board-manage-save').disabled&&!$('board-manage-delete').disabled)$('board-manage-dialog').close();};$('board-manage-dialog').addEventListener('cancel',e=>{if($('board-manage-save').disabled||$('board-manage-delete').disabled)e.preventDefault();});
window.BoardAdmin={load};UIShell.dialogs();
if(context()?.user?.permissions.boards)load();
if(location.hash==='#boards'){const timer=setInterval(()=>{if(context()?.user){clearInterval(timer);if(context().user.permissions.boards)document.querySelector('[data-panel="boards"]').click();}},50);setTimeout(()=>clearInterval(timer),10000);}
})();

