// Durable Redis REST storage for Vercel; JSON storage remains available locally.
const prefix = 'dailyNote:';
let client;
let connecting;
async function nativeClient() {
 if (client?.isReady) return client;
 if (!connecting) {
  if (!client || !client.isOpen) {
   const {createClient} = require('redis');
   client = createClient({
    url: process.env.REDIS_URL,
    disableOfflineQueue: true,
    socket: {connectTimeout: 5000, reconnectStrategy: false}
   });
   client.on('error', () => console.error('Redis connection error'));
  }
  connecting = client.connect().then(() => client).finally(() => {connecting = null;});
 }
 return connecting;
}
async function command(...args) {
 if (process.env.REDIS_URL) {
  const connection = await nativeClient();
  return connection.sendCommand(args.map(String));
 }
 const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
  method:'POST', headers:{Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type':'application/json'}, body:JSON.stringify(args)
 });
 if (!response.ok) throw new Error('Storage request failed');
 const data = await response.json();
 if (data.error) throw new Error(data.error);
 return data.result;
}
async function findAll(name) { return (await command('HVALS',prefix+name)).map(JSON.parse); }
async function findOne(name,predicate) { return (await findAll(name)).find(predicate); }
async function mutateUser(id, updates) {
 const {FREE_USER_LIMIT,licenseError} = require('./license');
 const result = await command('EVAL',require('./user-seat-script'),2,prefix+'users',prefix+'users:id',id===null?'':String(id),JSON.stringify(updates),FREE_USER_LIMIT);
 if (!result) return null;
 const user = JSON.parse(result);
 if (user.code === 'LICENSE_USER_LIMIT') throw licenseError(user.count);
 return user;
}
async function insert(name,obj) {
 if (name === 'users') return mutateUser(null,obj);
 obj = {...obj,id:await command('INCR',prefix+name+':id')};
 await command('HSET',prefix+name,String(obj.id),JSON.stringify(obj));return obj;
}
async function update(name,id,updates) {
 if (name === 'users') return mutateUser(id,updates);
 const result = await command('EVAL', `local v=redis.call('HGET',KEYS[1],ARGV[1]); if not v then return false end; local o=cjson.decode(v); local u=cjson.decode(ARGV[2]); for k,v in pairs(u) do o[k]=v end; local s=cjson.encode(o); redis.call('HSET',KEYS[1],ARGV[1],s); return s`,1,prefix+name,String(id),JSON.stringify(updates));
 return result ? JSON.parse(result) : null;
}
async function remove(name,id) { return Boolean(await command('HDEL',prefix+name,String(id))); }
async function hasAnyDelivery(name,keys) { return keys.length>0&&(await command('HMGET',prefix+name+':deliveries',...keys)).some(value=>value!==null); }
async function insertOnce(name, key, obj) {
 const result = await command('EVAL', `if redis.call('HEXISTS',KEYS[3],ARGV[1])==1 then return false end; local id=redis.call('INCR',KEYS[2]); local o=cjson.decode(ARGV[2]); o.id=id; local s=cjson.encode(o); redis.call('HSET',KEYS[1],tostring(id),s); redis.call('HSET',KEYS[3],ARGV[1],tostring(id)); return s`,3,prefix+name,prefix+name+':id',prefix+name+':deliveries',key,JSON.stringify(obj));
 return result ? JSON.parse(result) : null;
}
async function insertSession(obj) { await command('SET',prefix+'session:'+obj.token,JSON.stringify(obj),'EX',Math.max(1,Math.floor((new Date(obj.expiresAt)-Date.now())/1000)));return obj; }
async function findSessionByToken(token) { const v=await command('GET',prefix+'session:'+token);return v?JSON.parse(v):null; }
let initializing;
async function initialize() {
 if (!initializing) initializing=(async()=>{
  if ((await findAll('users')).length) return;
  if (!process.env.ADMIN_USERNAME || (process.env.ADMIN_PASSWORD||'').length<8) throw new Error('Initial administrator environment variables required');
  const {makeUserRecord}=require('./auth');
  const record={...makeUserRecord(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD),id:1,createdAt:new Date().toISOString()};
  await command('HSETNX',prefix+'users','1',JSON.stringify(record));
  await command('SET',prefix+'users:id','1','NX');
 })().catch(e=>{initializing=null;throw e;});
 return initializing;
}
async function close() { if (client?.isOpen) await client.close(); client = null; }
module.exports={close,findAll,findOne,insert,insertOnce,update,remove,hasAnyDelivery,insertSession,findSessionByToken,deleteExpiredSessions:async()=>{},command,initialize};


