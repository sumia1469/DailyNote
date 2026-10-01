const {test,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {Readable,Writable}=require('stream');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'large-files-'));
process.env.DATA_DIR=path.join(root,'data');process.env.UPLOAD_DIR=path.join(root,'uploads');
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),handler=require('../src/server'),{makeUserRecord}=require('../src/auth');
after(()=>fs.rmSync(root,{recursive:true,force:true}));
async function request(method,url,body,token){
 const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url,headers:token?{authorization:'Bearer '+token}:{}});
 const chunks=[];const res=new Writable({write(c,e,cb){chunks.push(c);cb();}});
 res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;res.headersSent=true;};
 const done=new Promise(resolve=>res.on('finish',resolve));await handler(req,res);await done;
 const buffer=Buffer.concat(chunks);return {status:res.status,buffer,data:res.headers['Content-Type']==='application/json'?JSON.parse(buffer.toString()):null};
}
test('large files keep original bytes across chunk upload/download, enforce ownership/rights and clean up',async()=>{
 const member=await ds.insert('users',{...makeUserRecord('large-member','test-member-123'),role:'member',approval:'approved'});
 await ds.insert('users',{...makeUserRecord('large-other','test-other-123'),role:'member',approval:'approved'});
 await ds.insert('users',{...makeUserRecord('large-admin','test-admin-123'),role:'admin'});
 const token=(await request('POST','/api/auth/login',{username:'large-member',password:'test-member-123'})).data.token;
 const other=(await request('POST','/api/auth/login',{username:'large-other',password:'test-other-123'})).data.token;
 const admin=(await request('POST','/api/auth/login',{username:'large-admin',password:'test-admin-123'})).data.token;
 const original=crypto.randomBytes(10*1024*1024+19);
 const start=await request('POST','/api/upload',{phase:'start',filename:'large.bin',mime:'application/octet-stream',size:original.length},token);assert.equal(start.status,201);
 const {id,chunkSize}=start.data;
 assert.equal((await request('GET','/api/files',null,token)).data.length,0);
 assert.equal((await request('GET','/api/admin/files',null,admin)).data.length,0);
 assert.equal((await request('POST','/api/upload',{phase:'cancel',id},other)).status,404);
 assert.equal((await request('POST','/api/upload',{phase:'part',id,index:1,data:'AQ=='},token)).status,400);
 assert.equal((await request('POST','/api/upload',{phase:'part',id,index:0,data:'AQ=='},token)).status,400);
 for(let i=0;i<Math.ceil(original.length/chunkSize);i++){
  const response=await request('POST','/api/upload',{phase:'part',id,index:i,data:original.subarray(i*chunkSize,(i+1)*chunkSize).toString('base64')},token);
  assert.equal(response.status,i===Math.ceil(original.length/chunkSize)-1?201:200);
 }
 const file=(await request('GET','/api/files',null,token)).data[0];assert.equal(file.sizeBytes,original.length);
 const parts=[];for(let i=0;i<file.chunkCount;i++)parts.push((await request('GET','/api/upload/'+id+'?part='+i,null,token)).buffer);
 assert.deepEqual(Buffer.concat(parts),original);
 assert.equal((await request('GET','/api/upload/'+id+'?part=0',null,other)).status,404);
 assert.equal((await request('DELETE','/api/upload/'+id,null,other)).status,404);
 assert.equal((await request('GET','/api/upload/'+id+'?part=999',null,token)).status,400);
 assert.deepEqual((await request('GET','/api/admin/files/'+id+'?part=0',null,admin)).buffer,original.subarray(0,chunkSize));
 await ds.update('users',member.id,{permissions:{fileUpload:false,fileDownload:false}});
 assert.equal((await request('POST','/api/upload',{phase:'start',filename:'deny',mime:'',size:1},token)).status,403);
 assert.equal((await request('GET','/api/upload/'+id+'?part=0',null,token)).status,403);
 await ds.update('users',member.id,{permissions:{}});
 assert.equal((await request('DELETE','/api/admin/files/'+id,null,admin)).status,200);
 assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length,0);
 const pending=(await request('POST','/api/upload',{phase:'start',filename:'cancel.bin',mime:'',size:chunkSize+1},token)).data;
 await request('POST','/api/upload',{phase:'part',id:pending.id,index:0,data:original.subarray(0,chunkSize).toString('base64')},token);
 assert.equal((await request('POST','/api/upload',{phase:'cancel',id:pending.id},token)).status,200);assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length,0);
 const empty=(await request('POST','/api/upload',{phase:'start',filename:'empty.bin',mime:'',size:0},token)).data;
 assert.equal((await request('POST','/api/upload',{phase:'part',id:empty.id,index:0,data:''},token)).status,201);
 assert.equal((await request('GET','/api/upload/'+empty.id+'?part=0',null,token)).buffer.length,0);
 await request('DELETE','/api/upload/'+empty.id,null,token);
 const legacy=await request('POST','/api/upload',{filename:'legacy.bin',mime:'application/octet-stream',data:original.subarray(0,3*1024*1024+1).toString('base64')},token);assert.equal(legacy.status,201);
 assert.deepEqual((await request('GET','/api/upload/'+legacy.data.id,null,token)).buffer,original.subarray(0,3*1024*1024+1));await request('DELETE','/api/upload/'+legacy.data.id,null,token);
});
