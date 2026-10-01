/* Portable Windows/macOS launcher. Uses Node built-ins; no npm installation. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function localEnvironment(){
 for(const key of ['VERCEL','REDIS_URL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'])delete process.env[key];
 process.env.DATA_DIR=path.join(root,'data');process.env.UPLOAD_DIR=path.join(root,'uploads');
}
function identity(dir){
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'.portable-id');
 try{fs.writeFileSync(file,crypto.randomUUID(),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 return fs.readFileSync(file,'utf8').trim();
}
function probe(port,id){return new Promise(resolve=>{
 const req=http.get({host:'127.0.0.1',port,path:'/__dailynote_local_health',agent:false,timeout:1200},res=>{
  let body='';res.on('data',c=>{body+=c;if(body.length>4096)req.destroy();});res.on('end',()=>{try{resolve(JSON.parse(body).instance===id?'same':'other');}catch{resolve('other');}});
 });req.on('timeout',()=>{req.destroy();resolve('other');});req.on('error',e=>resolve(e.code==='ECONNREFUSED'?'free':'other'));
});}
function openBrowser(address,platform=process.platform,launch=spawn){
 const command=platform==='win32'?'rundll32.exe':platform==='darwin'?'/usr/bin/open':null;
 if(!command){console.log('브라우저에서 직접 열어 주세요: '+address);return;}
 // Pass the URL as an argument without a shell on both platforms.
 const args=platform==='win32'?['url.dll,FileProtocolHandler',address]:[address];
 const child=launch(command,args,{stdio:'ignore',windowsHide:true});
 child.on('error',()=>console.log('브라우저에서 직접 열어 주세요: '+address));
}
async function initialize(dir){
 const file=path.join(dir,'users.json');
 if(fs.existsSync(file)){
  const users=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(users))throw new Error('users.json 형식이 잘못되었습니다. 기존 자료를 보존합니다.');
  if(users.length)return;
 }
 const readline=require('node:readline/promises'),{Writable}=require('node:stream');
 let hidden=false;
 const output=new Writable({write(chunk,encoding,done){if(!hidden)process.stdout.write(chunk);done();}});
 const rl=readline.createInterface({input:process.stdin,output,terminal:process.stdin.isTTY});
 let closed=false;rl.on('close',()=>{closed=true;});
 async function ask(label){if(closed)throw new Error('계정 설정이 취소되었습니다.');return rl.question(label);}
 async function secret(label){process.stdout.write(label);hidden=true;try{return await ask('');}finally{hidden=false;process.stdout.write('\n');}}
 try{
  console.log('처음 실행입니다. 관리자 계정을 생성합니다. 비밀번호는 화면에 표시하지 않습니다.');
  let username;do{username=(await ask('관리자 아이디 (2~40자): ')).trim();}while(!/^[a-zA-Z0-9가-힣._-]{2,40}$/.test(username));
  let password;while(true){password=await secret('비밀번호 (8~128자): ');const confirm=await secret('비밀번호 확인: ');if(password.length>=8&&password.length<=128&&password===confirm)break;console.log('길이 또는 비밀번호 확인이 일치하지 않습니다.');}
  const {makeUserRecord}=require('../src/auth');
  const record={...makeUserRecord(username,password),id:1,role:'admin',active:true,approval:'approved',createdAt:new Date().toISOString()};
  // Another initialization must never overwrite accounts created in the meantime.
  if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).length)throw new Error('이미 계정이 생성되어 초기화를 중단합니다.');
  const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify([record],null,2));fs.renameSync(temp,file);
  console.log('관리자 계정 생성 완료.');
 }finally{rl.close();}
}
async function main(){
 localEnvironment();const id=identity(process.env.DATA_DIR),port=Number(require('../src/config').PORT);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('config.json PORT는 1~65535의 정수여야 합니다.');
 const address='http://127.0.0.1:'+port;
 const status=await probe(port,id);
 if(status==='same'){console.log('이미 실행 중인 서버를 엽니다.');openBrowser(address);return;}
 if(status==='other')throw new Error('포트 '+port+'를 다른 프로그램이 사용합니다. config.json의 PORT를 바꿔 주세요.');
 // Reserve the port before prompting to prevent duplicate server/account startup.
 const server=http.createServer((req,res)=>{res.writeHead(503);res.end('Starting DailyNote');});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 try{
  await initialize(process.env.DATA_DIR);await require('../src/local-backup').startup();const handler=require('../src/server');
  server.removeAllListeners('request');server.on('request',(req,res)=>{
   if(req.method==='GET'&&req.url==='/__dailynote_local_health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({app:'DailyNote',instance:id}));}
   return handler(req,res);
  });
  console.log('\nDailyNote '+address+'\n종료하려면 이 창에서 Ctrl+C를 누르세요.\n자료: '+process.env.DATA_DIR);
  openBrowser(address);
 }catch(e){server.close();throw e;}
}
if(require.main===module)main().catch(e=>{console.error('\n실행 실패: '+e.message);process.exitCode=1;});
module.exports={localEnvironment,identity,probe,openBrowser};

