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
  if (!user) return sendJson(res, 401, { message: '아이디 또는 비밀번호를 확인하세요.' });
  const saltBuf = Buffer.from(user.salt, 'hex');
  const hashBuf = hashPassword(password, saltBuf);
  const storedBuf = Buffer.from(user.password, 'hex');
  if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
    return sendJson(res, 401, { message: 'Invalid password' });
  }
  if (user.active === false || (user.approval && user.approval !== 'approved')) return sendJson(res, 403, {message: user.approval === 'pending' ? '관리자 승인을 기다리고 있습니다. 승인 후 로그인해 주세요.' : user.approval === 'rejected' ? '가입신청이 반려되었습니다. 관리자에게 문의해 주세요.' : '비활성화된 계정입니다. 관리자에게 문의해 주세요.'});
  const license = await require('./license').status();
  if (license.overLimit && require('./permissions').roleOf(user) !== 'admin' && !require('./permissions').rightsOf(user).users) throw require('./license').licenseError(license.activeUserCount);
  sendJson(res, 200, await createLoginSession(user));
}

async function createLoginSession(user) {
  const token = crypto.randomBytes(48).toString('hex');
  const expires = new Date(Date.now() + (cfg.TOKEN_EXPIRES_HOURS || 24) * 3600 * 1000);
  await ds.insertSession({
    token, userId: user.id, username: user.username,
    expiresAt: expires.toISOString(),
    createdAt: new Date(Math.max(Date.now(), (Date.parse(user.passwordResetAt)||0)+1)).toISOString()
  });
  return { token, userId: user.id, username: user.username, mustChangePassword:user.mustChangePassword===true };
}

async function verifyToken(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  await ds.deleteExpiredSessions();
  const sess = await ds.findSessionByToken(token);
  if (!sess) return null;
  const user = await ds.findOne('users', u => u.id === sess.userId);
  if (!user || user.active === false || (user.approval && user.approval !== 'approved')) return null;
  if (user.passwordResetAt && (!sess.createdAt || new Date(sess.createdAt).getTime() <= new Date(user.passwordResetAt).getTime())) return null;
  const {roleOf, rightsOf} = require('./permissions');
  return { userId: user.id, username: user.username, role: roleOf(user), permissions: rightsOf(user), mustChangePassword:user.mustChangePassword===true };
}

async function changePasswordHandler(req,res,auth) {
  const body=await require('./utils').parseJsonBody(req);
  if(typeof body.currentPassword!=='string')return sendJson(res,400,{message:'현재 또는 임시 비밀번호를 입력하세요.'});
  if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)return sendJson(res,400,{message:'새 비밀번호는 8~128자로 입력하세요.'});
  if(body.password!==body.passwordConfirmation)return sendJson(res,400,{message:'비밀번호 확인이 일치하지 않습니다.'});
  if(body.password===body.currentPassword)return sendJson(res,400,{message:'임시 또는 기존 비밀번호와 다른 비밀번호를 입력하세요.'});
  const user=await ds.findOne('users',u=>u.id===auth.userId);
  if(!crypto.timingSafeEqual(hashPassword(body.currentPassword,Buffer.from(user.salt,'hex')),Buffer.from(user.password,'hex')))return sendJson(res,400,{message:'현재 또는 임시 비밀번호가 올바르지 않습니다.'});
  const updated=await ds.update('users',user.id,{...makeUserRecord(user.username,body.password),mustChangePassword:false,passwordResetAt:new Date().toISOString()});
  return sendJson(res,200,{...await createLoginSession(updated),message:'비밀번호를 변경했습니다.'});
}

function makeUserRecord(username, password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPassword(password, Buffer.from(salt, 'hex')).toString('hex');
  return { username, password: hash, salt };
}

async function registerHandler(req, res) {
  const body = await require('./utils').parseJsonBody(req);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  if (!/^[a-zA-Z0-9가-힣._-]{2,40}$/.test(username)) return sendJson(res,400,{message:'아이디는 2~40자의 한글·영문·숫자·점·밑줄·하이픈으로 입력하세요.'});
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return sendJson(res,400,{message:'비밀번호는 8~128자로 입력하세요.'});
  if (body.password !== body.passwordConfirmation) return sendJson(res,400,{message:'비밀번호 확인이 일치하지 않습니다.'});
  if (await ds.findOne('users', user => user.username === username)) return sendJson(res,409,{message:'이미 등록되었거나 승인 대기 중인 아이디입니다.'});
  const license = await require('./license').status();
  if (license.atLimit) throw require('./license').licenseError(license.activeUserCount);
  await ds.insert('users',{...makeUserRecord(username,body.password),role:'member',permissions:{},active:false,approval:'pending',createdAt:new Date().toISOString()});
  return sendJson(res,201,{message:'사용자 등록신청을 완료했습니다. 관리자 승인 후 로그인할 수 있습니다.'});
}
module.exports = { loginHandler, verifyToken, makeUserRecord, registerHandler, changePasswordHandler };
