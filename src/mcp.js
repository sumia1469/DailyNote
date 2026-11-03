'use strict';
// Stateless MCP-over-HTTP adapter. Uses the existing authenticated API router.
const {parseJsonBody,sendJson}=require('./utils');
const {verifyToken}=require('./auth');
const VERSION='2025-11-25';
const spec=(description,properties={},required=[],extra={})=>({description,inputSchema:{type:'object',properties,required,additionalProperties:false},...extra});
const string=(description,maxLength=200)=>({type:'string',description,maxLength});
const integer=(description)=>({type:'integer',description,minimum:1});
const date=()=>({type:'string',description:'YYYY-MM-DD',pattern:'^\\d{4}-\\d{2}-\\d{2}$'});
const tools={
 system_whoami:{...spec('현재 로그인 계정과 사용 가능한 권한 확인'),method:'GET',path:'/api/auth/me'},
 worklog_list:{...spec('내 업무일지 검색. workDate는 선택.',{workDate:date()}),right:'worklogRead',method:'GET',path:a=>'/api/worklogs'+(a.workDate?'?date='+encodeURIComponent(a.workDate):'')},
 worklog_create:{...spec('내 업무일지 생성',{workDate:date(),todo:{type:'array',description:'TODO 항목 (task, checked, children)',items:{type:'object'}},nextDayPlan:{type:'array',items:{type:'object'}},remarks:string('비고',10000),memo:string('메모',10000)},['workDate','todo']),right:'worklogCreate',method:'POST',path:'/api/worklogs',body:a=>({workDate:a.workDate,todo:a.todo,nextDayPlan:a.nextDayPlan||[],remarks:a.remarks||'',memo:a.memo||''})},
 worklog_update:{...spec('내 업무일지 수정. 기존 값 덮어쓰기 주의.',{id:integer('업무일지 ID'),todo:{type:'array',items:{type:'object'}},nextDayPlan:{type:'array',items:{type:'object'}},remarks:string('비고',10000),memo:string('메모',10000)},['id']),right:'worklogEdit',method:'PUT',path:a=>'/api/worklogs/'+a.id,body:a=>Object.fromEntries(['todo','nextDayPlan','remarks','memo'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]))},
 memo_list:{...spec('내 메모 목록 조회'),right:'memoRead',method:'GET',path:'/api/memos'},
 memo_get:{...spec('내 메모 상세 조회',{id:integer('메모 ID')},['id']),right:'memoRead',method:'GET',path:a=>'/api/memos/'+a.id},
 memo_create:{...spec('텍스트 메모 작성',{title:string('제목',200),text:string('본문',100000),folder:string('폴더',80)},['title','text']),right:'memoCreate',method:'POST',path:'/api/memos',body:a=>({title:a.title,text:a.text,html:'',folder:a.folder||'',font:'sans-serif',color:'white',starred:false,pinned:false,attachments:[]})},
 calendar_list:{...spec('내 캘린더 일정 및 일지 조회 (최대 370일)',{start:date(),end:date()},['start','end']),right:'calendarRead',method:'GET',path:a=>'/api/calendar?start='+a.start+'&end='+a.end},
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
  if(rule.type==='string'&&(typeof val!=='string'||(rule.maxLength&&val.length>rule.maxLength)||(rule.pattern&&!new RegExp(rule.pattern).test(val))))throw Error('Invalid argument: '+key);
  if(rule.type==='integer'&&(!Number.isSafeInteger(val)||val<(rule.minimum||0)))throw Error('Invalid argument: '+key);
  if(rule.type==='boolean'&&typeof val!=='boolean')throw Error('Invalid argument: '+key);
  if(rule.type==='array'&&(!Array.isArray(val)||val.length>500))throw Error('Invalid argument: '+key);
 }
}
function allowed(tool,auth){return (!tool.right||auth.permissions[tool.right]===true)&&(!tool.adminWrite||process.env.DAILYNOTE_MCP_ADMIN_WRITES==='1');}
function publicTool(name,tool){const {description,inputSchema}=tool;return {name,description,inputSchema,annotations:{readOnlyHint:tool.method==='GET',destructiveHint:false,idempotentHint:tool.method==='GET'}};}
function rpc(id,result){return {jsonrpc:'2.0',id,result};}
function failure(id,code,message){return {jsonrpc:'2.0',id,error:{code,message}};}
function response(res,status,obj){res.setHeader('Cache-Control','no-store');return sendJson(res,status,obj);}
async function invokeApi(route,authHeader,dispatch){
 const input={method:route.method,url:route.path,headers:{authorization:authHeader},body:route.body};
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
  const origin=new URL(req.headers.origin);const host=req.headers.host;
  if(!host||origin.host!==host)return response(res,403,{error:'Cross-origin requests are not allowed'});
 }
 if(req.method!=='POST'){res.setHeader('Allow','POST');return response(res,405,{error:'Use POST'});}
 if(!String(req.headers['content-type']||'').includes('application/json'))return response(res,415,{error:'Content-Type application/json required'});
 let input;
 try{input=await parseJsonBody(req);}catch{return response(res,400,failure(null,-32700,'Invalid JSON'));}
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
  if(tool.adminWrite&&args.confirm!==true)throw Error('Administrator approval is required: confirm=true');
  const path=typeof tool.path==='function'?tool.path(args):tool.path;
  const body=tool.body?tool.body(args):undefined;
  if(tool.method!=='GET'&&body&&Object.keys(body).length===0&&name==='worklog_update')throw Error('No updates supplied');
  req.auditInfo={mcpTool:name,targetId:args.id||null};
  const data=compact(await invokeApi({method:tool.method,path,body},req.headers.authorization,dispatch));
  return response(res,200,rpc(id,{content:[{type:'text',text:JSON.stringify(data)}]}));
 }catch(error){return response(res,200,rpc(id,{isError:true,content:[{type:'text',text:error.message||'Tool execution failed'}]}));}
}
module.exports={mcpRouter,tools,validate};
