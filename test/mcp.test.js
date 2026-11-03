const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mcpRouter}=require('../src/mcp');
const {sendJson}=require('../src/utils');
const auth={userId:11,username:'tester',role:'member',permissions:{worklogRead:true,memoRead:true,calendarRead:false,fileRead:false,users:false}};
async function call(method,params={},user=auth,options={}){
 let status=0,body='';
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(code){status=code;return this;},end(value=''){body+=value||'';}};
 const req={method:'POST',url:'/api/mcp',headers:{authorization:'Bearer example',host:'localhost:3000','content-type':'application/json'},body:{jsonrpc:'2.0',id:1,method,params}};
 const dispatch=async (input,output)=>{
  options.onDispatch?.(input);
  sendJson(output,options.apiStatus||200,options.data||[{id:1,userId:11,workDate:'2026-11-04'}]);
 };
 await mcpRouter(req,res,user,dispatch);
 return {status,data:JSON.parse(body||'{}')};
}
test('MCP tool discovery respects user rights and excludes admin mutations by default',async()=>{
 const r=await call('tools/list');
 assert.equal(r.status,200);
 const names=r.data.result.tools.map(x=>x.name);
 assert.ok(names.includes('worklog_list'));
 assert.ok(names.includes('system_test_health'));
 assert.ok(!names.includes('admin_users_list'));
 assert.ok(!names.includes('admin_user_approve'));
});
test('MCP worklog access calls the existing API route rather than datastore',async()=>{
 let seen;
 const r=await call('tools/call',{name:'worklog_list',arguments:{workDate:'2026-11-04'}},auth,{onDispatch:x=>seen=x});
 assert.equal(seen.url,'/api/worklogs?date=2026-11-04');
 assert.equal(seen.method,'GET');
 assert.equal(r.data.result.content[0].type,'text');
 assert.equal(r.data.result.isError,undefined);
});
test('MCP rejects unavailable tools, unknown arguments and malformed dates',async()=>{
 const noRight=await call('tools/call',{name:'file_list',arguments:{}});
 assert.equal(noRight.data.result.isError,true);
 const malformed=await call('tools/call',{name:'worklog_list',arguments:{workDate:'2026/11/04'}});
 assert.equal(malformed.data.result.isError,true);
 const unknown=await call('tools/call',{name:'worklog_list',arguments:{userId:999}});
 assert.equal(unknown.data.result.isError,true);
});
test('MCP refuses anonymous requests and admin writes when disabled',async()=>{
 const anonymous=await call('tools/list',{},null);
 assert.equal(anonymous.status,401);
 let reached=false;
 const admin={...auth,role:'admin',permissions:{...auth.permissions,users:true}};
 const blocked=await call('tools/call',{name:'admin_user_approve',arguments:{id:2,confirm:true}},admin,{onDispatch:()=>reached=true});
 assert.equal(blocked.data.result.isError,true);
 assert.equal(reached,false);
});
test('MCP returns existing API permission errors without claiming success',async()=>{
 const r=await call('tools/call',{name:'memo_list',arguments:{}},auth,{apiStatus:403,data:{message:'Permission denied'}});
 assert.equal(r.data.result.isError,true);
 assert.match(r.data.result.content[0].text,/Permission denied/);
});
test('MCP test_health returns sanitized data, no internal records',async()=>{
 const r=await call('tools/call',{name:'system_test_health',arguments:{}},auth,{data:{activeUserCount:3,atLimit:false,overLimit:false,contact:'secret'}});
 const info=JSON.parse(r.data.result.content[0].text);
 assert.equal(info.ok,true);
 assert.equal(info.license.activeUserCount,3);
 assert.equal(JSON.stringify(info).includes('secret'),false);
});
