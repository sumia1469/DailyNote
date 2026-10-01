const ds=require('./datastore');
const {sendJson}=require('./utils');
const LIMIT=10000,DAYS=30;
let queue=Promise.resolve();
function admin(auth){return auth.role==='admin';}
async function recordRequest(req,res,durationMs){
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(!pathname.startsWith('/api/'))return;
 const status=Number(res.statusCode||res.status)||500;
 if(pathname.startsWith('/api/admin/logs'))return;
 if(req.method==='GET'&&status<400&&!pathname.startsWith('/api/backup/export'))return;
 if(pathname==='/api/backup/import'&&!req.auditInfo&&status<400)return;
 if(req.auditSkip&&status<400)return;
 const entry={at:new Date().toISOString(),userId:req.auditAuth?.userId||0,username:req.auditAuth?.username||'미인증',method:req.method,path:pathname.replace(/[^a-zA-Z0-9_\-/]/g,'').slice(0,240),status,durationMs:Math.max(0,durationMs),category:status>=400?'error':pathname.includes('/auth/')?'access':pathname.includes('/backup')?'backup':'activity',...(req.auditInfo||{})};
 const operation=queue.then(()=>ds.appendAudit(entry,LIMIT,DAYS));queue=operation.catch(()=>{});return operation;
}
async function router(req,res,auth){
 if(!admin(auth))return sendJson(res,403,{message:'로그는 관리자만 조회할 수 있습니다.'});
 if(req.method!=='GET')return sendJson(res,405,{message:'로그는 조회·다운로드할 수 있습니다.'});
 const u=new URL(req.url,'http://localhost'),q=(u.searchParams.get('q')||'').toLocaleLowerCase(),kind=u.searchParams.get('category')||'',from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'';
 if([from,to].some(x=>x&&!/^\d{4}-\d{2}-\d{2}$/.test(x)))return sendJson(res,400,{message:'조회 날짜를 확인하세요.'});
 const rows=(await ds.findAll('audit_logs')).filter(x=>Date.parse(x.at)>=Date.now()-DAYS*86400000).filter(x=>(!q||[x.username,x.path,x.method,x.scope,x.status].join(' ').toLocaleLowerCase().includes(q))&&(!kind||x.category===kind)&&(!from||Date.parse(x.at)>=Date.parse(from+'T00:00:00+09:00'))&&(!to||Date.parse(x.at)<Date.parse(to+'T00:00:00+09:00')+86400000)).sort((a,b)=>b.id-a.id);
 if(u.searchParams.get('download')==='1'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="DailyNote-logs.json"','Cache-Control':'no-store'});return res.end(JSON.stringify(rows,null,2));}
 const offset=Math.max(0,Number(u.searchParams.get('offset'))||0),limit=30;
 return sendJson(res,200,{items:rows.slice(offset,offset+limit),total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,retentionDays:DAYS,maxRecords:LIMIT});
}
module.exports={recordRequest,router};
