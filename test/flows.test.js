const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {Readable,Writable}=require('stream');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-test-'));
process.env.DATA_DIR=path.join(root,'data');process.env.UPLOAD_DIR=path.join(root,'uploads');
const ds=require('../src/datastore');const handler=require('../src/server');
const {makeUserRecord}=require('../src/auth');
after(()=>fs.rmSync(root,{recursive:true,force:true}));
async function request(method,url,body,token){
 const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url,headers:token?{authorization:`Bearer ${token}`}:{}});
 let chunks=[];const res=new Writable({write(c,e,cb){chunks.push(c);cb();}});
 res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;res.headersSent=true;};
 const done=new Promise(resolve=>res.on('finish',resolve));await handler(req,res);await done;
 const text=Buffer.concat(chunks).toString();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:res.status,data};
}
test('login, ownership, worklog CRUD, notifications, password update and file lifecycle',async()=>{
 const user=await ds.insert('users',makeUserRecord('tester','test-password-123'));
 await ds.insert('users',makeUserRecord('other','other-password-123'));
 assert.equal((await request('GET','/api/worklogs')).status,401);
 assert.equal((await request('POST','/api/auth/login',{username:'tester',password:'wrong'})).status,401);
 const login=await request('POST','/api/auth/login',{username:'tester',password:'test-password-123'});assert.equal(login.status,200);const token=login.data.token;
 const other=(await request('POST','/api/auth/login',{username:'other',password:'other-password-123'})).data.token;
 const created=await request('POST','/api/worklogs',{workDate:'2026-09-30',todo:[{task:'복원 테스트',checked:false}],nextDayPlan:['배포']},token);assert.equal(created.status,201);const id=created.data.id;
 assert.equal((await request('GET','/api/worklogs',null,token)).data.length,1);
 assert.equal((await request('PUT',`/api/worklogs/${id}`,{memo:'침범'},other)).status,404);
 assert.equal((await request('DELETE',`/api/worklogs/${id}`,null,other)).status,404);
 assert.equal((await request('PUT',`/api/worklogs/${id}`,{workDate:'2026-10-01',memo:'저장 성공'},token)).status,200);
 assert.equal((await request('GET','/api/worklogs?date=2026-10-01',null,token)).data[0].memo,'저장 성공');
 assert.equal(JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR,'work_logs.json')))[0].memo,'저장 성공');
 const note=await request('POST','/api/notifications',{userId:user.id,message:'완료'},token);assert.equal(note.status,201);
 assert.equal((await request('PUT',`/api/notifications/${note.data.id}`,{},token)).status,200);
 assert.equal((await request('GET','/api/notifications',null,token)).data[0].isRead,true);
 const file=await request('POST','/api/upload',{filename:'../테스트.txt',mime:'text/plain',data:Buffer.from('파일 테스트').toString('base64')},token);assert.equal(file.status,201);
 assert.equal((await request('GET',`/api/upload/${file.data.id}`,null,token)).data,'파일 테스트');
 assert.equal((await request('GET',`/api/upload/${file.data.id}`,null,other)).status,404);
 assert.equal((await request('DELETE',`/api/upload/${file.data.id}`,null,token)).status,200);
 assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length,0);
 assert.equal((await request('PUT',`/api/users/${user.id}`,{password:'new-password-123'},token)).status,200);
 assert.equal((await request('POST','/api/auth/login',{username:'tester',password:'new-password-123'})).status,200);
 assert.equal((await request('DELETE',`/api/worklogs/${id}`,null,token)).status,200);
});

test('Vercel without Redis serves login and assets while API reports missing storage',async()=>{
 const previous=process.env.VERCEL;process.env.VERCEL='1';
 try {
  const page=await request('GET','/');assert.equal(page.status,200);assert.match(page.data,/id="login-form"/);
  for (const asset of ['/style.css','/script.js']) assert.equal((await request('GET',asset)).status,200);
  assert.equal((await request('POST','/api/auth/login',{username:'tester',password:'test-password-123'})).status,503);
 } finally {if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
