const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tree=require('../public/todo-tree');
test('move preserves descendants and checked states; add starts unchecked',()=>{
 const first={task:'first',checked:true,children:[]},child={task:'child',checked:true,children:[]},second={task:'second',checked:true,children:[child]},items=[first,second];
 assert.equal(tree.canMove(items,first,'indent'),false);assert.equal(tree.canMove(items,first,'outdent'),false);
 tree.move(items,second,'indent');assert.equal(first.children[0],second);assert.equal(second.children[0],child);assert.equal(child.checked,true);
 tree.move(items,second,'outdent');assert.equal(items[1],second);
 const added=tree.add(items,second,'child','new');assert.equal(added.checked,false);assert.equal(second.children[1],added);
 const sibling=tree.add(items,second,'sibling','other');assert.equal(items[2],sibling);assert.equal(second.checked,true);
});
test('full form round trip preserves inline newlines, literal slashes and hierarchy',()=>{
 const source=fs.readFileSync('public/script.js','utf8');const start=source.indexOf('function linesToArray('),end=source.indexOf('// 오늘 날짜',start);const context={};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const items=[{task:'first\n\nlast',children:[{task:'\\ literal\nchild line',children:[]}]},{task:'second',children:[]}];
 const converted=JSON.parse(JSON.stringify(context.linesToArray(context.arrayToLines(items))));
 assert.equal(converted.length,2);assert.equal(converted[0].task,items[0].task);assert.equal(converted[0].children[0].task,items[0].children[0].task);
});
