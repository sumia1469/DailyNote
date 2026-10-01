// Isolated browser QA. Never connects to configured or production Redis.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-license-ui-'));
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
fs.mkdirSync(process.env.DATA_DIR,{recursive:true});
const out=process.env.UI_CAPTURE_DIR||path.join(tmp,'captures');fs.mkdirSync(out,{recursive:true});
const {makeUserRecord}=require('../src/auth'),password=crypto.randomBytes(24).toString('hex');
// Seed a legacy installation before the datastore reads it. API writes cannot exceed six.
fs.writeFileSync(path.join(process.env.DATA_DIR,'users.json'),JSON.stringify(Array.from({length:7},(_,i)=>({...makeUserRecord('license-example-'+(i+1),password),id:i+1,role:i?'member':'admin',active:true,approval:'approved'}))));
const ds=require('../src/datastore'),handler=require('../src/server');
let browser,server;
(async()=>{
 await ds.insert('work_logs',{userId:2,workDate:'2026-10-01',memo:'License recovery preserves example data'});
 const pending=await ds.insert('users',{...makeUserRecord('license-pending',password),role:'member',active:false,approval:'pending'});
 server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
 const errors=[],checks=[],page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 async function settled(){await page.waitForFunction(()=>(!window.AppLoading||AppLoading.pending===0)&&Array.from(document.querySelectorAll('.loading-overlay')).every(n=>n.hidden&&!n.matches(':popover-open')));}
 async function count(n){await page.locator('#license-status').filter({hasText:'무료 사용 '+n+'/6명'}).waitFor();await settled();}
 async function layout(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');const r=await page.locator('#admin-title').boundingBox();assert.ok(Math.abs(r.x+r.width/2-page.viewportSize().width/2)<2,'Centered title');}
 function row(name){return page.locator('#admin-users .admin-row').filter({has:page.locator('strong',{hasText:name})});}
 async function edit(name,active){await row(name).getByRole('button',{name:'수정',exact:true}).click();await page.locator('#manage-active').selectOption(String(active));await page.locator('#user-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('user-dialog').open);}
 await page.goto(base);await page.locator('#username').fill('license-example-1');await page.locator('#password').fill(password);await page.locator('.login-btn').click();await page.locator('#main-section').waitFor({state:'visible'});
 await page.goto(base+'/admin.html');await count(7);await layout();assert.equal(await row('license-example-7').count(),1);assert.match(await page.locator('#license-status').textContent(),/한도 초과/);
 assert.equal(await page.locator('#license-status a').getAttribute('href'),'mailto:sumia1469@gmail.com');
 const token=await page.evaluate(()=>localStorage.getItem('token'));
 async function api(url,method='GET',body){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 assert.equal((await api('/api/worklogs')).status,403);await edit('license-example-7',false);await count(6);assert.equal((await api('/api/worklogs')).status,200);
 checks.push('legacy seven-account admin recovery without data deletion');
 for(const [label,viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await page.reload();await settled();await page.locator('#admin-menu-toggle').click();await page.locator('[data-panel="users"]').click();await count(6);await layout();
  await page.locator('#admin-create').click();await page.locator('#manage-username').fill('license-new-'+label);await page.locator('#manage-password').fill(password);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/users')&&r.request().method()==='POST');await page.locator('#user-form button[type=submit]').click();assert.equal((await response).status(),403);
  await page.locator('#user-form-error').filter({hasText:'sumia1469@gmail.com'}).waitFor();assert.equal(await page.locator('#user-dialog').evaluate(n=>n.open),true);assert.equal(await page.locator('#manage-username').inputValue(),'license-new-'+label);assert.equal(await page.locator('#manage-password').inputValue(),password);await settled();await layout();await page.screenshot({path:path.join(out,'blocked-'+label+'.png')});
  await page.locator('#user-dialog [data-close-dialog]').first().click();
  const approval=page.waitForResponse(r=>r.url().endsWith('/'+pending.id+'/approve'));await page.locator('#admin-approvals').getByRole('button',{name:'승인',exact:true}).click();assert.equal((await approval).status(),403);await page.locator('#admin-status').filter({hasText:'무료 사용'}).waitFor();assert.equal((await ds.findOne('users',u=>u.id===pending.id)).approval,'pending');
  await row('license-example-7').getByRole('button',{name:'수정',exact:true}).click();await page.locator('#manage-active').selectOption('true');const reactivation=page.waitForResponse(r=>r.url().endsWith('/api/admin/users/7'));await page.locator('#user-form button[type=submit]').click();assert.equal((await reactivation).status(),403);assert.equal(await page.locator('#user-dialog').evaluate(n=>n.open),true);await page.locator('#user-dialog [data-close-dialog]').first().click();
  await edit('license-example-6',false);await count(5);await page.locator('#admin-create').click();await page.locator('#manage-username').fill('license-new-'+label);await page.locator('#manage-password').fill(password);await page.locator('#user-form button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('user-dialog').open);await count(6);await layout();
  await edit('license-new-'+label,false);await count(5);await edit('license-example-6',true);await count(6);checks.push(label+' create/approval/reactivation rejection, preserved input, seat release and reuse');
 }
 const member=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'license-example-2',password})});assert.equal(member.status,200);const memberToken=(await member.json()).token;
 const logs=await fetch(base+'/api/worklogs',{headers:{Authorization:'Bearer '+memberToken}});assert.equal((await logs.json())[0].memo,'License recovery preserves example data');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',viewports:['1440x1000','390x844'],checks,captures:2,...(process.env.UI_CAPTURE_DIR?{output:out}:{})}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
