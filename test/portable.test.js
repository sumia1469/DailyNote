const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {identity,probe}=require('../scripts/portable-start.cjs');
test('portable server detection distinguishes same installation, unrelated server and free port',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dailynote-portable-'));
 const id=identity(dir);assert.equal(identity(dir),id);
 const server=http.createServer((req,res)=>{res.end(JSON.stringify({instance:id}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 try{assert.equal(await probe(port,id),'same');assert.equal(await probe(port,'another-installation'),'other');}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
 assert.equal(await probe(port,id),'free');
});
