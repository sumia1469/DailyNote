(function(){
 const example=document.getElementById('harness-reference-example');
 for(const part of ReferenceCore.parts(ReferenceCore.internal('memos',1,'회의 메모')+' · '+ReferenceCore.external('로컬 업무 사이트','http://localhost:3000/'))){const node=document.createElement(part.href?'a':'span');node.textContent=part.text;if(part.href)node.href=part.href;example.append(node);}
 const field=document.getElementById('harness-tree');for(const [id,direction] of [['harness-tree-indent',1],['harness-tree-outdent',-1]])document.getElementById(id).addEventListener('click',()=>{const at=field.value.indexOf('부모');if(at<0)return;const result=ListEditor.changeDepth(field.value,at,at,direction);field.value=result.value;field.focus();field.setSelectionRange(result.start,result.end);});
})();
