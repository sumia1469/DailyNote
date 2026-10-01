(function(){
'use strict';
async function upload(file,send,progress=()=>{}){
 const info=await send({phase:'start',filename:file.name,mime:file.type,size:file.size});
 try{
  const count=Math.max(1,Math.ceil(file.size/info.chunkSize));
  for(let index=0;index<count;index++){
   const part=file.slice(index*info.chunkSize,(index+1)*info.chunkSize);
   const result=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('파일을 읽지 못했습니다.'));reader.onabort=()=>reject(Error('파일 읽기가 취소되었습니다.'));reader.readAsDataURL(part);});
   await send({phase:'part',id:info.id,index,data:result.slice(result.indexOf(',')+1)});
   progress(Math.round((index+1)/count*100));
  }
  return info.id;
 }catch(error){await send({phase:'cancel',id:info.id}).catch(()=>{});throw error;}
}
async function download(file,read){
 const parts=[];
 if(file.chunkCount){for(let i=0;i<file.chunkCount;i++)parts.push(await read('?part='+i));}
 else parts.push(await read(''));
 return new Blob(parts,{type:file.mimeType||'application/octet-stream'});
}
window.FileTransfer={upload,download};
})();
