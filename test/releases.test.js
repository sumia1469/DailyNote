const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {Readable,Writable}=require('stream');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-releases-'));
process.env.DATA_DIR=path.join(root,'data');
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),handler=require('../src/server'),{makeUserRecord}=require('../src/auth');
const releases=require('../src/releases.json');
after(()=>fs.rmSync(root,{recursive:true,force:true}));
async function request(method,url,body,token){
 const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url,headers:token?{authorization:'Bearer '+token}:{}});
 const chunks=[];const res=new Writable({write(c,e,cb){chunks.push(c);cb();}});
 res.writeHead=(status)=>{res.status=status;res.headersSent=true;};
 const done=new Promise(resolve=>res.on('finish',resolve));await handler(req,res);await done;
 return {status:res.status,data:JSON.parse(Buffer.concat(chunks).toString())};
}
test('update notices persist once per user, preserve read/edit/delete, and exclude pending users',async()=>{
 assert.equal(new Set(releases.map(r=>r.id)).size,releases.length);
 for(const r of releases){assert.ok(r.message.length<=2000);assert.ok(Number.isFinite(Date.parse(r.publishedAt)));}
 const owner=await ds.insert('users',makeUserRecord('owner','test-admin-123'));
 const member=await ds.insert('users',{...makeUserRecord('member','test-member-123'),role:'member',active:true,approval:'approved'});
 const pending=await ds.insert('users',{...makeUserRecord('pending','test-pending-123'),role:'member',active:false,approval:'pending'});
 const admin=(await request('POST','/api/auth/login',{username:'owner',password:'test-admin-123'})).data.token;
 const token=(await request('POST','/api/auth/login',{username:'member',password:'test-member-123'})).data.token;
 await Promise.all(Array.from({length:8},()=>request('GET','/api/notifications',null,token)));
 let mine=(await request('GET','/api/notifications',null,token)).data;
 assert.equal(mine.length,releases.length);assert.ok(mine.every(n=>n.userId===member.id&&!n.isRead));
 const note=mine[0];
 assert.equal((await request('PUT','/api/notifications/'+note.id,{},token)).status,200);
 assert.equal((await request('GET','/api/notifications',null,token)).data.find(n=>n.id===note.id).isRead,true);
 assert.equal((await request('PUT','/api/admin/notifications/'+note.id,{userId:member.id,message:'관리자가 수정한 공지'},admin)).status,200);
 mine=(await request('GET','/api/notifications',null,token)).data;
 assert.equal(mine.find(n=>n.id===note.id).message,'관리자가 수정한 공지');
 assert.equal((await request('DELETE','/api/admin/notifications/'+note.id,null,admin)).status,200);
 assert.equal((await request('GET','/api/notifications',null,token)).data.some(n=>n.id===note.id),false);
 const all=(await request('GET','/api/admin/notifications',null,admin)).data;
 assert.equal(all.some(n=>n.userId===pending.id),false);assert.ok(all.some(n=>n.userId===owner.id));
 assert.equal(all.filter(n=>n.userId===member.id).length,releases.length-1);
 await ds.update('users',pending.id,{active:true,approval:'approved'});
 const approved=(await request('GET','/api/admin/notifications',null,admin)).data;
 assert.equal(approved.filter(n=>n.userId===pending.id).length,releases.length);
});
