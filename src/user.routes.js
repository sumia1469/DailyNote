// src/user.routes.js — 사진 기반 복원
const url = require('url');
const crypto = require('crypto');
const ds = require('./datastore');
const {sendJson, parseJsonBody} = require('./utils');
const {makeUserRecord} = require('./auth');
async function listUsers(req, res, auth) {
  const users = await ds.findAll('users');
  const safe = users.map(u => ({id: u.id, username: u.username, createdAt: u.createdAt}));
  sendJson(res, 200, safe);
}
async function createUser(req, res, auth) {
  const {username, password} = await parseJsonBody(req);
  if (!username || !password) return sendJson(res, 400, {message: 'username & password required'});
  const exists = await ds.findOne('users', u => u.username === username);
  if (exists) return sendJson(res, 409, {message: 'username already exists'});
  const record = makeUserRecord(username, password);
  record.createdAt = new Date().toISOString();
  const newUser = await ds.insert('users', record);
  sendJson(res, 201, {id: newUser.id, username: newUser.username});
}
async function updateUser(req, res, auth, id) {
  const {username, password} = await parseJsonBody(req);
  const updates = {};
  if (username) updates.username = username;
  if (password) {
    // 원본 사진에는 crypto의 require 선언이 없습니다.
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 64, 'sha512').toString('hex');
    updates.password = hash;
    updates.salt = salt;
  }
  if (Object.keys(updates).length === 0) return sendJson(res, 400, {message: 'Nothing to update'});
  const updated = await ds.update('users', id, updates);
  if (!updated) return sendJson(res, 404, {message: 'User not found'});
  sendJson(res, 200, {id: updated.id, username: updated.username});
}
async function deleteUser(req, res, auth, id) {
  const ok = await ds.remove('users', id);
  if (!ok) return sendJson(res, 404, {message: 'User not found'});
  sendJson(res, 200, {message: 'User deleted'});
}
async function userRouter(req, res, auth) {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const id = parts[2] ? Number(parts[2]) : null;
  const method = req.method.toUpperCase();
  // 원본: 모든 인증된 사용자를 관리자라고 가정합니다.
  if (method === 'GET' && !id) return listUsers(req, res, auth);
  if (method === 'POST' && !id) return createUser(req, res, auth);
  if (method === 'PUT' && id) return updateUser(req, res, auth, id);
  if (method === 'DELETE' && id) return deleteUser(req, res, auth, id);
  sendJson(res, 404, {message: 'User API not found'});
}
module.exports = {userRouter};
