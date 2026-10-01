const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'search-nav-qa-'));
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');
let server,browser;
(async()=>{
 const password=crypto.randomBytes(24).toString('hex');
 const user=await ds.insert('users',{...makeUserRecord('검색위치예시',password),role:'member'});
 for(let day=1;day<=10;day++)await ds.insert('work_logs',{userId:user.id,workDate:`2026-09-${String(day).padStart(2,'0')}`,todo:Array.from({length:6},(_,i)=>({task:`테스트 ${day}-${i} 내용`,checked:false,children:[]})),nextDayPlan:[],remarks:'',memo:''});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{})});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:640}]){
  const context=await browser.newContext({viewport}),page=await context.newPage();
  await page.goto(base);await page.locator('#username').fill('검색위치예시');await page.locator('#password').fill(password);await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});
  await page.locator('#open-search-btn').click();await page.locator('#worklog-query').fill('테스트');await page.locator('#worklog-search-submit').click();
  await page.locator('#worklog-search-nav').waitFor();await page.locator('#loading-overlay').waitFor({state:'hidden'});
  async function check(){
   const box=await page.locator('#worklog-search-nav').boundingBox(),header=await page.locator('.ui-header').boundingBox();
   assert.ok(Math.abs(box.y-header.y-header.height)<1,'navigation directly below header');assert.ok(box.x>=0&&box.x+box.width<=viewport.width,'navigation fits viewport');
   assert.ok(box.height<=56,'one compact row');
   for(const id of ['prev','next','clear']){const button=await page.locator('#worklog-search-'+id).boundingBox();assert.ok(button.width>=44&&button.height>=44);assert.ok(button.y>=box.y&&button.y+button.height<=box.y+box.height);}
  }
  await check();
  await page.evaluate(()=>document.getElementById('main-section').scrollTop=1800);await check();
  await page.locator('#worklog-search-next').click();
  await page.waitForFunction(()=>{const mark=document.querySelector('mark.search-current'),nav=document.getElementById('worklog-search-nav');return mark.getBoundingClientRect().top>=nav.getBoundingClientRect().bottom&&mark.getBoundingClientRect().top<innerHeight;});await check();
  await page.locator('#worklog-search-prev').click();await page.waitForFunction(()=>document.getElementById('worklog-search-count').textContent.includes('1 /'));await check();
  await page.locator('#sidebar-open').click();await page.locator('[data-view="files"]').click();assert.equal(await page.locator('#worklog-search-nav').isVisible(),false);
  await page.locator('#sidebar-open').click();await page.locator('[data-view="worklogs"]').click();await check();
  if(process.env.UI_CAPTURE_DIR){fs.mkdirSync(process.env.UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_CAPTURE_DIR,`search-nav-${viewport.width}.png`)});}
  await page.locator('#worklog-search-clear').click();assert.equal(await page.locator('#worklog-search-nav').isVisible(),false);assert.equal(await page.locator('mark[data-worklog-match]').count(),0);assert.equal(await page.locator('#view-worklogs').evaluate(el=>getComputedStyle(el).paddingTop),'0px');
  await context.close();
 }
 console.log('PASS: search navigation anchoring, scroll, result visibility, menu switching and clear');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
