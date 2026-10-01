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
 const {makeUserRecord}=require('../src/auth'),password=crypto.randomBytes(24).toString('hex'),legacyApproval=[undefined,null,'',false,0,'approved',undefined],legacy=Array.from({length:7},(_,i)=>({...makeUserRecord('redis-example-'+(i+1),password),id:i+1,role:i?'member':'admin',active:true,approval:legacyApproval[i]}));
 for(const user of legacy)await command(['HSET','dailyNote:users',user.id,JSON.stringify(user)]);await command(['SET','dailyNote:users:id',7]);
 const ds=require('../src/datastore'),handler=require('../src/server'),license=require('../src/license');
 await ds.insert('work_logs',{userId:2,workDate:'2026-10-01',memo:'Redis example data preserved'});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 async function request(url,method='GET',body,token){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 const admin=(await request('/api/auth/login','POST',{username:'redis-example-1',password})).data.token;assert.ok(admin);
 assert.equal((await request('/api/auth/login','POST',{username:'redis-example-2',password})).data.code,'LICENSE_USER_LIMIT');
 assert.equal((await request('/api/worklogs','GET',null,admin)).status,403);assert.equal((await request('/api/admin/users','GET',null,admin)).status,200);assert.equal((await request('/api/license')).status,401);
 assert.equal((await request('/api/admin/users/7','PUT',{username:'redis-example-7',active:false},admin)).status,200);assert.equal((await license.status()).activeUserCount,6);
 assert.equal((await request('/api/admin/users','POST',{username:'redis-overflow',password,limit:100,license:true},admin)).status,403);assert.equal(await ds.findOne('users',u=>u.username==='redis-overflow'),undefined);
 assert.equal((await request('/api/admin/users/7','PUT',{username:'redis-example-7',active:true},admin)).status,403);
 assert.equal((await request('/api/auth/register','POST',{username:'redis-register-overflow',password,passwordConfirmation:password})).status,403);
 const pending=await ds.insert('users',{...makeUserRecord('redis-pending',password),role:'member',active:false,approval:'pending'});assert.equal((await request('/api/admin/users/'+pending.id+'/approve','POST',{},admin)).status,403);
 await ds.update('users',6,{active:false});
 const concurrent=await Promise.all(Array.from({length:12},(_,i)=>request('/api/admin/users','POST',{username:'redis-concurrent-'+i,password},admin)));assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,...Array(11).fill(403)]);assert.equal((await license.status()).activeUserCount,6);
 const added=concurrent.find(r=>r.status===201).data;await ds.update('users',added.id,{active:false});
 const approvals=await Promise.all([request('/api/admin/users/'+pending.id+'/approve','POST',{},admin),request('/api/admin/users/7','PUT',{username:'redis-example-7',active:true},admin)]);assert.deepEqual(approvals.map(r=>r.status).sort(),[200,403]);assert.equal((await license.status()).activeUserCount,6);
 const member=await request('/api/auth/login','POST',{username:'redis-example-2',password});assert.equal(member.status,200);assert.equal((await request('/api/worklogs','GET',null,member.data.token)).data[0].memo,'Redis example data preserved');
 const stored=(await command(['HVALS','dailyNote:users'])).map(JSON.parse);assert.equal(stored.filter(license.usesSeat).length,6);assert.equal((await ds.update('users',999999,{active:true})),null);
 console.log(JSON.stringify({status:'passed',redis:await command(['INFO','server']).then(s=>s.match(/redis_version:([^\r]+)/)[1]),checks:['legacy recovery and data preservation','unauthenticated status denied','server rejects client cap override','registration/approval/reactivation cap','12 concurrent HTTP creations: one accepted','concurrent approval/reactivation: one accepted','stored active count is six','missing record returns null']}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(r=>server.close(r));if(bridge)await new Promise(r=>bridge.close(r));if(redis&&redis.exitCode===null){const closed=new Promise(r=>redis.once('exit',r));redis.kill('SIGTERM');await closed;}fs.rmSync(tmp,{recursive:true,force:true});});
