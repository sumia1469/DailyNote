/* Korea holiday snapshot. Sources and annual maintenance: docs/CALENDAR.md. No runtime network calls. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CalendarHolidays=api;})(typeof window!=='undefined'?window:globalThis,function(){
 const fixed={'01-01':'신정','03-01':'삼일절','05-01':'노동절','05-05':'어린이날','06-06':'현충일','07-17':'제헌절','08-15':'광복절','10-03':'개천절','10-09':'한글날','12-25':'성탄절'};
 const extra={2026:{'02-16':'설 연휴','02-17':'설날','02-18':'설 연휴','03-02':'대체공휴일 (삼일절)','05-24':'부처님오신날','05-25':'대체공휴일 (부처님오신날)','06-03':'지방선거일','08-17':'대체공휴일 (광복절)','09-24':'추석 연휴','09-25':'추석','09-26':'추석 연휴','10-05':'대체공휴일 (개천절)'},2027:{'02-06':'설 연휴','02-07':'설날','02-08':'설 연휴','02-09':'대체공휴일 (설날)','05-03':'대체공휴일 (노동절)','05-13':'부처님오신날','07-19':'대체공휴일 (제헌절)','08-16':'대체공휴일 (광복절)','09-14':'추석 연휴','09-15':'추석','09-16':'추석 연휴','10-04':'대체공휴일 (개천절)','10-11':'대체공휴일 (한글날)','12-27':'대체공휴일 (성탄절)'}};
 function name(date){const y=date.slice(0,4),md=date.slice(5);return extra[y]?extra[y][md]||fixed[md]||'':'';}
 return {name,supported:year=>Object.hasOwn(extra,year)};
});
