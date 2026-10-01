const ds = require('./datastore');
const {sendJson, parseJsonBody} = require('./utils');
function profileOf(user) {
  return {nickname:user.nickname || '', avatar:user.avatar || ''};
}
async function updateProfile(req,res,auth) {
  const body = await parseJsonBody(req);
  if (!body || typeof body.nickname !== 'string' || body.nickname.trim().length > 40 || /[\u0000-\u001f\u007f]/.test(body.nickname)) return sendJson(res,400,{message:'별명은 40자 이내로 입력하세요.'});
  if (typeof body.avatar !== 'string' || body.avatar.length > 400000 || (body.avatar && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.avatar))) return sendJson(res,400,{message:'프로필 사진은 PNG·JPG·WebP 이미지로 등록하세요.'});
  if (body.avatar) {
    const mime=body.avatar.match(/^data:image\/(\w+);/)[1], bytes=Buffer.from(body.avatar.split(',')[1],'base64');
    const valid=mime==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if(!valid)return sendJson(res,400,{message:'올바른 이미지 파일을 선택하세요.'});
  }
  // The session identifies the owner; client-supplied IDs and other fields are ignored.
  const user=await ds.update('users',auth.userId,{nickname:body.nickname.trim(),avatar:body.avatar});
  return sendJson(res,200,profileOf(user));
}
module.exports={profileOf,updateProfile};
