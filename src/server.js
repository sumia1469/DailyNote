// src/server.js — 사진 기반 복원
const http = require('http');
const url = require('url');
const path = require('path');
const cfg = require('./config');
const {sendJson, sendFile} = require('./utils');
const {loginHandler, verifyToken, registerHandler, changePasswordHandler} = require('./auth');
const {userRouter} = require('./user.routes');
const {notificationRouter} = require('./notification.routes');
const {uploadRouter} = require('./upload.routes');
const {worklogRouter} = require('./worklog.routes');
const {adminRouter, settingsHandler} = require('./admin.routes');
const {calendarRouter} = require('./calendar.routes');
const {memoRouter} = require('./memo.routes');
const PORT = cfg.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const ext = path.extname(pathname).toLowerCase();
  const mime = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm',
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json'
  }[ext] || 'application/octet-stream';
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, {message: 'Forbidden'});
  sendFile(res, filePath, mime);
}
async function handleApi(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  if (pathname === '/api/auth/login' && req.method === 'POST') return loginHandler(req, res);
  if (pathname === '/api/auth/register' && req.method === 'POST') return registerHandler(req,res);
  if (req.method === 'GET' && (pathname === '/api/settings' || pathname === '/api/background/1')) return settingsHandler(req, res);
  const authInfo = await verifyToken(req);
  if (!authInfo) return sendJson(res, 401, {message: 'Invalid or missing token'});
  if (pathname === '/api/license' && req.method === 'GET') return sendJson(res,200,await require('./license').status());
  if (pathname === '/api/auth/me' && req.method === 'GET') return sendJson(res, 200, authInfo);
  if (pathname === '/api/auth/change-password' && req.method === 'POST') return changePasswordHandler(req,res,authInfo);
  if (authInfo.mustChangePassword) return sendJson(res,403,{code:'PASSWORD_CHANGE_REQUIRED',message:'비밀번호를 변경한 후 이용해 주세요.'});
  const license = await require('./license').status();
  const recovery = /^\/api\/admin\/(users|permissions|directory)(\/|$)/.test(pathname);
  if (license.overLimit && !recovery) throw require('./license').licenseError(license.activeUserCount);
  let basicRight;
  if(pathname.startsWith('/api/calendar')) basicRight={GET:'calendarRead',POST:'calendarCreate',PUT:'calendarEdit',DELETE:'calendarDelete'}[req.method];
  if(pathname.startsWith('/api/memos')) basicRight={GET:'memoRead',POST:'memoCreate',PUT:'memoEdit',DELETE:'memoDelete'}[req.method];
  if(pathname.startsWith('/api/worklogs')) basicRight={GET:'worklogRead',POST:'worklogCreate',PUT:'worklogEdit',DELETE:'worklogDelete'}[req.method];
  if(pathname.startsWith('/api/files')||pathname.startsWith('/api/upload')) basicRight=req.method==='GET'?(pathname.split('/').filter(Boolean)[2]?'fileDownload':'fileRead'):{POST:'fileUpload',DELETE:'fileDelete'}[req.method];
  if(pathname.startsWith('/api/notifications')&&['GET','PUT'].includes(req.method)) basicRight='notificationRead';
  if(basicRight&&!authInfo.permissions[basicRight])return sendJson(res,403,{code:'PERMISSION_DENIED',message:'이 작업을 사용할 권한이 없습니다. 관리자에게 문의해 주세요.'});
  if (pathname === '/api/calendar' || pathname.startsWith('/api/calendar/')) return calendarRouter(req,res,authInfo);
  if (pathname.startsWith('/api/admin/')) return adminRouter(req, res, authInfo);
  if (pathname.startsWith('/api/users')) return userRouter(req, res, authInfo);
  if (pathname.startsWith('/api/notifications')) return notificationRouter(req, res, authInfo);
  if (pathname.startsWith('/api/upload')) return uploadRouter(req, res, authInfo);
  if (pathname.startsWith('/api/files')) return uploadRouter(req, res, authInfo);
  if (pathname === '/api/memos' || pathname.startsWith('/api/memos/')) return memoRouter(req,res,authInfo);
  if (pathname.startsWith('/api/worklogs')) return worklogRouter(req, res, authInfo);
  sendJson(res, 404, {message: 'API endpoint not found'});
}
async function handler(req, res) {
 try {
  // Vercel rewrites the public API URL to this single function entry point.
  const incoming = new URL(req.url, 'http://localhost');
  if (incoming.pathname === '/api/index' && incoming.searchParams.has('path')) {
   const route = incoming.searchParams.get('path').replace(/^\/+/, '');
   incoming.pathname = '/api/' + route;
   incoming.searchParams.delete('path');
   req.url = incoming.pathname + incoming.search;
  }
  const parsed = url.parse(req.url);
  if (!parsed.pathname.startsWith('/api/')) return serveStatic(req, res);
  if (process.env.VERCEL && !(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL)) return sendJson(res, 503, {message: '데이터 저장소가 연결되지 않았습니다. Vercel에서 Redis 환경 변수를 설정해 주세요.'});
  if ((process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL)) await require('./redis-store').initialize();
  await handleApi(req, res);
 } catch (error) {
  console.error(error.message);
  if (!res.headersSent && error.code === 'LICENSE_USER_LIMIT') return sendJson(res,403,{code:error.code,message:error.message,...error.details});
  if (!res.headersSent) sendJson(res, 500, {message: 'Server error'});
  else res.end();
 }
}
module.exports = handler;
if (require.main === module) {
 http.createServer(handler).listen(PORT, () => console.log(`dailyNote http://localhost:${PORT}`));
}


