// Development-only browser verification; no browser package is shipped to users.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-links-'));
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
for(const key of ['REDIS_URL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','VERCEL'])delete process.env[key];
const ds=require('../src/datastore'),{makeUserRecord}=require('../src/auth');let server,browser;
(async()=>{
 await ds.insert('users',{...makeUserRecord('링크검토','local-test-password'),role:'admin',approval:'approved'});
 await ds.insert('site_settings',{values:{background:'none'}});
 await ds.insert('boards',{name:'링크 게시판',categories:[],group:'공유게시판',active:true,inMenu:true,order:0});
 server=http.createServer(require('../src/server'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 if(process.env.AGENT_BROWSER_BIN){
  const {execFile}=require('node:child_process'),{promisify}=require('node:util'),run=promisify(execFile);
  const env={...process.env,AGENT_BROWSER_EXECUTABLE_PATH:process.env.BROWSER_EXECUTABLE_PATH};
  try{await run(process.env.AGENT_BROWSER_BIN,['--session','dailynote-links','open',base],{env});const result=await run(process.env.AGENT_BROWSER_BIN,['--session','dailynote-links','snapshot','-i'],{env});assert.ok(result.stdout.includes('로그인'));}
  finally{await run(process.env.AGENT_BROWSER_BIN,['--session','dailynote-links','close'],{env});}
 }
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Local link test</title>'}));
 await page.goto(base);await page.locator('#username').fill('링크검토');await page.locator('#password').fill('local-test-password');await page.locator('.login-btn').click();
 await page.locator('#main-section').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('loading-overlay').hidden);
 // DOM conversion retains exact text, punctuation, existing links and code.
 await page.evaluate(()=>{
  const body=document.createElement('div');body.innerHTML='<p>(https://example.com/문서?q=1&amp;x=2). www.example.com!</p><pre>https://example.com/code</pre><code>www.example.com/code</code><a href="https://example.com/named">이름</a>';
  const text=body.textContent;EditorCore.links.linkify(body);const count=body.querySelectorAll('a').length;EditorCore.links.linkify(body);
  if(body.textContent!==text||count!==3||body.querySelectorAll('a').length!==3||body.querySelector('pre a,code a,a a'))throw Error('Link conversion changed text or code');
 });
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto(base+'/#memos');await page.locator('#open-memo-btn').click();
  const title='링크 메모 '+viewport.width,text='문서 https://example.com/문서?q=1&x=2.\n사이트 www.example.com\n내부 http://127.0.0.1:3000/';
  await page.locator('#memo-title').fill(title);await page.locator('#memo-body').fill(text);await page.locator('#memo-title').focus();
  await page.waitForFunction(()=>document.getElementById('memo-status').textContent==='자동 저장됨');
  assert.equal(await page.locator('#memo-body a').count(),3);assert.equal(await page.locator('#memo-body').innerText(),text);
  await page.locator('#memo-close').click();await page.locator('.memo-card').filter({hasText:title}).click();
  assert.equal(await page.locator('#memo-body a').count(),3);
  const popup=page.waitForEvent('popup');await page.locator('#memo-body a').first().click();const opened=await popup;await opened.waitForLoadState();assert.ok(opened.url().startsWith('https://example.com/'));await opened.close();
  await page.locator('#memo-close').click();
  await page.goto(base+'/#boards/1');await page.locator('#board-create').click();await page.locator('#board-title').fill('링크 글 '+viewport.width);
  await page.locator('#board-body').fill('게시판 https://example.com/path_(test). www.example.com');
  await page.locator('#board-save').click();await page.locator('.board-detail').waitFor();
  assert.equal(await page.locator('.board-rich a').count(),2);assert.equal(await page.locator('.board-rich a').first().getAttribute('href'),'https://example.com/path_(test)');
  const boardPopup=page.waitForEvent('popup');await page.locator('.board-rich a').first().click();const boardOpened=await boardPopup;await boardOpened.waitForLoadState();await boardOpened.close();
  await page.reload();await page.locator('.board-detail').waitFor();assert.equal(await page.locator('.board-rich a').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const anchor of await page.locator('.board-rich a').all()){assert.equal(await anchor.getAttribute('target'),'_blank');assert.equal(await anchor.getAttribute('rel'),'noopener noreferrer');}
 }
 // Legacy HTML sanitization preserves safe named links and removes unsafe hrefs/events.
 const date=new Date().toISOString(),html='<p><a href="javascript:alert(1)" onclick="alert(1)">위험</a> <a href="https://example.com/named" onclick="alert(1)">문서</a> https://example.com/old</p><pre data-language="text">https://example.com/code</pre>';
 const post=await ds.insert('board_posts',{boardId:1,userId:1,author:'검토',title:'기존 글',html,text:'기존 글',category:'',tags:[],mentions:[],attachments:[],references:[],createdAt:date,updatedAt:date});
 await page.goto(base+'/#boards/1/posts/'+post.id);await page.locator('.board-detail').waitFor();assert.equal(await page.locator('.board-rich a').count(),2);assert.equal(await page.locator('.board-rich [onclick],.board-rich a[href^="javascript:"],.board-rich pre a').count(),0);
 const memo=await ds.insert('memos',{userId:1,title:'기존 메모',html,text:'기존 메모',folder:'내 메모',font:'sans-serif',color:'white',starred:false,pinned:false,attachments:[],createdAt:date,updatedAt:date});
 await page.goto(base+'/#memos');await page.locator('.memo-card').filter({hasText:'기존 메모'}).click();assert.equal(await page.locator('#memo-body a[href^="javascript:"],#memo-body [onclick]').count(),0);assert.ok(await page.locator('#memo-body a').count()>=2);
 assert.deepEqual(errors,[]);console.log('PASS: PC/mobile memo autosave/reopen/link click; board save/reload/link click; safe existing HTML; text, punctuation and code preserved');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
