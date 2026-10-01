const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(nativeFetch=async()=>new Response('{}')){
 const listeners=new Map(),timers=new Map();let nextTimer=0,observed;
 const document={activeElement:null};
 class Element {
  constructor(id){this.id=id;this.inert=false;this.hidden=false;this.isConnected=true;this.style={overflow:''};this.attrs=new Map();this.classList={add(){}};this.p={textContent:''};}
  focus(){document.activeElement=this;}
  closest(){return this.inert?this:null;}
  setAttribute(k,v){this.attrs.set(k,v);} removeAttribute(k){this.attrs.delete(k);} hasAttribute(k){return this.attrs.has(k);}
  querySelector(){return this.p;} matches(){return Boolean(this.popover);}
  showPopover(){this.popover=true;} hidePopover(){this.popover=false;}
 }
 const main=new Element('main-section'),overlay=new Element('loading-overlay'),button=new Element('button'),existing=new Element('existing');
 overlay.hidden=true;existing.inert=true;document.activeElement=button;
 document.body=new Element('body');document.body.children=[main,overlay,existing];document.body.style.overflow='auto';
 document.getElementById=id=>id==='loading-overlay'?overlay:null;document.querySelectorAll=()=>[main];
 const window={fetch:nativeFetch,addEventListener(type,cb){listeners.set(type,cb);}};
 class Observer{constructor(cb){this.cb=cb;}observe(){observed=this;}disconnect(){observed=null;}}
 vm.runInNewContext(fs.readFileSync('public/loading.js','utf8'),{window,document,HTMLElement:Element,MutationObserver:Observer,URL,location:new URL('https://example.test/'),setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},clearTimeout(id){timers.delete(id);},Date,localStorage:{getItem:()=>null}});
 return {app:window.AppLoading,window,main,overlay,existing,button,document,Element,
  flush(){while(timers.size){const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());}},
  add(node){document.body.children.push(node);observed?.cb([{addedNodes:[node]}]);},
  event(type){const e={target:button,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};listeners.get(type)?.(e);return e;}};
}
test('blocking loading stops mouse, touch, keyboard and submit; restores focus, scroll and pre-existing inert',()=>{
 const x=setup(),end=x.app.begin('저장');assert.equal(x.app.blocking,true);assert.equal(x.main.inert,true);assert.equal(x.document.body.style.overflow,'hidden');
 for(const event of ['click','pointerdown','touchmove','wheel','keydown','submit','cancel']){const e=x.event(event);assert.equal(e.prevented,true);assert.equal(e.stopped,true);}
 const added=new x.Element('dialog');x.add(added);assert.equal(added.inert,true);
 end();end();x.flush();assert.equal(x.app.pending,0);assert.equal(x.app.blocking,false);assert.equal(x.main.inert,false);assert.equal(added.inert,false);assert.equal(x.existing.inert,true);assert.equal(x.document.body.style.overflow,'auto');assert.equal(x.document.activeElement,x.button);assert.equal(x.event('click').prevented,undefined);
});
test('background loading permits scrolling and navigation; a background task never prolongs a blocking overlay',()=>{
 const x=setup(),background=x.app.begin('목록 추가',{mode:'background'});assert.equal(x.overlay.hidden,true);assert.equal(x.event('wheel').prevented,undefined);assert.equal(x.event('click').prevented,undefined);
 const first=x.app.begin('첫 요청'),second=x.app.begin('두 번째');first();x.flush();assert.equal(x.app.blocking,true);second();x.flush();assert.equal(x.app.blocking,false);assert.equal(x.app.pending,1);background();assert.equal(x.app.pending,0);
});
test('clear ignores stale finish functions and preserves new tasks',()=>{
 const x=setup(),old=x.app.begin();x.app.clear();assert.equal(x.main.inert,false);const fresh=x.app.begin();old();x.flush();assert.equal(x.app.blocking,true);assert.equal(x.app.pending,1);fresh();x.flush();assert.equal(x.app.blocking,false);
});
test('run releases the lock when the action fails',async()=>{
 const x=setup();await assert.rejects(x.app.run('저장',async()=>{throw Error('failed');}),/failed/);x.flush();assert.equal(x.app.blocking,false);assert.equal(x.app.pending,0);
});
test('background GET body reads remain interactive; mutations cannot request that exception',async()=>{
 let sent;const x=setup(async(input,options)=>{sent=options;return new Response('{}');});
 const r=await x.window.fetch('/api/boards/1/posts?cursor=1',{appLoading:'background'});assert.equal(x.app.blocking,false);assert.equal(sent.appLoading,undefined);await r.json();x.flush();assert.equal(x.app.pending,0);
 const write=await x.window.fetch('/api/files/1',{method:'DELETE',appLoading:'background'});assert.equal(x.app.blocking,true);await write.json();x.flush();assert.equal(x.app.blocking,false);
});
test('fetch failures and invalid body reads release the lock',async()=>{
 const x=setup(async()=>{throw Error('aborted');});await assert.rejects(x.window.fetch('/api/files'),/aborted/);x.flush();assert.equal(x.app.pending,0);assert.equal(x.main.inert,false);
 const y=setup(async()=>new Response('invalid'));const response=await y.window.fetch('/api/files');await assert.rejects(response.json());y.flush();assert.equal(y.app.pending,0);assert.equal(y.app.blocking,false);
});
test('memo autosave and reminder polling retain inline status without blocking',async()=>{
 const x=setup();await x.window.fetch('/api/memos/1',{method:'PUT'});await x.window.fetch('/api/calendar?reminders=1');assert.equal(x.app.pending,0);assert.equal(x.app.blocking,false);
});
