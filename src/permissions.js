const adminKeys = ['backups','logs','boards','notifications', 'files', 'appearance', 'users', 'permissions'];
const basicKeys = ['boardRead','boardCreate','boardEdit','boardDelete','calendarRead','calendarCreate','calendarEdit','calendarDelete','worklogRead','worklogCreate','worklogEdit','worklogDelete','fileRead','fileUpload','fileDownload','fileDelete','notificationRead','memoRead','memoCreate','memoEdit','memoDelete'];
const keys = [...adminKeys,...basicKeys];
function roleOf(user) { return user.role || (Number(user.id) === 1 ? 'admin' : 'member'); }
function rightsOf(user) {
  return Object.fromEntries(keys.map(key => [key, roleOf(user) === 'admin' || (!['backups','logs'].includes(key) && (basicKeys.includes(key) ? user.permissions?.[key] !== false : user.permissions?.[key] === true))]));
}
function safeUser(user) {
  return {id:user.id, username:user.username, role:roleOf(user), active:user.active !== false,
    permissions:rightsOf(user), approval:user.approval || 'approved', mustChangePassword:user.mustChangePassword===true, createdAt:user.createdAt};
}
module.exports = {keys, adminKeys, basicKeys, roleOf, rightsOf, safeUser};



