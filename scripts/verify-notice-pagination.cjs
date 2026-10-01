const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'notice-pagination-'));
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
process.env.DATA_DIR=tmp;process.env.UPLOAD_DIR=path.join(tmp,'uploads');
const ds=require('../src/datastore'),handler=require('../src/server'),{makeUserRecord}=require('../src/auth');
(async()=>{let server,browser;try{
 const owner=await ds.insert('users',{...makeUserRecord('qa-owner','qa-password-123'),role:'admin',active:true});
 for(let i=0;i<400;i++)await ds.insert('notifications',{userId:owner.id,title:'QA '+i,message:'내용 '+i,isRead:i%2===0,createdAt:new Date(Date.UTC(2090,0,1,0,0,i)).toISOString()});
 server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'qa-owner',password:'qa-password-123'})});const {token}=await login.json();
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(base);await page.evaluate(token=>localStorage.setItem('token',token),token);requests.length=0;await page.goto(base+'/admin.html');
  await page.waitForFunction(()=>document.querySelectorAll('#admin-notifications .admin-row').length===30);await page.waitForFunction(()=>document.getElementById('admin-loading').hidden);
  assert.ok(!requests.some(url=>/\/api\/admin\/(files|users|permissions|settings)(\?|$)/.test(url)));
  const summary=await page.locator('#notice-summary').textContent();assert.match(summary,/현재 30건 표시/);
  await page.locator('.admin-shell').evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForFunction(()=>document.querySelectorAll('#admin-notifications .admin-row').length>=60);
  const loaded=await page.locator('#admin-notifications .admin-row').count();
  await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel=files]').click();await page.waitForFunction(()=>document.getElementById('admin-loading').hidden);
  await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel=notifications]').click();await page.waitForFunction(()=>document.getElementById('admin-loading').hidden);assert.equal(await page.locator('#admin-notifications .admin-row').count(),loaded);
  await page.locator('#admin-search').click();await page.locator('#notice-search').fill('QA 0');await page.locator('#notice-search-form button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('admin-loading').hidden&&document.querySelectorAll('#admin-notifications .admin-row').length===1);
  assert.match(await page.locator('#admin-notifications').textContent(),/QA 0/);assert.equal(await page.locator('#notice-load-more').count(),0);
  await page.locator('#admin-search').click();await page.locator('#notice-search-all').click();await page.waitForFunction(()=>document.getElementById('admin-loading').hidden&&document.querySelectorAll('#admin-notifications .admin-row').length===30);
  await page.screenshot({path:path.join(tmp,'notice-'+viewport.width+'.png')});assert.deepEqual(errors,[]);await page.close();
 }
 console.log(JSON.stringify({status:'passed',records:400,viewports:['1440x1000','390x844'],checks:['initial 30 rows','scroll adds next page','search beyond loaded records','reset','inactive APIs skipped','no page errors'],captures:tmp}));
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
