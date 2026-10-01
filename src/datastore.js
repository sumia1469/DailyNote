// src/datastore.js — photographed source reconstruction
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL)) fs.mkdirSync(DATA_DIR, {recursive: true});
const cache = {};
const counters = {};
const transactionPath = path.join(DATA_DIR, 'backup-transaction.json');
let recovered = false;
function recoverBackup() {
 if(recovered)return;
 if(fs.existsSync(transactionPath)) {
  const next=JSON.parse(fs.readFileSync(transactionPath,'utf8'));
  for(const [name,records] of Object.entries(next)) {
   if(!/^[a-z_-]+$/.test(name)||!Array.isArray(records))throw Error('Invalid restore journal');
   fs.writeFileSync(filePath(name)+'.tmp',JSON.stringify(records));fs.renameSync(filePath(name)+'.tmp',filePath(name));
  }
  fs.unlinkSync(transactionPath);
 }
 recovered=true;
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

let usersLoading;
async function load(name) {
  if (name !== 'users') return loadFile(name);
  if (cache.users !== undefined) return cache.users;
  if (!usersLoading) usersLoading = loadFile(name).finally(() => { usersLoading = null; });
  return usersLoading;
}
async function loadFile(name) {
  recoverBackup();
  if (cache[name] !== undefined) return cache[name];
  const fp = filePath(name);
  try {
    console.log('[datastore]읽을 파일:', fp);
    const raw = await fs.promises.readFile(fp, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${name}.json의 최상위 데이터가 배열이 아닙니다.`);
    }
    cache[name] = parsed;
    console.log('[datastore]로드 성공:', cache[name].length);
    return cache[name];
  } catch (e) {
    console.log('[datastore] 파일 로드 실패');
    console.log('경로', fp);
    console.log('오류', e.message);
    if (e.code !== 'ENOENT') throw e;
    cache[name] = [];
    return cache[name];
  }
  return cache[name];
}

async function save(name) {
  const fp = filePath(name);
  const data = JSON.stringify(cache[name], null, 2);
  await fs.promises.writeFile(fp, data, 'utf-8');
}

async function findAll(name) { return await load(name); }
async function hasAnyDelivery(name,keys) { const wanted=new Set(keys);return (await load(name+'-deliveries')).some(item=>wanted.has(item.key)); }
async function findOne(name, predicate) {
  const arr = await load(name);
  return arr.find(predicate);
}
let userQueue = Promise.resolve();
function mutateUser(id, changes) {
  const operation = userQueue.then(async () => {
    const users = await load('users');
    const index = id === null ? -1 : users.findIndex(user => user.id === id);
    if (id !== null && index === -1) return null;
    const previous = index === -1 ? null : users[index];
    const next = previous ? {...previous, ...changes} : {...changes, id:users.reduce((m,u)=>Math.max(m,Number(u.id)||0),counters.users||0)+1};
    counters.users=Math.max(counters.users||0,next.id);
    require('./license').assertSeatChange(users, previous, next);
    const saved = users.slice();
    if (previous) saved[index] = next; else saved.push(next);
    // Publish the cache only after durable save. Failed writes do not consume a seat.
    const temp = filePath('users') + '.tmp';
    await fs.promises.writeFile(temp, JSON.stringify(saved,null,2), 'utf-8');
    await fs.promises.rename(temp, filePath('users'));
    cache.users = saved;
    return next;
  });
  userQueue = operation.catch(() => {});
  return operation;
}
async function insert(name, obj) {
  if (name === 'users') return mutateUser(null, obj);
  const arr = await load(name);
  const maxId = Math.max(counters[name]||0,arr.reduce((m, o) => (o.id > m ? o.id : m), 0));
  counters[name]=maxId+1;
  obj.id = maxId + 1;
  arr.push(obj);
  await save(name);
  return obj;
}
async function update(name, id, updates) {
  if (name === 'users') return mutateUser(id, updates);
  const arr = await load(name);
  const idx = arr.findIndex(o => o.id === id);
  if (idx === -1) return null;
  arr[idx] = { ...arr[idx], ...updates };
  await save(name);
  return arr[idx];
}
async function remove(name, id) {
  const arr = await load(name);
  const idx = arr.findIndex(o => o.id === id);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  await save(name);
  return true;
}
let deliveryQueue = Promise.resolve();
function insertOnce(name, key, obj) {
  const operation = deliveryQueue.then(async () => {
    const deliveries = await load(name + '-deliveries');
    if (deliveries.some(item => item.key === key)) return null;
    // Recover a notification saved before its delivery marker after interruption.
    const existing = await findOne(name, item => item.releaseId === obj.releaseId && item.userId === obj.userId);
    const record = existing || await insert(name, obj);
    deliveries.push({key, notificationId: record.id});
    await save(name + '-deliveries');
    return existing ? null : record;
  });
  deliveryQueue = operation.catch(() => {});
  return operation;
}
async function findSessionByToken(token) {
  const arr = await load('sessions');
  return arr.find(s => s.token === token);
}
async function insertSession(sessionObj) {
  const arr = await load('sessions');
  arr.push(sessionObj);
  await save('sessions');
  return sessionObj;
}
async function deleteExpiredSessions() {
  const arr = await load('sessions');
  const now = Date.now();
  const filtered = arr.filter(s => new Date(s.expiresAt).getTime() > now);
  if (filtered.length !== arr.length) {
    cache['sessions'] = filtered;
    await save('sessions');
  }
}
module.exports = {
  findAll, findOne, insert, insertOnce, update, remove, hasAnyDelivery,
  findSessionByToken, insertSession, deleteExpiredSessions
};

module.exports.reserveIds=async function(name,count){const arr=await load(name),start=arr.reduce((max,x)=>Math.max(max,Number(x.id)||0),counters[name]||0);counters[name]=start+count;return Array.from({length:count},(_,i)=>start+i+1);};
module.exports.notificationHistory=async function(){return (await load('notifications-deliveries')).map((x,i)=>{const split=x.key.lastIndexOf(':');return {id:Number.parseInt(require('node:crypto').createHash('sha256').update(x.key).digest('hex').slice(0,13),16),releaseId:x.key.slice(0,split),userId:x.key.slice(split+1)==='shared'?0:Number(x.key.slice(split+1))};});};
module.exports.commitBackup=async function(entries,receipt,settings,deliveries,expectedUsers){
 const operation=userQueue.then(async()=>{
  const names=[...new Set([...Object.keys(entries),'backup_receipts',...(settings?['site_settings']:[]),...(deliveries.length?['notifications-deliveries']:[])])];
  for(const name of names)await load(name);
  if(cache.backup_receipts.some(x=>x.key===receipt.key))return false;
  if(expectedUsers&&JSON.stringify(cache.users)!==JSON.stringify(expectedUsers))throw Error('사용자 정보가 변경되었습니다. 다시 시도하세요.');
  const next=Object.fromEntries(names.map(name=>{const imported=entries[name]||[],ids=new Set(imported.map(x=>x.id));return [name,[...cache[name].filter(x=>!ids.has(x.id)),...imported]];}));
  next.backup_receipts.push(receipt);
  if(settings)next.site_settings=[...cache.site_settings.filter(x=>x.id!==1),{...settings,id:1}];
  if(deliveries.length)next['notifications-deliveries'].push(...deliveries);
  // A durable write-ahead record makes an interrupted multi-collection import recoverable.
  fs.writeFileSync(transactionPath+'.tmp',JSON.stringify(next));fs.renameSync(transactionPath+'.tmp',transactionPath);
  try{
    for(const [name,records] of Object.entries(next)){fs.writeFileSync(filePath(name)+'.tmp',JSON.stringify(records,null,2));fs.renameSync(filePath(name)+'.tmp',filePath(name));}
    fs.unlinkSync(transactionPath);Object.assign(cache,next);return true;
  }catch(error){for(const name of names)delete cache[name];recovered=false;throw error;}
});userQueue=operation.catch(()=>{});return operation;
};


module.exports.appendAudit=async function(entry,limit,days){const arr=await load('audit_logs');const next=arr.filter(x=>Date.parse(x.at)>=Date.now()-days*86400000);const id=Math.max(counters.audit_logs||0,...arr.map(x=>x.id||0))+1;counters.audit_logs=id;next.push({...entry,id});cache.audit_logs=next.slice(-limit);const fp=filePath('audit_logs');await fs.promises.writeFile(fp+'.tmp',JSON.stringify(cache.audit_logs));await fs.promises.rename(fp+'.tmp',fp);};

if ((process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL)) module.exports = require('./redis-store');

