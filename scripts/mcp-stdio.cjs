#!/usr/bin/env node
'use strict';
// MCP stdio-to-HTTP bridge for local Claude Code and other desktop clients.
// stdout MUST contain JSON-RPC messages only. Diagnostics go to stderr.
const readline=require('node:readline');
const {URL}=require('node:url');
const endpoint=process.env.DAILYNOTE_MCP_URL||'http://127.0.0.1:3000/api/mcp';
const token=process.env.DAILYNOTE_MCP_TOKEN||'';
let target;
try{
 target=new URL(endpoint);
 const loopback=['127.0.0.1','localhost','[::1]'].includes(target.hostname);
 if(!['https:','http:'].includes(target.protocol)||target.username||target.password||target.search||target.hash||target.pathname!=='/api/mcp')throw Error('Invalid MCP endpoint');
 if(!loopback&&(target.protocol!=='https:'||process.env.DAILYNOTE_MCP_ALLOW_REMOTE!=='1'))throw Error('Remote MCP requires HTTPS and DAILYNOTE_MCP_ALLOW_REMOTE=1');
 if(!token||!/^\S+$/.test(token))throw Error('Set DAILYNOTE_MCP_TOKEN to a dedicated DailyNote login session');
}catch(err){process.stderr.write('DailyNote MCP setup: '+err.message+'\n');process.exit(1);}
const lineReader=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let queue=Promise.resolve();
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
function failure(id,code,message){return {jsonrpc:'2.0',id,error:{code,message}};}
async function forward(raw){
 let message;
 try{message=JSON.parse(raw);}catch{output(failure(null,-32700,'Invalid JSON'));return;}
 if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string'||Array.isArray(message)){output(failure(message?.id??null,-32600,'Invalid request'));return;}
 const notification=message.id===undefined;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(target,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','authorization':'Bearer '+token},body:JSON.stringify(message),signal:controller.signal,redirect:'error'});
  if(notification)return;
  const body=await response.text();
  if(!response.ok)throw Error('DailyNote MCP HTTP '+response.status);
  const result=JSON.parse(body);
  if(!result||result.jsonrpc!=='2.0'||result.id!==message.id)throw Error('Invalid MCP response');
  output(result);
 }catch(error){
  if(!notification)output(failure(message.id,-32000,error.name==='AbortError'?'DailyNote MCP request timeout':error.message));
 }finally{clearTimeout(timer);}
}
lineReader.on('line',line=>{
 if(Buffer.byteLength(line,'utf8')>256*1024){output(failure(null,-32600,'Request too large'));return;}
 queue=queue.then(()=>forward(line)).catch(err=>process.stderr.write('MCP bridge error: '+err.message+'\n'));
});
