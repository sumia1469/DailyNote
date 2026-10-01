const crypto=require('node:crypto');
const ds=require('./datastore'),storage=require('./file-storage');
const {sendJson}=require('./utils');
const {validate:validateMemo}=require('./memo.routes');
const {keys:permissionKeys,roleOf}=require('./permissions');
const Reference=require('../public/reference-core');
const CHUNK=512*1024;
const scopes={worklogs:['work_logs'],memos:['memos'],files:['files'],schedules:['calendar_events'],notifications:['notifications'],management:['users','site_settings','notifications','notification_history','notification_reads','boards'],boards:['users','boards','board_posts','files'],all:['users','work_logs','memos','files','calendar_events','notifications','site_settings','notification_history','notification_reads','boards','board_posts']};
function fail(message,status=400){throw Object.assign(Error(message),{status});}
function authorize(auth,scope,write=false){
 if(!scopes[scope])fail('지원하지 않는 백업 종류입니다.');
 if(['all','management','boards'].includes(scope)){if(auth.role!=='admin')fail('전체·관리정보 백업과 복원은 관리자만 사용할 수 있습니다.',403);return;}
 const rights={worklogs:write?['worklogRead','worklogCreate']:['worklogRead'],memos:write?['memoRead','memoCreate']:['memoRead'],files:write?['fileRead','fileUpload']:['fileRead','fileDownload'],schedules:write?['calendarRead','calendarCreate']:['calendarRead'],boards:['boards'],notifications:['notificationRead']}[scope];
 if(scope==='notifications'&&write)fail('공지 복원은 관리자 관리정보 불러오기를 사용하세요.',403);
 if(!rights.every(key=>auth.permissions[key]===true))fail('백업·불러오기 권한이 없습니다.',403);
}
async function readBody(req){
 let raw;if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
 else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024)fail('백업 조각이 너무 큽니다.');chunks.push(chunk);}raw=Buffer.concat(chunks).toString();}
 if(Buffer.byteLength(raw)>4*1024*1024)fail('백업 조각이 너무 큽니다.');try{return JSON.parse(raw);}catch{fail('JSON 형식이 올바르지 않습니다.');}
}
function pick(record,fields){return Object.fromEntries(fields.filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function tree(value,depth=0){
 if(!Array.isArray(value)||depth>30||value.length>10000)fail('일정 항목 형식 또는 단계 수를 확인하세요.');
 return value.filter(x=>x!==null).map(x=>{if(typeof x==='string')return {task:x,checked:false,children:[]};if(!x||typeof x.task!=='string'||x.task.length>200000)fail('일정 내용 형식이 올바르지 않습니다.');return {task:x.task,checked:x.checked===true,children:tree(x.children||[],depth+1)};});
}
function normalize(kind,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!Number.isSafeInteger(input.id)||input.id<1)fail('백업 항목 ID가 올바르지 않습니다.');
 const base=pick(input,['id','userId','createdAt','updatedAt']);
 if(kind==='notification_history'){if(typeof input.releaseId!=='string'||input.releaseId.length>100)fail('공지 이력을 확인하세요.');return {...base,releaseId:input.releaseId};}
 if(kind==='notification_reads'){if(typeof input.releaseId!=='string'||input.releaseId.length>200)fail('공지 읽음 이력을 확인하세요.');return {...base,releaseId:input.releaseId,readAt:input.readAt};}
 if(kind==='boards'){return {...base,...require('./board.routes').boardValue(input)};}
 if(kind==='board_posts'){if(!['attachments','references','tags','mentions'].every(k=>Array.isArray(input[k]||[]))||String(input.title||'').length>200||String(input.html||'').length>500000||String(input.text||'').length>200000)fail('게시글 입력 크기 또는 참조 형식을 확인하세요.');if(typeof input.title!=='string'||typeof input.html!=='string'||typeof input.text!=='string'||!Number.isSafeInteger(input.boardId))fail('게시글 형식을 확인하세요.');return {...base,...pick(input,['boardId','title','html','text','category','tags','mentions','attachments','references','author'])};}
 if(kind==='work_logs'){if(!validDate(input.workDate))fail('업무일자를 확인하세요.');return {...base,workDate:input.workDate,todo:tree(input.todo||[]),nextDayPlan:tree(input.nextDayPlan||[]),completed:input.completed===true,remarks:String(input.remarks||''),memo:String(input.memo||''),...pick(input,['remarksItems','memoItems'])};}
 if(kind==='memos')return {...base,...validateMemo({...input,attachments:input.attachments||[]})};
 if(kind==='files'){
  if(typeof input.originalName!=='string'||!input.originalName||input.originalName.length>255||!Number.isSafeInteger(input.sizeBytes)||input.sizeBytes<0)fail('파일 정보를 확인하세요.');
  return {...base,originalName:input.originalName,mimeType:typeof input.mimeType==='string'?input.mimeType:'application/octet-stream',sizeBytes:input.sizeBytes,uploadedAt:input.uploadedAt||new Date().toISOString()};
 }
 if(kind==='users'){
  if(typeof input.username!=='string'||!input.username.trim()||input.username.length>80||!/^[a-f0-9]{128}$/i.test(input.password)||!/^[a-f0-9]{64}$/i.test(input.salt))fail('사용자 정보 또는 이전 비밀번호 형식을 확인하세요.');
  return {...base,username:input.username,password:input.password,salt:input.salt,role:roleOf(input),active:input.active!==false,approval:['pending','rejected'].includes(input.approval)?input.approval:'approved',permissions:Object.fromEntries(permissionKeys.filter(k=>typeof input.permissions?.[k]==='boolean').map(k=>[k,input.permissions[k]])),mustChangePassword:input.mustChangePassword===true};
 }
 if(kind==='notifications'){
  if(typeof input.message!=='string'||input.message.length>2000||String(input.title||'').length>120)fail('공지 형식을 확인하세요.');
  return {...base,message:input.message,title:input.title||'',isRead:input.isRead===true,...pick(input,['releaseId','shared','deleted','revision'])};
 }
 if(kind==='site_settings'){
  const v=input.values;if(!v||!['system','sans','serif'].includes(v.fontFamily)||![14,16,18,20].includes(v.fontSize)||!['compact','normal','comfortable'].includes(v.spacing)||!['light','white','dark'].includes(v.theme)||!['autumn','custom','none'].includes(v.background))fail('화면 설정 형식을 확인하세요.');
  if(input.imageData&&(!/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageData)||Buffer.from(input.imageData,'base64').length>1024*1024||!['image/png','image/jpeg','image/webp'].includes(input.imageMime)))fail('배경 이미지 형식을 확인하세요.');
  return {...base,values:pick(v,['fontFamily','fontSize','spacing','theme','background','loadingMotion']),...pick(input,['imageData','imageMime'])};
 }
 if(kind==='calendar_events')return {...base,...require('./calendar.routes').validate(input)};
fail('지원하지 않는 자료 종류입니다.');
}
function visible(auth,scope,record){return ['all','management','boards'].includes(scope)||record.userId===auth.userId||(scope==='notifications'&&record.shared);}
function exported(kind,record){const value={...record};delete value.backupOrigin;if(kind==='files'){value.chunkCount=Math.max(1,Math.ceil(record.sizeBytes/CHUNK));delete value.storedName;delete value.receivedChunks;delete value.uploadUpdatedAt;}return value;}
async function recordsFor(auth,scope,kind){if(!scopes[scope].includes(kind))fail('백업 범위를 벗어난 자료입니다.',403);return (kind==='notification_history'?await ds.notificationHistory():await ds.findAll(kind)).filter(x=>visible(auth,scope,x)&&x.status!=='uploading');}
function receiptKey(auth,scope,archiveId){return `${auth.userId}:${scope}:${archiveId}`;}
async function getJob(auth,id){const job=await ds.findOne('backup_jobs',x=>x.id===id&&x.userId===auth.userId);if(!job)fail('불러오기 작업을 찾지 못했습니다.',404);authorize(auth,job.scope,true);if(Date.now()-Date.parse(job.createdAt)>86400000)fail('불러오기 작업이 만료되었습니다. 파일을 다시 선택하세요.');return job;}
async function cleanup(job){
 const staged=(await ds.findAll('backup_records')).filter(x=>x.jobId===job.id);
 const published=new Set((await ds.findAll('files')).map(x=>x.storedName));
 for(const item of staged){if(item.kind==='files'&&!published.has(item.storedName))for(let i=0;i<(item.receivedChunks||0);i++)await storage.remove(item.storedName+'.'+i);await ds.remove('backup_records',item.id);}
 await ds.remove('backup_jobs',job.id);
}
let commitQueue=Promise.resolve();
async function commit(auth,job){
 const key=receiptKey(auth,job.scope,job.archiveId);
 if(await ds.findOne('backup_receipts',x=>x.key===key)){await cleanup(job);return {duplicate:true};}
 const staged=(await ds.findAll('backup_records')).filter(x=>x.jobId===job.id),group=Object.fromEntries(scopes[job.scope].map(k=>[k,staged.filter(x=>x.kind===k)]));
 for(const [kind,count] of Object.entries(job.counts))if(group[kind].length!==count)fail('백업 항목 수가 일치하지 않습니다. 불러오기를 다시 시도하세요.');
 for(const item of group.files||[])if(item.receivedChunks!==Math.max(1,Math.ceil(item.record.sizeBytes/CHUNK)))fail('파일 원본 전송이 완료되지 않았습니다.');
 const entries={},maps={},users=structuredClone(await ds.findAll('users'));
 const management=['all','management','boards'].includes(job.scope);
 const owners=new Set(staged.filter(x=>!['users','site_settings','boards'].includes(x.kind)&&x.record.userId!==0).map(x=>x.record.userId));
 if(management&&!group.users?.length&&owners.size>1)fail('여러 사용자 자료가 포함되어 있습니다. 이전 users.json을 함께 선택하세요.');
 const mapUser=source=>source===0?0:management&&group.users?.length?maps.users?.[source]:auth.userId;
 if(group.users){maps.users={};entries.users=[];for(const item of group.users){const existing=users.find(u=>u.username===item.record.username);if(existing){maps.users[item.record.id]=existing.id;if(job.applyManagement&&existing.id!==auth.userId)entries.users.push({...existing,...pick(item.record,['role','permissions','active','approval'])});}else{const [id]=await ds.reserveIds('users',1);maps.users[item.record.id]=id;entries.users.push({...item.record,id});}}}
 if(entries.users){const imported=new Map(entries.users.map(u=>[u.id,u]));const next=[...users.map(u=>imported.get(u.id)||u),...entries.users.filter(u=>!users.some(x=>x.id===u.id))];const L=require('./license');if(next.filter(L.usesSeat).length>L.FREE_USER_LIMIT)fail(L.licenseError(next.length).message,403);if(!next.some(u=>roleOf(u)==='admin'&&L.usesSeat(u)))fail('활성 관리자는 최소 한 명 필요합니다.');}
 for(const [kind,items] of Object.entries(group)){
  if(['users','site_settings','notification_history'].includes(kind))continue;
  entries[kind]=[];maps[kind]={};const existing=await ds.findAll(kind);
  for(const item of items){
   const owner=mapUser(item.record.userId);if(owner===undefined||owner===null)fail('자료의 사용자 정보가 백업에 없습니다.');
   const origin=`${job.archiveId}:${kind}:${item.record.id}:${owner}`;
   const previous=existing.find(x=>x.backupOrigin===origin||(kind==='notifications'&&item.record.releaseId&&x.releaseId===item.record.releaseId&&x.userId===owner));
   if(previous){maps[kind][item.record.id]=previous.id;continue;}
   const [id]=await ds.reserveIds(kind,1);maps[kind][item.record.id]=id;
   entries[kind].push({...item.record,id,userId:owner,backupOrigin:origin,...(kind==='files'?{storedName:item.storedName,chunkCount:Math.max(1,Math.ceil(item.record.sizeBytes/CHUNK)),receivedChunks:item.receivedChunks,status:'ready'}:{})});
  }
 }
 const remapKinds={files:'files',memos:'memos',worklogs:'work_logs'};
 function references(value){if(typeof value==='string')return Reference.parts(value).map(p=>{if(!p.id)return p.token||p.text;const id=maps[remapKinds[p.kind]]?.[p.id];return id?Reference.internal(p.kind,id,p.text):p.text;}).join('');if(Array.isArray(value))return value.map(references);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='attachments'?v:references(v)]));return value;}
 for(const kind of ['work_logs','memos','calendar_events'])if(entries[kind])entries[kind]=entries[kind].map(references);
