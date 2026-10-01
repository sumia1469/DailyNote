// src/datastore.js — photographed source reconstruction
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
if (!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL)) fs.mkdirSync(DATA_DIR, {recursive: true});
const cache = {};

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
    const next = previous ? {...previous, ...changes} : {...changes, id:users.reduce((m,u)=>Math.max(m,Number(u.id)||0),0)+1};
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
  const maxId = arr.reduce((m, o) => (o.id > m ? o.id : m), 0);
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

if ((process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL)) module.exports = require('./redis-store');
