const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dropdowns-'));process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');let browser,server;
(async()=>{
 await ds.insert('users',{...makeUserRecord('검토계정','local-password-123'),role:'admin',approval:'approved'});
 await ds.insert('boards',{name:'드롭다운 검토',group:'공유게시판',description:'예시',categories:[],inMenu:true,active:true,order:0});
 await ds.insert('board_posts',{boardId:1,userId:1,title:'수정 삭제 테스트',text:'본문',html:'<p>본문</p>',category:'',attachments:[],references:[],mentions:[],tags:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 await ds.insert('worklogs',{userId:1,workDate:'2026-10-02',todo:[],nextDayPlan:[],remarks:'',memo:''});
 await ds.insert('memos',{userId:1,title:'메뉴 테스트',text:'본문',html:'본문',attachments:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#username').fill('검토계정');await page.locator('#password').fill('local-password-123');await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});
 async function check(trigger,menu){
  await page.locator(trigger).first().click();await page.locator(menu).waitFor({state:'visible'});
  assert.equal(await page.locator(menu).evaluate(n=>n.matches(':modal')),false);
  assert.equal(await page.locator(trigger).first().getAttribute('aria-expanded'),'true');
  const box=await page.locator(menu).boundingBox(),v=page.viewportSize();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=v.width+1&&box.y+box.height<=v.height+1,JSON.stringify(box));
  await page.keyboard.press('ArrowDown');assert.ok(await page.locator(menu).evaluate(n=>n.contains(document.activeElement)));
  await page.keyboard.press('Escape');await page.locator(menu).waitFor({state:'hidden'});
  assert.equal(await page.locator(trigger).first().getAttribute('aria-expanded'),'false');
 }
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto(base+'/#boards/1');await page.locator('.board-post-more').waitFor();
  const route=page.url();await check('.board-post-more','#board-menu');assert.equal(page.url(),route);
  await page.locator('.board-post-more').click();assert.deepEqual(await page.locator('#board-menu-items button').allTextContents(),['수정','삭제']);
  await page.locator('#board-menu-items button').getByText('수정',{exact:true}).click();await page.locator('#board-editor').waitFor({state:'visible'});assert.equal(await page.locator('#board-title').inputValue(),'수정 삭제 테스트');await page.locator('[data-board-close=board-editor]').click();
  await check('#board-more','#board-menu');await page.locator('.board-post-link').click();await page.locator('.board-detail').waitFor();await check('#board-more','#board-menu');
  await page.goto(base+'/#calendar');await page.locator('#open-calendar-more-btn').waitFor({state:'visible'});await check('#open-calendar-more-btn','#calendar-more-dialog');
  await page.goto(base+'/#worklogs');await page.locator('.card-menu-trigger').waitFor();await check('.card-menu-trigger','#card-menu-dialog');
  await page.goto(base+'/#memos');await page.locator('.memo-card').first().click();await page.locator('#memo-editor').waitFor({state:'visible'});await check('#memo-more','#memo-menu');await page.locator('#memo-close').click();
  await page.goto(base+'/admin.html#boards');await page.locator('.board-admin-more').waitFor();await check('.board-admin-more','#board-admin-menu');
  await page.locator('.board-admin-more').click();await page.mouse.click(viewport.width/2,viewport.height-20);await page.locator('#board-admin-menu').waitFor({state:'hidden'});
 }
 await page.goto(base+'/#boards/1');await page.locator('.board-post-more').click();await page.locator('#board-menu-items button').getByText('삭제',{exact:true}).click();assert.equal((await ds.findAll('board_posts')).length,1);await page.locator('#board-menu-items button').getByText('삭제 확인 · 다시 눌러 삭제',{exact:true}).click();await page.locator('.board-post-row').waitFor({state:'detached'});assert.equal((await ds.findAll('board_posts')).length,0);
 assert.deepEqual(errors,[]);console.log('PASS dropdowns: all production ellipsis menus nonmodal, anchored PC/mobile, outside/Escape/keyboard, row edit/delete, no row navigation conflict');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
