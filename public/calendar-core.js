/* Shared calendar arithmetic: Korea time, inclusive all-day dates, exclusive timed end. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CalendarCore=api;})(typeof window!=='undefined'?window:globalThis,function(){
 const DAY=86400000,ZONE=9*3600000;
 function dateKey(value=Date.now()){const t=typeof value==='string'?Date.parse(value):Number(value);return Number.isFinite(t)?new Date(t+ZONE).toISOString().slice(0,10):'';}
 function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
 function addDays(s,n){return new Date(Date.parse(s+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
 function weekday(s){return new Date(s+'T00:00:00Z').getUTCDay();}
 function monthMove(s,n){const d=new Date(s+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
 function range(s,view){if(view==='day')return {start:s,end:addDays(s,1)};if(view==='week'){const start=addDays(s,-weekday(s));return {start,end:addDays(start,7)};}const first=s.slice(0,7)+'-01',next=monthMove(first,1),start=addDays(first,-weekday(first));return {start,end:addDays(next,(7-weekday(next))%7)};}
 function span(e){return e.allDay?{start:e.start,end:addDays(e.end,1)}:{start:dateKey(e.start),end:addDays(dateKey(Date.parse(e.end)-1),1)};}
 function occurs(e,date){const r=span(e);return r.start<=date&&date<r.end;}
 function localTime(value){return new Date(Date.parse(value)+ZONE).toISOString().slice(0,16);}
 function reminderAt(e){if(e.reminderMinutes==null)return null;return Date.parse(e.allDay?e.start+'T09:00:00+09:00':e.start)-e.reminderMinutes*60000;}
 // Interval partitioning keeps overlapping appointments side by side.
 function layout(events,date){const start=Date.parse(date+'T00:00:00+09:00'),end=start+DAY;const items=events.filter(e=>!e.allDay&&occurs(e,date)).map(e=>({event:e,start:Math.max(start,Date.parse(e.start)),end:Math.min(end,Date.parse(e.end))})).sort((a,b)=>a.start-b.start||b.end-a.end);let group=[],until=0;
 function finish(){const lanes=[];for(const item of group){let lane=lanes.findIndex(t=>t<=item.start);if(lane<0)lane=lanes.length;lanes[lane]=item.end;item.lane=lane;}for(const item of group){item.columns=lanes.length;item.top=(item.start-start)/60000;item.minutes=(item.end-item.start)/60000;}}
 for(const item of items){if(group.length&&item.start>=until){finish();group=[];until=0;}group.push(item);until=Math.max(until,item.end);}finish();return items;}
 return {DAY,dateKey,validDate,addDays,weekday,monthMove,range,span,occurs,localTime,reminderAt,layout};
});
