/* Isolated development data. No production sessions or external services. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-pull-'));
for(const key of ['REDIS_URL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','VERCEL'])delete process.env[key];
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');
let server,browser;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const username='pull-qa',password=crypto.randomBytes(24).toString('hex');
 await ds.insert('users',{...makeUserRecord(username,password),role:'admin',active:true,approval:'approved'});
 server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
 const context=await browser.newContext({hasTouch:true}),login=await context.request.post(base+'/api/auth/login',{data:{username,password}}),token=(await login.json()).token;
 assert.ok(token);await context.addInitScript(token=>localStorage.setItem('token',token),token);
 const board=(await (await context.request.post(base+'/api/admin/boards',{headers:{Authorization:'Bearer '+token},data:{name:'당기기 예시',categories:['업무'],active:true,inMenu:true}})).json());
 assert.ok(board.id);
 const post=(await (await context.request.post(base+'/api/boards/'+board.id+'/posts',{headers:{Authorization:'Bearer '+token},data:{title:'예시 게시글',html:'<p>본문</p>',text:'본문',category:'업무',attachments:[],references:[]}})).json());assert.ok(post.id);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let delay=0,fail=false;const requests=[];
 page.on('request',r=>{if(r.url().includes('/api/')&&!r.url().includes('reminders=1'))requests.push(r.url());});
 await page.route('**/api/**',async route=>{if(delay&&!route.request().url().includes('reminders=1'))await pause(delay);if(fail&&route.request().url().includes('/worklogs'))return route.fulfill({status:500,contentType:'application/json',body:'{"message":"예시 실패"}'});await route.continue().catch(()=>{});});
 const settled=()=>page.waitForFunction(()=>AppLoading.pending===0&&!PullRefresh.refreshing&&Array.from(document.querySelectorAll('.loading-overlay')).every(x=>x.hidden));
 async function pull(selector,mode='full'){
  await page.evaluate(({selector,mode})=>{
   const el=document.querySelector(selector);if(mode!=='scrolled')el.scrollTop=0;
   const touch=(x,y,id=1)=>new Touch({identifier:id,target:el,clientX:x,clientY:y});
   const send=(type,x,y,count=1)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'||type==='touchcancel'?[]:Array.from({length:count},(_,i)=>touch(x,y,i+1)),changedTouches:[touch(x,y)]}));
   send('touchstart',100,150);send('touchmove',mode==='horizontal'?280:100,mode==='short'?190:340,mode==='multi'?2:1);
   send(mode==='cancel'?'touchcancel':'touchend',100,340);
  },{selector,mode});
 }
 for(const [name,size] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(size);await page.goto(base);await page.locator('#main-section').waitFor({state:'visible'});await settled();
  for(const route of ['worklogs','calendar','memos','notifications','files','boards','boards/'+board.id,'boards/'+board.id+'/posts/'+post.id]){
   await page.evaluate(route=>location.hash=route,route);await settled();requests.length=0;delay=150;
   await pull('#main-section');await page.waitForFunction(()=>PullRefresh.refreshing);
   assert.equal(await page.locator('.ui-pull-refresh').isVisible(),true);
   assert.equal(await page.locator('#loading-overlay').isVisible(),false);
   await settled();assert.ok(requests.length>0,name+' '+route);assert.equal(await page.locator('.ui-pull-refresh-text').textContent(),'새로고침 완료');delay=0;
  }
  await page.evaluate(()=>location.hash='worklogs');await settled();
  for(const mode of ['short','horizontal','multi','cancel']){requests.length=0;await pull('#main-section',mode);await pause(40);assert.equal(requests.length,0,mode);}
  await page.evaluate(()=>{const el=document.querySelector('#main-section');const extra=document.createElement('div');extra.id='pull-long-example';extra.style.height='2000px';el.append(extra);el.scrollTop=100;});requests.length=0;await pull('#main-section','scrolled');await pause(40);assert.equal(requests.length,0,'middle of list');await page.evaluate(()=>document.querySelector('#pull-long-example').remove());
  // Search date is retained by the worklog adapter.
  await page.evaluate(()=>loadList('2026-10-01'));await settled();requests.length=0;await pull('#main-section');await settled();assert.ok(requests.some(x=>x.includes('date=2026-10-01')));await page.evaluate(()=>loadList(''));await settled();
  // Duplicate requests are blocked while the first refresh is pending.
  delay=300;requests.length=0;await pull('#main-section');await pull('#main-section');await settled();assert.equal(requests.filter(x=>x.includes('/worklogs')).length,1);delay=0;
  // Failed refresh preserves content and allows the next gesture.
  fail=true;await pull('#main-section');await settled();assert.match(await page.locator('.ui-pull-refresh-text').textContent(),/실패/);fail=false;await pull('#main-section');await settled();assert.equal(await page.locator('.ui-pull-refresh-text').textContent(),'새로고침 완료');
  // Existing form and inline edit flows cannot be refreshed away.
  await page.locator('#open-worklog-btn').click();requests.length=0;await pull('#main-section');await pause(40);assert.equal(requests.length,0);await page.locator('#modal-close-btn').click();await settled();
  // Delayed response cannot update the destination screen.
  delay=300;await pull('#main-section');await page.evaluate(()=>location.hash='files');await settled();delay=0;assert.equal(await page.locator('.ui-pull-refresh').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(base+'/admin.html');await settled();
  for(const key of ['notifications','boards','files','appearance','users','permissions']){
   await page.evaluate(key=>document.querySelector('[data-panel="'+key+'"]').click(),key);await settled();requests.length=0;delay=60;await pull('.admin-shell');await settled();assert.ok(requests.length>0,'admin '+key);assert.equal(await page.locator('.ui-pull-refresh-text').textContent(),'새로고침 완료');delay=0;
  }
  await page.evaluate(()=>document.querySelector('[data-panel="appearance"]').click());await settled();
  await page.locator('#font-size').selectOption('18');requests.length=0;await pull('.admin-shell');await pause(40);assert.equal(requests.length,0,'dirty settings');assert.equal(await page.locator('#font-size').inputValue(),'18');await page.evaluate(()=>document.querySelector('#appearance-form').requestSubmit());await settled();requests.length=0;await pull('.admin-shell');await settled();assert.ok(requests.length>0,'saved settings unlock');
  console.log('PASS '+name+': all menu adapters, gesture cancellation, duplicate/failure/navigation and dirty settings');
 }
 // Real touch events in a mobile viewport: exercise browser scroll arbitration.
 await page.setViewportSize({width:390,height:844});await page.goto(base);await settled();
 const cdp=await context.newCDPSession(page);await page.evaluate(()=>document.querySelector('#main-section').scrollTop=0);requests.length=0;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:110}]});
 for(const y of [125,145,175,210,250,300,340])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled();
 assert.ok(requests.some(x=>x.includes('/worklogs')),'real touch refresh');
 assert.deepEqual(errors,[]);console.log('PASS real mobile touch: one refresh, no page errors');
 await context.close();
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());fs.rmSync(tmp,{recursive:true,force:true});});
