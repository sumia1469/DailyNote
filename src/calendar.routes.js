const ds=require('./datastore');
const {sendJson}=require('./utils');
const C=require('../public/calendar-core');
async function body(req){if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>20000)throw Error('일정 내용이 너무 큽니다.');return JSON.parse(raw);}const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)throw Error('일정 내용이 너무 큽니다.');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function validate(v){
 if(!v||typeof v.title!=='string'||!v.title.trim()||v.title.length>200)throw Error('일정 제목을 200자 이내로 입력해 주세요.');
 if(typeof v.description!=='string'||v.description.length>5000)throw Error('일정 메모는 5000자 이내로 입력해 주세요.');
 if(typeof v.allDay!=='boolean'||!['schedule','dayoff'].includes(v.kind)||!['blue','green','orange','purple','red'].includes(v.color))throw Error('일정 종류와 색상을 확인해 주세요.');
 let start=v.start,end=v.end;
 if(v.allDay){if(!C.validDate(start)||!C.validDate(end)||start>end)throw Error('종료일은 시작일보다 빠를 수 없습니다.');}
 else {const pattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|\+09:00)$/;if(typeof start!=='string'||typeof end!=='string'||!pattern.test(start)||!pattern.test(end)||[start,end].some(t=>Number(t.slice(11,13))>23||Number(t.slice(14,16))>59||(t[16]===':'&&Number(t.slice(17,19))>59))||!C.validDate(start.slice(0,10))||!C.validDate(end.slice(0,10))||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(start)>=Date.parse(end))throw Error('종료 시간은 시작 시간 이후로 지정해 주세요.');start=new Date(start).toISOString();end=new Date(end).toISOString();}
 if(C.span({allDay:v.allDay,start,end}).start<'1900-01-01'||C.span({allDay:v.allDay,start,end}).end>'2101-01-01')throw Error('1900~2100년 날짜를 선택해 주세요.');
 if(v.kind==='dayoff'&&!v.allDay)throw Error('휴무는 종일 일정으로 등록해 주세요.');
 if(v.reminderMinutes!==null&&![0,5,10,30,60,1440].includes(v.reminderMinutes))throw Error('알림 시간을 확인해 주세요.');
 return {title:v.title.trim(),description:v.description,allDay:v.allDay,start,end,kind:v.kind,color:v.color,reminderMinutes:v.reminderMinutes};
}
async function calendarRouter(req,res,auth){
 const url=new URL(req.url,'http://localhost'),match=url.pathname.match(/^\/api\/calendar(?:\/(\d+))?$/);if(!match)return sendJson(res,404,{message:'일정을 찾을 수 없습니다.'});const id=match[1]?Number(match[1]):null;
 if(req.method==='GET'&&!id){const start=url.searchParams.get('start'),end=url.searchParams.get('end');if(!C.validDate(start)||!C.validDate(end)||start>=end||Date.parse(end)-Date.parse(start)>370*C.DAY)return sendJson(res,400,{message:'조회 기간은 최대 370일입니다.'});
 const includeRecords=url.searchParams.get('reminders')!=='1';
 const own=x=>x.userId===auth.userId,inside=d=>C.validDate(d)&&start<=d&&d<end;
 const events=(await ds.findAll('calendar_events')).filter(x=>{const r=C.span(x);return own(x)&&r.start<end&&r.end>start;});
 const worklogs=includeRecords&&auth.permissions.worklogRead?(await ds.findAll('work_logs')).filter(x=>own(x)&&inside(x.workDate)):[];
 const memos=includeRecords&&auth.permissions.memoRead?(await ds.findAll('memos')).filter(x=>own(x)&&inside(C.dateKey(x.createdAt))).map(x=>({id:x.id,date:C.dateKey(x.createdAt),title:x.title||'제목 없는 메모',text:(x.text||'').slice(0,300),attachmentCount:Array.isArray(x.attachments)?x.attachments.length:0})):[];
 const files=includeRecords&&auth.permissions.fileRead?(await ds.findAll('files')).filter(x=>own(x)&&x.status!=='uploading'&&inside(C.dateKey(x.uploadedAt))).map(x=>({id:x.id,date:C.dateKey(x.uploadedAt),title:x.originalName,sizeBytes:x.sizeBytes})):[];
 return sendJson(res,200,{events,worklogs,memos,files});}
 const item=id?await ds.findOne('calendar_events',x=>x.id===id&&x.userId===auth.userId):null;if(id&&!item)return sendJson(res,404,{message:'일정을 찾을 수 없습니다.'});
 if(req.method==='GET'&&id)return sendJson(res,200,item);
 if(req.method==='DELETE'&&id){await ds.remove('calendar_events',id);return sendJson(res,200,{message:'삭제했습니다.'});}
 if((req.method==='POST'&&!id)||(req.method==='PUT'&&id)){let value;try{value=validate(await body(req));}catch(e){return sendJson(res,400,{message:e.message});}const now=new Date().toISOString();const saved=id?await ds.update('calendar_events',id,{...value,updatedAt:now}):await ds.insert('calendar_events',{...value,userId:auth.userId,createdAt:now,updatedAt:now});return sendJson(res,id?200:201,saved);}
 return sendJson(res,405,{message:'지원하지 않는 요청입니다.'});
}
module.exports={calendarRouter,validate};
