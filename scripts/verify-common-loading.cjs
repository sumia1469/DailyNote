/* Development-only QA. Uses isolated data and deliberately delayed network responses. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-common-loading-'));
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');
let browser,server;
const password=crypto.randomBytes(24).toString('hex'),username='로딩검증';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function cli(args){await new Promise((resolve,reject)=>{const child=spawn(process.env.AGENT_BROWSER_PATH||'agent-browser',['--session','dailynote-loading-qa',...args],{env:{...process.env,AGENT_BROWSER_EXECUTABLE_PATH:process.env.BROWSER_EXECUTABLE_PATH||'',AGENT_BROWSER_ARGS:'--no-sandbox'}});child.stdout.on('data',x=>process.stdout.write(x));child.stderr.on('data',x=>process.stderr.write(x));child.on('error',reject);child.on('exit',code=>code?reject(Error('agent-browser failed: '+code)):resolve());});}
(async()=>{
 await ds.insert('users',{...makeUserRecord(username,password),role:'admin',active:true,approval:'approved'});
 server=http.createServer((req,res)=>{if(req.url==='/api/loading-body'){res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();setTimeout(()=>res.end('{"ok":true}'),1000);return;}handler(req,res);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 // Verify immediately after starting the server, before the delayed-network scenarios.
 if(process.env.AGENT_BROWSER_PATH){await cli(['open',base]);await cli(['snapshot','-i']);await cli(['eval','document.body.innerText.trim().length > 0 && !document.querySelector(".vite-error-overlay")']);await cli(['close']);}
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
 const context=await browser.newContext(),login=await context.request.post(base+'/api/auth/login',{data:{username,password}}),token=(await login.json()).token;
 assert.ok(token);await context.addInitScript(value=>localStorage.setItem('token',value),token);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const settled=()=>page.waitForFunction(()=>Array.from(document.querySelectorAll('.loading-overlay')).every(x=>x.hidden));
 let delay=0;
 await page.route('**/api/**',async route=>{if(delay&&!route.request().url().includes('reminders=1'))await wait(delay);await route.continue().catch(()=>{});});
 for(const [label,viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await page.goto(base);await page.locator('#main-section').waitFor({state:'visible'});await settled();delay=700;
  for(const menu of ['calendar','memos','notifications','files','worklogs','boards']){
   await page.evaluate(key=>{location.hash=key;},menu);
   await page.waitForFunction(()=>!document.getElementById('loading-overlay').hidden);
   assert.equal(await page.locator('#main-section').getAttribute('aria-busy'),'true');
   assert.equal(await page.locator('#loading-overlay').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   if(menu==='calendar')await page.screenshot({path:path.join(tmp,'loading-calendar-'+label+'.png')});
   await settled();
  }
  await page.evaluate(()=>{location.hash='calendar';});await settled();
  await page.locator('#calendar-next').click();await page.waitForFunction(()=>!document.getElementById('loading-overlay').hidden);await settled();
  await page.locator('#open-calendar-more-btn').click();await page.locator('#calendar-refresh').click();await page.waitForFunction(()=>!document.getElementById('loading-overlay').hidden);await settled();
  // Switching away cancels the old loading state even while its request is unfinished.
  delay=1500;await page.locator('#calendar-next').click();await page.waitForFunction(()=>!document.getElementById('loading-overlay').hidden);
  await page.evaluate(()=>{location.hash='worklogs';});await settled();assert.equal(await page.evaluate(()=>AppLoading.pending),0);
  delay=700;await page.goto(base+'/admin.html');await settled();
  for(const key of ['files','users','permissions','appearance','notifications','boards']){
   await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel="'+key+'"]').click();
   await page.waitForFunction(()=>!document.getElementById('admin-loading').hidden);await settled();
  }
  await page.screenshot({path:path.join(tmp,'loading-admin-'+label+'.png')});delay=0;
 }
 await page.goto(base);await settled();
 await page.evaluate(()=>{window.bodyRead=fetch('/api/loading-body').then(r=>r.json());});
 await wait(500);assert.equal(await page.locator('#loading-overlay').isVisible(),true);await page.evaluate(()=>window.bodyRead);await settled();
 // Loading stays visible above native dialogs and does not move keyboard focus.
 await page.evaluate(()=>{location.hash='calendar';});await settled();
 await page.locator('#open-calendar-btn').click();
 await page.waitForFunction(()=>document.getElementById('calendar-event-dialog').open && document.activeElement.id==='calendar-title');
 const focused=await page.evaluate(()=>document.activeElement.id);
 await page.evaluate(()=>{window.finishModal=AppLoading.begin('팝업 처리 중입니다…');});
 assert.equal(await page.locator('#loading-overlay').isVisible(),true);
 assert.equal(await page.evaluate(()=>document.activeElement.id),focused);
 assert.equal(await page.locator('#loading-overlay').evaluate(el=>typeof el.showPopover!=='function'||el.matches(':popover-open')),true);
 await page.evaluate(()=>finishModal());await settled();await page.keyboard.press('Escape');
 // A completed request must not hide an independent pending request.
 await page.evaluate(()=>{window.finishA=AppLoading.begin('첫 요청');window.finishB=AppLoading.begin('두 번째 요청');finishA();});
 await wait(450);assert.equal(await page.locator('#loading-overlay').isVisible(),true);await page.evaluate(()=>finishB());await settled();
 // A rejected body reader still releases its loading token.
 await page.route('**/api/loading-invalid',route=>route.fulfill({status:200,contentType:'application/json',body:'invalid'}));
 await page.evaluate(()=>fetch('/api/loading-invalid').then(r=>r.json()).catch(()=>{}));await settled();assert.equal(await page.evaluate(()=>AppLoading.pending),0);
 // Failed and aborted requests clean up; the calendar keeps its retry action.
 await page.route('**/api/calendar?*',route=>route.fulfill({status:500,contentType:'application/json',body:'{"message":"예시 실패"}'}));
 await page.evaluate(()=>AppShell.refresh());await page.getByRole('button',{name:'다시 불러오기',exact:true}).waitFor();await settled();
 await page.route('**/api/loading-abort',async route=>{await wait(600);await route.abort().catch(()=>{});});
 await page.evaluate(async()=>{const c=new AbortController(),p=fetch('/api/loading-abort',{signal:c.signal}).catch(()=>{});c.abort();await p;});await settled();
 // Silent reminder polling never creates an overlay.
 await page.evaluate(()=>fetch('/api/calendar?start=2026-10-01&end=2026-10-02&reminders=1').then(r=>r.json()).catch(()=>{}));assert.equal(await page.locator('#loading-overlay').isVisible(),false);
 // A body that starts reading after headers must be tracked again.
 await page.evaluate(async()=>{const r=await fetch('/api/auth/me');await new Promise(resolve=>setTimeout(resolve,500));await r.json();});await settled();
 assert.deepEqual(errors,[]);console.log('PASS common loading: all user/admin menus, PC/mobile, navigation, concurrent requests, body reads, error, abort, quiet polling. Captures: '+tmp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
