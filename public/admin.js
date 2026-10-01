const adminScroll=ListScroll.mount(document.querySelector('.admin-shell'));
const adminToken=localStorage.getItem('token');
let licenseStatus;
let me, directory=[], users=[], appearance={}, backgroundData=null, activePanel;
let noticeVersion=0, noticeNext=null, noticeLoading=false, noticeObserver;
let pending=0, notices=[], noticeFilters={query:'',recipient:'',read:''};
const rights=['boards','notifications','files','appearance','users','permissions'];
const permissionKeys=[...rights,'boardRead','boardCreate','boardEdit','boardDelete','calendarRead','calendarCreate','calendarEdit','calendarDelete','worklogRead','worklogCreate','worklogEdit','worklogDelete','fileRead','fileUpload','fileDownload','fileDelete','notificationRead','memoRead','memoCreate','memoEdit','memoDelete'];
const $=id=>document.getElementById(id);
function status(message,error=false){$('admin-status').textContent=message;$('admin-status').classList.toggle('error',error);}
async function busy(action){pending++;$('admin-loading').hidden=false;try{return await action();}finally{pending--;$('admin-loading').hidden=pending===0;}}
async function api(path,method='GET',body,blob=false){
 const response=await fetch(path,{method,headers:{Authorization:'Bearer '+adminToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(response.status===401){localStorage.removeItem('token');location.replace('/');throw new Error('다시 로그인해 주세요.');}
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message||'요청을 처리하지 못했습니다.');}
 return blob?response.blob():response.json();
}
function options(select,items,valueKey='id',labelKey='username'){
 const selected=select.value;select.replaceChildren();
 for(const item of items){const option=document.createElement('option');option.value=item[valueKey];option.textContent=item[labelKey]+(item.active===false?' (비활성)':'');select.appendChild(option);}
 if(items.some(i=>String(i[valueKey])===selected))select.value=selected;
}
const userName=id=>directory.find(u=>Number(u.id)===Number(id))?.username||('사용자 '+id);
function row(title,detail){const div=document.createElement('div');div.className='admin-row';const strong=document.createElement('strong');strong.textContent=title;const small=document.createElement('small');small.textContent=detail;const actions=document.createElement('div');actions.className='admin-actions';div.append(strong,small,actions);return {div,actions};}
function button(label,action,danger=false){const b=document.createElement('button');b.type='button';b.className=danger?'danger-btn':'secondary-btn';b.textContent=label;b.addEventListener('click',()=>run(action));return b;}
async function run(action){status('');try{await busy(action);}catch(e){status(e.message,true);}}
function empty(container){if(!container.children.length){const p=document.createElement('p');p.textContent='등록된 항목이 없습니다.';container.appendChild(p);}}
function showPanel(key){adminScroll.capture();activePanel=key;const menu=UIConfig.menus.admin.find(menu=>menu.id===key);UIShell.title($('admin-title'),menu?.title||'관리페이지');UIShell.actions('admin',key,me?.permissions||{},[$('admin-create'),$('admin-search')]);document.querySelectorAll('.admin-panel').forEach(panel=>panel.hidden=panel.id!==menu?.panel);document.querySelectorAll('[data-panel]').forEach(button=>{if(button.dataset.panel===key)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});adminScroll.activate(key);}

function renderLicenseStatus(){
 const list=$('admin-users');if(!list)return;
 let note=$('license-status');
 if(!note){note=document.createElement('p');note.id='license-status';note.setAttribute('role','status');list.before(note);}
 note.replaceChildren(document.createTextNode(`무료 사용 ${licenseStatus.activeUserCount}/${licenseStatus.limit}명 · 관리자 포함. `));
 if(licenseStatus.atLimit)note.append(document.createTextNode(licenseStatus.overLimit?'한도 초과로 업무 기능이 차단되었습니다. 계정을 비활성화하여 6명 이하로 줄이세요. ':'7번째 사용자 등록·승인·재활성화에는 별도 라이선스가 필요합니다. '));
 const link=document.createElement('a');link.href='mailto:'+licenseStatus.contact;link.textContent='라이선스 문의 · '+licenseStatus.contact;note.append(link);
}
function setPermissionForm(){const u=users.find(u=>String(u.id)===$('permission-user').value);if(!u)return;$('permission-role').value=u.role;for(const key of permissionKeys){const box=$('permission-form').elements.namedItem(key);box.checked=u.permissions[key]===true;box.disabled=u.role==='admin';}}
function updatePermissionRole(){const admin=$('permission-role').value==='admin';for(const key of permissionKeys){const box=$('permission-form').elements.namedItem(key);box.disabled=admin;if(admin)box.checked=true;}}
function preview(){const form=$('appearance-form').elements;const values={...appearance,fontFamily:form.fontFamily.value,fontSize:Number(form.fontSize.value),spacing:form.spacing.value,theme:form.theme.value,background:form.background.value,loadingMotion:form.loadingMotion.value};window.SiteSettings.apply(values,{persist:false});const image=values.background==='custom'?(backgroundData||values.backgroundUrl):values.background==='autumn'?'images/login-autumn.webp':null;$('background-preview').style.backgroundImage=image?`url("${image}")`:'none';}
function setAppearance(values){appearance=values;for(const key of ['fontFamily','fontSize','spacing','theme','background','loadingMotion'])$('appearance-form').elements.namedItem(key).value=key==='loadingMotion'?LoadingMotion.normalize(values[key]):values[key];preview();}
async function refresh(reload=true){
 me=await api('/api/auth/me');if(me.mustChangePassword){location.replace('/change-password.html');return;}licenseStatus=await api('/api/license');
 if(licenseStatus.overLimit && !['users','permissions'].includes(activePanel)) activePanel=me.permissions.users?'users':'permissions';
 window.AccountMenu.configure(me);
 const allowed=UIConfig.allowed('admin',me.permissions).map(menu=>menu.id);document.querySelectorAll('[data-panel]').forEach(b=>b.hidden=!allowed.includes(b.dataset.panel));
 if(!allowed.length){$('admin-create').hidden=true;$('admin-search').hidden=true;$('admin-title').textContent='관리페이지';document.querySelectorAll('.admin-panel').forEach(p=>p.hidden=true);status('관리페이지에 접근할 권한이 없습니다.',true);return;}
 showPanel(allowed.includes(activePanel)?activePanel:allowed[0]);
 if(me.permissions.boards)await window.BoardAdmin?.load();
 if(['files','users','permissions'].includes(activePanel))directory=await api('/api/admin/directory');
 if((activePanel==='users'||activePanel==='permissions')&&(me.permissions.users||me.permissions.permissions)){users=await api('/api/admin/'+(me.permissions.users?'users':'permissions'));
 renderLicenseStatus();options($('permission-user'),users);setPermissionForm();}
 if(activePanel==='notifications'&&me.permissions.notifications){
  options($('notification-user'),[{id:'all',username:'전체 사용자 공통 공지'}]);
  options($('notice-recipient'),[{id:'',username:'전체 공지'}]);
  if(reload||!notices.length)await loadNotices(true);
  else if($('notice-load-more'))noticeObserver?.observe($('notice-load-more'));
 }
 if(activePanel==='files'&&me.permissions.files){const files=await api('/api/admin/files');const list=$('admin-files');list.replaceChildren();files.forEach(file=>{const r=row(file.originalName,userName(file.userId)+' · '+Math.ceil(file.sizeBytes/1024)+'KB');const input=document.createElement('input');input.value=file.originalName;input.setAttribute('aria-label',file.originalName+' 파일명 변경');input.maxLength=200;r.div.insertBefore(input,r.actions);r.actions.append(button('파일명 저장',async()=>{await api('/api/admin/files/'+file.id,'PUT',{originalName:input.value});await refresh();status('파일명을 변경했습니다.');}),button('다운로드',async()=>{const data=await FileTransfer.download(file,suffix=>api('/api/admin/files/'+file.id+suffix,'GET',undefined,true));const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=file.originalName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),button('삭제',async()=>{if(!confirm(file.originalName+' 파일을 삭제할까요?'))return;await api('/api/admin/files/'+file.id,'DELETE');await refresh();status('파일을 삭제했습니다.');},true));list.appendChild(r.div);});empty(list);}
 if(activePanel==='users'&&me.permissions.users){const pendingUsers=users.filter(user=>user.approval==='pending');$('approval-count').textContent=pendingUsers.length;const requests=$('admin-approvals');requests.replaceChildren();pendingUsers.forEach(user=>{const r=row(user.username,'승인 대기 · '+(user.createdAt?new Date(user.createdAt).toLocaleDateString('ko-KR'):''));r.actions.append(button('승인',async()=>{await api('/api/admin/users/'+user.id+'/approve','POST',{});await refresh();status('가입신청을 승인했습니다. 이제 로그인할 수 있습니다.');}),button('반려',async()=>{if(!confirm('이 가입신청을 반려할까요?'))return;await api('/api/admin/users/'+user.id+'/reject','POST',{});await refresh();status('가입신청을 반려했습니다.');},true));requests.appendChild(r.div);});empty(requests);const list=$('admin-users');list.replaceChildren();users.forEach(user=>{const r=row(user.username,(user.role==='admin'?'관리자':'일반 사용자')+' · '+(user.approval==='pending'?'승인 대기':user.approval==='rejected'?'반려':user.active?'활성':'비활성'));r.actions.append(button('수정',()=>openUserDialog(user)));if(me.role==='admin')r.actions.append(button('비밀번호 초기화',()=>{const form=$('password-reset-form');form.reset();form.elements.id.value=user.id;$('password-reset-account').textContent='대상 사용자: '+user.username;$('password-reset-error').textContent='';$('password-dialog').showModal();}));list.appendChild(r.div);});empty(list);}
 if(activePanel==='appearance'&&me.permissions.appearance){const values=await api('/api/admin/settings');backgroundData=null;$('background-file').value='';setAppearance(values);}
}

function noticeRow(note){
 const date=note.createdAt?new Date(note.createdAt).toLocaleDateString('ko-KR'):'';
 const r=row(note.title||note.message,(note.shared?'공통 공지':'이전 개별 공지')+' · '+date+' · 열람 '+note.readCount+'/'+note.audienceCount+'명'+(note.updatedAt?' · 수정됨':''));
 if(note.title){const preview=document.createElement('p');preview.className='notice-preview';preview.textContent=note.message;r.div.insertBefore(preview,r.actions);}
 r.actions.append(button('수정',()=>openNotificationDialog(note)),button('삭제',async()=>{if(!confirm('이 공지 게시글을 삭제할까요?'))return;await api('/api/admin/notifications/'+note.id,'DELETE');await loadNotices(true);status('공지를 삭제했습니다.');},true));
 return r.div;
}
async function loadNotices(reset=false){
 if(!reset&&(noticeLoading||noticeNext===null||activePanel!=='notifications'))return;
 if(reset){noticeVersion++;noticeNext=0;noticeObserver?.disconnect();}
 const version=noticeVersion,offset=noticeNext;noticeLoading=true;
 const more=$('notice-load-more');if(more){more.disabled=true;more.textContent='불러오는 중…';}
 try{
  const params=new URLSearchParams({limit:'30',offset:String(offset),...noticeFilters});
  const data=await api('/api/admin/notifications?'+params);
  if(version!==noticeVersion||activePanel!=='notifications')return;
  const items=Array.isArray(data)?data:data.items;
  const list=$('admin-notifications');noticeObserver?.disconnect();$('notice-load-more')?.remove();
  if(reset){notices=[];list.replaceChildren();}
  const ids=new Set(notices.map(n=>n.id)),fragment=document.createDocumentFragment();
  for(const note of items){if(ids.has(note.id))continue;notices.push(note);fragment.appendChild(noticeRow(note));}
  list.appendChild(fragment);noticeNext=Array.isArray(data)?null:data.nextOffset;
  $('notice-summary').textContent=Array.isArray(data)?`${data.length}건`:`${data.filteredTotal} / ${data.total}개 게시글 · 현재 ${notices.length}건 표시`;
  empty(list);
  if(noticeNext!==null){
   const trigger=button('더 불러오기',()=>loadNotices());trigger.id='notice-load-more';list.appendChild(trigger);
   if('IntersectionObserver' in window){noticeObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&!noticeLoading)run(()=>loadNotices());},{root:document.querySelector('.admin-shell'),rootMargin:'0px 0px 160px 0px'});noticeObserver.observe(trigger);}
  }
 }catch(error){if(version===noticeVersion){const trigger=$('notice-load-more');if(trigger){trigger.disabled=false;trigger.textContent='다시 불러오기';}}throw error;}
 finally{if(version===noticeVersion)noticeLoading=false;}
}
$('admin-search').addEventListener('click',()=>{if(activePanel!=='notifications'||!me?.permissions.notifications)return;$('notice-search').value=noticeFilters.query;$('notice-recipient').value=noticeFilters.recipient;$('notice-read').value=noticeFilters.read;$('notice-search-dialog').showModal();$('notice-search').focus();});
$('notice-search-form').addEventListener('submit',event=>{event.preventDefault();noticeFilters={query:$('notice-search').value.trim(),recipient:$('notice-recipient').value,read:$('notice-read').value};$('notice-search-dialog').close();adminScroll.activate('notifications',0);run(()=>loadNotices(true));});
$('notice-search-all').addEventListener('click',()=>{noticeFilters={query:'',recipient:'',read:''};$('notice-search-form').reset();$('notice-search-dialog').close();adminScroll.activate('notifications',0);run(()=>loadNotices(true));});

