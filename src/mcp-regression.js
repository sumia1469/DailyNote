'use strict';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const execFileAsync=promisify(execFile);
const root=join(__dirname,'..');
const SUITES={
 mcp:['test/mcp.test.js','test/mcp-integration.test.js'],
 ui:['test/ui-contract.test.js']
};
function available(){
 return process.env.DAILYNOTE_MCP_TEST_MODE==='1'
  && !process.env.VERCEL
  && !process.env.REDIS_URL
  && !process.env.UPSTASH_REDIS_REST_URL
  && process.env.NODE_ENV!=='production';
}
let running=false,lastRun=0;
async function run(suite){
 if(running||Date.now()-lastRun<30000)throw Error('Regression test is busy or cooling down');
 if(!available())throw Error('Regression tests require an isolated local test environment');
 const files=SUITES[suite];
 if(!files)throw Error('Unknown test suite');
 running=true;lastRun=Date.now();
 let dir;
 try{dir=await mkdtemp(join(tmpdir(),'dailynote-mcp-regression-'));}catch(error){running=false;throw error;}
 try{
  const env={...process.env,DATA_DIR:dir,UPLOAD_DIR:join(dir,'uploads'),DAILYNOTE_MCP_ADMIN_WRITES:'0',DAILYNOTE_MCP_TEST_MODE:'0'};
  for(const key of ['REDIS_URL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','VERCEL','ADMIN_PASSWORD','DAILYNOTE_MCP_TOKEN'])delete env[key];
  const started=Date.now();
  try{
   const {stdout}=await execFileAsync(process.execPath,['--test',...files],{cwd:root,env,timeout:90000,maxBuffer:512*1024});
   const summary=stdout.match(/# (?:tests|pass|fail|duration_ms) [^\r\n]+/g)||[];
   return {ok:true,suite,elapsedMs:Date.now()-started,summary:summary.slice(-5)};
  }catch(error){
   return {ok:false,suite,elapsedMs:Date.now()-started,message:error.killed?'Test timed out':'Test failed',summary:String(error.stdout||'').match(/# (?:tests|pass|fail|duration_ms) [^\r\n]+/g)?.slice(-5)||[]};
  }
 }finally{running=false;await rm(dir,{recursive:true,force:true});}
}
module.exports={available,run,SUITES};
