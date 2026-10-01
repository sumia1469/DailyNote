const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {identity,probe,openBrowser}=require('../scripts/portable-start.cjs');
test('browser launch uses native Windows and macOS handlers with URL arguments',()=>{
 const calls=[];
 const launch=(...args)=>{calls.push(args);return {on(){}};};
 const address='http://127.0.0.1:3000';
 openBrowser(address,'darwin',launch);openBrowser(address,'win32',launch);
 assert.deepEqual(calls.map(c=>c.slice(0,2)),[
  ['/usr/bin/open',[address]],['rundll32.exe',['url.dll,FileProtocolHandler',address]]
 ]);
 assert.ok(calls.every(c=>!c[2].shell));
});
test('Mac command chooses native bundled runtime and preserves paths containing spaces', {skip:process.platform==='win32'},()=>{
 const {spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'DailyNote Mac '));
 try {
  fs.copyFileSync(path.join(__dirname,'../Start_DailyNote.command'),path.join(dir,'Start_DailyNote.command'));
  const bin=path.join(dir,'shim');fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,'uname'),'#!/bin/sh\nif [ "$1" = "-s" ]; then echo Darwin; else echo "$MOCK_ARCH"; fi\n',{mode:0o755});
  for(const [arch,target] of [['arm64','darwin-arm64'],['x86_64','darwin-x64']]){
   const runtime=path.join(dir,'runtime',target,'bin');fs.mkdirSync(runtime,{recursive:true});
   fs.writeFileSync(path.join(runtime,'node'),'#!/bin/sh\nprintf "%s\\n%s\\n%s\\n" "$0" "$1" "${NODE_OPTIONS-unset}:${PORT-unset}"\n',{mode:0o644});
   const result=spawnSync('bash',[path.join(dir,'Start_DailyNote.command')],{encoding:'utf8',env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,MOCK_ARCH:arch,NODE_OPTIONS:'inherited',PORT:'9999'}});
   assert.equal(result.status,0,result.stderr);
   assert.ok(result.stdout.includes(path.join(runtime,'node')));
   assert.ok(result.stdout.includes(path.join(dir,'scripts/portable-start.cjs')));
   assert.ok(result.stdout.includes('unset:unset'));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('portable server detection distinguishes same installation, unrelated server and free port',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-portable-'));
 const id=identity(dir);assert.equal(identity(dir),id);
 const server=http.createServer((req,res)=>{res.end(JSON.stringify({instance:id}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 try{assert.equal(await probe(port,id),'same');assert.equal(await probe(port,'another-installation'),'other');}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
 assert.equal(await probe(port,id),'free');
});