module.exports.reserveIds=async function(name,count){if(!count)return [];const end=Number(await command('INCRBY',prefix+name+':id',count));return Array.from({length:count},(_,i)=>end-count+i+1);};
module.exports.notificationHistory=async function(){const keys=await command('HKEYS',prefix+'notifications:deliveries');return keys.sort().map((key,i)=>{const split=key.lastIndexOf(':');return {id:Number.parseInt(require('node:crypto').createHash('sha256').update(key).digest('hex').slice(0,13),16),releaseId:key.slice(0,split),userId:key.slice(split+1)==='shared'?0:Number(key.slice(split+1))};});};
module.exports.commitBackup=async function(entries,receipt,settings,deliveries,expectedUsers){
 const writes=[];for(const [name,records] of Object.entries(entries))for(const record of records)writes.push([prefix+name,String(record.id),JSON.stringify(record)]);
 if(settings)writes.push([prefix+'site_settings','1',JSON.stringify({...settings,id:1})]);
 for(const item of deliveries)writes.push([prefix+'notifications:deliveries',item.key,String(item.notificationId)]);
 const result=await command('EVAL',`if redis.call('HEXISTS',KEYS[1],ARGV[1])==1 then return 0 end; local function equal(a,b) if type(a)~=type(b) then return false end; if type(a)~='table' then return a==b end; for k,v in pairs(a) do if not equal(v,b[k]) then return false end end; for k,v in pairs(b) do if a[k]==nil then return false end end; return true end; local expected=cjson.decode(ARGV[4]); if #expected~=redis.call('HLEN',KEYS[2]) then return -1 end; for _,v in ipairs(expected) do if not equal(cjson.decode(redis.call('HGET',KEYS[2],v[1]) or 'null'),cjson.decode(v[2])) then return -1 end end; local writes=cjson.decode(ARGV[3]); for _,v in ipairs(writes) do redis.call('HSET',v[1],v[2],v[3]) end; redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]); return 1`,2,prefix+'backup_receipts',prefix+'users',receipt.key,JSON.stringify(receipt),JSON.stringify(writes),JSON.stringify(expectedUsers.map(x=>[String(x.id),JSON.stringify(x)])));
 if(Number(result)===-1)throw Error('사용자 정보가 변경되었습니다. 다시 시도하세요.');return Boolean(result);
};

module.exports.appendAudit=async function(entry,limit,days){return command('EVAL',`local id=redis.call('INCR',KEYS[3]); local entry=cjson.decode(ARGV[1]); entry.id=id; redis.call('HSET',KEYS[1],tostring(id),cjson.encode(entry)); redis.call('ZADD',KEYS[2],ARGV[2],tostring(id)); local old=redis.call('ZRANGEBYSCORE',KEYS[2],'-inf',ARGV[3]); for _,key in ipairs(old) do redis.call('HDEL',KEYS[1],key);redis.call('ZREM',KEYS[2],key) end; local count=redis.call('ZCARD',KEYS[2]); if count>tonumber(ARGV[4]) then local extra=redis.call('ZRANGE',KEYS[2],0,count-tonumber(ARGV[4])-1); for _,key in ipairs(extra) do redis.call('HDEL',KEYS[1],key);redis.call('ZREM',KEYS[2],key) end end; return id`,3,prefix+'audit_logs',prefix+'audit_logs:index',prefix+'audit_logs:id',JSON.stringify(entry),Date.now(),Date.now()-days*86400000,limit);};
