// Optional real-Redis QA. Starts its own temporary Redis; ignores operational credentials.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-license-redis-'));
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;delete process.env.VERCEL;
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
let redis,bridge,server,port;
const incomplete=Symbol('incomplete');
function parse(buffer,offset=0){
 const end=buffer.indexOf('\r\n',offset);if(end<0)return incomplete;
 const type=String.fromCharCode(buffer[offset]),text=buffer.toString('utf8',offset+1,end),start=end+2;
 if(type==='+'||type==='-'||type===':')return {value:type==='-'?new Error(text):type===':'?Number(text):text,end:start};
 const length=Number(text);if(length===-1)return {value:null,end:start};
 if(type==='$'){if(buffer.length<start+length+2)return incomplete;return {value:buffer.toString('utf8',start,start+length),end:start+length+2};}
 if(type==='*'){const result=[];let cursor=start;for(let i=0;i<length;i++){const value=parse(buffer,cursor);if(value===incomplete)return incomplete;result.push(value.value);cursor=value.end;}return {value:result,end:cursor};}
 throw new Error('Unsupported Redis response');
}
function command(args){return new Promise((resolve,reject)=>{
 const socket=net.connect({host:'127.0.0.1',port}),parts=[Buffer.from('*'+args.length+'\r\n')];let buffer=Buffer.alloc(0),finished=false;
 for(const arg of args){const value=Buffer.from(String(arg));parts.push(Buffer.from('$'+value.length+'\r\n'),value,Buffer.from('\r\n'));}
 function complete(error,value){if(finished)return;finished=true;socket.destroy();error?reject(error):resolve(value);}
 socket.setTimeout(5000,()=>complete(new Error('Redis QA timeout')));socket.on('error',e=>complete(e));socket.on('connect',()=>socket.write(Buffer.concat(parts)));
 socket.on('data',data=>{buffer=Buffer.concat([buffer,data]);try{const response=parse(buffer);if(response!==incomplete)complete(response.value instanceof Error?response.value:null,response.value);}catch(e){complete(e);}});
 socket.on('end',()=>{if(!finished)complete(new Error('Redis closed before response'));});
});}
(async()=>{
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));port=reservation.address().port;await new Promise(r=>reservation.close(r));
 redis=spawn(process.env.REDIS_SERVER_EXECUTABLE||'redis-server',['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no','--dir',tmp],{stdio:['ignore','ignore','pipe']});let spawnError;redis.on('error',e=>{spawnError=e;});redis.stderr.on('data',()=>{});
 let ready=false;for(let i=0;i<100;i++){if(spawnError)throw spawnError;try{ready=await command(['PING'])==='PONG';if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready,'Dedicated Redis starts');
 const secret=crypto.randomBytes(24).toString('hex');
 // Exercise the application's Upstash-compatible HTTP transport and genuine Redis EVAL.
 bridge=http.createServer(async(req,res)=>{try{if(req.headers.authorization!=='Bearer '+secret){res.writeHead(401);res.end();return;}const chunks=[];for await(const chunk of req)chunks.push(chunk);const result=await command(JSON.parse(Buffer.concat(chunks)));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({result}));}catch(e){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 await new Promise(r=>bridge.listen(0,'127.0.0.1',r));process.env.UPSTASH_REDIS_REST_URL='http://127.0.0.1:'+bridge.address().port;process.env.UPSTASH_REDIS_REST_TOKEN=secret;
 const {makeUserRecord}=require('../src/auth'),password=crypto.randomBytes(24).toString('hex'),ds=require('../src/datastore'),handler=require('../src/server');
 await ds.insert('users',{...makeUserRecord('redis-backup-admin',password),role:'admin',active:true,approval:'approved'});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function call(url,body,token){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 const token=(await call('/api/auth/login',{username:'redis-backup-admin',password})).data.token;assert.ok(token);
 const job=(await call('/api/backup/import',{phase:'start',scope:'all',archiveId:'redis-restore-123',counts:{users:1,work_logs:1}},token)).data;
 await call('/api/backup/import',{phase:'record',jobId:job.jobId,kind:'users',record:{id:70,...makeUserRecord('redis-restored',password),role:'member',active:true,approval:'approved'}},token);
 await call('/api/backup/import',{phase:'record',jobId:job.jobId,kind:'work_logs',record:{id:80,userId:70,workDate:'2026-10-01',todo:['Redis 복원'],nextDayPlan:[],memo:'비공개 내용'}},token);
 const result=await call('/api/backup/import',{phase:'commit',jobId:job.jobId},token);assert.equal(result.status,200,JSON.stringify(result));
 const restored=await ds.findOne('users',x=>x.username==='redis-restored');assert.equal((await ds.findAll('work_logs'))[0].userId,restored.id);
 assert.equal((await call('/api/backup/import',{phase:'start',scope:'all',archiveId:'redis-restore-123',counts:{}},token)).data.duplicate,true);
 const before=structuredClone(await ds.findAll('users'));await ds.update('users',restored.id,{nickname:'수정됨'});
 await assert.rejects(()=>ds.commitBackup({work_logs:[{id:999,userId:1}]},{key:'stale-cas'},null,[],before),/변경/);assert.equal(await ds.findOne('work_logs',x=>x.id===999),undefined);
 const logs=(await call('/api/admin/logs',null,token)).data.items;assert.ok(logs.some(x=>x.category==='backup'));assert.ok(!JSON.stringify(logs).includes(password));
 const indexed=await command(['ZCARD','dailyNote:audit_logs:index']);assert.ok(indexed>0);
 console.log(JSON.stringify({status:'passed',checks:['Redis atomic restore','ownership ID remap','duplicate prevention','concurrent user update rejection','bounded audit index']}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(bridge)await new Promise(r=>bridge.close(r));if(redis&&redis.exitCode===null){const closed=new Promise(r=>redis.once('exit',r));redis.kill('SIGTERM');await closed;}fs.rmSync(tmp,{recursive:true,force:true});});

