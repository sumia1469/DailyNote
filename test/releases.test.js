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
test('shared releases preserve legacy reads and links, update/delete globally and never duplicate',async()=>{
 assert.equal(new Set(releases.map(r=>r.id)).size,releases.length);
 for(const r of releases){assert.ok(r.message.length<=2000);assert.ok(Number.isFinite(Date.parse(r.publishedAt)));}
 const owner=await ds.insert('users',makeUserRecord('owner','test-admin-123'));
 const member=await ds.insert('users',{...makeUserRecord('member','test-member-123'),role:'member',active:true,approval:'approved'});
 const pending=await ds.insert('users',{...makeUserRecord('pending','test-pending-123'),role:'member',active:false,approval:'pending'});
 const removed=releases[2];const removedCopy=await ds.insertOnce('notifications',removed.id+':'+owner.id,{userId:owner.id,releaseId:removed.id,message:removed.message,isRead:false,createdAt:removed.publishedAt});await ds.remove('notifications',removedCopy.id);
 const release=releases[0],legacy=await ds.insert('notifications',{userId:member.id,releaseId:release.id,message:release.message,isRead:true,createdAt:release.publishedAt});
 await ds.insert('notifications',{userId:owner.id,releaseId:release.id,message:release.message,isRead:false,createdAt:release.publishedAt});
 const admin=(await request('POST','/api/auth/login',{username:'owner',password:'test-admin-123'})).data.token;
 const token=(await request('POST','/api/auth/login',{username:'member',password:'test-member-123'})).data.token;
 await Promise.all(Array.from({length:8},()=>request('GET','/api/notifications',null,token)));
 let mine=(await request('GET','/api/notifications',null,token)).data;assert.equal(mine.length,releases.length-1);assert.equal(mine.some(n=>n.releaseId===removed.id),false);
 const note=mine.find(n=>n.releaseId===release.id);assert.equal(note.isRead,true);
 assert.equal((await request('GET','/api/notifications/'+legacy.id,null,token)).data.id,note.id);
 let all=(await request('GET','/api/admin/notifications',null,admin)).data;assert.equal(all.length,releases.length-1);assert.equal(all.find(n=>n.id===note.id).readCount,1);
 assert.equal((await request('GET','/api/notifications/'+note.id,null,admin)).data.isRead,false);
 const other=mine.find(n=>n.id!==note.id);await Promise.all(Array.from({length:4},()=>request('PUT','/api/notifications/'+other.id,{},token)));
 assert.equal((await request('GET','/api/notifications/'+other.id,null,token)).data.isRead,true);
 assert.equal((await ds.findAll('notification_reads')).filter(r=>r.userId===member.id).length,1);
 assert.equal((await request('PUT','/api/admin/notifications/'+legacy.id,{title:'변경 제목',message:'관리자가 수정한 공지'},admin)).status,200);
 for(const t of [admin,token]){const n=(await request('GET','/api/notifications/'+note.id,null,t)).data;assert.equal(n.message,'관리자가 수정한 공지');assert.equal(n.isRead,false);}
 await request('DELETE','/api/admin/notifications/'+note.id,null,admin);
 for(const t of [admin,token])assert.equal((await request('GET','/api/notifications/'+legacy.id,null,t)).status,404);
 await ds.update('users',pending.id,{active:true,approval:'approved'});const later=(await request('POST','/api/auth/login',{username:'pending',password:'test-pending-123'})).data.token;
 const laterList=(await request('GET','/api/notifications',null,later)).data;assert.equal(laterList.length,releases.length-2);assert.equal(laterList.some(n=>n.releaseId===release.id||n.releaseId===removed.id),false);
 const broadcastDate='2020-01-01T00:00:00Z';const old1=await ds.insert('notifications',{userId:owner.id,title:'이전 전체 공지',message:'기존 게시글',createdAt:broadcastDate,isRead:true});
 const old2=await ds.insert('notifications',{userId:member.id,title:'이전 전체 공지',message:'기존 게시글',createdAt:broadcastDate,isRead:false});
 all=(await request('GET','/api/admin/notifications',null,admin)).data;assert.equal(all.filter(n=>n.title==='이전 전체 공지').length,1);assert.equal(all.find(n=>n.title==='이전 전체 공지').readCount,1);
 assert.equal((await request('GET','/api/notifications/'+old1.id,null,token)).status,404);
 await request('PUT','/api/admin/notifications/'+old1.id,{title:'이전 공지 수정',message:'함께 수정'},admin);
 assert.equal((await request('GET','/api/notifications/'+old2.id,null,token)).data.message,'함께 수정');
});
