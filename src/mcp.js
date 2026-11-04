'use strict';
// Stateless MCP-over-HTTP adapter. Uses the existing authenticated API router.
const {sendJson}=require('./utils');
const MAX_REQUEST_BYTES=256*1024;
async function readJsonRequest(req){
 if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>MAX_REQUEST_BYTES)throw Error('MCP request too large');return JSON.parse(raw);}
 const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>MAX_REQUEST_BYTES)throw Error('MCP request too large');chunks.push(Buffer.from(chunk));}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
const {verifyToken}=require('./auth');
const regression=require('./mcp-regression');
const VERSION='2025-11-25';
const spec=(description,properties={},required=[],extra={})=>({description,inputSchema:{type:'object',properties,required,additionalProperties:false},...extra});
const string=(description,maxLength=200)=>({type:'string',description,maxLength});
const integer=(description)=>({type:'integer',description,minimum:1});
const date=()=>({type:'string',description:'YYYY-MM-DD',pattern:'^\\d{4}-\\d{2}-\\d{2}$'});
const tools={
 system_whoami:{...spec('현재 로그인 계정과 사용 가능한 권한 확인'),method:'GET',path:'/api/auth/me'},
 system_test_health:{...spec('운영 데이터를 변경하지 않고 로그인 API와 라이선스 상태를 점검'),method:'GET',path:'/api/license',diagnostic:'health'},
 system_test_permissions:{...spec('현재 계정의 MCP 도구별 허용 상태를 점검. 다른 사용자의 데이터를 조회하지 않음'),method:'GET',path:'/api/auth/me',diagnostic:'permissions'},
 system_test_regression:{...spec('로컬 격리 환경에서 MCP 또는 UI 계약 회귀 테스트 실행 (운영 환경 불가)',{suite:{type:'string',enum:['mcp','ui'],description:'실행할 고정 테스트 모음'}},['suite']),localTest:true},
 worklog_list:{...spec('내 업무일지 검색. workDate는 선택.',{workDate:date()}),right:'worklogRead',method:'GET',path:a=>'/api/worklogs'+(a.workDate?'?date='+encodeURIComponent(a.workDate):'')},
 worklog_create:{...spec('내 업무일지 생성',{workDate:date(),todo:{type:'array',description:'TODO 항목 (task, checked, children)',items:{type:'object'}},nextDayPlan:{type:'array',items:{type:'object'}},remarks:string('비고',10000),memo:string('메모',10000)},['workDate','todo']),right:'worklogCreate',method:'POST',path:'/api/worklogs',body:a=>({workDate:a.workDate,todo:a.todo,nextDayPlan:a.nextDayPlan||[],remarks:a.remarks||'',memo:a.memo||''})},
 worklog_update:{...spec('내 업무일지 수정. 기존 값 덮어쓰기 주의.',{id:integer('업무일지 ID'),todo:{type:'array',items:{type:'object'}},nextDayPlan:{type:'array',items:{type:'object'}},remarks:string('비고',10000),memo:string('메모',10000)},['id']),right:'worklogEdit',method:'PUT',path:a=>'/api/worklogs/'+a.id,body:a=>Object.fromEntries(['todo','nextDayPlan','remarks','memo'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]))},
 memo_list:{...spec('내 메모 목록 조회'),right:'memoRead',method:'GET',path:'/api/memos'},
 memo_get:{...spec('내 메모 상세 조회',{id:integer('메모 ID')},['id']),right:'memoRead',method:'GET',path:a=>'/api/memos/'+a.id},
 memo_create:{...spec('텍스트 메모 작성',{title:string('제목',200),text:string('본문',100000),folder:string('폴더',80)},['title','text']),right:'memoCreate',method:'POST',path:'/api/memos',body:a=>({title:a.title,text:a.text,html:'',folder:a.folder||'',font:'sans-serif',color:'white',starred:false,pinned:false,attachments:[]})},
 calendar_list:{...spec('내 캘린더 일정 및 일지 조회 (최대 370일)',{start:date(),end:date()},['start','end']),right:'calendarRead',method:'GET',path:a=>'/api/calendar?start='+a.start+'&end='+a.end},
 calendar_create:{...spec('내 캘린더 일정 등록. 종일 일정의 end는 마지막 날짜를 포함합니다.',{title:string('일정 제목',200),description:string('일정 내용',5000),allDay:{type:'boolean'},start:string('시작일 YYYY-MM-DD 또는 ISO 시간',40),end:string('종료일 YYYY-MM-DD 또는 ISO 시간',40),kind:{type:'string',enum:['schedule','dayoff']},color:{type:'string',enum:['blue','green','orange','purple','red']},reminderMinutes:{type:'integer',minimum:0}},['title','allDay','start','end']),right:'calendarCreate',method:'POST',path:'/api/calendar',body:a=>({title:a.title,description:a.description||'',allDay:a.allDay,start:a.start,end:a.end,kind:a.kind||'schedule',color:a.color||'blue',reminderMinutes:a.reminderMinutes??null})},
 calendar_update:{...spec('내 캘린더 일정 수정. 모든 필드를 전달하여 해당 일정을 갱신합니다.',{id:integer('일정 ID'),title:string('일정 제목',200),description:string('일정 내용',5000),allDay:{type:'boolean'},start:string('시작일',40),end:string('종료일',40),kind:{type:'string',enum:['schedule','dayoff']},color:{type:'string',enum:['blue','green','orange','purple','red']},reminderMinutes:{type:'integer',minimum:0}},['id','title','allDay','start','end']),right:'calendarEdit',method:'PUT',path:a=>'/api/calendar/'+a.id,body:a=>({title:a.title,description:a.description||'',allDay:a.allDay,start:a.start,end:a.end,kind:a.kind||'schedule',color:a.color||'blue',reminderMinutes:a.reminderMinutes??null})},
 calendar_delete:{...spec('내 캘린더 일정 삭제. 삭제 전 사용자의 명시적 확인이 필요합니다.',{id:integer('삭제할 일정 ID'),confirm:{type:'boolean',description:'사용자가 삭제를 명시적으로 승인했음'}},['id','confirm']),right:'calendarDelete',method:'DELETE',path:a=>'/api/calendar/'+a.id,confirmWrite:true},

 file_list:{...spec('내 파일 목록 조회. 다운로드 파일 본문은 반환하지 않습니다.'),right:'fileRead',method:'GET',path:'/api/files'},
 notification_list:{...spec('내 공지 목록 조회'),right:'notificationRead',method:'GET',path:'/api/notifications'},
 admin_users_list:{...spec('관리자 사용자 및 권한 목록 조회'),right:'users',method:'GET',path:'/api/admin/users'},
 admin_files_list:{...spec('관리자 전체 파일 목록 조회'),right:'files',method:'GET',path:'/api/admin/files'},
 admin_notices_list:{...spec('관리자 공지 목록 조회'),right:'notifications',method:'GET',path:'/api/admin/notifications'},
 admin_logs_list:{...spec('감사 로그 목록 조회'),right:'logs',method:'GET',path:'/api/admin/logs'},
 admin_user_approve:{...spec('가입 신청 승인. 관리자 MCP 변경 도구 설정 및 명시적 confirm=true가 필요합니다.',{id:integer('신청 사용자 ID'),confirm:{type:'boolean',description:'관리자가 승인 작업을 검토했음'}},['id','confirm']),right:'users',adminWrite:true,method:'POST',path:a=>'/api/admin/users/'+a.id+'/approve',body:()=>({})},
 admin_notice_create:{...spec('전체 사용자 공지 작성. 관리자 MCP 변경 도구 설정 및 명시적 confirm=true가 필요합니다.',{title:string('공지 제목',120),message:string('공지 본문',2000),confirm:{type:'boolean',description:'게시 내용을 검토했음'}},['message','confirm']),right:'notifications',adminWrite:true,method:'POST',path:'/api/admin/notifications',body:a=>({title:a.title||'',message:a.message})}
};
function validate(schema,value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('arguments must be an object');
 for(const key of schema.required||[])if(value[key]===undefined)throw Error('Missing required argument: '+key);
 for(const [key,val] of Object.entries(value)){
  const rule=schema.properties[key];if(!rule)throw Error('Unknown argument: '+key);
  if(rule.type==='string'&&(typeof val!=='string'||(rule.maxLength&&val.length>rule.maxLength)||(rule.enum&&!rule.enum.includes(val))||(rule.pattern&&!new RegExp(rule.pattern).test(val))))throw Error('Invalid argument: '+key);
  if(rule.type==='integer'&&(!Number.isSafeInteger(val)||val<(rule.minimum||0)))throw Error('Invalid argument: '+key);
  if(rule.type==='boolean'&&typeof val!=='boolean')throw Error('Invalid argument: '+key);
  if(rule.type==='array'&&(!Array.isArray(val)||val.length>500))throw Error('Invalid argument: '+key);
 }
}
function allowed(tool,auth){const scopes=String(auth.scope||'').split(/\s+/);const oauthAllowed=!auth.mcpOnly||(scopes.includes('mcp:read')&&(tool.method==='GET'||scopes.includes('mcp:write'))&&!tool.localTest&&!tool.adminWrite&&!['users','files','notifications','logs'].includes(tool.right));return oauthAllowed&&(!tool.right||auth.permissions[tool.right]===true)&&(!tool.adminWrite||process.env.DAILYNOTE_MCP_ADMIN_WRITES==='1')&&(!tool.localTest||(auth.role==='admin'&&regression.available()));}
function publicTool(name,tool){const {description,inputSchema}=tool;return {name,description,inputSchema,annotations:{readOnlyHint:tool.method==='GET',destructiveHint:false,idempotentHint:tool.method==='GET'}};}
function rpc(id,result){return {jsonrpc:'2.0',id,result};}
function failure(id,code,message){return {jsonrpc:'2.0',id,error:{code,message}};}
function response(res,status,obj){res.setHeader('Cache-Control','no-store');return sendJson(res,status,obj);}
async function invokeApi(route,authHeader,dispatch){
 const input={method:route.method,url:route.path,headers:{authorization:authHeader},body:route.body,mcpInternal:true};
 let status=500,raw='';
 const output={headersSent:false,writeHead(code){status=code;this.headersSent=true;return this;},setHeader(){},end(value=''){raw+=value||'';this.headersSent=true;},write(value){raw+=value||'';}};
 await dispatch(input,output);
 let data;try{data=JSON.parse(raw||'{}');}catch{throw Error('API returned an invalid response');}
 if(status>=400)throw Error(data.message||'API request failed ('+status+')');
 return data;
}
function compact(value){
 const json=JSON.stringify(value);
 if(Buffer.byteLength(json)<=64000)return value;
 if(Array.isArray(value))return {total:value.length,items:value.slice(0,30),truncated:true};
 return {message:'Response exceeds 64KB. Narrow the request using a date or ID.',truncated:true};
}
async function mcpRouter(req,res,auth,dispatch){
 if(!auth) return response(res,401,{error:'Authentication required'});
 if(auth.mustChangePassword)return response(res,403,{error:'Password change required'});
 if(req.headers.origin){
  let origin;try{origin=new URL(req.headers.origin);}catch{return response(res,403,{error:'Invalid Origin'});}
  const host=req.headers.host;
  if(!host||origin.host!==host)return response(res,403,{error:'Cross-origin requests are not allowed'});
 }
 if(req.method!=='POST'){res.setHeader('Allow','POST');return response(res,405,{error:'Use POST'});}
 if(!String(req.headers['content-type']||'').includes('application/json'))return response(res,415,{error:'Content-Type application/json required'});
 let input;
 try{input=await readJsonRequest(req);}catch{return response(res,400,failure(null,-32700,'Invalid JSON'));}
 if(!input||input.jsonrpc!=='2.0'||typeof input.method!=='string'||Array.isArray(input))return response(res,400,failure(input?.id??null,-32600,'Invalid JSON-RPC request'));
 if(input.method==='notifications/initialized')return res.writeHead(202).end();
 const id=input.id;
 if(id===undefined)return res.writeHead(202).end();
 if(input.method==='initialize')return response(res,200,rpc(id,{protocolVersion:VERSION,capabilities:{tools:{listChanged:false}},serverInfo:{name:'dailynote-mcp',version:'1.0.0'}}));
 if(input.method==='ping')return response(res,200,rpc(id,{}));
 if(input.method==='tools/list')return response(res,200,rpc(id,{tools:Object.entries(tools).filter(([,tool])=>allowed(tool,auth)).map(([name,tool])=>publicTool(name,tool))}));
 if(input.method!=='tools/call')return response(res,200,failure(id,-32601,'Method not found'));
 const name=input.params?.name,tool=tools[name];
 if(!tool)return response(res,200,failure(id,-32602,'Unknown tool'));
 if(!allowed(tool,auth))return response(res,200,rpc(id,{isError:true,content:[{type:'text',text:'Permission denied'}]}));
 try{
  const args=input.params?.arguments||{};
  validate(tool.inputSchema,args);
  if((tool.adminWrite||tool.confirmWrite)&&args.confirm!==true)throw Error('이 작업을 실행하려면 confirm=true로 명시적인 확인이 필요합니다.');
  const path=typeof tool.path==='function'?tool.path(args):tool.path;
  const body=tool.body?tool.body(args):undefined;
  if(tool.method!=='GET'&&body&&Object.keys(body).length===0&&name==='worklog_update')throw Error('No updates supplied');
  req.auditInfo={mcpTool:name,targetId:args.id||null};
  const result=tool.localTest?await regression.run(args.suite):await invokeApi({method:tool.method,path,body},req.headers.authorization,dispatch);
  const data=compact(tool.diagnostic==='health'
   ?{ok:true,checkedAt:new Date().toISOString(),license:{atLimit:result.atLimit,overLimit:result.overLimit,activeUserCount:result.activeUserCount}}
   :tool.diagnostic==='permissions'
    ?{userId:auth.userId,role:auth.role,allowedTools:Object.entries(tools).filter(([,entry])=>allowed(entry,auth)).map(([toolName])=>toolName)}
    :result);
  return response(res,200,rpc(id,{content:[{type:'text',text:JSON.stringify(data)}]}));
 }catch(error){return response(res,200,rpc(id,{isError:true,content:[{type:'text',text:error.message||'Tool execution failed'}]}));}
}
module.exports={mcpRouter,tools,validate};
