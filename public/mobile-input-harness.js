(function(){
 const $=id=>document.getElementById(id),fields='input:not([type=button]),textarea,select,[contenteditable=true]';
 function metrics(){const viewport=window.visualViewport;$('metrics').textContent='화면 '+innerWidth+' × '+innerHeight+' / 문서 폭 '+document.documentElement.scrollWidth+'\n확대 배율 '+(viewport?viewport.scale.toFixed(2):'지원 안 함')+' / 활성 입력 '+(document.activeElement.id||'없음');}
 function audit(){const rows=[...document.querySelectorAll(fields)].filter(node=>node.getClientRects().length).map(node=>{const size=parseFloat(getComputedStyle(node).fontSize);return (size>=16?'PASS':'FAIL')+' '+node.id+': '+size+'px';});$('audit-results').textContent=rows.join('\n');metrics();}
 $('sample-form').addEventListener('submit',event=>{event.preventDefault();if(event.target.contains(document.activeElement))document.activeElement.blur();$('sample-login').hidden=true;$('sample-main').hidden=false;audit();});
 $('back').addEventListener('click',()=>{$('sample-main').hidden=true;$('sample-login').hidden=false;audit();});
 for(const [id,size] of [['font-small',14],['font-large',20]])$(id).addEventListener('click',()=>{document.documentElement.style.setProperty('--app-font-size',size+'px');audit();});
 $('audit').addEventListener('click',audit);document.addEventListener('focusin',metrics);document.addEventListener('focusout',metrics);window.addEventListener('resize',metrics);window.visualViewport?.addEventListener('resize',metrics);window.visualViewport?.addEventListener('scroll',metrics);audit();
})();
