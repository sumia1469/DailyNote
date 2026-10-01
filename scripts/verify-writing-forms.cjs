const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'writing-browser-'));process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');let server,browser;
(async()=>{
 await ds.insert('users',{...makeUserRecord('검토계정','local-password-123'),role:'admin',approval:'approved'});await ds.insert('site_settings',{values:{background:'none'}});await ds.insert('boards',{name:'개발 공유',group:'공유게시판',categories:['개발'],active:true,inMenu:true,order:0});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#username').fill('검토계정');await page.locator('#password').fill('local-password-123');await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('loading-overlay').hidden);
 async function full(id){assert.equal(await page.locator('#'+id).evaluate(x=>x.tagName),'SECTION',id+' is a page');assert.equal(await page.locator('#'+id).evaluate(x=>x.matches(':modal')),false);assert.equal(new URL(page.url()).searchParams.get('write'),id);assert.equal(await page.evaluate(()=>history.state.writingPage),id);const b=await page.locator('#'+id).boundingBox(),v=page.viewportSize();assert.equal(Math.round(b.x),0,id);assert.equal(Math.round(b.y),0,id);assert.equal(Math.round(b.width),v.width,id);assert.equal(Math.round(b.height),v.height,id);assert.equal(await page.locator('#'+id).evaluate(x=>getComputedStyle(x).borderRadius),'0px');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 async function capture(name){if(process.env.UI_CAPTURE_DIR){fs.mkdirSync(process.env.UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_CAPTURE_DIR,name+'-'+page.viewportSize().width+'.png')});}}
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto(base+'/#worklogs');await page.locator('#open-worklog-btn').click();await full('worklog-modal');await page.locator('#todo').fill('첫 항목');await page.locator('#todo').fill('둘째 항목');await page.locator('#worklog-modal [aria-label="실행 취소"]').click();assert.equal(await page.locator('#todo').inputValue(),'첫 항목');await page.locator('#worklog-modal [aria-label="다시 실행"]').click();assert.equal(await page.locator('#todo').inputValue(),'둘째 항목');await capture('writing-journal');await page.locator('#modal-close-btn').click();
  await page.goto(base+'/#memos');await page.locator('#open-memo-btn').click();await full('memo-editor');await capture('writing-memo');await page.locator('#memo-close').click();
  await page.goto(base+'/#calendar');await page.locator('#open-calendar-btn').click();await full('calendar-event-dialog');await capture('writing-calendar');await page.locator('#calendar-event-close').click();
  await page.goto(base+'/#boards/1');await page.locator('#board-create').click();await full('board-editor');await page.locator('#board-title').fill('공통 작성 화면');await page.locator('#board-body').fill('본문 내용');assert.ok(await page.locator('#board-editor .editor-tools').isVisible());assert.ok(await page.locator('#board-undo').isVisible());await capture('writing-board');await page.locator('[data-board-close=board-editor]').first().click();
  await page.goto(base+'/admin.html');await page.locator('#admin-create').click();await full('notification-dialog');await page.locator('#notification-title').fill('공지 제목');await page.locator('#notification-message').fill('공지 내용');await page.route('**/api/admin/notifications',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'저장 실패 검증'})}):r.continue());await page.locator('#notification-form [type=submit]').click();await page.locator('#notification-form-error').filter({hasText:'저장 실패'}).waitFor();assert.equal(await page.locator('#notification-message').inputValue(),'공지 내용');await capture('writing-notice');await page.unroute('**/api/admin/notifications');await page.locator('[data-close-dialog=notification-dialog]').click();
  // Every menu create action opens a page, including management and uploads.
  await page.goto(base+'/#files');await page.locator('#open-upload-btn').click();await full('upload-dialog');await page.goBack();await page.locator('#upload-dialog').waitFor({state:'hidden'});assert.equal(new URL(page.url()).hash,'#files');
  for (const [panel,id] of [['boards','board-manage-dialog'],['users','user-dialog'],['files','admin-upload-dialog']]) {
    await page.goto(base+'/admin.html');await page.waitForFunction(()=>window.AdminBoardContext?.user);
    await page.evaluate(key=>document.querySelector('[data-panel="'+key+'"]').click(),panel);
    await page.locator('#admin-create').click();await full(id);await capture('registration-'+panel);
    assert.ok(await page.locator('#'+id+' .ui-writing-header').isVisible());
    if(panel==='boards') {
      await page.locator('#board-manage-name').fill('페이지 등록 검사');
      await page.locator('#board-manage-description').fill('저장 실패에도 유지');
      await page.route('**/api/admin/boards',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'등록 실패 검사'})}):r.continue());
      await page.locator('#board-manage-save').click();await page.locator('#board-manage-error').filter({hasText:'등록 실패'}).waitFor();
      assert.equal(await page.locator('#board-manage-description').inputValue(),'저장 실패에도 유지');
      await page.unroute('**/api/admin/boards');
      await page.locator('#board-manage-save').click();await page.locator('#'+id).waitFor({state:'hidden'});
      await page.locator('.board-admin-title').filter({hasText:'페이지 등록 검사',exact:true}).first().waitFor();
      await page.locator('#admin-create').click();await full(id);
      // Browser Back during a pending save cannot discard the form.
      await page.locator('#board-manage-name').fill('저장 중 뒤로가기');
      let pending;await page.route('**/api/admin/boards',r=>r.request().method()==='POST'?new Promise(resolve=>{pending=async()=>{await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'지연 저장 실패'})});resolve();};}):r.continue());
      await page.locator('#board-manage-save').click();await page.waitForFunction(()=>document.getElementById('board-manage-save').disabled);
      await page.goBack();await full(id);assert.equal(await page.locator('#board-manage-name').inputValue(),'저장 중 뒤로가기');
      assert.ok(pending);await pending();await page.unroute('**/api/admin/boards');await page.locator('#board-manage-error').filter({hasText:'지연 저장 실패'}).waitFor();
    }
    await page.goBack();await page.locator('#'+id).waitFor({state:'hidden'});assert.equal(new URL(page.url()).searchParams.has('write'),false);
  }
  // Memo uses its async autosave when navigating back; errors retain input.
  await page.goto(base+'/#memos');await page.locator('#open-memo-btn').click();await page.locator('#memo-title').fill('뒤로가기 저장 검사');await page.locator('#memo-body').fill('본문 유지');
  await page.route('**/api/memos*',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'메모 저장 실패 검사'})}):r.continue());
  await page.goBack();await page.locator('#memo-status').filter({hasText:'메모 저장 실패'}).waitFor();await full('memo-editor');assert.equal(await page.locator('#memo-body').innerText(),'본문 유지');
  await page.unroute('**/api/memos*');await page.locator('#memo-close').click();await page.locator('#memo-editor').waitFor({state:'hidden'});
  assert.equal(new URL(page.url()).hash,'#memos');
  await page.goto(base+'/admin.html#boards');await page.waitForFunction(()=>window.AdminBoardContext?.user);await page.evaluate(()=>document.querySelector('[data-panel=boards]').click());await page.locator('#panel-boards').waitFor({state:'visible'});const more=page.locator('.board-admin-more').first();await more.click();const menu=page.locator('#board-admin-menu'),b=await menu.boundingBox(),t=await more.boundingBox();assert.ok(b.width<=260);assert.ok(Math.abs(b.y-t.y)<220);assert.equal(await menu.evaluate(x=>getComputedStyle(x,'::backdrop').backdropFilter),'none');await capture('writing-menu');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.classList.contains('board-admin-more'));
 }
 assert.deepEqual(errors,[]);console.log('PASS all registration pages, Back navigation, management CRUD, busy Back, memo failure retention; writing screens: PC/mobile viewport, journal undo/redo, memo/calendar/board/notice, save failure input, anchored menu and Escape focus');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});

