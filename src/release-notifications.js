const ds = require('./datastore');
const releases = require('./releases.json');
async function ensureReleaseNotifications(users) {
  for (const user of users) {
    if (user.active === false || ['pending', 'rejected'].includes(user.approval)) continue;
    for (const release of releases) {
      if (Date.parse(release.publishedAt) > Date.now()) continue;
      await ds.insertOnce('notifications', `${release.id}:${user.id}`, {
        userId: user.id, message: release.message, isRead: false,
        createdAt: release.publishedAt, releaseId: release.id
      });
    }
  }
}
module.exports = {ensureReleaseNotifications};
