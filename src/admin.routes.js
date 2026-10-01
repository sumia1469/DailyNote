const ds = require('./datastore');
const posts=require('./notice-posts');
const {sendJson, parseJsonBody} = require('./utils');
const {makeUserRecord} = require('./auth');
const {keys, basicKeys, roleOf, safeUser, rightsOf} = require('./permissions');
const storage = require('./file-storage');
const {downloadHandler,removeStored}=require('./upload.routes');
const LoadingMotion=require('../public/loading-motion');
const defaults = {fontFamily:'system',fontSize:16, spacing:'normal', theme:'light', background:'autumn',loadingMotion:LoadingMotion.defaultId};
const publicSettings = record => ({...defaults, ...(record?.values || {}),
  backgroundUrl:record?.imageData ? '/api/background/1?v=' + encodeURIComponent(record.updatedAt) : null});
async function settingsHandler(req,res) {
  const settings = await ds.findOne('site_settings', s => s.id === 1);
  if (new URL(req.url,'http://localhost').pathname === '/api/background/1') {
    if (!settings?.imageData) return sendJson(res,404,{message:'배경 이미지가 없습니다.'});
    const buffer=Buffer.from(settings.imageData,'base64');
    res.writeHead(200, {'Content-Type':settings.imageMime,'Content-Length':buffer.length,'Cache-Control':'public, max-age=300'});
    return res.end(buffer);
  }
  sendJson(res,200,publicSettings(settings));
}
async function adminRouter(req,res,auth) {
  const url=new URL(req.url,'http://localhost');
  const [, , area, rawId]=url.pathname.split('/').filter(Boolean);
  const id=rawId ? Number(rawId) : null;
  const action=url.pathname.split('/').filter(Boolean)[4];
  const right=area==='settings'?'appearance':area;
  if (area === 'directory' && req.method === 'GET' && ['notifications','files','users','permissions'].some(key => auth.permissions[key])) return sendJson(res,200,(await ds.findAll('users')).map(u=>({id:u.id,username:u.username,active:u.active!==false,approval:u.approval})));
  if (!auth.permissions[right]) return sendJson(res,403,{message:'이 관리 기능에 접근할 권한이 없습니다.'});
  const method=req.method;
  const body=['POST','PUT'].includes(method)?await parseJsonBody(req):{};
  if (area==='users' || area==='permissions') {
    if(method==='GET'&&!id) return sendJson(res,200,(await ds.findAll('users')).map(safeUser));
    const existing=id?await ds.findOne('users',u=>u.id===id):null;
    if(id&&!existing)return sendJson(res,404,{message:'사용자를 찾을 수 없습니다.'});
    if (area==='users' && existing && roleOf(existing)==='admin' && auth.role!=='admin' && method!=='GET') return sendJson(res,403,{message:'관리자 계정은 관리자만 수정할 수 있습니다.'});
    if (area==='users' && existing && method==='POST' && action==='reset-password') {
      if(auth.role!=='admin')return sendJson(res,403,{message:'비밀번호 초기화는 관리자만 할 수 있습니다.'});
      if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)return sendJson(res,400,{message:'새 비밀번호는 8~128자로 입력하세요.'});
      if(body.password!==body.passwordConfirmation)return sendJson(res,400,{message:'비밀번호 확인이 일치하지 않습니다.'});
      await ds.update('users',id,{...makeUserRecord(existing.username,body.password),mustChangePassword:true,passwordResetAt:new Date().toISOString()});
      return sendJson(res,200,{message:'임시 비밀번호를 설정했습니다. 사용자는 로그인 후 본인 비밀번호를 변경해야 합니다.'});
    }
    if (area==='users' && existing && method==='POST' && ['approve','reject'].includes(action)) {
      if (existing.approval !== 'pending') return sendJson(res,400,{message:'승인 대기 중인 신청이 아닙니다.'});
      const approved=action==='approve';
      const updated=await ds.update('users',id,{approval:approved?'approved':'rejected',active:approved,reviewedAt:new Date().toISOString(),reviewedBy:auth.userId});
      return sendJson(res,200,safeUser(updated));
    }
    if(method==='POST'||method==='PUT') {
      const updates={};
      if(area==='users') {
        const username=String(body.username||'').trim();
        if(!username||username.length>80)return sendJson(res,400,{message:'아이디는 1~80자로 입력하세요.'});
        if((await ds.findAll('users')).some(u=>u.username===username&&u.id!==id))return sendJson(res,409,{message:'이미 사용 중인 아이디입니다.'});
        updates.username=username;
        if(method==='POST'&&!body.password)return sendJson(res,400,{message:'비밀번호를 입력하세요.'});
        if(body.password) {
          if(typeof body.password!=='string'||body.password.length<8)return sendJson(res,400,{message:'비밀번호는 8자 이상 입력하세요.'});
          Object.assign(updates,makeUserRecord(username,body.password));
        }
        if(body.active!==undefined) {
          updates.active=body.active===true;
          if (updates.active && existing?.approval && existing.approval !== 'approved') updates.approval='approved';
        }
      }
      if(body.role!==undefined || body.permissions!==undefined || area==='permissions') {
        if(!auth.permissions.permissions)return sendJson(res,403,{message:'권한 설정 권한이 필요합니다.'});
        if(body.role!==undefined) {
          if(!['admin','member'].includes(body.role))return sendJson(res,400,{message:'잘못된 사용자 역할입니다.'});
          updates.role=body.role;
        }
        if(body.permissions!==undefined) {
          const currentRights=rightsOf(existing||{role:'member'});
          updates.permissions=Object.fromEntries(keys.map(key=>[key,basicKeys.includes(key)&&body.permissions?.[key]===undefined?currentRights[key]:body.permissions?.[key]===true]));
        }
      }
      if(existing) {
        if(existing.id===auth.userId&&updates.active===false)return sendJson(res,400,{message:'현재 로그인한 계정은 비활성화할 수 없습니다.'});
        if(roleOf(existing)==='admin'&&(updates.role==='member'||updates.active===false)) {
          const others=(await ds.findAll('users')).filter(u=>u.id!==id&&roleOf(u)==='admin'&&u.active!==false);
          if(!others.length)return sendJson(res,400,{message:'활성 관리자는 최소 한 명 필요합니다.'});
        }
        return sendJson(res,200,safeUser(await ds.update('users',id,updates)));
      }
      if(area==='permissions')return sendJson(res,400,{message:'사용자를 선택하세요.'});
      return sendJson(res,201,safeUser(await ds.insert('users',{role:'member',permissions:{},active:true,approval:'approved',...updates,createdAt:new Date().toISOString()})));
    }
  }
  if(area==='notifications') {
    if(method==='GET'&&!id){
      const records=await posts.listAdmin();
      if(!url.searchParams.has('limit'))return sendJson(res,200,records);
      const limit=Math.min(100,Math.max(1,Math.floor(Number(url.searchParams.get('limit'))||30)));
      const offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0));
      const query=(url.searchParams.get('query')||'').trim().toLocaleLowerCase(),read=url.searchParams.get('read');
      const filtered=records.filter(n=>(!read||(read==='read'?n.readCount>0:n.unreadCount>0))&&(!query||[n.title,n.message,n.shared?'공통 공지':'이전 개별 공지'].join(' ').toLocaleLowerCase().includes(query)))
        .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id-a.id);
      return sendJson(res,200,{items:filtered.slice(offset,offset+limit),total:records.length,filteredTotal:filtered.length,nextOffset:offset+limit<filtered.length?offset+limit:null});
    }
    if(method==='POST'||method==='PUT'){
      const title=String(body.title||'').trim(),message=String(body.message||'').trim();
      if(title.length>120)return sendJson(res,400,{message:'공지 제목은 120자 이내로 입력하세요.'});
      if(!message||message.length>2000)return sendJson(res,400,{message:'공지 내용을 1~2000자로 입력하세요.'});
      if(method==='POST'){const n=await posts.create(title,message);return sendJson(res,201,{...n,count:1,ids:[n.id]});}
      const n=await posts.change(id,{title,message});return sendJson(res,n?200:404,n||{message:'공지를 찾을 수 없습니다.'});
    }
    if(method==='DELETE'&&id){const ok=await posts.remove(id);return sendJson(res,ok?200:404,{message:ok?'공지를 삭제했습니다.':'공지를 찾을 수 없습니다.'});}
  }
  if(area==='files') {
    if(method==='GET'&&!id)return sendJson(res,200,(await ds.findAll('files')).filter(f=>f.status!=='uploading'));
    const file=await ds.findOne('files',f=>f.id===id);
    if(!file)return sendJson(res,404,{message:'파일을 찾을 수 없습니다.'});
    if(method==='DELETE') {
      await removeStored(file);
      await ds.remove('files',id);
      return sendJson(res,200,{message:'파일을 삭제했습니다.'});
    }
    if(method==='PUT') {
      const name=String(body.originalName||'').trim();
      if(!name||name.length>200)return sendJson(res,400,{message:'파일명은 1~200자로 입력하세요.'});
      return sendJson(res,200,await ds.update('files',id,{originalName:name}));
    }
    if(method==='GET')return downloadHandler(req,res,{...auth,userId:file.userId},file.id);
  }
  if(area==='settings') {
    const current=await ds.findOne('site_settings',s=>s.id===1);
    if(method==='GET')return sendJson(res,200,publicSettings(current));
    if(method==='PUT') {
      const values={...defaults,...current?.values};
      if(body.fontFamily!==undefined){if(!['system','sans','serif'].includes(body.fontFamily))return sendJson(res,400,{message:'잘못된 폰트입니다.'});values.fontFamily=body.fontFamily;}
      if(body.fontSize!==undefined){const n=Number(body.fontSize);if(![14,16,18,20].includes(n))return sendJson(res,400,{message:'잘못된 글자 크기입니다.'});values.fontSize=n;}
      if(body.spacing!==undefined){if(!['compact','normal','comfortable'].includes(body.spacing))return sendJson(res,400,{message:'잘못된 간격입니다.'});values.spacing=body.spacing;}
      if(body.theme!==undefined){if(!['light','white','dark'].includes(body.theme))return sendJson(res,400,{message:'잘못된 화면 모드입니다.'});values.theme=body.theme;}
      if(body.background!==undefined){if(!['autumn','custom','none'].includes(body.background))return sendJson(res,400,{message:'잘못된 배경입니다.'});values.background=body.background;}
      if(body.loadingMotion!==undefined){if(!LoadingMotion.variants.some(item=>item.id===body.loadingMotion))return sendJson(res,400,{message:'잘못된 로딩 모션입니다.'});values.loadingMotion=body.loadingMotion;}
      const record={values,updatedAt:new Date().toISOString()};
      if(body.imageData) {
        if(typeof body.imageData!=='string'||body.imageData.length>1500000)return sendJson(res,400,{message:'배경 이미지는 1MB 이하로 올려 주세요.'});
        const image=Buffer.from(body.imageData,'base64');
        const mime=image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png'
          :image[0]===255&&image[1]===216?'image/jpeg'
          :image.toString('ascii',0,4)==='RIFF'&&image.toString('ascii',8,12)==='WEBP'?'image/webp':null;
        if(!mime||image.length>1024*1024)return sendJson(res,400,{message:'PNG·JPG·WebP 이미지(1MB 이하)를 선택하세요.'});
        record.imageData=image.toString('base64');record.imageMime=mime;
      }
      if(values.background==='custom'&&!record.imageData&&!current?.imageData)return sendJson(res,400,{message:'배경 이미지를 먼저 선택하세요.'});
      const saved=current?await ds.update('site_settings',1,record):await ds.insert('site_settings',record);
      return sendJson(res,200,publicSettings(saved));
    }
  }
  return sendJson(res,404,{message:'관리 API를 찾을 수 없습니다.'});
}
module.exports={adminRouter,settingsHandler};
