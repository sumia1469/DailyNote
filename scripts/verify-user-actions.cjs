const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'user-actions-'));process.env.DATA_DIR=tmp;process.env.UPLOAD_DIR=path.join(tmp,'uploads');delete process.env.REDIS_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');let browser,server;
(async()=>{
 await ds.insert('users',{...makeUserRecord('menu-admin','local-password-123'),role:'admin',active:true,approval:'approved'});
 const member=await ds.insert('users',{...makeUserRecord('member-example','local-password-123'),role:'member',active:true,approval:'approved'});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const {token}=await (await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'menu-admin',password:'local-password-123'})})).json();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.evaluate(t=>localStorage.setItem('token',t),token);await page.goto(base+'/admin.html#users');
 const row=page.locator('#admin-users .user-admin-row').filter({hasText:'member-example'}),more=row.locator('.user-admin-more'),menu=page.locator('#user-admin-menu');await row.waitFor();assert.equal(await row.locator('button').count(),1);
 await more.click();await menu.waitFor({state:'visible'});assert.deepEqual(await menu.locator('button').allTextContents(),['수정','비밀번호 초기화']);const b=await menu.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width&&b.y+b.height<=viewport.height);assert.equal(await page.locator(':modal').count(),0);
 await page.keyboard.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false');assert.equal(await more.evaluate(n=>document.activeElement===n),true);
 await more.click();await page.locator('#license-status').click();await menu.waitFor({state:'hidden'});
 await more.click();await menu.getByRole('menuitem',{name:'수정',exact:true}).click();await page.locator('#user-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#manage-username').inputValue(),'member-example');assert.equal(await page.locator('#user-form [name=id]').inputValue(),String(member.id));await page.locator('#user-dialog [data-close-dialog]').first().click();
 await more.click();await menu.getByRole('menuitem',{name:'비밀번호 초기화',exact:true}).click();await page.locator('#password-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#password-reset-form [name=id]').inputValue(),String(member.id));await page.locator('#reset-password').fill('new-example-123');await page.locator('#reset-password-confirmation').fill('wrong-example-123');await page.locator('#password-reset-form [type=submit]').click();await page.locator('#password-reset-error').filter({hasText:'일치하지'}).waitFor();assert.equal(await page.locator('#reset-password').inputValue(),'new-example-123');await page.locator('#password-dialog [data-close-dialog]').first().click();
 await more.click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS user actions: PC/mobile dropdown, target edit/reset, outside/Escape close, failed reset preserves input');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
