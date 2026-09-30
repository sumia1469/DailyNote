// src/server.js — 사진 기반 복원
const http = require('http');
const url = require('url');
const path = require('path');
const cfg = require('./config');
const {sendJson, sendFile} = require('./utils');
const {loginHandler, verifyToken} = require('./auth');
const {userRouter} = require('./user.routes');
const {notificationRouter} = require('./notification.routes');
const {uploadRouter} = require('./upload.routes');
const {worklogRouter} = require('./worklog.routes');
const PORT = cfg.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const ext = path.extname(pathname).toLowerCase();
  const mime = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json'
  }[ext] || 'application/octet-stream';
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, {message: 'Forbidden'});
  sendFile(res, filePath, mime);
}
async function handleApi(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  if (pathname === '/api/auth/login' && req.method === 'POST') return loginHandler(req, res);
  const authInfo = await verifyToken(req);
  if (!authInfo) return sendJson(res, 401, {message: 'Invalid or missing token'});
  if (pathname.startsWith('/api/users')) return userRouter(req, res, authInfo);
  if (pathname.startsWith('/api/notifications')) return notificationRouter(req, res, authInfo);
  if (pathname.startsWith('/api/upload')) return uploadRouter(req, res, authInfo);
  if (pathname.startsWith('/api/files')) return uploadRouter(req, res, authInfo);
  if (pathname.startsWith('/api/worklogs')) return worklogRouter(req, res, authInfo);
  sendJson(res, 404, {message: 'API endpoint not found'});
}
async function handler(req, res) {
 try {
  if (process.env.VERCEL && !process.env.UPSTASH_REDIS_REST_URL) return sendJson(res, 503, {message: 'Configure persistent Redis storage before testing.'});
  if (process.env.UPSTASH_REDIS_REST_URL) await require('./redis-store').initialize();
  const parsed = url.parse(req.url);
  if (parsed.pathname.startsWith('/api/')) await handleApi(req, res);
  else serveStatic(req, res);
 } catch (error) {
  console.error(error.message);
  if (!res.headersSent) sendJson(res, 500, {message: 'Server error'});
  else res.end();
 }
}
module.exports = handler;
if (require.main === module) {
 http.createServer(handler).listen(PORT, () => console.log(`dailyNote http://localhost:${PORT}`));
}

