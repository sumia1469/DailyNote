const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Excel=require('../public/worklog-excel');
const XLSX=require('../public/vendor/xlsx/xlsx.full.min');
test('real XLSX round trip preserves hierarchy, statuses, dates, multiline and literal formula text',()=>{
 const worklog={id:42,workDate:'2026-10-01',todo:[{task:'상위 & <검토>',checked:true,children:[{task:'하위\n두 번째 줄 😀',checked:false,children:[{task:'=HYPERLINK("https://example.com")',checked:true}]}]}],nextDayPlan:['익일 계획'],remarks:'+SUM(1,2)',memo:'@문자\n한글 메모'};
 const before=JSON.stringify(worklog),bytes=Excel.build(worklog);
 assert.equal(JSON.stringify(worklog),before);
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
 const book=XLSX.read(bytes,{type:'array',cellDates:true,cellStyles:true}),sheet=book.Sheets['일정 카드'];
 assert.deepEqual(book.SheetNames,['일정 카드']);
 assert.equal(sheet.B2.t,'d');assert.equal(sheet.B2.v.toISOString(),'2026-10-01T00:00:00.000Z');
 assert.equal(sheet.E5.v,'상위 & <검토>');assert.equal(sheet.D5.v,'완료');
 assert.equal(sheet.B6.v,'1.1');assert.equal(sheet.C6.v,2);assert.equal(sheet.D6.v,'미완료');assert.equal(sheet.E6.v,'하위\n두 번째 줄 😀');
 assert.equal(sheet.B7.v,'1.1.1');assert.equal(sheet.E7.t,'s');assert.equal(sheet.E7.f,undefined);assert.equal(sheet.E7.v,worklog.todo[0].children[0].children[0].task);
 assert.equal(sheet.E8.v,'익일 계획');assert.equal(sheet.E9.v,'+SUM(1,2)');assert.equal(sheet.E10.v,'@문자\n한글 메모');
 assert.equal(sheet['!autofilter'].ref,'A4:E10');assert.equal(Excel.filename(worklog),'일정_2026-10-01_42.xlsx');
});
test('empty, legacy and invalid dates export without data loss; oversized cells fail explicitly',()=>{
 const sheet=XLSX.read(Excel.build({todo:[null,'기존 문자열'],workDate:'2026-02-30'}),{type:'array'}).Sheets['일정 카드'];
 assert.equal(sheet.B2.v,'2026-02-30');assert.equal(sheet.B2.t,'s');assert.equal(sheet.E5.v,'기존 문자열');assert.equal(sheet.D5.v,'미완료');
 assert.equal(XLSX.read(Excel.build({}),{type:'array'}).Sheets['일정 카드']['!ref'],'A1:E6');
 assert.throws(()=>Excel.build({memo:'가'.repeat(32768)}),/32,767/);
 assert.ok(!Excel.filename({workDate:'../../date',id:'../1'}).includes('/'));
});
test('card menu connects an offline exporter before journal controls',()=>{
 const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
 assert.ok(html.indexOf('worklog-excel.js')<html.indexOf('journal-controls.js'));
 assert.match(fs.readFileSync(require.resolve('../public/journal-controls.js'),'utf8'),/item\('엑셀 다운로드','download',\(\)=>WorklogExcel.download\(worklog\)\)/);
});
test('structured remarks and memo preserve their own hierarchy and completion',()=>{
 const worklog={remarks:'stale summary',remarksItems:[{task:'비고 상위',checked:true,children:[{task:'비고 하위',checked:false}]}],memo:'old memo',memoItems:[{task:'메모 항목',checked:true}]};
 const sheet=XLSX.read(Excel.build(worklog),{type:'array'}).Sheets['일정 카드'];
 assert.equal(sheet.A5.v,'비고');assert.equal(sheet.E5.v,'비고 상위');assert.equal(sheet.D5.v,'완료');
 assert.equal(sheet.B6.v,'1.1');assert.equal(sheet.E6.v,'비고 하위');
 assert.equal(sheet.A7.v,'메모');assert.equal(sheet.E7.v,'메모 항목');assert.equal(sheet.D7.v,'완료');
 assert.equal(Excel.rowsFor({remarks:'obsolete',remarksItems:[],memoItems:[]}).length,4);
});
