const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
if(process.env.UI_CAPTURE_DIR)fs.mkdirSync(process.env.UI_CAPTURE_DIR,{recursive:true});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'admin-files-'));process.env.DATA_DIR=tmp;process.env.UPLOAD_DIR=path.join(tmp,'uploads');delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');let browser,server;
(async()=>{
 const user=await ds.insert('users',{...makeUserRecord('file-menu-admin','local-example-123'),role:'admin',active:true,approval:'approved'});
 fs.mkdirSync(process.env.UPLOAD_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.UPLOAD_DIR,'sample.txt'),'example');
 const file=await ds.insert('files',{userId:user.id,originalName:'sample.txt',storedName:'sample.txt',mimeType:'text/plain',sizeBytes:7,uploadedAt:new Date().toISOString()});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const {token}=await (await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'file-menu-admin',password:'local-example-123'})})).json();
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
 for(const [label,viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.evaluate(t=>localStorage.setItem('token',t),token);await page.goto(base+'/admin.html');await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel=files]').click();
 const row=page.locator('#admin-files .file-admin-row'),more=row.locator('.file-admin-more'),menu=page.locator('#file-admin-menu'),form=row.locator('form');await more.waitFor();assert.equal(await row.locator('button:visible').count(),1);assert.equal(await row.locator('input:visible').count(),0);
 const rb=await row.boundingBox(),mb=await more.boundingBox();assert.ok(mb.x>rb.x+rb.width-70&&mb.y<rb.y+30);
 await page.locator('#admin-loading').waitFor({state:'hidden'});await more.click();await menu.waitFor({state:'visible'});assert.deepEqual(await menu.locator('button').allTextContents(),['파일명 변경','다운로드','삭제']);const box=await menu.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);assert.equal(await page.locator(':modal').count(),0);
 await page.screenshot({path:path.join(process.env.UI_CAPTURE_DIR||tmp,label+'-menu.png')});
 await page.keyboard.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false');assert.equal(await more.evaluate(n=>document.activeElement===n),true);
 await more.click();await page.locator('#admin-title').click();await menu.waitFor({state:'hidden'});
 await more.click();await menu.getByRole('menuitem',{name:'파일명 변경'}).click();await form.locator('input').fill('cancelled.txt');await form.getByRole('button',{name:'취소'}).click();assert.equal(await row.locator('strong').textContent(),file.originalName);
 await more.click();await menu.getByRole('menuitem',{name:'파일명 변경'}).click();await form.locator('input').fill('failed.txt');await page.route('**/api/admin/files/'+file.id,route=>route.request().method()==='PUT'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'예시 저장 오류'})}):route.continue());await form.getByRole('button',{name:'파일명 저장'}).click();await form.getByRole('alert').filter({hasText:'예시 저장 오류'}).waitFor();assert.equal(await form.locator('input').inputValue(),'failed.txt');await page.unroute('**/api/admin/files/'+file.id);
 const newName=label+'-renamed.txt';await form.locator('input').fill(newName);await form.getByRole('button',{name:'파일명 저장'}).click();await form.waitFor({state:'hidden'});assert.equal(await row.locator('strong').textContent(),newName);file.originalName=newName;
 await more.click();const pending=page.waitForEvent('download');await menu.getByRole('menuitem',{name:'다운로드'}).click();const download=await pending;assert.equal(download.suggestedFilename(),newName);const saved=await download.path();assert.equal(fs.readFileSync(saved,'utf8'),'example');
 await more.click();page.once('dialog',d=>d.dismiss());await menu.getByRole('menuitem',{name:'삭제'}).click();assert.equal(await row.count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage();await page.goto(base);await page.evaluate(t=>localStorage.setItem('token',t),token);await page.goto(base+'/admin.html');await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel=files]').click();await page.locator('.file-admin-more').click();page.once('dialog',d=>d.accept());await page.getByRole('menuitem',{name:'삭제',exact:true}).click();await page.locator('#admin-files').getByText('등록된 항목이 없습니다.').waitFor();assert.ok(!await ds.findOne('files',f=>f.id===file.id));
 console.log('PASS PC/mobile: right aligned dropdown, bounds, outside/Escape, rename cancel/failure/save, download content/name, delete cancel/confirm');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
