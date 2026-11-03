const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable,Writable}=require('node:stream');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-mcp-api-'));
process.env.DATA_DIR=tmp;delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.DAILYNOTE_MCP_ADMIN_WRITES;
const ds=require('../src/datastore'),handler=require('../src/server'),{makeUserRecord}=require('../src/auth');
after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
async function request(method,url,body,token){
 const req=Readable.from(body?[JSON.stringify(body)]:[]);
 Object.assign(req,{method,url,headers:{host:'localhost:3000',...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})}});
 const chunks=[];const res=new Writable({write(chunk,encoding,callback){chunks.push(chunk);callback();}});
 res.writeHead=status=>{res.status=status;res.headersSent=true;return res;};
 res.setHeader=()=>{};
 const done=new Promise(resolve=>res.on('finish',resolve));
 await handler(req,res);await done;
 const raw=Buffer.concat(chunks).toString();
 return {status:res.status,data:raw?JSON.parse(raw):null};
}
const rpc=(method,params)=>({jsonrpc:'2.0',id:1,method,params});
test('actual MCP HTTP route uses existing login, ownership and permissions',async()=>{
 const first=await ds.insert('users',{...makeUserRecord('mcp-one','password123'),role:'member'});
 await ds.insert('users',{...makeUserRecord('mcp-two','password123'),role:'member',permissions:{memoRead:false}});
 const login1=(await request('POST','/api/auth/login',{username:'mcp-one',password:'password123'})).data.token;
 const login2=(await request('POST','/api/auth/login',{username:'mcp-two',password:'password123'})).data.token;
 assert.equal((await request('POST','/api/mcp',rpc('tools/list',{}))).status,401);
 const init=await request('POST','/api/mcp',rpc('initialize',{protocolVersion:'2025-11-25'}),login1);
 assert.equal(init.data.result.serverInfo.name,'dailynote-mcp');
 const list=await request('POST','/api/mcp',rpc('tools/list',{}),login2);
 assert.equal(list.data.result.tools.some(t=>t.name==='memo_list'),false);
 assert.equal(list.data.result.tools.some(t=>t.name==='admin_users_list'),false);
 const created=await request('POST','/api/mcp',rpc('tools/call',{name:'worklog_create',arguments:{workDate:'2026-11-04',todo:[{task:'MCP 테스트',checked:false,children:[]}]}}),login1);
 assert.equal(created.status,200);
 assert.equal(created.data.result.isError,undefined);
 const all=await request('POST','/api/mcp',rpc('tools/call',{name:'worklog_list',arguments:{}}),login2);
 assert.deepEqual(JSON.parse(all.data.result.content[0].text),[]);
 const mine=await request('POST','/api/mcp',rpc('tools/call',{name:'worklog_list',arguments:{}}),login1);
 assert.equal(JSON.parse(mine.data.result.content[0].text)[0].userId,first.id);
});
