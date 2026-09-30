// src/auth.js — photographed source reconstruction
const crypto = require('crypto');
const ds = require('./datastore');
const { sendJson } = require('./utils');
const cfg = require('./config');

function hashPassword(password, saltBuffer) {
  return crypto.pbkdf2Sync(password, saltBuffer, 100000, 64, 'sha512');
}

async function loginHandler(req, res) {
  const { username, password } = await require('./utils').parseJsonBody(req);
  if (!username || !password) return sendJson(res, 400, { message: 'Missing credentials' });
  const user = await ds.findOne('users', u => u.username === username);
  if (!user) return sendJson(res, 401, { message: 'Invalid user' });
  const saltBuf = Buffer.from(user.salt, 'hex');
  const hashBuf = hashPassword(password, saltBuf);
  const storedBuf = Buffer.from(user.password, 'hex');
  if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
    return sendJson(res, 401, { message: 'Invalid password' });
  }
  const token = crypto.randomBytes(48).toString('hex');
  const expires = new Date(Date.now() + (cfg.TOKEN_EXPIRES_HOURS || 24) * 3600 * 1000);
  await ds.insertSession({
    token, userId: user.id, username: user.username,
    expiresAt: expires.toISOString(), createdAt: new Date().toISOString()
  });
  sendJson(res, 200, { token, userId: user.id, username: user.username });
}

async function verifyToken(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  await ds.deleteExpiredSessions();
  const sess = await ds.findSessionByToken(token);
  if (!sess) return null;
  return { userId: sess.userId, username: sess.username };
}

function makeUserRecord(username, password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPassword(password, Buffer.from(salt, 'hex')).toString('hex');
  return { username, password: hash, salt };
}

module.exports = { loginHandler, verifyToken, makeUserRecord };
