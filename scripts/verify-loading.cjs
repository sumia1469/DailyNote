/* Local-only browser verification with isolated data, never production Redis. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-loading-'));
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');
const variants=require('../public/loading-motion').variants;
(async()=>{
 await ds.insert('users',{...makeUserRecord('loading-review','local-review-123'),role:'admin',active:true,approval:'approved'});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const outside=[];page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))outside.push(r.url());});
   await page.goto(origin);await page.waitForLoadState('networkidle');
   await page.evaluate(async()=>{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'loading-review',password:'local-review-123'})});const data=await response.json();localStorage.setItem('token',data.token);});
   await page.goto(origin+'/admin.html');await page.waitForLoadState('networkidle');
   await page.evaluate(()=>document.querySelector('[data-panel="appearance"]').click());
   await page.locator('#panel-appearance').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('#loading-motion').value==='petal');
   await page.waitForFunction(()=>document.getElementById('admin-loading').hidden);
   await page.locator('.loading-motion-preview').scrollIntoViewIfNeeded();
   assert.equal(await page.locator('#loading-motion option').count(),10);
   for(const variant of variants){
    await page.selectOption('#loading-motion',variant.id);
    assert.equal(await page.locator('.loading-motion-preview [data-loading-motion]').getAttribute('data-loading-motion'),variant.id);
    const before=await page.locator('.loading-motion-preview .dn-dot').first().evaluate(e=>getComputedStyle(e).transform+' '+getComputedStyle(e).offsetDistance);
    await page.waitForTimeout(120);
    const after=await page.locator('.loading-motion-preview .dn-dot').first().evaluate(e=>getComputedStyle(e).transform+' '+getComputedStyle(e).offsetDistance);
    assert.notEqual(before,after,variant.id+' has changing motion');
   }
   await page.selectOption('#loading-motion','windows');
   await page.locator('#appearance-form button[type="submit"]').click();
   await page.waitForFunction(()=>document.querySelector('#admin-status').textContent.includes('저장했습니다'));
   await page.reload();await page.waitForLoadState('networkidle');
   await page.evaluate(()=>document.querySelector('[data-panel="appearance"]').click());
   await page.waitForFunction(()=>document.querySelector('#loading-motion').value==='windows');
   await page.selectOption('#loading-motion','petal');await page.locator('#appearance-form button[type="submit"]').click();
   await page.waitForFunction(()=>document.querySelector('#admin-status').textContent.includes('저장했습니다'));
   await page.goto(origin);await page.waitForLoadState('networkidle');
   assert.equal(await page.locator('#loading-overlay [data-loading-motion]').getAttribute('data-loading-motion'),'petal');
   await page.evaluate(()=>{document.getElementById('loading-overlay').hidden=false;});
   const panel=await page.locator('#loading-overlay .loading-panel').evaluate(e=>({background:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow}));
   assert.equal(panel.background,'rgba(0, 0, 0, 0)');assert.equal(panel.shadow,'none');
   assert.equal(await page.locator('#loading-overlay .dn-mark').evaluate(i=>i.complete&&i.naturalWidth>0),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   fs.mkdirSync(path.join(tmp,'captures'),{recursive:true});await page.screenshot({path:path.join(tmp,'captures','loading-'+viewport.width+'.png')});
   await page.evaluate(()=>document.body.dataset.theme='dark');
   assert.ok((await page.locator('#loading-overlay .dn-mark').evaluate(e=>getComputedStyle(e).filter)).includes('invert'));
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('#loading-overlay .dn-dot').first().evaluate(e=>getComputedStyle(e).animationName),'none');
   assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);await page.close();
  }
  console.log('Loading browser QA passed: 10 animated variants, save/reload, shared user/admin, PC/mobile, transparent panel, dark and reduced motion. Captures: '+path.join(tmp,'captures'));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

