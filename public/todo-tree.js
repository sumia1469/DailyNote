(function(root){
 function locate(items,target,parent=null){
  for(let index=0;index<items.length;index++){
   if(items[index]===target)return {items,index,parent};
   const found=locate(items[index].children||[],target,{items,index,node:items[index]});
   if(found)return found;
  }
 }
 function canMove(items,target,direction){const p=locate(items,target);return !!p&&(direction==='outdent'?!!p.parent:p.index>0);}
 function move(items,target,direction){
  const p=locate(items,target);if(!canMove(items,target,direction))return false;
  p.items.splice(p.index,1);
  if(direction==='outdent')p.parent.items.splice(p.parent.index+1,0,target);
  else {const previous=p.items[p.index-1];(previous.children||(previous.children=[])).push(target);}
  return true;
 }
 function add(items,target,kind,task){const p=locate(items,target);const node={task,checked:false,children:[]};if(kind==='child')(target.children||(target.children=[])).push(node);else p.items.splice(p.index+1,0,node);return node;}
 function reposition(items,source,target,after=false){
  if(source===target||locate(source.children||[],target))return false;
  const from=locate(items,source),to=locate(items,target);if(!from||!to)return false;
  from.items.splice(from.index,1);const destination=locate(items,target);
  destination.items.splice(destination.index+(after?1:0),0,source);return true;
 }
 const api={locate,canMove,move,add,reposition};if(typeof module!=='undefined')module.exports=api;else root.TodoTree=api;
})(typeof window!=='undefined'?window:globalThis);
