// src/utils.js — 사진 기반 복원
const fs = require('fs');
const path = require('path');
function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)});
  res.end(payload);
}
function sendFile(res, filePath, mime) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, {'Content-Type': mime});
    res.end(data);
  });
}
function parseJsonBody(req) {
  if (req.body !== undefined) {
    try { return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); }
    catch { return Promise.resolve({}); }
  }
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
  });
}
function parseBase64Upload(body) {
  const {filename, mime, data} = body;
  if (!filename || !data) return null;
  const buffer = Buffer.from(data, 'base64');
  return {filename, mime, buffer};
}
module.exports = {sendJson, sendFile, parseJsonBody, parseBase64Upload};
