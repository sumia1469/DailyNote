// Redis checks capacity and writes the account in one atomic operation across instances.
module.exports = `
local function seat(user)
  -- Match license.usesSeat: legacy falsy approval values mean no approval status.
  local approval = user.approval
  return user.active ~= false and (not approval or approval == cjson.null or approval == '' or approval == 0 or approval == 'approved')
end
local previous = nil
if ARGV[1] ~= '' then
  local raw = redis.call('HGET', KEYS[1], ARGV[1])
  if not raw then return false end
  previous = cjson.decode(raw)
end
local nextUser = previous or {}
local wasActive = previous and seat(previous)
local changes = cjson.decode(ARGV[2])
for key, value in pairs(changes) do nextUser[key] = value end
local count = 0
for _, raw in ipairs(redis.call('HVALS', KEYS[1])) do
  if seat(cjson.decode(raw)) then count = count + 1 end
end
if seat(nextUser) and not wasActive and count >= tonumber(ARGV[3]) then
  return cjson.encode({code='LICENSE_USER_LIMIT', count=count})
end
if not previous then nextUser.id = redis.call('INCR', KEYS[2]) end
local saved = cjson.encode(nextUser)
redis.call('HSET', KEYS[1], tostring(nextUser.id), saved)
return saved
`;
