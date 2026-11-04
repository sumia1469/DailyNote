(function(){
'use strict';
let dialog,activeUrl=null;
function ensure(){
 if(dialog)return dialog;
 dialog=document.createElement('dialog');dialog.className='journal-dialog file-preview-dialog';dialog.setAttribute('aria-label','파일 미리보기');
 dialog.style.cssText='width:min(94vw,960px);max-width:960px;max-height:90dvh;padding:16px;border:0;border-radius:18px;box-shadow:0 20px 80px #0005';
 const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:12px';
 const title=document.createElement('strong');title.id='file-preview-title';title.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
 const close=document.createElement('button');close.type='button';close.textContent='닫기 ✕';close.className='secondary-btn';close.addEventListener('click',()=>dialog.close());
 header.append(title,close);
 const body=document.createElement('div');body.id='file-preview-body';body.style.cssText='min-height:160px;max-height:75dvh;overflow:auto;text-align:center';
 dialog.append(header,body);document.body.append(dialog);
 dialog.addEventListener('close',()=>{body.replaceChildren();if(activeUrl)URL.revokeObjectURL(activeUrl);activeUrl=null;});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 return dialog;
}
function typeOf(file){const mime=(file.mimeType||'').toLowerCase(),name=(file.originalName||'').toLowerCase();
 if(mime.startsWith('image/')||/\.(png|jpe?g|gif|webp|bmp|avif)$/.test(name))return 'image';
 if(mime==='application/pdf'||name.endsWith('.pdf'))return 'pdf';
 if(mime.startsWith('video/'))return 'video';if(mime.startsWith('audio/'))return 'audio';
 if(mime.startsWith('text/')||/\.(txt|csv|json|md|xml|log|js|css|html)$/.test(name))return 'text';return 'other';
}
async function open(file,download){
 const d=ensure(),body=d.querySelector('#file-preview-body');d.querySelector('#file-preview-title').textContent=file.originalName||'파일 미리보기';
 body.textContent='미리보기를 불러오는 중입니다…';if(!d.open)d.showModal();
 try{
  const blob=await download();if(!d.open)return;
  body.replaceChildren();const type=typeOf(file);
  if(type==='text'){
   if(blob.size>2*1024*1024)throw Error('텍스트 미리보기는 2MB까지 지원합니다.');
   const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;word-break:break-word;text-align:left';pre.textContent=await blob.text();body.append(pre);
  }else if(type==='other'){
   const p=document.createElement('p');p.textContent='이 파일 형식은 브라우저 미리보기를 지원하지 않습니다. 다운로드해서 확인해 주세요.';body.append(p);
  }else{
   activeUrl=URL.createObjectURL(blob);let node;
   if(type==='image'){node=document.createElement('img');node.alt=file.originalName||'이미지';node.style.cssText='max-width:100%;max-height:70dvh;object-fit:contain';}
   else if(type==='pdf'){node=document.createElement('iframe');node.title='PDF 미리보기';node.style.cssText='width:100%;height:68dvh;border:0';}
   else{node=document.createElement(type);node.controls=true;node.style.cssText='max-width:100%;max-height:65dvh';}
   node.src=activeUrl;body.append(node);
  }
 }catch(error){body.textContent='미리보기를 표시하지 못했습니다: '+error.message;}
}
async function thumbnail(file,download,button){
 if((file.sizeBytes||0)>3*1024*1024)return;
 try{const blob=await download();if(!button.isConnected)return;const url=URL.createObjectURL(blob);const img=document.createElement('img');img.alt='';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit';img.onload=()=>URL.revokeObjectURL(url);img.onerror=()=>URL.revokeObjectURL(url);img.src=url;button.replaceChildren(img);}catch{} 
}
window.FilePreview={open,thumbnail,typeOf};
})();
