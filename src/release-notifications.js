const {ensure}=require('./notice-posts');
// Kept as an adapter for existing callers; releases are now shared posts.
module.exports={ensureReleaseNotifications:ensure};
