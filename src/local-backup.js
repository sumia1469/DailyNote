const fs=require('node:fs/promises'),path=require('node:path');
const ds=require('./datastore'),storage=require('./file-storage');
const {sendJson}=require('./utils');
const cloud=()=>Boolean(process.env.REDIS_URL||process.env.UPSTASH_REDIS_REST_URL);
const dir=()=>process.env.BACKUP_DIR||path.join(path.dirname(process.env.DATA_DIR||path.join(__dirname,'../data')),'backup');
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
let running;
async function create(reason='daily'){
 if(cloud())return null;
 if(running)return running;
 running=(async()=>{
  const name=reason==='daily'?'backup_'+day()+'.zip':'backup_'+day()+'_'+Date.now()+'.zip';
  await fs.mkdir(dir(),{recursive:true});
  try{await fs.access(path.join(dir(),name));return name;}catch{}
  const zip=new (require('../public/vendor/jszip/jszip.min'))();
  const {scopes}=require('./backup.routes'),records={};
  for(const kind of scopes.all)records[kind]=kind==='notification_history'?await ds.notificationHistory():structuredClone(await ds.findAll(kind));
  records.files=records.files.filter(f=>f.status!=='uploading');
  for(const file of records.files){const chunks=[];for(let i=0;i<(file.chunkCount||1);i++){const bytes=await storage.read(file.storedName+(file.chunkCount?'.'+i:''));if(!bytes)throw Error('자동 백업 파일 원본이 없습니다: '+file.originalName);chunks.push(bytes);}const bytes=Buffer.concat(chunks);if(bytes.length!==file.sizeBytes)throw Error('자동 백업 파일 크기가 일치하지 않습니다.');zip.file('files/'+file.id+'.bin',bytes);delete file.storedName;}
  zip.file('manifest.json',JSON.stringify({format:'DailyNoteBackup',version:1,archiveId:require('node:crypto').randomUUID(),scope:'all',createdAt:new Date().toISOString(),records}));
  const tmp=path.join(dir(),name+'.tmp');await fs.writeFile(tmp,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));await fs.rename(tmp,path.join(dir(),name));
  const original=path.join(process.env.DATA_DIR||path.join(__dirname,'../data'),'data.json');
  try{await fs.copyFile(original,path.join(dir(),'backup_'+day()+'.json'),require('node:fs').constants.COPYFILE_EXCL);}catch(e){if(!['ENOENT','EEXIST'].includes(e.code))throw e;}
  return name;
 })().finally(()=>{running=null;});return running;
}
async function startup(){if(!cloud())await create();}
async function router(req,res,auth){
 if(auth.role!=='admin')return sendJson(res,403,{message:'백업 관리는 관리자만 사용할 수 있습니다.'});
 if(cloud())return sendJson(res,200,{local:false,items:[],message:'웹 배포에서는 전체 백업을 다운로드해 보관하세요. 로컬 서버는 시작 시 하루 한 번 자동 백업합니다.'});
 const u=new URL(req.url,'http://localhost'),name=u.searchParams.get('name');
 if(req.method==='GET'&&name){if(!/^backup_\d{4}-\d{2}-\d{2}(?:_\d+)?\.(zip|json)$/.test(name))return sendJson(res,400,{message:'백업 파일명을 확인하세요.'});try{const bytes=await fs.readFile(path.join(dir(),name));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'});return res.end(bytes);}catch(e){if(e.code!=='ENOENT')throw e;return sendJson(res,404,{message:'백업 파일을 찾지 못했습니다.'});}}
 if(req.method==='POST'){const name=await create('manual');return sendJson(res,201,{name});}
 if(req.method!=='GET')return sendJson(res,405,{message:'지원하지 않는 요청입니다.'});
 await fs.mkdir(dir(),{recursive:true});const names=(await fs.readdir(dir())).filter(x=>/^backup_.*\.(zip|json)$/.test(x)).sort().reverse();
 const items=await Promise.all(names.slice(0,100).map(async name=>{const stat=await fs.stat(path.join(dir(),name));return {name,size:stat.size,createdAt:stat.mtime.toISOString()};}));return sendJson(res,200,{local:true,items});
}
module.exports={startup,create,router};
