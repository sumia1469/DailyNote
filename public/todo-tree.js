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
 const api={locate,canMove,move,add};if(typeof module!=='undefined')module.exports=api;else root.TodoTree=api;
})(typeof window!=='undefined'?window:globalThis);
