(function(root){
 const aliases={work_logs:['work_logs','worklogs','workLogs','workLogsData','dailyNotes'],memos:['memos','notes'],files:['files'],calendar_events:['calendar_events','schedules','events','calendar'],boards:['boards'],board_posts:['board_posts'],notification_reads:['notification_reads'],users:['users'],notifications:['notifications','notices'],site_settings:['site_settings','siteSettings','settings'],notification_history:['notification_history','notifications-deliveries']};
 const scopeKinds={worklogs:['work_logs'],memos:['memos'],files:['files'],schedules:['calendar_events'],notifications:['notifications'],boards:['users','boards','board_posts','files'],management:['users','notifications','site_settings','notification_history','notification_reads','boards'],all:Object.keys(aliases)};
 function parseJSON(buffer){const bytes=new Uint8Array(buffer);let encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{if(encoding!=='utf-8')throw Error('이전 JSON 인코딩을 읽지 못했습니다.');text=new TextDecoder('euc-kr',{fatal:true}).decode(bytes);}return JSON.parse(text.replace(/^\uFEFF/,''));}
 function items(value){if(Array.isArray(value))return value;if(value&&typeof value==='object')return [value];return [];}
 function kindFor(name,value){const stem=name.split('/').at(-1).replace(/\.json$/i,'');for(const [kind,names] of Object.entries(aliases))if(names.includes(stem))return kind;
  const item=Array.isArray(value)?value.find(Boolean):value;if(item?.workDate||item?.work_date||item?.todo)return 'work_logs';if(item?.originalName||item?.storedName||item?.filename)return 'files';if(item?.salt&&item?.password)return 'users';if(item?.start||item?.startDate)return 'calendar_events';if(item?.message)return 'notifications';if(item?.html||item?.text||item?.content)return 'memos';if(item?.values?.fontFamily||item?.fontFamily)return 'site_settings';return null;
 }
 function record(kind,value,index){
  const r={...value,id:Number(value.id||index+1),userId:Number(value.userId??value.user_id??1)};
  if(kind==='work_logs'){r.workDate=value.workDate||value.work_date;r.nextDayPlan=value.nextDayPlan||value.next_day_plan||[];r.todo=typeof value.todo==='string'?value.todo.split(/\r?\n/).filter(Boolean):value.todo||[];if(typeof r.nextDayPlan==='string')r.nextDayPlan=r.nextDayPlan.split(/\r?\n/).filter(Boolean);}
  if(kind==='memos'){const raw=String(value.text??value.content??'');Object.assign(r,{title:String(value.title||''),text:raw,html:value.html||raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'),folder:value.folder||'',font:value.font||'sans-serif',color:value.color||'white',attachments:Array.isArray(value.attachments)?value.attachments:[]});}
  if(kind==='files'){r.originalName=value.originalName||value.filename||value.name;r.sizeBytes=Number(value.sizeBytes??value.size??0);r.mimeType=value.mimeType||value.mime||'application/octet-stream';}
  if(kind==='notification_history'&&value.key){const at=value.key.lastIndexOf(':');r.releaseId=value.key.slice(0,at);r.userId=Number(value.key.slice(at+1));}
  if(kind==='calendar_events'){r.start=value.start||value.startDate;r.end=value.end||value.endDate||r.start;r.description=value.description||value.memo||'';r.kind=value.kind||'schedule';r.color=value.color||'blue';r.allDay=value.allDay===true;r.reminderMinutes=value.reminderMinutes??null;}
  if(kind==='site_settings')r.values={fontFamily:'system',fontSize:16,spacing:'normal',theme:'light',background:'none',...(value.values||value)};
  return r;
 }
 function legacy(documents,scope){const result={};for(const {name,value} of documents){if(value?.format==='DailyNoteBackup')throw Error('새 형식 백업은 ZIP 파일 전체를 선택하세요.');let found=false;if(value&&typeof value==='object'&&!Array.isArray(value)){for(const [kind,names] of Object.entries(aliases)){const key=names.find(k=>value[k]!==undefined);if(key){(result[kind]||(result[kind]=[])).push(...items(value[key]));found=true;}}}if(!found){const kind=kindFor(name,value);if(kind)(result[kind]||(result[kind]=[])).push(...items(value));}}
  const records={};for(const kind of scopeKinds[scope]||[]){if(result[kind])records[kind]=result[kind].map((x,i)=>record(kind,x,i));}
  if(!Object.values(records).some(x=>x.length))throw Error('복원할 자료가 없습니다. 기존 data 폴더의 JSON 또는 데이터 ZIP을 선택하세요.');return records;
 }
 const api={legacy,scopeKinds,record,parseJSON};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BackupCore=api;
})(typeof window!=='undefined'?window:globalThis);
