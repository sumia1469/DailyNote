const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable,Writable}=require('node:stream');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-oauth-'));
process.env.DATA_DIR=tmp;
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
process.env.DAILYNOTE_PUBLIC_URL='https://dailynote.example/';
process.env.DAILYNOTE_OAUTH_CLIENTS=JSON.stringify({'trusted-test-client':{redirectUris:['https://chat.example/callback']}});
const handler=require('../src/server'),ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth');
after(()=>{delete process.env.DAILYNOTE_PUBLIC_URL;delete process.env.DAILYNOTE_OAUTH_CLIENTS;fs.rmSync(tmp,{recursive:true,force:true});});
async function request(method,url,body,headers={}){
 const req=Readable.from(body?[body]:[]);
 Object.assign(req,{method,url,headers:{host:'dailynote.example',...headers}});
 const chunks=[];const res=new Writable({write(chunk,enc,cb){chunks.push(chunk);cb();}});
 res.headers={};res.setHeader=(name,value)=>{res.headers[name.toLowerCase()]=value;};
 res.writeHead=(code,entries={})=>{res.status=code;res.headersSent=true;for(const [key,value]of Object.entries(entries))res.headers[key.toLowerCase()]=value;return res;};
 const finished=new Promise(resolve=>res.on('finish',resolve));
 await handler(req,res);await finished;
 const text=Buffer.concat(chunks).toString();
 let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:res.status,headers:res.headers,data};
}
function authorization(verifier){
 const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 const p=new URLSearchParams({response_type:'code',client_id:'trusted-test-client',redirect_uri:'https://chat.example/callback',resource:'https://dailynote.example/api/mcp',code_challenge:challenge,code_challenge_method:'S256',scope:'mcp:read',state:'test-state'});
 return '/api/oauth/authorize?'+p.toString();
}
test('OAuth discovery, consent, code replay, PKCE and MCP-only permissions',async()=>{
 const me=await ds.insert('users',{...makeUserRecord('oauth-tester','password123'),role:'member'});
 const meta=await request('GET','/.well-known/oauth-protected-resource');
 assert.equal(meta.status,200);
 assert.equal(meta.data.resource,'https://dailynote.example/api/mcp');
 const authMeta=await request('GET','/api/.well-known/oauth-authorization-server');
 assert.equal(authMeta.data.code_challenge_methods_supported[0],'S256');
 const verifier='a'.repeat(43),url=authorization(verifier);
 const page=await request('GET',url);
 assert.equal(page.status,200);
 assert.match(page.data,/DailyNote AI 연결/);
 const form=new URLSearchParams({username:'oauth-tester',password:'password123',decision:'approve'}).toString();
 const grant=await request('POST',url,form,{'content-type':'application/x-www-form-urlencoded'});
 assert.equal(grant.status,302);
 const location=new URL(grant.headers.location);
 assert.equal(location.origin,'https://chat.example');
 assert.equal(location.searchParams.get('state'),'test-state');
 const code=location.searchParams.get('code');
 const exchange=new URLSearchParams({grant_type:'authorization_code',client_id:'trusted-test-client',redirect_uri:'https://chat.example/callback',code,code_verifier:verifier,resource:'https://dailynote.example/api/mcp'}).toString();
 const token=await request('POST','/api/oauth/token',exchange,{'content-type':'application/x-www-form-urlencoded'});
 assert.equal(token.status,200);
 assert.equal(token.data.token_type,'Bearer');
 const duplicate=await request('POST','/api/oauth/token',exchange,{'content-type':'application/x-www-form-urlencoded'});
 assert.equal(duplicate.status,400);
 const regular=await request('GET','/api/auth/me',null,{authorization:'Bearer '+token.data.access_token});
 assert.equal(regular.status,403);
 const list=await request('POST','/api/mcp',JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),{'content-type':'application/json',authorization:'Bearer '+token.data.access_token});
 assert.equal(list.status,200);
 const names=list.data.result.tools.map(tool=>tool.name);
 assert.ok(names.includes('worklog_list'));
 assert.ok(!names.includes('worklog_create'));
 assert.ok(!names.includes('admin_user_approve'));
 const listData=await request('POST','/api/mcp',JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'worklog_list',arguments:{}}}),{'content-type':'application/json',authorization:'Bearer '+token.data.access_token});
 assert.equal(listData.status,200);
 assert.equal(listData.data.result.isError,undefined);
 const denied=await request('POST','/api/mcp',JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'worklog_create',arguments:{workDate:'2026-11-04',todo:[]}}}),{'content-type':'application/json',authorization:'Bearer '+token.data.access_token});
 assert.equal(denied.data.result.isError,true);
});
test('OAuth rejects unregistered redirect and bad code challenge',async()=>{
 const url=authorization('a'.repeat(43)).replace('chat.example%2Fcallback','attacker.example%2Fcallback');
 const response=await request('GET',url);
 assert.equal(response.status,400);
 const noToken=await request('POST','/api/oauth/token','grant_type=password',{'content-type':'application/x-www-form-urlencoded'});
 assert.equal(noToken.status,400);
});

test('OAuth write scope requires client opt-in and explicit user consent',async()=>{
 const verifier='b'.repeat(43);
 const readUrl=authorization(verifier);
 const writeUrl=readUrl.replace('scope=mcp%3Aread','scope=mcp%3Aread+mcp%3Awrite');
 const refused=await request('GET',writeUrl);
 assert.equal(refused.status,400);
 process.env.DAILYNOTE_OAUTH_CLIENTS=JSON.stringify({'trusted-test-client':{redirectUris:['https://chat.example/callback'],allowWrite:true}});
 const consent=await request('GET',writeUrl);
 assert.equal(consent.status,200);
 assert.match(consent.data,/조회·등록·수정·삭제/);
 const form=new URLSearchParams({username:'oauth-tester',password:'password123',decision:'approve'}).toString();
 const grant=await request('POST',writeUrl,form,{'content-type':'application/x-www-form-urlencoded'});
 assert.equal(grant.status,302);
 const code=new URL(grant.headers.location).searchParams.get('code');
 const exchange=new URLSearchParams({grant_type:'authorization_code',client_id:'trusted-test-client',redirect_uri:'https://chat.example/callback',code,code_verifier:verifier,resource:'https://dailynote.example/api/mcp'}).toString();
 const issued=await request('POST','/api/oauth/token',exchange,{'content-type':'application/x-www-form-urlencoded'});
 assert.equal(issued.status,200);
 assert.equal(issued.data.scope,'mcp:read mcp:write');
 const list=await request('POST','/api/mcp',JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/list',params:{}}),{'content-type':'application/json',authorization:'Bearer '+issued.data.access_token});
 assert.equal(list.status,200);
 assert.ok(list.data.result.tools.some(x=>x.name==='calendar_create'));
 assert.ok(!list.data.result.tools.some(x=>x.name==='admin_user_approve'));
});
