(function(){
 const token=localStorage.getItem('token');
 if(!token){location.replace('/');return;}
 let required=false;
 const close=document.getElementById('password-change-close');
 let returnTo='/';
 try{const candidate=new URL(new URLSearchParams(location.search).get('returnTo')||document.referrer||'/',location.origin);if(candidate.origin===location.origin&&['/','/index.html','/admin.html'].includes(candidate.pathname))returnTo=candidate.pathname+candidate.hash;}catch{}
 function leave(){if(close.disabled)return;if(required)localStorage.removeItem('token');location.replace(required?'/':returnTo);}
 close.addEventListener('click',leave);
 document.addEventListener('keydown',event=>{if(event.key==='Escape')leave();});
 fetch('/api/auth/me',{headers:{Authorization:'Bearer '+token}}).then(async response=>{if(response.status===401){localStorage.removeItem('token');location.replace('/');return;}if(!response.ok)throw Error('계정 정보를 확인하지 못했습니다. 다시 시도해 주세요.');const user=await response.json();required=user.mustChangePassword===true;document.getElementById('password-change-description').textContent=required?'임시 비밀번호로 로그인했습니다. 새 비밀번호로 변경해 주세요. X로 닫으면 로그아웃됩니다.':'본인만 아는 새 비밀번호로 변경해 주세요.';close.disabled=false;}).catch(error=>{message.textContent=error.message;required=true;close.disabled=false;});
 const form=document.getElementById('change-password-form'),message=document.getElementById('change-password-message'),loader=document.getElementById('password-change-loading');
 document.getElementById('password-change-logout').addEventListener('click',()=>{localStorage.removeItem('token');location.replace('/');});
 form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]'),f=form.elements;if(button.disabled)return;
  message.textContent='';
  if(f.password.value!==f.passwordConfirmation.value){message.textContent='비밀번호 확인이 일치하지 않습니다.';f.passwordConfirmation.focus();return;}
  if(f.password.value===f.currentPassword.value){message.textContent='임시 또는 기존 비밀번호와 다른 비밀번호를 입력하세요.';f.password.focus();return;}
  button.disabled=true;close.disabled=true;loader.hidden=false;
  try{
   const response=await fetch('/api/auth/change-password',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:f.currentPassword.value,password:f.password.value,passwordConfirmation:f.passwordConfirmation.value})});
   const result=await response.json();
   if(response.status===401){localStorage.removeItem('token');location.replace('/');return;}
   if(!response.ok)throw new Error(result.message||'비밀번호를 변경하지 못했습니다.');
   localStorage.setItem('token',result.token);form.reset();location.replace(returnTo);
  }catch(error){message.textContent=error.message;}
  finally{button.disabled=false;close.disabled=false;loader.hidden=true;}
 });
})();
