const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable,Writable}=require('node:stream');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-memos-'));process.env.DATA_DIR=root;delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;
const ds=require('../src/datastore'),handler=require('../src/server'),{makeUserRecord}=require('../src/auth');after(()=>fs.rmSync(root,{recursive:true,force:true}));
async function request(method,url,body,token){const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url,headers:token?{authorization:'Bearer '+token}:{}});let chunks=[];const res=new Writable({write(c,e,cb){chunks.push(c);cb();}});res.writeHead=status=>{res.status=status;res.headersSent=true;};const done=new Promise(resolve=>res.on('finish',resolve));await handler(req,res);await done;return {status:res.status,data:JSON.parse(Buffer.concat(chunks).toString())};}
const payload={title:'업무 아이디어',html:'<b>내용</b>',text:'내용',folder:'내 메모',font:'sans-serif',color:'yellow',pinned:true,starred:true,attachments:[]};
test('memo persistence, ownership, permissions, attachments, payload validation and lifecycle',async()=>{
 await ds.insert('users',{...makeUserRecord('admin','password123'),role:'admin'});const member=await ds.insert('users',{...makeUserRecord('member','password123'),role:'member'});await ds.insert('users',{...makeUserRecord('other','password123'),role:'member'});
 const token=(await request('POST','/api/auth/login',{username:'member',password:'password123'})).data.token,other=(await request('POST','/api/auth/login',{username:'other',password:'password123'})).data.token;
 assert.equal((await request('GET','/api/memos')).status,401);
 const created=await request('POST','/api/memos',payload,token);assert.equal(created.status,201);const id=created.data.id;
 assert.equal((await request('GET','/api/memos',null,other)).data.length,0);
 for(const method of ['GET','PUT','DELETE'])assert.equal((await request(method,'/api/memos/'+id,payload,other)).status,404);
 const audio={kind:'audio',name:'녹음.webm',data:'data:audio/webm;base64,AQID'};const image={kind:'image',name:'그림.png',data:'data:image/png;base64,AQID'};
 assert.equal((await request('PUT','/api/memos/'+id,{...payload,attachments:[audio,image]},token)).status,200);
 const saved=(await request('GET','/api/memos/'+id,null,token)).data;assert.equal(saved.attachments.length,2);assert.equal(saved.pinned,true);
 const list=(await request('GET','/api/memos',null,token)).data;assert.equal(list[0].attachmentCount,2);assert.equal('attachments' in list[0],false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'memos.json')))[0].attachments.length,2);
 for(const invalid of [{...payload,title:'',text:'',html:''},{...payload,font:'evil'},{...payload,attachments:[{kind:'image',name:'bad.svg',data:'data:image/svg+xml;base64,AQID'}]},{...payload,attachments:[{...image,data:'https://example.com/image.png'}]}])assert.equal((await request('POST','/api/memos',invalid,token)).status,400);
 await ds.update('users',member.id,{permissions:{memoRead:false,memoCreate:false,memoEdit:false,memoDelete:false}});
 for(const [method,url] of [['GET','/api/memos'],['POST','/api/memos'],['PUT','/api/memos/'+id],['DELETE','/api/memos/'+id]])assert.equal((await request(method,url,payload,token)).status,403);
 await ds.update('users',member.id,{permissions:{}});assert.equal((await request('DELETE','/api/memos/'+id,null,token)).status,200);assert.equal((await request('GET','/api/memos/'+id,null,token)).status,404);
});
