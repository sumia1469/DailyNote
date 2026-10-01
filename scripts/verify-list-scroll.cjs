/* Optional developer-only browser harness. Production UI has no browser dependencies. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
let chromium;
try{({chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'));}catch{console.error('Optional browser QA needs Playwright. Install it in a development environment or set PLAYWRIGHT_MODULE_PATH.');process.exit(1);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-ui-'));
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth'),handler=require('../src/server');
const out=process.env.UI_CAPTURE_DIR||path.join(tmp,'captures');fs.mkdirSync(out,{recursive:true});
const password=crypto.randomBytes(24).toString('hex'),username='디자인검토';
let browser,server;
async function seed(){
 await ds.insert('users',{...makeUserRecord(username,password),role:'admin',active:true,approval:'approved'});
 await ds.insert('users',{...makeUserRecord('일반사용자',password),role:'member',active:true,approval:'approved'});
 await ds.insert('users',{...makeUserRecord('신규사용자',password),role:'member',active:false,approval:'pending'});
 await ds.insert('work_logs',{userId:1,workDate:'2026-10-01',todo:[{task:'사용자·관리자 메뉴 디자인 통일',checked:true},{task:'공지 상세페이지 검증',checked:false,children:[{task:'새로고침과 뒤로가기 확인',checked:false}]},{task:'온보딩 문서 정리',checked:false}],nextDayPlan:[{task:'팀원에게 시작 가이드 공유',checked:false}],remarks:'공통 UI 모듈을 사용하는 예시입니다.',memo:'중앙 제목 · 숨김 메뉴 · ＋ 팝업'});
 await ds.insert('notifications',{userId:1,title:'업무일지 화면 안내',message:'업무일지 화면이 새롭게 바뀌었습니다.\n\n왼쪽 메뉴와 중앙 제목을 확인하세요. 등록은 오른쪽 ＋에서 시작합니다.',isRead:false,createdAt:new Date().toISOString()});
 await ds.insert('site_settings',{values:{fontFamily:'system',fontSize:16,spacing:'normal',theme:'light',background:'none'}});
 fs.mkdirSync(process.env.UPLOAD_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.UPLOAD_DIR,'sample.txt'),'예시 업무 자료');
 await ds.insert('files',{userId:1,originalName:'업무회의-자료.txt',storedName:'sample.txt',mimeType:'text/plain',sizeBytes:20,uploadedAt:new Date().toISOString()});
}
(async()=>{
 await seed();server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
 const errors=[];
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#username').fill(username);await page.locator('#password').fill(password);await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});
 async function check(selector,root){
  await page.evaluate(({selector,root})=>{const list=document.querySelector(selector);for(let i=0;i<50;i++){const row=document.createElement('div');row.className='admin-row scroll-fixture';row.textContent='스크롤 확인용 예시 '+i;row.style.minHeight='64px';list.append(row);}document.querySelector(root).scrollTop=0;},{selector,root});
  await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.wheel(0,500);await page.waitForTimeout(180);
  assert.ok(await page.locator(root).evaluate(n=>n.scrollTop)>0,selector+' responds to wheel');
  assert.equal(await page.evaluate(()=>window.scrollY),0,'body does not scroll');
  assert.equal(Math.round((await page.locator('.ui-header').boundingBox()).y),0,'header stays fixed');
  await page.locator(root).evaluate(n=>n.scrollTop=n.scrollHeight);
  const last=await page.locator(selector+' .scroll-fixture').last().boundingBox();assert.ok(last.y>=76&&last.y+last.height<=viewport.height,selector+' last row visible');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
 }
 for(const [key,list] of [['worklogs','#worklog-list'],['memos','#memo-list'],['notifications','#noti-list'],['files','#file-list']]){
  await page.evaluate(key=>{location.hash=key;},key);await page.waitForTimeout(350);await check(list,'#main-section');
  if(key==='worklogs'){
   const top=await page.locator('#main-section').evaluate(n=>n.scrollTop);
   await page.evaluate(()=>{AppShell.openReference('#worklogs/1');});await page.waitForTimeout(300);await page.locator('#notification-back').click();await page.waitForTimeout(300);
   assert.equal(await page.locator('#main-section').evaluate(n=>n.scrollTop),top,'reference return restores viewport');
  }
 }
 await page.evaluate(()=>{location.hash='worklogs';});await page.waitForTimeout(200);assert.ok(await page.locator('#main-section').evaluate(n=>n.scrollTop)>0,'menu restores position');
 await page.goto(base+'/admin.html');await page.locator('#admin-title').waitFor();await page.waitForTimeout(400);
 for(const [key,list] of [['notifications','#admin-notifications'],['files','#admin-files'],['users','#admin-users']]){
  await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel="'+key+'"]').click();await page.waitForTimeout(200);await check(list,'.admin-shell');
  if(key==='notifications'){
   await page.screenshot({path:path.join(out,'scroll-notice-'+viewport.width+'.png')});await page.locator('#admin-search').click();assert.equal(await page.locator('#notice-search-dialog').evaluate(n=>n.open),true);await page.keyboard.press('Escape');
  }
 }
 await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel="permissions"]').click();await page.waitForTimeout(200);await page.locator('.admin-shell').evaluate(n=>n.scrollTop=n.scrollHeight);await page.locator('#permission-form [type="submit"]').click({trial:true});
 await page.goto(base+'/design-harness.html');await page.waitForTimeout(200);assert.equal(await page.locator('#harness-scroll-list .admin-row').count(),40);
 await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,captures:out,checks:['user/admin long lists','wheel','last row','fixed header','reference return','menu position','search popup','permission form','shared harness','PC/mobile']}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});});
