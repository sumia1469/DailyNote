(function(){
  const opener=document.getElementById('account-settings-open'),trigger=document.getElementById('profile-open');
  if(!opener||!trigger)return;
  const menu=document.createElement('dialog');
  menu.id='account-settings-dialog';menu.className='journal-dialog account-settings-dialog';menu.setAttribute('aria-labelledby','account-settings-title');
  menu.innerHTML='<div class="journal-dialog-header"><h2 id="account-settings-title">설정</h2><button type="button" class="shell-icon" data-icon="close" aria-label="설정 닫기"></button></div><nav aria-label="설정 메뉴"><a href="onboarding.html" data-icon="journal">시작하기 · 시작 가이드</a><a href="local-start.html" data-icon="download">바로가기 만들기</a><a href="change-password.html" id="change-password-link" data-icon="password">비밀번호 변경</a><a href="admin.html" id="admin-page-btn" data-icon="shield" hidden>관리자</a></nav>';
  document.body.append(menu);
  const dialog=document.createElement('dialog');
  dialog.id='profile-dialog';dialog.className='journal-dialog profile-dialog';dialog.setAttribute('aria-labelledby','profile-title');
  dialog.innerHTML='<div class="journal-dialog-header"><h2 id="profile-title">내 프로필</h2><button type="button" id="profile-close" class="shell-icon" data-icon="close" aria-label="프로필 닫기"></button></div><form id="profile-form"><div class="profile-photo"><span id="profile-preview" class="profile-avatar" aria-label="프로필 사진 미리보기"></span><button type="button" id="profile-photo-change" class="secondary-btn">사진 변경</button><input type="file" id="profile-file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" id="profile-remove" class="secondary-btn">사진 삭제</button></div><div class="form-field"><label for="profile-nickname">별명</label><input id="profile-nickname" maxlength="40" autocomplete="nickname" placeholder="별명을 입력하세요"><small>비워두면 로그인 아이디로 표시됩니다.</small></div><p id="profile-error" class="dialog-error" role="alert"></p><div class="journal-dialog-actions"><button type="button" id="profile-cancel" class="secondary-btn">취소</button><button type="submit" id="profile-save" class="primary-btn">저장</button></div></form>';
  document.body.append(dialog);
  let user=null,avatar='',busy=false,reading=false,version=0;
  const $=id=>document.getElementById(id),error=$('profile-error');
  function paint(node,value,name){node.replaceChildren();if(value){const img=document.createElement('img');img.src=value;img.alt='';node.append(img);}else node.textContent=(name||'나').slice(0,1);}
  function render(){if(!user)return;const name=user.nickname||user.username;$(document.getElementById('admin-account')?'admin-account':'shell-account').textContent=name;$('account-username').textContent=user.username;paint($('account-avatar'),user.avatar,name);}
  function configure(value){user=value;render();$('admin-page-btn').hidden=!['boards','notifications','files','appearance','users','permissions'].some(key=>user.permissions?.[key]);}
  function lock(value){busy=value;dialog.querySelectorAll('button,input').forEach(node=>node.disabled=value);$('profile-save').textContent=value?'저장 중…':'저장';}
  function close(){if(!busy&&!reading)dialog.close();}
  opener.addEventListener('click',()=>{if(!user)return;$('change-password-link').href='/change-password.html?returnTo='+encodeURIComponent(location.pathname+location.hash);menu.showModal();opener.setAttribute('aria-expanded','true');});
  menu.querySelector('button').addEventListener('click',()=>menu.close());
  menu.addEventListener('close',()=>{opener.setAttribute('aria-expanded','false');opener.focus();});
  trigger.addEventListener('click',()=>{if(!user)return;version++;avatar=user.avatar||'';$('profile-nickname').value=user.nickname||'';$('profile-file').value='';error.textContent='';paint($('profile-preview'),avatar,user.nickname||user.username);dialog.showModal();});
  $('profile-close').addEventListener('click',close);$('profile-cancel').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{if(busy||reading)event.preventDefault();});
  dialog.addEventListener('close',()=>{version++;trigger.focus();});
  $('profile-photo-change').addEventListener('click',()=>$('profile-file').click());
  $('profile-remove').addEventListener('click',()=>{avatar='';$('profile-file').value='';paint($('profile-preview'),avatar,$('profile-nickname').value||user.username);});
  $('profile-file').addEventListener('change',async()=>{
    const file=$('profile-file').files[0],ticket=++version;if(!file)return;
    error.textContent='';reading=true;lock(true);
    let objectUrl;
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('PNG·JPG·WebP 사진을 선택하세요.');
      objectUrl=URL.createObjectURL(file);const img=new Image();img.src=objectUrl;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const context=canvas.getContext('2d'),side=Math.min(img.naturalWidth,img.naturalHeight);
      context.fillStyle='#fff';context.fillRect(0,0,256,256);context.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,256,256);
      if(ticket!==version||!dialog.open)return;
      avatar=canvas.toDataURL('image/jpeg',0.86);paint($('profile-preview'),avatar,$('profile-nickname').value||user.username);
    }catch(e){error.textContent=e.message||'사진을 읽을 수 없습니다.';}finally{if(objectUrl)URL.revokeObjectURL(objectUrl);reading=false;lock(false);}
  });
  $('profile-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||reading)return;error.textContent='';lock(true);
    try{
      const response=await fetch('/api/auth/profile',{method:'PUT',headers:{Authorization:'Bearer '+(localStorage.getItem('token')||''),'Content-Type':'application/json'},body:JSON.stringify({nickname:$('profile-nickname').value,avatar})});
      const data=await response.json();if(!response.ok)throw Error(data.message||'프로필 저장에 실패했습니다.');
      if(!user)return;Object.assign(user,data);render();dialog.close();
    }catch(e){error.textContent=e.message;}finally{lock(false);}
  });
  UIShell.dialogs();window.AccountMenu={configure,reset(){version++;user=null;menu.close();dialog.close();}};
})();
