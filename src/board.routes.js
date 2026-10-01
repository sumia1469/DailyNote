const ds=require('./datastore');
const {sendJson,parseJsonBody}=require('./utils');
const {downloadHandler}=require('./upload.routes');
const array=value=>Array.isArray(value)?value:[];
const normalizeBoard=value=>value?{...value,categories:array(value.categories)}:null;
const normalizePost=value=>value?{...value,attachments:array(value.attachments),references:array(value.references),mentions:array(value.mentions),tags:array(value.tags)}:null;
const manage=auth=>auth.role==='admin'||auth.permissions?.boards===true;
const can=(auth,key)=>auth.permissions?.[key]===true;
const fail=(res,status,message)=>sendJson(res,status,{message});
function boardValue(v){
 if(typeof v.name!=='string'||!v.name.trim()||v.name.length>80)throw Error('게시판 이름은 1~80자로 입력하세요.');
 if(!Array.isArray(v.categories)||v.categories.length>50||v.categories.some(x=>typeof x!=='string'||!x.trim()||x.length>50))throw Error('분류는 50자 이내로 최대 50개까지 등록하세요.');
 return {name:v.name.trim(),group:String(v.group||'공유게시판').slice(0,50),description:String(v.description||'').slice(0,500),categories:[...new Set(v.categories.map(x=>x.trim()))],inMenu:v.inMenu!==false,active:v.active!==false,order:Number.isFinite(Number(v.order))?Number(v.order):0};
}
async function postValue(v,board,auth,previous){
 if(typeof v.title!=='string'||!v.title.trim()||v.title.length>200||typeof v.html!=='string'||v.html.length>500000||typeof v.text!=='string'||v.text.length>200000)throw Error('제목과 본문을 확인하세요.');
 if(v.category&&!board.categories.includes(v.category))throw Error('게시판에 등록된 분류를 선택하세요.');
 if(!Array.isArray(v.attachments)||v.attachments.length>100||!Array.isArray(v.references)||v.references.length>50)throw Error('첨부 또는 참조 개수를 확인하세요.');
 const attachments=[];
 for(const id of [...new Set(v.attachments)]){
  const file=await ds.findOne('files',f=>f.id===id&&f.status!=='uploading');
  // A copied post may retain files already shared in its source, never arbitrary private IDs.
  if(!file||(file.userId!==auth.userId&&!previous?.attachments?.includes(id)))throw Error('접근할 수 없는 첨부입니다.');
  attachments.push(id);
 }
 const references=[];
 for(const ref of v.references){
  if(previous?.references?.some(x=>x.type===ref.type&&x.id===ref.id)){references.push(previous.references.find(x=>x.type===ref.type&&x.id===ref.id));continue;}
  const names={memos:'memos',worklogs:'work_logs',files:'files'};if(!names[ref.type])throw Error('지원하지 않는 참조입니다.');
  const record=await ds.findOne(names[ref.type],x=>x.id===ref.id&&x.userId===auth.userId);if(!record)throw Error('본인 자료만 참조할 수 있습니다.');
  const right={memos:'memoRead',worklogs:'worklogRead',files:'fileRead'}[ref.type];if(!can(auth,right))throw Error('참조 자료를 조회할 권한이 없습니다.');
  if(ref.type==='files'){if(record.status==='uploading')throw Error('업로드 중인 파일입니다.');if(!attachments.includes(record.id))attachments.push(record.id);}
  references.push({type:ref.type,id:ref.id,title:String(record.title||record.originalName||record.workDate||'참조'),text:ref.type==='memos'?String(record.text||''):ref.type==='worklogs'?JSON.stringify({workDate:record.workDate,todo:record.todo,nextDayPlan:record.nextDayPlan,remarks:record.remarks,memo:record.memo}):record.originalName});
 }
 const tags=String(v.tags||'').split(/[#,\s]+/).filter(Boolean);if(tags.length>30||tags.some(x=>x.length>50))throw Error('태그는 50자 이내로 최대 30개입니다.');
 const mentions=[...new Set(Array.isArray(v.mentions)?v.mentions:[])];if(mentions.length>50)throw Error('멘션은 최대 50명입니다.');
 const users=await ds.findAll('users');if(mentions.some(id=>!users.some(u=>u.id===id&&u.active!==false&&u.approval!=='pending'&&u.approval!=='rejected')))throw Error('멘션 대상을 확인하세요.');
 return {title:v.title.trim(),html:v.html,text:v.text,category:v.category||'',tags:[...new Set(tags)],mentions,attachments,references};
}
async function present(post){post=normalizePost(post);const files=await ds.findAll('files');return {...post,attachments:(post.attachments||[]).map(id=>files.find(f=>f.id===id&&f.status!=='uploading')).filter(Boolean).map(({id,originalName,mimeType,sizeBytes,chunkCount})=>({id,originalName,mimeType,sizeBytes,chunkCount}))};}
async function boardRouter(req,res,auth){
 const url=new URL(req.url,'http://localhost'),m=url.pathname.match(/^\/api\/(admin\/)?boards(?:\/(\d+))?(?:\/(posts|members)(?:\/(\d+))?(?:\/files\/(\d+))?)?$/);
 if(!m)return fail(res,404,'게시판을 찾을 수 없습니다.');
 const admin=!!m[1],id=Number(m[2]),kind=m[3],postId=Number(m[4]),fileId=Number(m[5]),method=req.method;
 if(admin&&!manage(auth))return fail(res,403,'게시판 관리 권한이 없습니다.');
 if(!admin&&!can(auth,'boardRead'))return fail(res,403,'게시판 조회 권한이 없습니다.');
 const board=normalizeBoard(id?await ds.findOne('boards',x=>x.id===id):null);
 if(id&&(!board||(!admin&&!board.active)))return fail(res,404,'삭제되거나 비활성화된 게시판입니다.');
 if(!kind){
  if(method==='GET')return sendJson(res,200,id?board:(await ds.findAll('boards')).map(normalizeBoard).filter(x=>admin||x.active).sort((a,b)=>a.order-b.order||a.id-b.id));
  if(!admin)return fail(res,403,'게시판 관리 권한이 없습니다.');
  if(method==='DELETE'&&id){if((await ds.findAll('board_posts')).some(p=>p.boardId===id))return fail(res,409,'게시글이 있는 게시판은 비활성화해서 보관하세요.');await ds.remove('boards',id);return sendJson(res,200,{id});}
  if((method==='POST'&&!id)||(method==='PUT'&&id)){try{const value=boardValue(await parseJsonBody(req));const now=new Date().toISOString();return sendJson(res,id?200:201,id?await ds.update('boards',id,{...value,updatedAt:now}):await ds.insert('boards',{...value,createdAt:now,updatedAt:now}));}catch(e){return fail(res,400,e.message);}}
  return fail(res,405,'지원하지 않는 요청입니다.');
 }
 if(admin||!id)return fail(res,404,'게시판 경로를 확인하세요.');
 if(kind==='members'&&method==='GET')return sendJson(res,200,(await ds.findAll('users')).filter(x=>x.active!==false&&(!x.approval||x.approval==='approved')).map(x=>({id:x.id,username:x.username})));
 if(kind!=='posts')return fail(res,405,'지원하지 않는 요청입니다.');
 const post=normalizePost(postId?await ds.findOne('board_posts',x=>x.id===postId&&x.boardId===id):null);
 if(postId&&!post)return fail(res,404,'게시글이 삭제되었거나 존재하지 않습니다.');
 if(fileId){if(method!=='GET'||!post.attachments?.includes(fileId))return fail(res,404,'첨부를 찾을 수 없습니다.');if(!can(auth,'fileDownload'))return fail(res,403,'다운로드 권한이 없습니다.');const file=await ds.findOne('files',x=>x.id===fileId);if(!file)return fail(res,404,'첨부가 삭제되었습니다.');return downloadHandler(req,res,{...auth,userId:file.userId},fileId);}
 if(method==='GET'&&postId)return sendJson(res,200,await present(post));
 if(method==='GET'){
  const limit=Math.min(30,Math.max(1,Number(url.searchParams.get('limit'))||20)),cursor=Number(url.searchParams.get('cursor'))||Infinity,q=(url.searchParams.get('q')||'').toLocaleLowerCase(),category=url.searchParams.get('category')||'';
  const rows=(await ds.findAll('board_posts')).map(normalizePost).filter(x=>x.boardId===id&&(!category||x.category===category)&&[x.title,x.text,x.author,...(x.tags||[])].join(' ').toLocaleLowerCase().includes(q)).sort((a,b)=>b.id-a.id),page=rows.filter(x=>x.id<cursor).slice(0,limit);
  return sendJson(res,200,{items:page.map(({html,text,attachments,references,...x})=>({...x,preview:text.slice(0,160),attachmentCount:attachments.length})),total:rows.length,nextCursor:rows.some(x=>x.id<(page.at(-1)?.id||0))?page.at(-1).id:null});
 }
 const right={POST:'boardCreate',PUT:'boardEdit',DELETE:'boardDelete'}[method];if(!right||!can(auth,right))return fail(res,403,'이 작업을 사용할 권한이 없습니다.');
 if(post&&post.userId!==auth.userId&&!manage(auth))return fail(res,403,'작성자 또는 게시판 관리자만 수정·삭제할 수 있습니다.');
 if(method==='DELETE'&&postId){await ds.remove('board_posts',postId);return sendJson(res,200,{id:postId});}
 if((method==='POST'&&!postId)||(method==='PUT'&&postId)){
  try{const input=await parseJsonBody(req);let source=post;
   if(input.sourcePostId&&!post){source=normalizePost(await ds.findOne('board_posts',p=>p.id===input.sourcePostId&&p.boardId===id));if(!source)throw Error('복제 원문이 삭제되었습니다.');}
   const value=await postValue(input,board,auth,source),now=new Date().toISOString();return sendJson(res,post?200:201,await present(post?await ds.update('board_posts',postId,{...value,updatedAt:now}):await ds.insert('board_posts',{...value,boardId:id,userId:auth.userId,author:auth.username,createdAt:now,updatedAt:now})));
  }catch(e){return fail(res,400,e.message);}
 }
 return fail(res,405,'지원하지 않는 요청입니다.');
}
module.exports={boardRouter,boardValue,postValue};
