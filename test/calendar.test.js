const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable,Writable}=require('node:stream');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-calendar-'));process.env.DATA_DIR=root;delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const C=require('../public/calendar-core'),H=require('../public/calendar-holidays'),ds=require('../src/datastore'),handler=require('../src/server'),{makeUserRecord}=require('../src/auth');after(()=>fs.rmSync(root,{recursive:true,force:true}));
async function request(method,url,body,token){const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url,headers:token?{authorization:'Bearer '+token}:{}});const chunks=[],res=new Writable({write(c,e,cb){chunks.push(c);cb();}});res.writeHead=status=>{res.status=status;res.headersSent=true;};const done=new Promise(resolve=>res.on('finish',resolve));await handler(req,res);await done;return {status:res.status,data:JSON.parse(Buffer.concat(chunks).toString())};}
const payload={title:'기획 회의',description:'회의 자료',start:'2026-10-01T09:00:00+09:00',end:'2026-10-01T10:00:00+09:00',allDay:false,kind:'schedule',color:'blue',reminderMinutes:10};
test('calendar dates survive timezone boundaries, leap days, month ends and inclusive periods',()=>{
 assert.equal(C.dateKey('2026-09-30T15:00:00Z'),'2026-10-01');assert.equal(C.validDate('2026-02-29'),false);assert.equal(C.validDate('2028-02-29'),true);assert.equal(C.monthMove('2026-01-31',1),'2026-02-28');assert.equal(C.monthMove('2026-12-31',1),'2027-01-31');
 assert.deepEqual(C.range('2026-10-01','week'),{start:'2026-09-27',end:'2026-10-04'});assert.deepEqual(C.range('2026-02-01','month'),{start:'2026-02-01',end:'2026-03-01'});
 const all={...payload,allDay:true,start:'2026-09-30',end:'2026-10-02'};assert.equal(C.occurs(all,'2026-10-02'),true);assert.equal(C.occurs(all,'2026-10-03'),false);
 assert.equal(C.occurs({...payload,end:'2026-10-02T00:00:00+09:00'},'2026-10-02'),false);
 assert.equal(C.reminderAt(payload),Date.parse('2026-10-01T08:50:00+09:00'));assert.equal(C.reminderAt({...all,reminderMinutes:1440}),Date.parse('2026-09-29T09:00:00+09:00'));assert.equal(C.reminderAt({...all,reminderMinutes:null}),null);
 assert.equal(H.name('2026-10-05'),'대체공휴일 (개천절)');assert.equal(H.name('2027-07-19'),'대체공휴일 (제헌절)');assert.equal(H.supported(2028),false);
});
test('overlapping and overnight appointments are clipped and partitioned without collision',()=>{
 const items=C.layout([payload,{...payload,start:'2026-10-01T09:30:00+09:00',end:'2026-10-01T11:00:00+09:00'},{...payload,start:'2026-10-01T11:00:00+09:00',end:'2026-10-01T12:00:00+09:00'}],'2026-10-01');assert.deepEqual(items.map(x=>[x.lane,x.columns,x.top,x.minutes]),[[0,2,540,60],[1,2,570,90],[0,1,660,60]]);
 const overnight=C.layout([{...payload,start:'2026-09-30T23:00:00+09:00',end:'2026-10-01T01:00:00+09:00'}],'2026-10-01');assert.equal(overnight[0].top,0);assert.equal(overnight[0].minutes,60);
});
test('calendar CRUD, persistence, own records, per-module rights and validation',async()=>{
 await ds.insert('users',{...makeUserRecord('admin','password123'),role:'admin'});const member=await ds.insert('users',{...makeUserRecord('member','password123'),role:'member'});const other=await ds.insert('users',{...makeUserRecord('other','password123'),role:'member'});
 const token=(await request('POST','/api/auth/login',{username:'member',password:'password123'})).data.token,otherToken=(await request('POST','/api/auth/login',{username:'other',password:'password123'})).data.token;
 const query='/api/calendar?start=2026-10-01&end=2026-10-03';assert.equal((await request('GET',query)).status,401);
 const created=await request('POST','/api/calendar',{...payload,userId:other.id},token);assert.equal(created.status,201);assert.equal(created.data.userId,member.id);const id=created.data.id;assert.equal(JSON.parse(fs.readFileSync(path.join(root,'calendar_events.json')))[0].title,payload.title);
 for(const method of ['GET','PUT','DELETE'])assert.equal((await request(method,'/api/calendar/'+id,payload,otherToken)).status,404);
 assert.equal((await request('GET',query,null,otherToken)).data.events.length,0);
 await ds.insert('work_logs',{userId:member.id,workDate:'2026-10-01',todo:[{task:'할 일',checked:false}]});await ds.insert('work_logs',{userId:other.id,workDate:'2026-10-01',todo:[{task:'비공개'}]});
 await ds.insert('memos',{userId:member.id,title:'메모',text:'메모 내용',html:'<b>비공개 첨부</b>',attachments:[{data:'private'}],createdAt:'2026-09-30T15:30:00Z'});await ds.insert('memos',{userId:other.id,createdAt:'2026-10-01T10:00:00Z'});
 await ds.insert('files',{userId:member.id,originalName:'자료.txt',uploadedAt:'2026-09-30T16:00:00Z',storedName:'private'});await ds.insert('files',{userId:member.id,originalName:'업로드중.txt',status:'uploading',uploadedAt:'2026-10-01T09:00:00Z'});await ds.insert('files',{userId:other.id,uploadedAt:'2026-10-01T09:00:00Z'});
 let result=(await request('GET',query,null,token)).data;assert.equal(result.worklogs.length,1);assert.equal(result.memos.length,1);assert.equal(result.files.length,1);assert.equal(result.memos[0].date,'2026-10-01');assert.equal('attachments' in result.memos[0],false);assert.equal('storedName' in result.files[0],false);
 await ds.update('users',member.id,{permissions:{worklogRead:false,memoRead:false,fileRead:false}});result=(await request('GET',query,null,token)).data;assert.equal(result.events.length,1);for(const key of ['worklogs','memos','files'])assert.equal(result[key].length,0);
 for(const change of [{end:payload.start},{start:'2026-02-30T09:00:00+09:00'},{start:'2026-10-01T24:00:00+09:00'},{title:''},{reminderMinutes:-1},{kind:'dayoff'},{allDay:true,start:'2026-10-03',end:'2026-10-01'},{color:'javascript:'}])assert.equal((await request('POST','/api/calendar',{...payload,...change},token)).status,400);
 for(const q of ['?start=bad&end=2026-10-03','?start=2026-10-03&end=2026-10-01','?start=2026-01-01&end=2028-01-01'])assert.equal((await request('GET','/api/calendar'+q,null,token)).status,400);
 const vacation=await request('POST','/api/calendar',{...payload,allDay:true,kind:'dayoff',start:'2026-09-30',end:'2026-10-02'},token);assert.equal(vacation.status,201);assert.equal((await request('GET',query,null,token)).data.events.length,2);
 assert.equal((await request('PUT','/api/calendar/'+id,{...payload,title:'수정한 회의'},token)).status,200);assert.equal((await request('GET','/api/calendar/'+id,null,token)).data.title,'수정한 회의');
 await ds.update('users',member.id,{permissions:{calendarRead:false,calendarCreate:false,calendarEdit:false,calendarDelete:false}});for(const [method,url] of [['GET',query],['POST','/api/calendar'],['PUT','/api/calendar/'+id],['DELETE','/api/calendar/'+id]])assert.equal((await request(method,url,payload,token)).status,403);
 await ds.update('users',member.id,{permissions:{}});assert.equal((await request('DELETE','/api/calendar/'+id,null,token)).status,200);assert.equal((await request('GET','/api/calendar/'+id,null,token)).status,404);
});
