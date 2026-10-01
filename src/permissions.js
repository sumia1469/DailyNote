const keys = ['notifications', 'files', 'appearance', 'users', 'permissions'];
function roleOf(user) { return user.role || (Number(user.id) === 1 ? 'admin' : 'member'); }
function rightsOf(user) {
  return Object.fromEntries(keys.map(key => [key, roleOf(user) === 'admin' || user.permissions?.[key] === true]));
}
function safeUser(user) {
  return {id:user.id, username:user.username, role:roleOf(user), active:user.active !== false,
    permissions:rightsOf(user), approval:user.approval || 'approved', mustChangePassword:user.mustChangePassword===true, createdAt:user.createdAt};
}
module.exports = {keys, roleOf, rightsOf, safeUser};
