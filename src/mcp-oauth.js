'use strict';
// Fixed-client OAuth 2.1 authorization-code + PKCE for DailyNote MCP.
// Client IDs/redirect URIs are explicitly configured by the deployment owner.
// No dynamic registration, implicit flow, password grant or external network calls.
const crypto=require('node:crypto');
const ds=require('./datastore');
const {sendJson}=require('./utils');
const {makeUserRecord}=require('./auth');
const TTL_CODE=5*60*1000,TTL_ACCESS=60*60*1000,TTL_REFRESH=30*86400000;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const safe=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function config(){
 const raw=process.env.DAILYNOTE_OAUTH_CLIENTS||'{}';
 let clients;try{clients=JSON.parse(raw);}catch{return null;}
 const base=process.env.DAILYNOTE_PUBLIC_URL;
 if(!base||!/^https:\/\//.test(base)||!clients||typeof clients!=='object'||Array.isArray(clients))return null;
 try{const url=new URL(base);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;return {base:url.origin,clients};}catch{return null;}
}
function clientFor(conf,id,uri){
 const client=conf.clients[id];
 return client&&Array.isArray(client.redirectUris)&&client.redirectUris.includes(uri)?client:null;
}
function params(req){
 const url=new URL(req.url,'http://localhost');
 return url.searchParams;
}
async function form(req){
 const type=String(req.headers['content-type']||'');
 if(!type.includes('application/x-www-form-urlencoded'))throw Error('Unsupported form encoding');
 let input='';
 if(req.body!==undefined)input=typeof req.body==='string'?req.body:new URLSearchParams(req.body).toString();
 else for await(const chunk of req){input+=chunk;if(Buffer.byteLength(input)>8192)throw Error('Form too large');}
 if(Buffer.byteLength(input)>8192)throw Error('Form too large');
 return new URLSearchParams(input);
}
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(res,body,status=200){
 const text='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DailyNote AI 연결</title><style>body{font:16px system-ui,sans-serif;background:#f5f6f8;margin:0;display:grid;place-items:center;min-height:100dvh;color:#222}main{background:white;padding:28px;border-radius:20px;max-width:430px;width:calc(100% - 48px);box-shadow:0 12px 45px #0001}label{display:block;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #aaa;border-radius:8px}button{margin-top:18px;padding:12px 18px;border:0;border-radius:8px;background:#151515;color:white;cursor:pointer}p{line-height:1.6}small{color:#555}</style><main>'+body+'</main></html>';
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");res.setHeader('X-Frame-Options','DENY');res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(text);
}
function noCache(res){res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');}
function bad(res,error,status=400){noCache(res);return sendJson(res,status,{error});}
function validateRequest(conf,p){
 const clientId=p.get('client_id'),redirect=p.get('redirect_uri'),resource=p.get('resource');
 const challenge=p.get('code_challenge'),method=p.get('code_challenge_method');
 if(!clientId||!redirect||!clientFor(conf,clientId,redirect))return null;
 if(p.get('response_type')!=='code'||method!=='S256'||!challenge||!/^[A-Za-z0-9_-]{43,128}$/.test(challenge))return null;
 if(resource!==conf.base+'/api/mcp')return null;
 if((p.get('scope')||'mcp:read')!=='mcp:read')return null;
 const state=p.get('state')||'';
 if(state.length>512)return null;
 return {clientId,redirect,resource,challenge,state};
}
const pending=new Map(),redeemed=new Set();
function clean(){for(const [key,val]of pending)if(val.expiresAt<Date.now())pending.delete(key);}
async function account(username,password){
 const user=await ds.findOne('users',u=>u.username===username);
 if(!user||user.active===false||(user.approval&&user.approval!=='approved')||user.mustChangePassword)return null;
 const salt=Buffer.from(user.salt,'hex');
 const actual=crypto.pbkdf2Sync(password,salt,100000,64,'sha512');
 const expected=Buffer.from(user.password,'hex');
 if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
 return user;
}
async function issueAuthCode(record,user){
 const code=random(),hashed=digest(code);
 const data={...record,userId:user.id,expiresAt:Date.now()+TTL_CODE};
 if(process.env.REDIS_URL||process.env.UPSTASH_REDIS_REST_URL){
  await require('./redis-store').command('SET','dailyNote:oauth:code:'+hashed,JSON.stringify(data),'EX',300);
 }else{
  pending.set(hashed,data);clean();
 }
 return code;
}
async function consumeCode(code){
 const hashed=digest(code);
 if(process.env.REDIS_URL||process.env.UPSTASH_REDIS_REST_URL){
  const raw=await require('./redis-store').command('GETDEL','dailyNote:oauth:code:'+hashed);
  return raw?JSON.parse(raw):null;
 }
 if(redeemed.has(hashed))return null;
 const data=pending.get(hashed);
 pending.delete(hashed);redeemed.add(hashed);
 if(redeemed.size>2000)redeemed.clear();
 return data||null;
}
function redirectUrl(record,code){const url=new URL(record.redirect);url.searchParams.set('code',code);if(record.state)url.searchParams.set('state',record.state);url.searchParams.set('iss',config().base);return url.toString();}
async function authorize(req,res,conf){
 if(req.method==='GET'){
  const p=params(req),record=validateRequest(conf,p);
  if(!record)return page(res,'<h1>연결 요청 오류</h1><p>허용되지 않은 클라이언트 또는 인증 요청입니다.</p>',400);
  const query=p.toString();
  return page(res,'<h1>DailyNote AI 연결</h1><p><b>'+escape(record.clientId)+'</b>에서 내 DailyNote 업무일지·메모·일정·파일의 읽기 기능에 접근하려고 합니다.</p><p>기존 DailyNote 계정으로 로그인하고 <b>연결 승인</b>을 선택해 주세요. 연결을 거부해도 됩니다.</p><form method="post" action="/api/oauth/authorize?'+escape(query)+'"><label for="username">DailyNote 아이디</label><input id="username" name="username" required autocomplete="username" maxlength="40"><label for="password">비밀번호</label><input id="password" name="password" type="password" required autocomplete="current-password"><button name="decision" value="approve">연결 승인</button> <button name="decision" value="deny" style="background:#777">거부</button></form><small>인증 후 발급되는 토큰은 MCP에서만 유효하며, 일반 웹사이트 로그인 세션을 외부에 전달하지 않습니다.</small>');
 }
 if(req.method!=='POST')return bad(res,'invalid_request',405);
 const record=validateRequest(conf,params(req));
 if(!record)return bad(res,'invalid_request');
 const body=await form(req);
 if(body.get('decision')==='deny'){
  const url=new URL(record.redirect);url.searchParams.set('error','access_denied');if(record.state)url.searchParams.set('state',record.state);res.writeHead(302,{Location:url.toString(),'Cache-Control':'no-store'});return res.end();
 }
 const username=body.get('username')||'',password=body.get('password')||'';
 if(username.length>40||password.length>128)return page(res,'<h1>인증 오류</h1><p>로그인 입력값을 확인해 주세요.</p>',401);
 const user=await account(username,password);
 if(!user)return page(res,'<h1>인증 실패</h1><p>계정 또는 비밀번호가 올바르지 않거나 계정이 비활성화되었습니다. 연결을 다시 시작하세요.</p>',401);
 const code=await issueAuthCode(record,user);
 res.writeHead(302,{Location:redirectUrl(record,code),'Cache-Control':'no-store'});return res.end();
}
async function token(req,res,conf){
 if(req.method!=='POST')return bad(res,'invalid_request',405);
 const p=await form(req);
 if(p.get('grant_type')!=='authorization_code')return bad(res,'unsupported_grant_type');
 const id=p.get('client_id'),redirect=p.get('redirect_uri'),code=p.get('code'),verifier=p.get('code_verifier'),resource=p.get('resource');
 if(!id||!clientFor(conf,id,redirect)||!code||!verifier||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||resource!==conf.base+'/api/mcp')return bad(res,'invalid_grant');
 const record=await consumeCode(code);
 if(!record||record.expiresAt<Date.now()||record.clientId!==id||record.redirect!==redirect||record.resource!==resource||!safe(record.challenge,crypto.createHash('sha256').update(verifier).digest('base64url')))return bad(res,'invalid_grant');
 const user=await ds.findOne('users',u=>u.id===record.userId);
 if(!user||user.active===false||(user.approval&&user.approval!=='approved')||user.mustChangePassword)return bad(res,'invalid_grant');
 const access=random(),issued=Date.now();
 await ds.insertSession({token:access,userId:user.id,username:user.username,expiresAt:new Date(issued+TTL_ACCESS).toISOString(),createdAt:new Date(Math.max(issued,(Date.parse(user.passwordResetAt)||0)+1)).toISOString(),mcpOnly:true,oauthClientId:id,oauthResource:resource,scope:'mcp:read'});
 noCache(res);return sendJson(res,200,{access_token:access,token_type:'Bearer',expires_in:TTL_ACCESS/1000,scope:'mcp:read'});
}
async function oauthRouter(req,res){
 const conf=config();
 if(!conf)return bad(res,'oauth_not_configured',503);
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/oauth/authorize')return authorize(req,res,conf);
 if(pathname==='/api/oauth/token')return token(req,res,conf);
 return bad(res,'not_found',404);
}
function metadata(path){
 const conf=config();if(!conf)return null;
 if(path==='/api/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource')return {resource:conf.base+'/api/mcp',authorization_servers:[conf.base],scopes_supported:['mcp:read']};
 if(path==='/api/.well-known/oauth-authorization-server'||path==='/.well-known/oauth-authorization-server')return {issuer:conf.base,authorization_endpoint:conf.base+'/api/oauth/authorize',token_endpoint:conf.base+'/api/oauth/token',response_types_supported:['code'],grant_types_supported:['authorization_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['mcp:read'],authorization_response_iss_parameter_supported:true};
 return null;
}
module.exports={oauthRouter,metadata,config,validateRequest};
