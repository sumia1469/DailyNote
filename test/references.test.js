const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../public/reference-core'),editor=require('../public/list-editor');
test('stable references retain ids and escaped labels through plain text serialization',()=>{
 const token=core.internal('memos',8,'회의 [검토] \\ 자료');const parts=core.parts('앞 '+token+' 뒤');assert.equal(parts[1].href,'#memos/8');assert.equal(parts[1].text,'회의 [검토] \\ 자료');assert.equal(core.plain('앞 '+token+' 뒤'),'앞 회의 [검토] \\ 자료 뒤');assert.equal(core.parts(core.internal('files','01','파일'))[0].href,'#files/1');assert.throws(()=>core.internal('users',1,'사용자'));assert.throws(()=>core.internal('memos',0,'메모'));
});
test('external links accept local HTTP and HTTPS but reject script, data, credentials and relative URLs',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','file:///tmp/x','https://user:password@example.com/','//example.com']){assert.equal(core.safeUrl(url),null);assert.throws(()=>core.external('링크',url));}
 const token=core.external('<img src=x>','http://localhost:3000/a(b)?c=1');const part=core.parts(token)[0];assert.equal(part.text,'<img src=x>');assert.equal(part.href,'http://localhost:3000/a%28b%29?c=1');assert.equal(core.parts('#[bad](javascript:evil)')[0].href,undefined);
});
test('parent depth changes carry all descendants while retaining siblings and multiline content',()=>{
 const value='앞\n부모\n\t자식\n\t\t손자\n\\ 이어지는 본문\n다음';const at=value.indexOf('부모');const moved=editor.changeDepth(value,at,at,1);assert.equal(moved.value,'앞\n\t부모\n\t\t자식\n\t\t\t손자\n\t\\ 이어지는 본문\n다음');assert.equal(editor.changeDepth(moved.value,moved.start,moved.end,-1).value,value);
 const first='부모\n\t자식\n다음';assert.equal(editor.changeDepth(first,0,0,1).value,first);assert.equal(editor.changeDepth(first,0,0,-1).value,first);
 const child=value.indexOf('자식');assert.equal(editor.changeDepth(value,child,child,-1).value,'앞\n부모\n자식\n\t손자\n\\ 이어지는 본문\n다음');
});
