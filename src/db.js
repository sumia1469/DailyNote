// src/db.js — 사진 기반 복원. 외부 mysql CLI 사용.
const {exec} = require('child_process');
const cfg = require('./config');
const os = require('os');
function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  return `'${String(val).replace(/'/g, "''")}'`;
}
function buildSql(sql, params = []) {
  let idx = 0;
  return sql.replace(/\?/g, () => {
    const val = params[idx++];
    return escapeValue(val);
  });
}
function execMysql(sql) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, {MYSQL_PWD: cfg.DB_PASSWORD});
    const cmd = [
      'mysql', `-h${cfg.DB_HOST}`, `-P${cfg.DB_PORT}`, `-u${cfg.DB_USER}`, `-D${cfg.DB_NAME}`,
      '-B', '-N', `-e "${sql.replace(/"/g, '\\"')}"`
    ].join(' ');
    exec(cmd, {env, maxBuffer: 10 * 1024 * 1024}, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || error.message));
      resolve(stdout);
    });
  });
}
async function query(sql, params = []) {
  const realSql = buildSql(sql, params);
  const out = await execMysql(realSql);
  const isSelect = /^\s*(SELECT|SHOW|DESCRIBE|DESC)\b/i.test(sql.trim());
  if (isSelect) {
    if (!out.trim()) return [];
    const rows = out.trim().split('\n').map(line => {
      const cols = line.split('\t');
      const obj = {};
      cols.forEach((v, i) => (obj[`col${i}`] = v));
      return obj;
    });
    return rows;
  }
  const info = out.trim();
  const result = {};
  const insertMatch = info.match(/Inserted\s+(\d+)/i);
  if (insertMatch) result.insertId = Number(insertMatch[1]);
  const affectedMatch = info.match(/Rows\s+affected:\s+(\d+)/i) || info.match(/(\d+)\s+rows? affected/i);
  if (affectedMatch) result.affectedRows = Number(affectedMatch[1]);
  return result;
}
module.exports = {query};
