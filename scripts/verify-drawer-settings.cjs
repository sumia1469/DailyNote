/* Isolated administrator and guide navigation QA; no production data. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-settings-'));
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');
(async()=>{
 const password=crypto.randomBytes(24).toString('hex');
 await ds.insert('users',{...makeUserRecord('settings-example',password),role:'admin',active:true,approval:'approved'});
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#username').fill('settings-example');await page.locator('#password').fill(password);await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   for(const kind of ['admin','guide']){
    await page.goto(base+'/'+(kind==='admin'?'admin.html':'onboarding.html'));const nav=kind==='admin'?'#admin-navigation':'#guide-navigation';
    await page.locator(kind==='admin'?'#admin-menu-toggle':'#guide-menu-toggle').click();
    const opener=page.locator(nav+' [data-settings-open]');await opener.scrollIntoViewIfNeeded();const r=await opener.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=viewport.height,'Settings footer fits');
    assert.equal(await page.locator(nav+' > .onboarding-link[href="local-start.html"]').count(),0);
    await opener.click();const dialog=page.locator(kind==='admin'?'#account-settings-dialog':'#drawer-settings-dialog');assert.equal(await dialog.evaluate(n=>n.open),true);
    const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height,'Popup fits');
    assert.equal(await dialog.getByRole('link',{name:/시작 가이드/}).getAttribute('href'),'onboarding.html');
    assert.equal(await dialog.getByRole('link',{name:'바로가기 만들기',exact:true}).getAttribute('href'),'local-start.html');
    await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.id),kind==='admin'?'account-settings-dialog':'drawer-settings-dialog','Focus stays in popup');
    await page.keyboard.press('Escape');assert.equal(await dialog.evaluate(n=>n.open),false);assert.equal(await page.locator(nav).evaluate(n=>n.classList.contains('is-open')),true);assert.equal(await opener.evaluate(n=>document.activeElement===n),true);
    await opener.click();await page.mouse.click(viewport.width-2,2);assert.equal(await dialog.evaluate(n=>n.open),false,'Backdrop closes only settings');
    await opener.click();await dialog.getByRole('button',{name:'설정 닫기'}).click();assert.equal(await opener.getAttribute('aria-expanded'),'false');
    if(viewport.width===390){await opener.click();await page.screenshot({path:path.join(tmp,kind+'-settings.png')});await page.keyboard.press('Escape');}
    if(kind==='guide'){await page.locator('[data-guide-section][href="#admin"]').click();assert.equal(await page.locator(nav).evaluate(n=>n.inert),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'admin');await page.locator('#guide-menu-toggle').click();}
    await page.locator(nav+' .admin-return').click();await page.waitForURL(base+'/');
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS administrator/guide menus, settings, focus, backdrop and return at four viewport sizes. Captures: '+tmp);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
