const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'notice-actions-'));
process.env.DATA_DIR=tmp;process.env.UPLOAD_DIR=path.join(tmp,'uploads');delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');let server,browser;
(async()=>{
 await ds.insert('users',{...makeUserRecord('notice-qa','local-password-123'),role:'admin',active:true,approval:'approved'});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'notice-qa',password:'local-password-123'})});const {token}=await login.json();
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const title='메뉴 검증 '+viewport.width;const record=await ds.insert('notifications',{shared:true,title,message:'공지 내용',createdAt:new Date().toISOString()});
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(token=>localStorage.setItem('token',token),token);await page.goto(base+'/admin.html#notifications');
  const row=page.locator('#admin-notifications .admin-row').filter({hasText:title});await row.waitFor();
  assert.equal(await row.locator('button').count(),1);const more=row.locator('.notice-admin-more'),menu=page.locator('#notice-admin-menu');
  await more.click();await menu.waitFor({state:'visible'});assert.equal(await menu.locator('button').count(),2);assert.equal(await menu.evaluate(el=>el.matches(':modal')),false);
  const m=await menu.boundingBox(),o=await more.boundingBox();assert.ok(m.x>=0&&m.x+m.width<=viewport.width);assert.ok(Math.abs(m.y-o.y)<220);
  await page.keyboard.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false');assert.equal(await more.evaluate(el=>document.activeElement===el),true);
  await more.click();await page.locator('#notice-summary').click();await menu.waitFor({state:'hidden'});
  await more.click();await menu.getByRole('menuitem',{name:'수정',exact:true}).click();await page.locator('#notification-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#notification-title').inputValue(),title);await page.locator('#notification-message').fill('수정한 공지 내용');await page.locator('#notification-form [type=submit]').click();await page.locator('#notification-dialog').waitFor({state:'hidden'});assert.equal((await ds.findOne('notifications',n=>n.id===record.id)).message,'수정한 공지 내용');
  await page.locator('#admin-search').click();await page.locator('#notice-search').fill(title);
  assert.ok(await page.locator('#notice-search').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
  const b=await page.locator('#notice-search-dialog').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=viewport.width+1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(process.env.UI_CAPTURE_DIR){fs.mkdirSync(process.env.UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_CAPTURE_DIR,'notice-search-'+viewport.width+'.png')});}
  await page.locator('#notice-search-form [type=submit]').click();await row.waitFor();
  page.once('dialog',dialog=>dialog.dismiss());await more.click();await menu.getByRole('menuitem',{name:'삭제',exact:true}).click();assert.ok(await ds.findOne('notifications',n=>n.id===record.id));
  page.once('dialog',dialog=>dialog.accept());await more.click();await menu.getByRole('menuitem',{name:'삭제',exact:true}).click();await row.waitFor({state:'detached'});assert.equal((await ds.findOne('notifications',n=>n.id===record.id)).deleted,true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS notice actions: PC/mobile anchored dropdown, Escape/outside close, edit/save, search bounds and 16px input, delete cancel/confirm');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
