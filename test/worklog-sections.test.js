const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sections=require('../public/worklog-sections'),copy=require('../public/worklog-copy');
const source=fs.readFileSync('public/script.js','utf8'),context={};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function linesToArray('),source.indexOf('// 오늘 날짜')),context);
const parse=text=>JSON.parse(JSON.stringify(context.linesToArray(text))),serialize=context.arrayToLines;
test('legacy text becomes items; stale metadata never overrides changed text',()=>{
 const legacy={memo:'부모\n\t자식',remarks:'첫 줄\n두 번째 줄',nextDayPlan:['계획']};assert.equal(sections.read(legacy,'memo',parse,serialize)[0].children[0].task,'자식');assert.equal(sections.read(legacy,'remarks',parse,serialize).length,2);assert.equal(sections.read(legacy,'nextDayPlan',parse,serialize)[0].task,'계획');
 const items=[{task:'이전',checked:true,children:[]}];assert.equal(sections.read({memo:'최신',memoItems:items},'memo',parse,serialize)[0].task,'최신');assert.equal(sections.read({memo:'이전',memoItems:items},'memo',parse,serialize)[0].checked,true);
});
test('plain text and item metadata round trip preserves checks, references and children',()=>{
 const items=[{task:'메모 @[링크](files:1)\n둘째 문장',checked:true,children:[{task:'자식',checked:false,children:[]}]}];const patch=sections.patch('memo',items,serialize);const read=sections.read(patch,'memo',parse,serialize);assert.deepEqual(read,items);const duplicated=copy.makeCopy({...patch,todo:[],remarks:''},'2026-10-01');assert.deepEqual(duplicated.memoItems,items);duplicated.memoItems[0].task='복제';assert.equal(items[0].task,'메모 @[링크](files:1)\n둘째 문장');
});
