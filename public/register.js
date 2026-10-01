document.getElementById('register-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target,button=form.querySelector('button[type="submit"]'),message=document.getElementById('register-message');
 if(button.disabled)return;message.textContent='';message.classList.remove('success');
 const fields=form.elements;
 if(fields.password.value!==fields.passwordConfirmation.value){message.textContent='비밀번호 확인이 일치하지 않습니다.';fields.passwordConfirmation.focus();return;}
 button.disabled=true;document.getElementById('register-loading').hidden=false;
 try {
  const response=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fields.username.value.trim(),password:fields.password.value,passwordConfirmation:fields.passwordConfirmation.value})});
  const result=await response.json();if(!response.ok)throw new Error(result.message||'등록신청을 처리하지 못했습니다.');
  form.reset();form.hidden=true;message.classList.add('success');message.textContent=result.message;
 } catch(error){message.textContent=error.message;}
 finally {button.disabled=false;document.getElementById('register-loading').hidden=true;}
});
