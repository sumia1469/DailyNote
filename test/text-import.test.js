const {test}=require('node:test');
const assert=require('node:assert/strict');
const {decode,normalize,combine,rowsToText,bodyText}=require('../public/text-import-core');
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

test('photo body cleanup removes border shapes and checkboxes while preserving identifiers, numbers and real punctuation',()=>{
  const original='──────\n[| : 프레임좌측 180\n☑ 로그인 NHOTP 연동\n|1) 환율고지 기능관련: 지점 로그인\n\n\nJ : 실제 영문은 유지\nI: 서버명\n[보고] 01서버 9월\n수식 |x| = 10 / -3.5\nhttps://example.com/a?b=1#c\n|x|\n끝';
  assert.equal(bodyText(original),'프레임좌측 180\n로그인 NHOTP 연동\n1) 환율고지 기능관련: 지점 로그인\n\nJ : 실제 영문은 유지\nI: 서버명\n[보고] 01서버 9월\n수식 |x| = 10 / -3.5\nhttps://example.com/a?b=1#c\n|x|\n끝');
  assert.equal(bodyText('☐ 첫 항목\n[x] 둘째 항목\n[] 셋째 항목'),'첫 항목\n둘째 항목\n셋째 항목');
  assert.equal(bodyText('───\n||||'),'');
});
