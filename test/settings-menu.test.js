const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('settings dropdown stays in the drawer, anchors above its button and respects keyboard, permissions and dismissal',()=>{
 const listeners={},observers=[];let nav,document;
 function node(tag='div'){
  const n={tagName:tag.toUpperCase(),children:[],hidden:false,inert:false,style:{},attrs:{},dataset:{},handlers:{},scrollTop:0,scrollLeft:0,classList:{contains:v=>v==='is-open'},append(child){this.children.push(child);child.parent=this},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.handlers[k]=fn},closest(selector){if(selector==='a')return tag==='a'?this:null;return nav},querySelectorAll(){return this.children.filter(x=>x.tagName==='A')},focus(){document.activeElement=this},contains(target){return target===this||this.children.includes(target)},getBoundingClientRect(){return {left:0,top:0,right:250,bottom:180,width:250,height:180}}};return n;
 }
 nav=node();nav.getBoundingClientRect=()=>({left:0,top:0,right:280,bottom:568,width:280,height:568});
 const opener=node('button');opener.getBoundingClientRect=()=>({left:20,top:500,right:64,bottom:544,width:44,height:44});nav.append(opener);
 document={activeElement:opener,createElement:node,addEventListener(k,fn){listeners[k]=fn}};
 const window={addEventListener(){}},MutationObserver=function(fn){observers.push(fn);this.observe=()=>{}};
 vm.runInNewContext(fs.readFileSync('public/ui-shell.js','utf8'),{window,document,MutationObserver});let allowed=false;
 const api=window.UIShell.settingsMenu({opener,id:'settings-test',canOpen:()=>allowed,links:[{label:'시작',href:'guide',icon:'journal'},{label:'관리자',href:'admin',icon:'shield',hidden:true},{label:'바로가기',href:'shortcut',icon:'download'}]});
 assert.equal(api.menu.tagName,'DIV');assert.equal(nav.children.includes(api.menu),true);assert.equal(opener.attrs['aria-haspopup'],'menu');api.open();assert.equal(api.menu.hidden,true);allowed=true;opener.handlers.click();
 assert.equal(api.menu.hidden,false);assert.equal(api.menu.style.top,'312px');assert.equal(api.menu.style.left,'18px');assert.equal(document.activeElement,api.menu.children[0]);
 const key=key=>listeners.keydown({key,preventDefault(){},stopImmediatePropagation(){}});key('ArrowDown');assert.equal(document.activeElement,api.menu.children[2]);key('ArrowDown');assert.equal(document.activeElement,api.menu.children[0]);key('End');assert.equal(document.activeElement,api.menu.children[2]);key('Escape');assert.equal(api.menu.hidden,true);assert.equal(document.activeElement,opener);
 api.open();listeners.pointerdown({target:node()});assert.equal(api.menu.hidden,true);assert.equal(opener.attrs['aria-expanded'],'false');
 api.open();opener.handlers.click();assert.equal(api.menu.hidden,true);api.open();nav.inert=true;observers[0]();assert.equal(api.menu.hidden,true);
});