for(const post of entries.board_posts||[]){post.boardId=maps.boards?.[post.boardId];if(!post.boardId)fail('게시글의 게시판 정보가 백업에 없습니다.');post.attachments=(post.attachments||[]).map(id=>maps.files?.[id]).filter(Boolean);post.references=(post.references||[]).map(r=>({...r,id:maps[remapKinds[r.kind]]?.[r.id]})).filter(r=>r.id);}
 for(const read of entries.notification_reads||[]){read.releaseId=read.releaseId.replace(/^post:(\d+):/,(_,id)=>'post:'+(maps.notifications?.[id]||id)+':');}
 const deliveries=(entries.notifications||[]).filter(x=>x.releaseId).map(x=>({key:x.releaseId+':'+(x.shared?'shared':x.userId),notificationId:x.id}));
 for(const item of group.notification_history||[]){const userId=mapUser(item.record.userId);if(userId===undefined)fail('공지 이력의 사용자를 찾지 못했습니다.');const key=item.record.releaseId+':'+(userId===0?'shared':userId);if(!deliveries.some(x=>x.key===key))deliveries.push({key,notificationId:0});}
 const receipt={key,createdAt:new Date().toISOString(),counts:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,v.length]))};
 const applied=await ds.commitBackup(entries,receipt,job.applyManagement?group.site_settings?.[0]?.record:null,deliveries,users);
 if(!applied)return {duplicate:true};
 // Keep imported file chunks, but delete redundant staged chunks and all staging metadata.
 const names=new Set((entries.files||[]).map(x=>x.storedName));
 for(const item of staged){if(item.kind==='files'&&!names.has(item.storedName))for(let i=0;i<item.receivedChunks;i++)await storage.remove(item.storedName+'.'+i);await ds.remove('backup_records',item.id);}
 await ds.remove('backup_jobs',job.id);return {counts:receipt.counts};
}
async function backupRouter(req,res,auth){try{
 const url=new URL(req.url,'http://localhost'),action=url.pathname.split('/')[3];
 if(req.method==='GET'){
  const scope=url.searchParams.get('scope');authorize(auth,scope);
  if(action==='export'){const index={};for(const kind of scopes[scope])index[kind]=(await recordsFor(auth,scope,kind)).map(x=>x.id);return sendJson(res,200,{format:'DailyNoteBackup',version:1,archiveId:crypto.randomUUID(),scope,createdAt:new Date().toISOString(),index});}
  const kind=action==='file'?'files':url.searchParams.get('kind'),id=Number(url.searchParams.get('id')),record=(await recordsFor(auth,scope,kind)).find(x=>x.id===id);if(!record)fail('백업 자료를 찾지 못했습니다.',404);
  if(action==='record')return sendJson(res,200,exported(kind,record));
  if(action==='file'){
   const part=Number(url.searchParams.get('part')||0),count=record.chunkCount||Math.max(1,Math.ceil(record.sizeBytes/CHUNK));if(!Number.isSafeInteger(part)||part<0||part>=count)fail('파일 조각 번호를 확인하세요.');
   let bytes=await storage.read(record.storedName+(record.chunkCount?'.'+part:''));if(!record.chunkCount&&bytes)bytes=bytes.subarray(part*CHUNK,Math.min(bytes.length,(part+1)*CHUNK));if(!bytes)fail('파일 원본을 찾지 못했습니다.',404);
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length});return res.end(bytes);
  }
 }
 if(req.method==='POST'&&action==='import'){
  const body=await readBody(req);
  if(body.phase==='start'){
   authorize(auth,body.scope,true);if(!/^[\w-]{8,100}$/.test(body.archiveId||''))fail('백업 식별자를 확인하세요.');
   const counts={};for(const kind of scopes[body.scope]){const count=body.counts?.[kind]||0;if(!Number.isSafeInteger(count)||count<0||count>100000||(kind==='site_settings'&&count>1))fail('항목 수를 확인하세요.');counts[kind]=count;}
   if(Object.keys(body.counts||{}).some(k=>!scopes[body.scope].includes(k)))fail('다른 메뉴의 자료가 포함되어 있습니다.');
   if(await ds.findOne('backup_receipts',x=>x.key===receiptKey(auth,body.scope,body.archiveId)))return sendJson(res,200,{duplicate:true});
   for(const old of (await ds.findAll('backup_jobs')).filter(x=>x.userId===auth.userId&&Date.now()-Date.parse(x.createdAt)>86400000))await cleanup(old);
   const job=await ds.insert('backup_jobs',{userId:auth.userId,scope:body.scope,archiveId:body.archiveId,counts,applyManagement:body.applyManagement===true,createdAt:new Date().toISOString()});return sendJson(res,201,{jobId:job.id,chunkSize:CHUNK});
  }
  const job=await getJob(auth,body.jobId);
  if(body.phase==='cancel'){await cleanup(job);return sendJson(res,200,{cancelled:true});}
  if(body.phase==='record'){
   if(!scopes[job.scope].includes(body.kind))fail('백업 범위를 벗어난 자료입니다.',403);
   const record=normalize(body.kind,body.record),items=(await ds.findAll('backup_records')).filter(x=>x.jobId===job.id&&x.kind===body.kind);
   if(items.some(x=>x.record.id===record.id))fail('중복된 백업 ID입니다.');if(items.length>=job.counts[body.kind])fail('백업 항목 수를 초과했습니다.');
   if(body.kind==='users'&&items.some(x=>x.record.username===record.username))fail('중복된 사용자 아이디가 있습니다.');
   await ds.insert('backup_records',{jobId:job.id,kind:body.kind,record,...(body.kind==='files'?{storedName:'restore-'+crypto.randomBytes(24).toString('hex'),receivedChunks:0}:{})});return sendJson(res,201,{saved:true});
  }
  if(body.phase==='file'){
   const item=await ds.findOne('backup_records',x=>x.jobId===job.id&&x.kind==='files'&&x.record.id===body.sourceId);if(!item)fail('파일 정보를 먼저 전송하세요.');
   if(body.index!==item.receivedChunks||typeof body.data!=='string'||body.data.length>Math.ceil(CHUNK/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data))fail('파일 조각 형식을 확인하세요.');
   const bytes=Buffer.from(body.data,'base64'),expected=Math.max(0,Math.min(CHUNK,item.record.sizeBytes-body.index*CHUNK));if(bytes.length!==expected||body.index>=Math.max(1,Math.ceil(item.record.sizeBytes/CHUNK)))fail('파일 조각 크기를 확인하세요.');
   await storage.write(item.storedName+'.'+body.index,bytes);await ds.update('backup_records',item.id,{receivedChunks:item.receivedChunks+1});return sendJson(res,200,{saved:true});
  }
  if(body.phase==='commit'){req.auditInfo={scope:job.scope};await require('./local-backup').create('restore');const task=commitQueue.then(()=>commit(auth,job));commitQueue=task.catch(()=>{});return sendJson(res,200,await task);}
 }
 fail('백업 요청을 확인하세요.',404);
}catch(error){if(!error.status)console.error('Backup operation failed:',error.message);sendJson(res,error.status||500,{message:error.status?error.message:'백업 작업을 완료하지 못했습니다. 다시 시도하세요.'});}}
module.exports={backupRouter,normalize,scopes};
