// src/worklog.routes.js — 사진 기반 복원
const url = require('url');
const ds = require('./datastore');
const {sendJson, parseJsonBody} = require('./utils');
async function getWorkLogs(req, res, auth) {
  const parsed = url.parse(req.url, true);
  const date = parsed.query.date;
  const all = await ds.findAll('work_logs');
  let list = all.filter(w => w.userId === auth.userId);
  if (date) list = list.filter(w => w.workDate === date);
  list.sort((a, b) => (a.workDate < b.workDate ? 1 : -1));
  sendJson(res, 200, list);
}
async function createWorkLog(req, res, auth) {
  const {workDate, todo, nextDayPlan, remarks, memo, remarksItems, memoItems} = await parseJsonBody(req);
  if((remarksItems!==undefined&&(!Array.isArray(remarksItems)||typeof remarks!=='string'))||(memoItems!==undefined&&(!Array.isArray(memoItems)||typeof memo!=='string')))return sendJson(res,400,{message:'비고·메모 항목은 본문과 항목 배열을 함께 입력하세요.'});
  if (!workDate || !todo) return sendJson(res, 400, {message: 'workDate & todo required'});
  const newLog = await ds.insert('work_logs', {
    userId: auth.userId, workDate, todo, completed: false,
    ...(Array.isArray(remarksItems)?{remarksItems}:{}),...(Array.isArray(memoItems)?{memoItems}:{}),
    nextDayPlan: nextDayPlan || [], remarks: remarks || '', memo: memo || '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  sendJson(res, 201, {id: newLog.id});
}
async function updateWorkLog(req, res, auth, id) {
  if (!await ds.findOne('work_logs', w => w.id === id && w.userId === auth.userId)) return sendJson(res, 404, {message: 'Worklog not found'});
  const payload = await parseJsonBody(req);
  for(const key of ['remarks','memo']){if(payload[key+'Items']!==undefined&&(!Array.isArray(payload[key+'Items'])||typeof payload[key]!=='string'))return sendJson(res,400,{message:'비고·메모 항목은 본문과 항목 배열을 함께 입력하세요.'});}
  const allowed = ['workDate', 'todo', 'completed', 'nextDayPlan', 'remarks', 'memo', 'remarksItems', 'memoItems'];
  const updates = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) updates[key] = payload[key];
  }
  if (Object.keys(updates).length === 0) return sendJson(res, 400, {message: 'No updatable fields'});
  for(const key of ['remarks','memo'])if(payload[key]!==undefined&&payload[key+'Items']===undefined)updates[key+'Items']=null;
  updates.updatedAt = new Date().toISOString();
  const updated = await ds.update('work_logs', id, updates);
  if (!updated) return sendJson(res, 404, {message: 'Worklog not found'});
  sendJson(res, 200, {message: 'Updated'});
}
async function deleteWorkLog(req, res, auth, id) {
  if (!await ds.findOne('work_logs', w => w.id === id && w.userId === auth.userId)) return sendJson(res, 404, {message: 'Worklog not found'});
  const ok = await ds.remove('work_logs', id);
  if (!ok) return sendJson(res, 404, {message: 'Worklog not found'});
  sendJson(res, 200, {message: 'deleted'});
}
async function worklogRouter(req, res, auth) {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const id = parts[2] ? Number(parts[2]) : null;
  const method = req.method.toUpperCase();
  if (method === 'GET' && !id) return getWorkLogs(req, res, auth);
  if (method === 'POST' && !id) return createWorkLog(req, res, auth);
  if (method === 'PUT' && id) return updateWorkLog(req, res, auth, id);
  if (method === 'DELETE' && id) return deleteWorkLog(req, res, auth, id);
  sendJson(res, 404, {message: 'Worklog API not found'});
}
module.exports = {worklogRouter};
