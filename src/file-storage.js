const fs = require('fs').promises;
const path = require('path');
const dir = process.env.UPLOAD_DIR || path.join(__dirname,'../uploads');
module.exports = {
 async write(name,buffer) { if(process.env.UPSTASH_REDIS_REST_URL) return require('./redis-store').command('SET','dailyNote:file:'+name,buffer.toString('base64')); await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name),buffer); },
 async read(name) { if(process.env.UPSTASH_REDIS_REST_URL) {const v=await require('./redis-store').command('GET','dailyNote:file:'+name);if(v===null) return null;return Buffer.from(v,'base64');}try{return await fs.readFile(path.join(dir,name));}catch(e){if(e.code==='ENOENT')return null;throw e;} },
 async remove(name) { if(process.env.UPSTASH_REDIS_REST_URL) return require('./redis-store').command('DEL','dailyNote:file:'+name);await fs.unlink(path.join(dir,name)).catch(e=>{if(e.code!=='ENOENT')throw e;}); }
};
