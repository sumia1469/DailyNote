// Free seats are enforced by the server and storage; client input cannot raise this cap.
const FREE_USER_LIMIT = 6;
const contact = 'sumia1469@gmail.com';
function usesSeat(user) {
  return user.active !== false && (!user.approval || user.approval === 'approved');
}
function licenseError(count) {
  const error = new Error(`무료 사용은 관리자 포함 최대 ${FREE_USER_LIMIT}명입니다. 7명 이상 사용하려면 이노마인드랩스(${contact})에 라이선스를 문의하세요.`);
  error.code = 'LICENSE_USER_LIMIT';
  error.status = 403;
  error.details = {limit:FREE_USER_LIMIT, activeUserCount:count, contact};
  return error;
}
function assertSeatChange(users, previous, next) {
  const count = users.filter(usesSeat).length;
  if (usesSeat(next) && (!previous || !usesSeat(previous)) && count >= FREE_USER_LIMIT) throw licenseError(count);
}
async function status() {
  const count = (await require('./datastore').findAll('users')).filter(usesSeat).length;
  return {company:'이노마인드랩스', contact, limit:FREE_USER_LIMIT, activeUserCount:count,
    remaining:Math.max(0,FREE_USER_LIMIT-count), atLimit:count>=FREE_USER_LIMIT, overLimit:count>FREE_USER_LIMIT};
}
module.exports = {FREE_USER_LIMIT, usesSeat, assertSeatChange, licenseError, status};
