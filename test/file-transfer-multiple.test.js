const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function transfer(){
 const context={window:{},FileReader:class{
  readAsDataURL(){this.result='data:application/octet-stream;base64,QQ==';queueMicrotask(()=>this.onload?.());}
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/file-transfer.js'),'utf8'),context);
 return context.window.FileTransfer;
}
function file(name){return {name,type:'text/plain',size:1,slice(){return {};}};}

test('multi-upload sends each file in order and reports item progress',async()=>{
 const sendCalls=[],progress=[];
 const send=async payload=>{
  sendCalls.push(payload.phase);
  if(payload.phase==='start')return {id:sendCalls.length,chunkSize:4};
  return {};
 };
 const results=await transfer().uploadMany([file('a.txt'),file('b.txt')],send,detail=>progress.push(detail));
 assert.equal(results.length,2);
 assert.deepEqual(sendCalls,['start','part','start','part']);
 assert.equal(progress.filter(value=>value.completed).length,2);
 assert.equal(progress.at(-1).total,2);
});
test('a failed file preserves the completed list for recovery',async()=>{
 let starts=0;
 const send=async payload=>{
  if(payload.phase==='start'){
   if(++starts===2)throw Error('blocked');
   return {id:starts,chunkSize:4};
  }
  return {};
 };
 await assert.rejects(
  transfer().uploadMany([file('a.txt'),file('b.txt')],send),
  error=>error.message==='blocked'&&error.fileName==='b.txt'&&error.completed.length===1
 );
});
