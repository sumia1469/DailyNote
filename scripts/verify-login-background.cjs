/* Local-only browser regression check: no production users or data. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
delete process.env.REDIS_URL;delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.VERCEL;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-background-'));
process.env.DATA_DIR=path.join(tmp,'data');process.env.UPLOAD_DIR=path.join(tmp,'uploads');
const ds=require('../src/datastore'),handler=require('../src/server'),{makeUserRecord}=require('../src/auth');
let browser,server;
(async()=>{
 await ds.insert('users',{...makeUserRecord('background-review','local-review-123'),role:'admin',active:true,approval:'approved'});
 server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/auth/login',{method:'POST',body:JSON.stringify({username:'background-review',password:'local-review-123'})});const {token}=await login.json();
 async function save(background,theme){const res=await fetch(base+'/api/admin/settings',{method:'PUT',headers:{authorization:'Bearer '+token},body:JSON.stringify({background,theme,...(background==='custom'?{imageData:fs.readFileSync(path.join(__dirname,'../public/images/login-autumn.webp')).toString('base64')}:{})})});assert.equal(res.status,200);return res.json();}
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  for(const theme of ['light','white','dark'])for(const background of ['autumn','custom','none']){
   await save(background,theme);await page.goto(base);await page.waitForFunction(({background,theme})=>document.body.dataset.background===background&&document.body.dataset.theme===theme,{background,theme});
   const image=await page.locator('#login-section').evaluate(n=>getComputedStyle(n).backgroundImage);
   if(background==='none')assert.equal(image,'none');else{
    const expected=background==='custom'?'/api/background/1?v=':viewport.width<600?'login-autumn-mobile.webp':'login-autumn.webp';assert.ok(image.includes(expected),image);
    const source=image.match(/url\("([^\"]+)"\)/)[1];assert.equal((await context.request.get(source)).status(),200);
    assert.equal(await page.evaluate(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);img.src=src;}),source),true);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await save('autumn','light');await page.reload();await page.waitForFunction(()=>document.body.dataset.background==='autumn');
  if(process.env.UI_CAPTURE_DIR){fs.mkdirSync(process.env.UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_CAPTURE_DIR,'login-background-'+viewport.width+'.png'),fullPage:true});}
  await context.close();
 }
 console.log('PASS: saved autumn/custom/none backgrounds in light/white/dark themes, PC and mobile, image decode and reload.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
