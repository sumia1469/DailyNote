const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'menu-order-'));
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');let server,browser;
(async()=>{
 await ds.insert('users',{...makeUserRecord('순서검토','local-menu-password'),role:'admin',approval:'approved'});
 await ds.insert('site_settings',{values:{background:'none'}});
 for(const [name,group,order,inMenu,active] of [['첫 게시판','A',6,true,true],['둘째 게시판','B',7,true,true],['마지막 게시판','A',8,true,true],['숨김 게시판','A',0,false,true],['보관 게시판','A',0,true,false]])await ds.insert('boards',{name,group,order,inMenu,active,categories:[],description:''});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#username').fill('순서검토');await page.locator('#password').fill('local-menu-password');await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});assert.ok(page.url().endsWith('#worklogs'));
 for(const [width,height] of [[1440,1000],[390,844]]){
  await page.setViewportSize({width,height});await page.goto(base+'/#boards');await page.locator('[data-board-nav="3"]').waitFor({state:'attached'});
  await page.waitForFunction(()=>document.getElementById('loading-overlay').hidden);await page.locator('#sidebar-open').click();await page.locator('#app-sidebar.is-open').waitFor();
  assert.deepEqual(await page.locator('.app-navigation [data-view]').evaluateAll(ns=>ns.map(n=>n.dataset.view)),['worklogs','calendar','memos','notifications','files','boards']);
  assert.deepEqual(await page.locator('[data-board-nav]').evaluateAll(ns=>ns.map(n=>n.textContent)),['첫 게시판','둘째 게시판','마지막 게시판']);
  const boxes=await page.locator('.app-navigation [data-view],#board-nav-caption').evaluateAll(ns=>Object.fromEntries(ns.map(n=>[n.id||n.dataset.view,n.getBoundingClientRect().top])));
  assert.ok(boxes.files<boxes['board-nav-caption']&&boxes['board-nav-caption']<boxes.boards);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.waitForFunction(()=>document.getElementById('app-sidebar').getBoundingClientRect().left>=-1);await page.screenshot({path:path.join(tmp,'menu-'+width+'.png')});await page.keyboard.press('Escape');await page.reload();await page.locator('#main-section').waitFor({state:'visible'});await page.evaluate(()=>{location.hash='boards';window.AppShell.refresh();});await page.locator('[data-board-nav="3"]').waitFor({state:'attached'});
  assert.deepEqual(await page.locator('[data-board-nav]').evaluateAll(ns=>ns.map(n=>n.dataset.boardNav)),['1','2','3']);
 }
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile daily-report-first, board sixth, interleaved group order, hidden/archive, reload. Captures: '+tmp);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(path.join(tmp,'data'),{recursive:true,force:true});fs.rmSync(path.join(tmp,'uploads'),{recursive:true,force:true});});
