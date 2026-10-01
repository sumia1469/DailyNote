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
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function settled(){await page.waitForFunction(()=>Array.from(document.querySelectorAll('.loading-overlay')).every(node=>node.hidden));}
 async function capture(name){await settled();await page.waitForTimeout(220);await page.screenshot({path:path.join(out,name+'.png')});}
 async function centered(){const r=await page.locator('.ui-title').boundingBox();assert.ok(Math.abs(r.x+r.width/2-page.viewportSize().width/2)<2,'Centered title');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');}
 async function adminPanel(key){await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel="'+key+'"]').click();await centered();}
 async function journalSearch(){
  for(let attempt=0;attempt<2;attempt++){
   await page.locator('#open-search-btn').click();
   assert.equal(await page.locator('#search-dialog').evaluate(node=>node.open),true);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'search-close','Opening search must not focus a date or text input');
   await page.locator('#filter-date').click();
   assert.equal(await page.evaluate(()=>document.activeElement.id),'filter-date','Date input remains directly usable');
   await page.keyboard.press('Escape');
   if(await page.locator('#search-dialog').evaluate(node=>node.open))await page.locator('#search-close').click();
  }
 }
 async function journalExcel(label){
  await page.locator('.card-menu-trigger').first().click();
  const action=page.getByRole('button',{name:'엑셀 다운로드',exact:true});await action.waitFor();
  const bounds=await action.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=page.viewportSize().width&&bounds.y+bounds.height<=page.viewportSize().height);
  await page.screenshot({path:path.join(out,'excel-menu-'+label+'.png')});
  const promise=page.waitForEvent('download');await action.click();const download=await promise;
  assert.equal(download.suggestedFilename(),'일정_2026-10-01_1.xlsx');
  const file=path.join(tmp,'export-'+label+'.xlsx');await download.saveAs(file);assert.equal(await download.failure(),null);
  const sheet=require('../public/vendor/xlsx/xlsx.full.min').read(fs.readFileSync(file),{type:'buffer'}).Sheets['일정 카드'];
  assert.equal(sheet.E5.v,'사용자·관리자 메뉴 디자인 통일');assert.equal(sheet.D5.v,'완료');assert.equal(sheet.B7.v,'2.1');
  assert.equal(sheet.E10.v,'공통 UI 모듈을 사용하는 예시입니다.');assert.equal(sheet.E11.v,'중앙 제목 · 숨김 메뉴 · ＋ 팝업');
  assert.equal(await page.locator('#card-menu-dialog').evaluate(node=>node.open),false);
 }
 await page.goto(base);await page.locator('#username').fill(username);await page.locator('#password').fill(password);await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});await settled();await centered();await capture('01-user-worklogs');await journalSearch();
 await page.locator('#sidebar-open').click();await capture('02-user-menu');await page.locator('[data-view="notifications"]').click();await capture('03-user-notifications');await page.locator('.notification-content').first().click();await page.waitForFunction(()=>document.getElementById('notification-page-message').textContent.length>0);await page.waitForFunction(()=>document.getElementById('notification-page-state').textContent==='');assert.ok(await page.locator('#notification-page-title').textContent());await capture('04-user-notification-detail');assert.equal((await ds.findOne('notifications',n=>n.id===1)).isRead,true);await page.reload();await page.waitForFunction(()=>document.getElementById('notification-page-message').textContent.length>0);await settled();assert.equal(await page.locator('#notification-page-state').textContent(),'');await page.locator('#notification-back').click();await page.waitForURL('**/#notifications');
 await page.locator('#sidebar-open').click();await page.locator('[data-view="files"]').click();await capture('05-user-files');await page.locator('#open-upload-btn').click();await capture('06-user-file-create');await page.locator('#upload-close').click();
 await page.goto(base+'/admin.html');await page.waitForFunction(()=>document.getElementById('admin-title').textContent==='공지 관리');await centered();await capture('07-admin-notifications');await page.locator('#admin-create').click();await capture('08-admin-notification-create');await page.locator('#notification-user').selectOption('1');await page.locator('#notification-title').fill('브라우저 검증 공지');await page.locator('#notification-message').fill('   ');await page.locator('#notification-form button[type=submit]').click();await page.locator('#notification-form-error').filter({hasText:'공지 내용'}).waitFor();assert.equal(await page.locator('#notification-dialog').evaluate(node=>node.open),true);assert.equal(await page.locator('#notification-message').inputValue(),'   ');
 await page.locator('#notification-message').fill('브라우저 하네스 등록');await page.locator('#notification-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('notification-dialog').open);await settled();
 const created=page.locator('#admin-notifications .admin-row').filter({hasText:'브라우저 하네스 등록'});await created.getByRole('button',{name:'수정',exact:true}).click();assert.equal(await page.locator('#notification-message').inputValue(),'브라우저 하네스 등록');await capture('09-admin-notification-edit');await page.locator('#notification-message').fill('브라우저 하네스 수정');await page.locator('#notification-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('notification-dialog').open);await settled();await page.locator('#admin-notifications .admin-row').filter({hasText:'브라우저 하네스 수정'}).waitFor();await page.locator('#admin-search').click();await capture('21-admin-notice-search');await page.locator('#notice-search').fill('브라우저 검증 공지');await page.locator('#notice-search-form button[type=submit]').click();assert.equal(await page.locator('#admin-notifications .admin-row').count(),1);await page.locator('#admin-search').click();await page.locator('#notice-read').selectOption('read');await page.locator('#notice-search-form button[type=submit]').click();assert.equal(await page.locator('#admin-notifications .admin-row').count(),0);await page.locator('#admin-search').click();await page.locator('#notice-search-all').click();assert.ok(await page.locator('#admin-notifications .admin-row').count()>1);
 await page.locator('#admin-menu-toggle').click();await capture('10-admin-menu');await page.locator('[data-panel="files"]').click();await capture('11-admin-files');await page.locator('#admin-create').click();await capture('12-admin-file-create');await page.locator('#admin-file').setInputFiles({name:'harness.txt',mimeType:'text/plain',buffer:Buffer.from('UI harness file')});await page.locator('#admin-upload-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('admin-upload-dialog').open);await settled();await page.locator('#admin-files .admin-row').filter({hasText:'harness.txt'}).waitFor();
 for(const [key,name] of [['users','13-admin-users'],['appearance','14-admin-appearance'],['permissions','15-admin-permissions']]){await adminPanel(key);await capture(name);}
 await page.goto(base+'/onboarding.html');await centered();await capture('16-onboarding');await page.goto(base+'/design-harness.html');await centered();await page.locator('#harness-audit').click();assert.ok(!(await page.locator('#harness-result').textContent()).includes('FAIL'));await capture('17-design-harness');await page.locator('#harness-create').click();await page.locator('#harness-form button[type=submit]').click();await page.locator('#harness-error').filter({hasText:'내용을 입력하세요.'}).waitFor();await page.locator('#harness-input').fill('예시 검증');await page.locator('#harness-form button[type=submit]').click();assert.equal(await page.locator('#harness-dialog').evaluate(node=>node.open),false);
 await page.setViewportSize({width:390,height:844});await page.locator('#harness-audit').click();assert.ok(!(await page.locator('#harness-result').textContent()).includes('FAIL'));await page.goto(base+'/#notifications/1');await page.waitForFunction(()=>document.getElementById('notification-page-message').textContent.length>0);await settled();await centered();assert.equal(await page.locator('#notification-page-state').textContent(),'');await capture('18-mobile-notification-detail');await page.locator('#notification-back').click();await page.locator('#sidebar-open').click();await page.locator('[data-view="worklogs"]').click();await capture('19-mobile-worklogs');await journalSearch();await page.goto(base+'/admin.html');await settled();await centered();await page.locator('#admin-search').click();await capture('22-mobile-notice-search');await page.locator('#notice-search').fill('취소할 검색');await page.locator('#notice-search-dialog [data-close-dialog]').first().click();await page.locator('#admin-search').click();assert.equal(await page.locator('#notice-search').inputValue(),'');await page.locator('#notice-search-all').click();await page.locator('#admin-create').click();await capture('20-mobile-admin-notification-popup');

 for(const [label,viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await page.goto(base+'/#worklogs');await page.locator('.card-menu-trigger').first().waitFor();await settled();await journalExcel(label);
 }
 // Account footer and password close regression, with isolated example accounts.
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.goto(base+'/#files');await page.locator('#main-section').waitFor({state:'visible'});await settled();await page.locator('#sidebar-open').click();
  assert.equal(await page.locator('.app-navigation #admin-page-btn,.app-navigation #logout-btn').count(),0);
  const controls=await page.locator('.sidebar-account-actions .shell-icon').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {y:r.y,height:r.height,right:r.right}}));assert.equal(controls.length,3);assert.ok(controls.every(r=>r.y===controls[0].y&&r.height>=44&&r.right<=viewport.width));
  await page.locator('#logout-btn').scrollIntoViewIfNeeded();
  const icons=await page.locator('.sidebar-account-actions .app-icon').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return {width:r.width,height:r.height,centered:Math.abs(r.x+r.width/2-b.x-b.width/2)<1&&Math.abs(r.y+r.height/2-b.y-b.height/2)<1,bottom:b.bottom}}));
  assert.ok(icons.every(r=>r.width===22&&r.height===22&&r.centered&&r.bottom<=viewport.height-20));
  assert.equal(await page.locator('#admin-page-btn .app-icon').getAttribute('data-icon-name'),'shield');
  await page.locator('#change-password-link').scrollIntoViewIfNeeded();
  await page.locator('#change-password-link').click();await page.locator('#password-change-close:enabled').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#password-change-close').click();await page.waitForURL('**/#files');await page.locator('#main-section').waitFor({state:'visible'});
  await page.locator('#sidebar-open').click();await page.locator('#change-password-link').click();await page.locator('#password-change-close:enabled').waitFor();await page.keyboard.press('Escape');await page.waitForURL('**/#files');
 }
 await page.goto(base+'/change-password.html?returnTo='+encodeURIComponent('https://example.com/'));await page.locator('#password-change-close:enabled').waitFor();await page.locator('#password-change-close').click();assert.equal(new URL(page.url()).origin,base);
 await page.goto(base+'/#worklogs');await page.locator('#sidebar-open').click();await page.locator('#logout-btn').click();await page.locator('#login-section').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>localStorage.getItem('token')),null);
 await page.locator('#username').fill('일반사용자');await page.locator('#password').fill(password);await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});await settled();await page.locator('#sidebar-open').click();assert.equal(await page.locator('#admin-page-btn').isVisible(),false);
 await ds.update('users',2,{mustChangePassword:true});await page.goto(base);await page.waitForURL('**/change-password.html');await page.locator('#password-change-close:enabled').waitFor();await page.locator('#password-change-close').click();await page.locator('#login-section').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>localStorage.getItem('token')),null);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',viewports:['1440x1000','390x844'],captures:22,output:out,checks:['centered titles','no overflow','notification detail reload/back','notification create/update','error preserves input','file upload','harness error/save','account footer PC/mobile','password X/Escape return','external return URL rejected','member admin hidden','logout and required-password close','no page errors']}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(out.startsWith(tmp))console.log('Temporary captures: '+out);else fs.rmSync(tmp,{recursive:true,force:true});});


