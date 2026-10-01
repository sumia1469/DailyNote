const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const config=require('../public/ui-config');
test('daily report comes first and the board section follows the five primary menus',()=>{
  const expected=['worklogs','calendar','memos','notifications','files','boards'];
  assert.deepEqual(config.menus.user.map(x=>x.id),expected);
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
  const nav=html.slice(html.indexOf('<nav class="app-navigation">'),html.indexOf('</nav>'));
  assert.deepEqual([...nav.matchAll(/data-view="([^"]+)"/g)].map(x=>x[1]),expected);
  assert.ok(nav.indexOf('data-view="files"')<nav.indexOf('id="board-nav-caption"'));
});
test('board order survives interleaved groups, ties, hidden and archived boards',()=>{
  const boards=[{id:1,group:'A',order:6,inMenu:true},{id:2,group:'B',order:7,inMenu:true},{id:3,group:'A',order:8,inMenu:true},{id:4,order:1,inMenu:false},{id:5,order:0,inMenu:true,active:false},{id:6,group:'B',order:7,inMenu:true}];
  assert.deepEqual(config.boardMenus(boards).map(x=>x.id),[1,2,6,3]);
  assert.deepEqual(boards.map(x=>x.id),[1,2,3,4,5,6]);
});
