// src/upload.routes.js — 사진 기반 복원
const url = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ds = require('./datastore');
const {sendJson, parseJsonBody, parseBase64Upload} = require('./utils');
const storage = require('./file-storage');
async function uploadHandler(req, res, auth) {
  const body = await parseJsonBody(req);
  const file = parseBase64Upload(body);
  if (!file) return sendJson(res, 400, {message: 'Invalid upload payload'});
  file.filename = path.basename(file.filename.replace(/\\/g, '/'));
  if (!file.filename || file.buffer.length > 3 * 1024 * 1024) return sendJson(res, 400, {message: 'File must be at most 3 MB'});
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
  if (!file) return sendJson(res, 404, {message: 'File not found'});
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
  const all = await ds.findAll('files');
  const mine = all.filter(f => f.userId === auth.userId);
  sendJson(res, 200, mine);
}
async function deleteHandler(req, res, auth, fileId) {
  const file = await ds.findOne('files', item => Number(item.id) === Number(fileId) && Number(item.userId) === Number(auth.userId));
  if (!file) return sendJson(res, 404, {message: 'File not found'});
  const removed = await ds.remove('files', file.id);
  if (file.storedName) await storage.remove(file.storedName);
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
module.exports = {uploadRouter};
