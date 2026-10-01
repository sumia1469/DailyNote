const {test}=require('node:test');
const assert=require('node:assert/strict');
const {decode,normalize,combine,rowsToText}=require('../public/text-import-core');
test('import preserves text, line endings and append/replace without parsing markup',()=>{
  assert.equal(normalize('\uFEFF첫 줄\r\n둘째 줄\r셋째 줄'),'첫 줄\n둘째 줄\n셋째 줄');
  assert.equal(combine('기존\n','<script>alert(1)</script>\r\n다음','append'),'기존\n<script>alert(1)</script>\n다음');
  assert.equal(combine('기존','새 내용','replace'),'새 내용');
  assert.equal(rowsToText([['개발','회의'],['검토',''],['', '보고']]),'개발  회의\n검토  \n  보고');
});
test('Korean text files decode UTF-8, UTF-16 and CP949 without corrupting text',()=>{
  assert.equal(decode(new TextEncoder().encode('업무\n계획').buffer),'업무\n계획');
  const le=Buffer.concat([Buffer.from([255,254]),Buffer.from('업무\r\n계획','utf16le')]);
  assert.equal(decode(le),'업무\n계획');
  assert.equal(decode(Uint8Array.from([0xbe,0xf7,0xb9,0xab]).buffer),'업무');
});
