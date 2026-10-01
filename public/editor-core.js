(function(global){
'use strict';
function history(limit=60){
 let states=[],position=-1;
 return {reset(){states=[];position=-1;},push(value){if(states[position]===value)return false;states.splice(position+1);states.push(value);if(states.length>limit)states.shift();position=states.length-1;return true;},move(delta){const next=position+delta;if(next<0||next>=states.length)return null;position=next;return states[position];},get canUndo(){return position>0;},get canRedo(){return position<states.length-1;}};
}
function viewport(dialog){const update=()=>{if(!dialog.open)return;const v=global.visualViewport;dialog.style.setProperty('--editor-height',(v?.height||global.innerHeight)+'px');dialog.style.setProperty('--editor-top',(v?.offsetTop||0)+'px');};global.visualViewport?.addEventListener('resize',update);global.visualViewport?.addEventListener('scroll',update);global.addEventListener('resize',update);return update;}
function command(body,saved,name,value=null){
 body.focus();const selection=global.getSelection();
 if(saved&&body.contains(saved.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(saved);}
 global.document.execCommand(name,false,value);
 return selection.rangeCount&&body.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null;
}
function safeLink(value){
 if(typeof value!=='string')return null;
 let href=value.trim();if(/[\u0000-\u0020\u007f]/.test(href))return null;
 if(/^www\./i.test(href))href='https://'+href;
 if(!/^https?:\/\//i.test(href))return null;
 try{const url=new URL(href);return ['http:','https:'].includes(url.protocol)&&url.hostname?url.href:null;}catch{return null;}
}
function setLink(anchor,value){
 const href=safeLink(value);if(!href)return false;
 anchor.href=href;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.className='editor-link';return true;
}
function linkify(root){
 root.normalize();
 const doc=root.ownerDocument,walker=doc.createTreeWalker(root,4),nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 let added=0;
 for(const node of nodes){
  if(node.parentElement?.closest('a,pre,code,script,style,textarea,[data-board-image]'))continue;
  const text=node.nodeValue,matches=[...text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'\u0000-\u001f]+/giu)];
  if(!matches.length)continue;
  const fragment=doc.createDocumentFragment();let offset=0,count=0;
  for(const match of matches){
   const start=match.index;if(start>0&&/[\p{L}\p{N}_@/]/u.test(text[start-1]))continue;
   let label=match[0],previous;
   do{previous=label;label=label.replace(/[.,!?;:。，！？、…’”»]+$/u,'');
    for(const [open,close] of [['(',')'],['[',']'],['{','}']]){
     while(label.endsWith(close)&&label.split(close).length>label.split(open).length)label=label.slice(0,-1);
    }
   }while(label!==previous);
   const anchor=doc.createElement('a');if(!setLink(anchor,label))continue;
   fragment.append(doc.createTextNode(text.slice(offset,start)));anchor.textContent=label;fragment.append(anchor);
   offset=start+label.length;count++;
  }
  if(count){fragment.append(doc.createTextNode(text.slice(offset)));node.replaceWith(fragment);added+=count;}
 }
 return added;
}
function followEditableLink(event,root){
 const anchor=event.target.closest?.('a.editor-link');if(!anchor||!root.contains(anchor)||event.button!==0||event.defaultPrevented)return;
 const href=safeLink(anchor.getAttribute('href'));if(!href)return;
 event.preventDefault();event.stopPropagation();global.open(href,'_blank','noopener,noreferrer');
}
global.EditorCore={history,viewport,command,links:{safeLink,setLink,linkify,followEditableLink}};
})(window);
