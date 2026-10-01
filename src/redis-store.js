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
