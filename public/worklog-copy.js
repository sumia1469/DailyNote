(function(root){
  function copyItems(items,removeChecked){
    return (Array.isArray(items)?items:[]).filter(Boolean).flatMap(item=>{
      if(typeof item==='string')return [{task:item,checked:false,children:[]}];
      const children=copyItems(item.children,removeChecked);
      // Keep unfinished descendants even when their parent is completed.
      if(removeChecked&&item.checked)return children;
      return [{...item,checked:Boolean(item.checked),children}];
    });
  }
  function makeCopy(worklog,date,removeChecked=false){return {workDate:date,todo:copyItems(worklog.todo,removeChecked),nextDayPlan:copyItems(worklog.nextDayPlan,false),remarks:worklog.remarks||'',memo:worklog.memo||''};}
  if(typeof module!=='undefined'&&module.exports)module.exports={makeCopy};else root.WorklogCopy={makeCopy};
})(typeof window!=='undefined'?window:globalThis);
