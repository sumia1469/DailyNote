// src/upload.routes.js — 사진 기반 복원
const url = require('url');
const path = require('path');
const crypto = require('crypto');
const ds = require('./datastore');
const {sendJson, parseJsonBody, parseBase64Upload} = require('./utils');
const storage = require('./file-storage');
const CHUNK=512*1024;
async function removeStored(file){
 if(file.chunkCount){for(let i=0;i<file.chunkCount;i+=8)await Promise.all(Array.from({length:Math.min(8,file.chunkCount-i)},(_,j)=>storage.remove(file.storedName+'.'+(i+j))));}
 else if(file.storedName)await storage.remove(file.storedName);
}
async function cleanupPending(userId){
 const all=await ds.findAll('files');
 for(const file of all.filter(f=>f.userId===userId&&f.status==='uploading'&&Date.parse(f.uploadUpdatedAt||f.uploadedAt)<Date.now()-86400000)){
  await removeStored({...file,chunkCount:Math.min(file.chunkCount,file.receivedChunks+1)});await ds.remove('files',file.id);
 }
}
async function chunkUpload(body,res,auth){
 if(body.phase==='start'){
  if(typeof body.filename!=='string'||!body.filename.trim()||body.filename.length>255||!Number.isSafeInteger(body.size)||body.size<0||typeof body.mime!=='string'||body.mime.length>100||(body.mime&&!/^[\w.+-]+\/[\w.+-]+$/.test(body.mime)))return sendJson(res,400,{message:'파일 정보를 확인해 주세요.'});
  await cleanupPending(auth.userId);
  const file=await ds.insert('files',{userId:auth.userId,originalName:path.basename(body.filename.replace(/\\/g,'/')),storedName:crypto.randomBytes(24).toString('hex'),mimeType:body.mime||'application/octet-stream',sizeBytes:body.size,chunkCount:Math.max(1,Math.ceil(body.size/CHUNK)),receivedChunks:0,status:'uploading',uploadedAt:new Date().toISOString()});
  return sendJson(res,201,{id:file.id,chunkSize:CHUNK});
 }
 const file=await ds.findOne('files',f=>f.id===body.id&&f.userId===auth.userId);
 if(!file||file.status!=='uploading')return sendJson(res,404,{message:'진행 중인 업로드를 찾지 못했습니다.'});
 if(body.phase==='cancel'){await removeStored({...file,chunkCount:Math.min(file.chunkCount,file.receivedChunks+1)});await ds.remove('files',file.id);return sendJson(res,200,{message:'업로드를 취소했습니다.'});}
 if(body.phase!=='part'||!Number.isSafeInteger(body.index)||body.index!==file.receivedChunks||typeof body.data!=='string'||body.data.length>Math.ceil(CHUNK/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data))return sendJson(res,400,{message:'파일 조각을 확인해 주세요.'});
 const buffer=Buffer.from(body.data,'base64');
 const expected=Math.min(CHUNK,file.sizeBytes-body.index*CHUNK);
 if(buffer.length!==expected)return sendJson(res,400,{message:'파일 조각 크기가 올바르지 않습니다.'});
 await storage.write(file.storedName+'.'+body.index,buffer);
 const complete=body.index+1===file.chunkCount;
 await ds.update('files',file.id,{receivedChunks:body.index+1,uploadUpdatedAt:new Date().toISOString(),...(complete?{status:'ready'}:{})});
 return sendJson(res,complete?201:200,{id:file.id,complete});
}
async function uploadHandler(req, res, auth) {
  const body = await parseJsonBody(req);
  if(body.phase){req.auditSkip=body.phase==='part';return chunkUpload(body,res,auth);}
  const file = parseBase64Upload(body);
  if (!file) return sendJson(res, 400, {message: 'Invalid upload payload'});
  file.filename = path.basename(file.filename.replace(/\\/g, '/'));
  if (!file.filename) return sendJson(res, 400, {message: '파일 이름을 확인해 주세요.'});
  const storedName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${file.filename}`;
  await storage.write(storedName, file.buffer);
  const meta = await ds.insert('files', {
    userId: auth.userId, originalName: file.filename, storedName,
    mimeType: file.mime || 'application/octet-stream', sizeBytes: file.buffer.length,
    uploadedAt: new Date().toISOString()
  });
  sendJson(res, 201, {id: meta.id, message: 'File uploaded'});
}
async function downloadHandler(req, res, auth, fileId) {
  const file = await ds.findOne('files', f => f.id === fileId && f.userId === auth.userId);
  if (!file||file.status==='uploading') return sendJson(res, 404, {message: 'File not found'});
  if(file.chunkCount){
    const part=new URL(req.url,'http://localhost').searchParams.get('part');
    if(part===null)return sendJson(res,200,{chunkCount:file.chunkCount,sizeBytes:file.sizeBytes,mimeType:file.mimeType});
    const index=Number(part);
    if(!/^\d+$/.test(part)||!Number.isSafeInteger(index)||index<0||index>=file.chunkCount)return sendJson(res,400,{message:'파일 조각 번호가 올바르지 않습니다.'});
    const chunk=await storage.read(file.storedName+'.'+index);
    if(!chunk)return sendJson(res,404,{message:'파일 조각을 찾지 못했습니다.'});
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':chunk.length});return res.end(chunk);
  }
  const buffer = await storage.read(file.storedName);
  if (!buffer) return sendJson(res, 404, {message: 'File not found'});
  const mime = file.mimeType || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    'Content-Length': file.sizeBytes
  });
  res.end(buffer);
}
async function listFiles(req, res, auth) {
  await cleanupPending(auth.userId);
  const all = await ds.findAll('files');
  const mine = all.filter(f => f.userId === auth.userId&&f.status!=='uploading');
  sendJson(res, 200, mine);
}
async function deleteHandler(req, res, auth, fileId) {
  const file = await ds.findOne('files', item => Number(item.id) === Number(fileId) && Number(item.userId) === Number(auth.userId));
  if (!file) return sendJson(res, 404, {message: 'File not found'});
  await removeStored(file);
  await ds.remove('files', file.id);
  return sendJson(res, 200, {id: file.id, message: 'File deleted'});
}
async function uploadRouter(req, res, auth) {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const id = parts[2] ? Number(parts[2]) : null;
  const method = req.method.toUpperCase();
  if (method === 'POST' && !id) return uploadHandler(req, res, auth);
  if (method === 'GET' && id) return downloadHandler(req, res, auth, id);
  if (method === 'GET' && !id) return listFiles(req, res, auth);
  if (method === 'DELETE' && id) return deleteHandler(req, res, auth, id);
  sendJson(res, 404, {message: 'Upload API not found'});
}
module.exports = {uploadRouter,downloadHandler,removeStored};


