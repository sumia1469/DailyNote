const ds=require('./datastore');
const {sendJson}=require('./utils');
const LIMIT=3*1024*1024;
async function body(req){
 if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>LIMIT)throw Error('메모는 첨부를 포함해 3MB까지 저장할 수 있습니다.');return JSON.parse(raw);}
 const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>LIMIT)throw Error('메모는 첨부를 포함해 3MB까지 저장할 수 있습니다.');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString()||'{}');
}
function validate(input){
 const value={};
 for(const [key,max] of Object.entries({title:200,html:200000,text:100000,folder:80,font:30,color:20})){
  if(typeof input[key]!=='string'||input[key].length>max)throw Error('메모 입력값을 확인해 주세요.');value[key]=input[key];
 }
 if(!['white','yellow','blue','green','pink'].includes(value.color)||!['sans-serif','serif','monospace'].includes(value.font))throw Error('지원하지 않는 서식입니다.');
 value.starred=input.starred===true;value.pinned=input.pinned===true;value.attachments=[];
 if(!Array.isArray(input.attachments)||input.attachments.length>20)throw Error('첨부는 최대 20개입니다.');
 for(const item of input.attachments){if(!item||!['image','audio'].includes(item.kind)||typeof item.data!=='string'||typeof item.name!=='string'||item.name.length>200)throw Error('첨부 형식이 올바르지 않습니다.');
  const match=item.data.match(/^data:(image\/(?:png|jpeg|webp)|audio\/(?:webm|mp4|ogg|wav|mpeg))(?:;codecs=[\w.-]+)?;base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||!match[1].startsWith(item.kind+'/'))throw Error('사진 또는 음성 파일 형식이 올바르지 않습니다.');value.attachments.push({kind:item.kind,name:item.name,data:item.data});
 }
 if(!value.title.trim()&&!value.text.trim()&&!value.attachments.length)throw Error('제목이나 내용을 입력해 주세요.');return value;
}
async function memoRouter(req,res,auth){
 const pathname=new URL(req.url,'http://localhost').pathname;const match=pathname.match(/^\/api\/memos(?:\/(\d+))?$/);if(!match)return sendJson(res,404,{message:'메모를 찾을 수 없습니다.'});
 const id=match[1]?Number(match[1]):null;
 if(req.method==='GET'&&!id){const all=await ds.findAll('memos');return sendJson(res,200,all.filter(x=>x.userId===auth.userId).map(({html,attachments,...x})=>({...x,attachmentCount:attachments.length})));}
 const existing=id?await ds.findOne('memos',x=>x.id===id&&x.userId===auth.userId):null;
 if(id&&!existing)return sendJson(res,404,{message:'메모를 찾을 수 없습니다.'});
 if(req.method==='GET'&&id)return sendJson(res,200,existing);
 if(req.method==='DELETE'&&id){await ds.remove('memos',id);return sendJson(res,200,{message:'삭제했습니다.'});}
 if((req.method==='POST'&&!id)||(req.method==='PUT'&&id)){
  let value;try{value=validate(await body(req));}catch(e){return sendJson(res,400,{message:e.message});}
  const now=new Date().toISOString();const result=id?await ds.update('memos',id,{...value,updatedAt:now}):await ds.insert('memos',{...value,userId:auth.userId,createdAt:now,updatedAt:now});return sendJson(res,id?200:201,result);
 }return sendJson(res,405,{message:'지원하지 않는 요청입니다.'});
}
module.exports={memoRouter,validate};
