const ds=require('./datastore');
const releases=require('./releases.json');
const {randomUUID}=require('node:crypto');
const active=u=>u.active!==false&&!['pending','rejected'].includes(u.approval);
const version=n=>n.revision||n.updatedAt||n.createdAt||'';
const readKey=n=>'post:'+n.id+':'+version(n);
async function ensure(){
 const all=await ds.findAll('notifications'),users=await ds.findAll('users');
 for(const release of releases){
  if(Date.parse(release.publishedAt)>Date.now()||all.some(n=>n.shared&&n.releaseId===release.id))continue;
  const previous=all.filter(n=>!n.shared&&n.releaseId===release.id).sort((a,b)=>Date.parse(b.updatedAt||b.createdAt)-Date.parse(a.updatedAt||a.createdAt)||b.id-a.id)[0];
  const deleted=!previous&&await ds.hasAnyDelivery('notifications',users.map(u=>release.id+':'+u.id));
  await ds.insertOnce('notifications',release.id+':shared',{userId:0,shared:true,deleted,releaseId:release.id,title:previous?.title||release.title||'',message:previous?.message||release.message,createdAt:release.publishedAt,...(previous?.updatedAt?{updatedAt:previous.updatedAt}:{})});
 }
}
function resolved(all,id){const n=all.find(n=>n.id===id);return n?.releaseId&&!n.shared?all.find(p=>p.shared&&p.releaseId===n.releaseId)||n:n;}
function visible(n,uid){return n&&!n.deleted&&(n.shared||n.userId===uid);}
function wasRead(n,uid,all,reads){
 if(!n.shared)return !!n.isRead;
 if(reads.some(r=>r.userId===uid&&r.releaseId===readKey(n)))return true;
 return !!n.releaseId&&all.some(old=>!old.shared&&old.releaseId===n.releaseId&&old.userId===uid&&old.isRead&&old.message===n.message&&version(old)===version(n));
}
function view(n,uid,all,reads){return {...n,userId:uid,isRead:wasRead(n,uid,all,reads)};}
async function listUser(uid){await ensure();const all=await ds.findAll('notifications'),reads=await ds.findAll('notification_reads');return all.filter(n=>visible(n,uid)&&(!n.releaseId||n.shared)).map(n=>view(n,uid,all,reads));}
async function getUser(id,uid){await ensure();const all=await ds.findAll('notifications'),n=resolved(all,id);if(!visible(n,uid))return null;return view(n,uid,all,await ds.findAll('notification_reads'));}
async function markRead(id,uid){await ensure();const all=await ds.findAll('notifications'),n=resolved(all,id);if(!visible(n,uid))return false;if(n.shared)await ds.insertOnce('notification_reads',readKey(n)+':'+uid,{releaseId:readKey(n),userId:uid,readAt:new Date().toISOString()});else await ds.update('notifications',n.id,{isRead:true});return true;}
// Old broadcast copies share an exact timestamp and content; preserve their original audience.
function groups(all){const map=new Map();for(const n of all){if(n.deleted||n.releaseId&&!n.shared)continue;const key=n.shared?'shared:'+n.id:JSON.stringify([n.createdAt||n.id,n.title||'',n.message]);if(!map.has(key))map.set(key,[]);map.get(key).push(n);}return [...map.values()];}
async function listAdmin(){await ensure();const all=await ds.findAll('notifications'),reads=await ds.findAll('notification_reads'),users=(await ds.findAll('users')).filter(active);return groups(all).map(group=>{const n=group.reduce((a,b)=>a.id<b.id?a:b),audience=n.shared?users.map(u=>u.id):[...new Set(group.map(n=>n.userId))],readCount=audience.filter(uid=>n.shared?wasRead(n,uid,all,reads):group.some(old=>old.userId===uid&&old.isRead)).length;return {...n,readCount,audienceCount:audience.length,unreadCount:audience.length-readCount,isRead:audience.length>0&&readCount===audience.length};});}
async function create(title,message){return ds.insert('notifications',{userId:0,shared:true,title,message,createdAt:new Date().toISOString()});}
async function change(id,updates){await ensure();const all=await ds.findAll('notifications'),n=resolved(all,id);if(!n||n.deleted)return null;const group=n.shared?[n]:groups(all).find(g=>g.some(x=>x.id===n.id))||[n];const updatedAt=new Date().toISOString(),revision=randomUUID();for(const item of group)await ds.update('notifications',item.id,{...updates,updatedAt,revision,isRead:false});return {...n,...updates,updatedAt,revision,isRead:false};}
async function remove(id){return !!await change(id,{deleted:true});}
module.exports={ensure,listUser,getUser,markRead,listAdmin,create,change,remove};