function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다.'));reader.readAsDataURL(file);});}
for(const b of document.querySelectorAll('[data-panel]'))b.addEventListener('click',()=>{noticeVersion++;noticeLoading=false;noticeObserver?.disconnect();showPanel(b.dataset.panel);run(()=>refresh(false));});
$('notification-reset').addEventListener('click',()=>{$('notification-dialog').close();});
function openNotificationDialog(note){const form=$('notification-form');form.reset();const f=form.elements;f.id.value=note?.id||'';f.userId.value='all';f.title.value=note?.title||'';f.message.value=note?.message||'';$('notice-target-hint').textContent=note&&!note.shared?'기존 개별 공지는 원래 게시 대상에게 수정 내용이 적용됩니다.':'모든 사용자가 함께 보는 공지입니다. 수정하면 사용자별 읽음 상태가 초기화됩니다.';$('notification-dialog-title').textContent=note?'공지 수정':'공지 등록';$('notification-form-error').textContent='';$('notification-dialog').showModal();$('notification-message').focus();}
$('admin-create').addEventListener('click',()=>{if(!me?.permissions[activePanel])return;if(activePanel==='notifications')openNotificationDialog();else if(activePanel==='files'){$('admin-upload-form').reset();$('admin-upload-error').textContent='';$('admin-upload-dialog').showModal();}else if(activePanel==='users')openUserDialog();});
function openUserDialog(user){const form=$('user-form');form.reset();const f=form.elements;f.id.value=user?.id||'';f.username.value=user?.username||'';f.active.value=String(user?.active!==false);f.password.required=!user;$('user-dialog-title').textContent=user?'사용자 수정':'사용자 등록';$('user-form-error').textContent=licenseStatus?.atLimit?'무료 사용 한도에 도달했습니다. 신규 활성 등록·승인은 제한됩니다. 이노마인드랩스: sumia1469@gmail.com':'';$('user-dialog').showModal();}
$('user-create').addEventListener('click',()=>openUserDialog());
for(const b of document.querySelectorAll('[data-close-dialog]'))b.addEventListener('click',()=>$(b.dataset.closeDialog).close());
async function submitDialog(form,dialog,errorId,action){const submit=form.querySelector('[type=submit]');if(submit.disabled)return;submit.disabled=true;form.querySelector('.dialog-progress').hidden=false;$(errorId).textContent='';try{await busy(action);dialog.close();}catch(error){$(errorId).textContent=error.message;}finally{submit.disabled=false;form.querySelector('.dialog-progress').hidden=true;}}
$('password-reset-form').addEventListener('submit',e=>{e.preventDefault();const form=e.target,f=form.elements;submitDialog(form,$('password-dialog'),'password-reset-error',async()=>{if(f.password.value!==f.passwordConfirmation.value)throw new Error('비밀번호 확인이 일치하지 않습니다.');await api('/api/admin/users/'+f.id.value+'/reset-password','POST',{password:f.password.value,passwordConfirmation:f.passwordConfirmation.value});form.reset();status('임시 비밀번호를 설정했습니다. 사용자에게 전달해 주세요. 로그인 후 본인 비밀번호로 변경해야 합니다.');});});
$('notification-form').addEventListener('submit',e=>{e.preventDefault();submitDialog(e.target,$('notification-dialog'),'notification-form-error',async()=>{const f=e.target.elements;await api('/api/admin/notifications'+(f.id.value?'/'+f.id.value:''),f.id.value?'PUT':'POST',{userId:f.userId.value==='all'?'all':Number(f.userId.value),title:f.title.value,message:f.message.value});e.target.reset();f.id.value='';await refresh();status('공지를 저장했습니다.');});});
$('user-form').addEventListener('submit',e=>{e.preventDefault();const form=e.target,f=form.elements;submitDialog(form,$('user-dialog'),'user-form-error',async()=>{if(!f.id.value&&!f.password.value)throw new Error('새 사용자 비밀번호를 입력하세요.');await api('/api/admin/users'+(f.id.value?'/'+f.id.value:''),f.id.value?'PUT':'POST',{username:f.username.value,password:f.password.value,active:f.active.value==='true'});form.reset();f.id.value='';await refresh();status('사용자를 저장했습니다.');});});
$('permission-user').addEventListener('change',setPermissionForm);$('permission-role').addEventListener('change',updatePermissionRole);
$('permission-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const f=e.target.elements;const permissions=Object.fromEntries(permissionKeys.map(key=>[key,f.namedItem(key).checked]));await api('/api/admin/permissions/'+f.userId.value,'PUT',{role:f.role.value,permissions});await refresh();if(rights.some(key=>me.permissions[key]))status('권한을 저장했습니다.');});});
$('admin-upload-form').addEventListener('submit',e=>{e.preventDefault();submitDialog(e.target,$('admin-upload-dialog'),'admin-upload-error',async()=>{const file=$('admin-file').files[0];if(!file)return;await FileTransfer.upload(file,payload=>api('/api/upload','POST',payload),percent=>{$('admin-upload-error').textContent='업로드 '+percent+'%';});$('admin-upload-error').textContent='';e.target.reset();await refresh();status('파일을 업로드했습니다.');});});
$('appearance-form').addEventListener('change',e=>{if(e.target.id!=='background-file')preview();});
$('background-file').addEventListener('change',()=>run(async()=>{const file=$('background-file').files[0];if(!file)return;if(file.size>1024*1024)throw new Error('배경 이미지는 최대 1MB입니다.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG·JPG·WebP 이미지를 선택하세요.');backgroundData=await fileData(file);$('screen-background').value='custom';preview();}));
$('appearance-default').addEventListener('click',()=>{backgroundData=null;$('background-file').value='';setAppearance({fontFamily:'system',fontSize:16,spacing:'normal',theme:'light',background:'autumn',loadingMotion:'petal',backgroundUrl:appearance.backgroundUrl});status('기본값을 미리 보고 있습니다. 적용하려면 설정 저장을 누르세요.');});
$('appearance-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{const f=e.target.elements;const saved=await api('/api/admin/settings','PUT',{fontFamily:f.fontFamily.value,fontSize:Number(f.fontSize.value),spacing:f.spacing.value,theme:f.theme.value,background:f.background.value,loadingMotion:f.loadingMotion.value,...(backgroundData?{imageData:backgroundData.split(',')[1]}:{})});backgroundData=null;$('background-file').value='';window.SiteSettings.apply(saved);setAppearance(saved);status('화면·배경 설정을 저장했습니다.');});});
if(!adminToken)location.replace('/');else run(refresh);


window.AdminBoardContext={get user(){return me;},get activePanel(){return activePanel;},api,refresh};


