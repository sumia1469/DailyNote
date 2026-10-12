const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('row menu touch target stays visible and at least 44px regardless of pointer detection',()=>{
 const css=fs.readFileSync('public/style.css','utf8'),rule=css.match(/\.todo-menu-trigger\.shell-icon\s*\{([^}]+)\}/)?.[1];assert.ok(rule);for(const property of ['width','min-width','height','min-height'])assert.match(rule,new RegExp('(?:^|;)\\s*'+property+':44px'));assert.match(rule,/display:inline-flex/);assert.match(rule,/touch-action:manipulation/);assert.doesNotMatch(rule,/opacity:0|visibility:hidden|display:none/);
});
test('touch menu isolates pointer events and uses the same actions as right-click',()=>{
 const source=fs.readFileSync('public/todo-menu.js','utf8');for(const type of ['pointerdown','pointerup'])assert.ok(source.includes("trigger.addEventListener('"+type+"',event=>event.stopPropagation())"));assert.ok(source.includes("trigger.addEventListener('click',open)"));assert.match(source,/row\.addEventListener\('contextmenu'/);assert.match(source,/choice\('삭제',confirmDelete,true\)/);assert.match(source,/const count=flatten\(\[item\]\)\.length/);assert.match(source,/cancel\.focus\(\)/);
});
