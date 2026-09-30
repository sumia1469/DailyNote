// src/config.js — photographed source reconstruction
const fs = require('fs');
const path = require('path');
let cfg = {};
const cfgPath = path.join(__dirname, '..', 'config.json');
if (fs.existsSync(cfgPath)) {
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch (e) {
    console.error('❌ config.json 파싱 오류:', e.message);
    process.exit(1);
  }
}
cfg.PORT = process.env.PORT || cfg.PORT || 3000;
cfg.TOKEN_EXPIRES_HOURS = process.env.TOKEN_EXPIRES_HOURS || cfg.TOKEN_EXPIRES_HOURS || 24;
module.exports = cfg;
