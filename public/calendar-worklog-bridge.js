(function(){'use strict';
let generation=0;
const key=e=>e.allDay?e.start:CalendarCore.dateKey(e.start);
function token(){return localStorage.getItem('token');}
async function request(path,options={}){const response=await fetch(path,{...options,headers:{Authorization:'Bearer '+token(),...(options.body?{'Content-Type':'application/json'}:{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||'요청에 실패했습니다.');return data;}
function container(){let el=document.getElementById('calendar-worklog-bridge');if(!el){el=document.createElement('section');el.id='calendar-worklog-bridge';el.style.cssText='margin:12px 0;padding:14px;border:1px solid var(--border-color,#ddd);border-radius:14px;background:var(--card-bg,transparent)';document.getElementById('worklog-list').before(el);}return el;}
async function addTodo(event){const date=key(event),logs=await request('/api/worklogs?date='+encodeURIComponent(date));const existing=logs[0];const source='calendar:'+event.id;const task={task:event.title,checked:false,children:[],sourceId:source};
 if(existing){const todo=Array.isArray(existing.todo)?existing.todo:[];if(todo.some(x=>x&&x.sourceId===source))throw Error('이미 TODO에 추가된 일정입니다.');await request('/api/worklogs/'+existing.id,{method:'PUT',body:JSON.stringify({todo:[...todo,task]})});}
 else await request('/api/worklogs',{method:'POST',body:JSON.stringify({workDate:date,todo:[task],nextDayPlan:[],remarks:'',memo:''})});
}
async function refresh(date,logs=[]){const id=++generation,el=container();el.replaceChildren();const start=date||CalendarCore.addDays(CalendarCore.dateKey(),-7),end=CalendarCore.addDays(date||CalendarCore.dateKey(),date?1:22);
 const title=document.createElement('h3');title.textContent=date?'선택 날짜의 캘린더 일정':'캘린더 일정 · 최근 7일 / 향후 21일';title.style.margin='0 0 10px';el.append(title);
 try{const result=await request('/api/calendar?start='+start+'&end='+end);if(id!==generation)return;
 const events=(result.events||[]).filter(e=>e.kind!=='dayoff').sort((a,b)=>String(a.start).localeCompare(String(b.start)));
 if(!events.length){const p=document.createElement('p');p.textContent='표시할 일정이 없습니다.';el.append(p);return;}
 for(const e of events){const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid #8882;flex-wrap:wrap';
 const name=document.createElement('span');name.style.cssText='flex:1;min-width:150px;overflow-wrap:anywhere';name.textContent=(e.allDay?e.start:CalendarCore.localTime(e.start).replace('T',' '))+' · '+e.title;
 const go=document.createElement('button');go.type='button';go.className='secondary-btn';go.textContent='캘린더 보기';go.addEventListener('click',()=>{location.hash='calendar';});
 row.append(name,go);
 if(window.AppShell?.user?.permissions?.worklogCreate!==false){const add=document.createElement('button');add.type='button';add.className='secondary-btn';add.textContent='TODO에 추가';add.addEventListener('click',async()=>{add.disabled=true;try{await addTodo(e);add.textContent='추가 완료';if(typeof loadList==='function')await loadList(date||'');}catch(error){alert(error.message);add.disabled=false;}});row.append(add);}
 el.append(row);}
 }catch(error){if(id===generation){const p=document.createElement('p');p.textContent='캘린더 연계 조회 실패: '+error.message;el.append(p);}}
}
window.CalendarWorklogBridge={refresh};
})();
