const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function core(){const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../public/editor-core.js'),'utf8'),{window,URL});return window.EditorCore;}
test('editor links permit web URLs and reject executable or malformed schemes',()=>{
 const {safeLink}=core().links;
 assert.equal(safeLink('www.example.com/한글?q=1&x=2'),'https://www.example.com/%ED%95%9C%EA%B8%80?q=1&x=2');
 assert.equal(safeLink('http://127.0.0.1:3000/#boards/1'),'http://127.0.0.1:3000/#boards/1');
 assert.equal(safeLink('HTTPS://EXAMPLE.COM/path'),'https://example.com/path');
 for(const value of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','//example.com','https://','https://exam\nple.com','https://example.com/a b'])assert.equal(safeLink(value),null);
});
test('shared editor history restores states, forks after undo, caps memory, and resets sessions',()=>{const h=core().history(3);assert.equal(h.move(-1),null);for(const state of ['title','body','image'])h.push(state);assert.equal(h.move(-1),'body');assert.equal(h.move(1),'image');h.move(-1);h.push('code');assert.equal(h.canRedo,false);h.push('mention');assert.equal(h.move(-1),'code');assert.equal(h.move(-1),'body');assert.equal(h.move(-1),null);h.reset();assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);h.push('new session');assert.equal(h.push('new session'),false);assert.equal(h.move(-1),null);});
