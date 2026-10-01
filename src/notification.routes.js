// src/notification.routes.js — 사진 기반 복원
const url = require('url');
const ds = require('./datastore');
const posts=require('./notice-posts');
const {sendJson, parseJsonBody} = require('./utils');
async function listNoti(req, res, auth) {
  const mine=await posts.listUser(auth.userId);
  sendJson(res, 200, mine.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt) || b.id-a.id));
}
async function detailNoti(req,res,auth,id){const note=await posts.getUser(id,auth.userId);if(!note)return sendJson(res,404,{message:'Notification not found'});return sendJson(res,200,note);}
async function createNoti(req, res, auth) {
  const {userId, message} = await parseJsonBody(req);
  if (Number(userId) !== auth.userId && !auth.permissions.notifications) return sendJson(res, 403, {message: '공지 관리 권한이 필요합니다.'});
  if (!userId || !message) return sendJson(res, 400, {message: 'userId & message required'});
  const newNoti = await ds.insert('notifications', {userId, message, isRead: false, createdAt: new Date().toISOString()});
  sendJson(res, 201, {id: newNoti.id});
}
async function markRead(req, res, auth, id) {
  if (!await posts.markRead(id,auth.userId)) return sendJson(res,404,{message:'Notification not found'});
  sendJson(res, 200, {message: 'Marked as read'});
}
async function notificationRouter(req, res, auth) {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const id = parts[2] ? Number(parts[2]) : null;
  const method = req.method.toUpperCase();
  if (method === 'GET' && id) return detailNoti(req,res,auth,id);
  if (method === 'GET' && !id) return listNoti(req, res, auth);
  if (method === 'POST' && !id) return createNoti(req, res, auth);
  if (method === 'PUT' && id) return markRead(req, res, auth, id);
  sendJson(res, 404, {message: 'Notification API not found'});
}
module.exports = {notificationRouter};

