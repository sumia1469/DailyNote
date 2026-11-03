const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http');
const {once}=require('node:events');
const {available,run}=require('../src/mcp-regression');
const {validate,tools}=require('../src/mcp');

test('regression tool stays hidden when not explicitly enabled',()=>{
 const original=process.env.DAILYNOTE_MCP_TEST_MODE;
 delete process.env.DAILYNOTE_MCP_TEST_MODE;
 try{assert.equal(available(),false);}finally{if(original===undefined)delete process.env.DAILYNOTE_MCP_TEST_MODE;else process.env.DAILYNOTE_MCP_TEST_MODE=original;}
});
test('regression parameters allow only fixed suites',()=>{
 assert.doesNotThrow(()=>validate(tools.system_test_regression.inputSchema,{suite:'mcp'}));
 assert.throws(()=>validate(tools.system_test_regression.inputSchema,{suite:'../../other'}));
});
test('isolated regression rejects production execution',async()=>{
 const previous={mode:process.env.DAILYNOTE_MCP_TEST_MODE,production:process.env.NODE_ENV};
 process.env.DAILYNOTE_MCP_TEST_MODE='1';process.env.NODE_ENV='production';
 try{await assert.rejects(run('mcp'),/isolated local/);}finally{for(const [key,val]of Object.entries({DAILYNOTE_MCP_TEST_MODE:previous.mode,NODE_ENV:previous.production})){if(val===undefined)delete process.env[key];else process.env[key]=val;}}
});
test('stdio bridge exchanges JSON-RPC over local HTTP without printing tokens',async()=>{
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  assert.equal(req.headers.authorization,'Bearer test-local-session');
  const request=JSON.parse(Buffer.concat(chunks).toString());
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{tools:[]}}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port;
 const child=spawn(process.execPath,['scripts/mcp-stdio.cjs'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,DAILYNOTE_MCP_URL:'http://127.0.0.1:'+port+'/api/mcp',DAILYNOTE_MCP_TOKEN:'test-local-session'},stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';
 child.stdout.on('data',data=>stdout+=data);
 child.stderr.on('data',data=>stderr+=data);
 child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/list'})+'\n');
 await once(child,'close');
 server.close();
 assert.deepEqual(JSON.parse(stdout.trim()),{jsonrpc:'2.0',id:4,result:{tools:[]}});
 assert.equal(stdout.includes('test-local-session'),false);
 assert.equal(stderr.includes('test-local-session'),false);
});
