(function(root,factory){const config=factory();if(typeof module==='object'&&module.exports)module.exports=config;else root.UIConfig=config;})(typeof window!=='undefined'?window:globalThis,function(){
  const menus={
    user:[
      {id:'worklogs',title:'일일리스트',icon:'journal',panel:'worklog-section',read:['worklogRead','worklogCreate'],actions:[{id:'open-search-btn',kind:'search',label:'일지 검색',permission:'worklogRead'},{id:'open-worklog-btn',kind:'create',label:'새 일지 등록',permission:'worklogCreate'}]},
      {id:"calendar",title:"캘린더",icon:"calendar",panel:"view-calendar",read:["calendarRead","calendarCreate"],actions:[{id:"open-calendar-btn",kind:"create",label:"일정 추가",permission:"calendarCreate",dialog:"calendar-event-dialog"}]},
      {id:'memos',title:'메모',icon:'edit',panel:'view-memos',read:['memoRead','memoCreate'],actions:[{id:'open-memo-search-btn',kind:'search',label:'메모 검색',permission:'memoRead',dialog:'memo-search-dialog'},{id:'open-memo-btn',kind:'create',label:'새 메모 등록',permission:'memoCreate'}]},
      {id:'notifications',title:'공지사항',icon:'notice',panel:'view-notifications',read:['notificationRead'],actions:[]},
      {id:'files',title:'파일관리',icon:'files',panel:'view-files',read:['fileRead','fileUpload'],actions:[{id:'open-upload-btn',kind:'create',label:'파일 등록',permission:'fileUpload'}]}
    ],
    admin:[
      {id:'notifications',title:'공지 관리',icon:'notice',panel:'panel-notifications',read:['notifications'],actions:[{id:'admin-create',kind:'create',label:'공지 등록',permission:'notifications',dialog:'notification-dialog'},{id:'admin-search',kind:'search',label:'공지 검색',permission:'notifications',dialog:'notice-search-dialog'}]},
      {id:'files',title:'파일 관리',icon:'files',panel:'panel-files',read:['files'],actions:[{id:'admin-create',kind:'create',label:'파일 등록',permission:'files',dialog:'admin-upload-dialog',extraPermission:'fileUpload'}]},
      {id:'appearance',title:'화면·배경 설정',icon:'appearance',panel:'panel-appearance',read:['appearance'],actions:[]},
      {id:'users',title:'사용자 설정',icon:'users',panel:'panel-users',read:['users'],actions:[{id:'admin-create',kind:'create',label:'사용자 등록',permission:'users',dialog:'user-dialog'}]},
      {id:'permissions',title:'권한 설정',icon:'shield',panel:'panel-permissions',read:['permissions'],actions:[]}
    ]
  };
  function can(scope,permissions,key){return scope==='admin'&&key!=='fileUpload'?permissions[key]===true:permissions[key]!==false;}
  function allowed(scope,permissions={}){return menus[scope].filter(menu=>menu.read.some(key=>can(scope,permissions,key)));}
  function actions(scope,id,permissions={}){const menu=menus[scope].find(menu=>menu.id===id);return (menu?.actions||[]).filter(action=>can(scope,permissions,action.permission)&&(!action.extraPermission||can(scope,permissions,action.extraPermission)));}
  return {menus,allowed,actions};
});
