const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const config=require('../public/ui-config');
const read=file=>fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
test('menu actions enforce user and delegated administrator rights',()=>{
 assert.deepEqual(config.allowed('user',{worklogRead:false,worklogCreate:false,fileRead:false,fileUpload:false,notificationRead:true,memoRead:false,memoCreate:false}).map(menu=>menu.id),['notifications']);
 assert.equal(config.actions('user','notifications',{}).length,0);
 assert.equal(config.actions('user','files',{fileUpload:false}).length,0);
 assert.equal(config.actions('admin','notifications',{notifications:false}).length,0);
 assert.equal(config.actions('admin','notifications',{notifications:true})[0].dialog,'notification-dialog');
 assert.equal(config.actions('admin','files',{files:true,fileUpload:false}).length,0);
 assert.deepEqual(config.allowed('admin',{users:true}).map(menu=>menu.id),['users']);
 for(const menu of config.menus.admin.filter(menu=>['appearance','permissions'].includes(menu.id)))assert.equal(menu.actions.length,0);
});
test('every menu panel and action is wired once and common modules load before adapters',()=>{
 for(const [scope,file] of [['user','index.html'],['admin','admin.html']]){const html=read(file);const ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),match=>match[1]);assert.equal(ids.length,new Set(ids).size);for(const menu of config.menus[scope]){assert.ok(ids.includes(menu.panel),menu.panel);for(const action of menu.actions){assert.ok(ids.includes(action.id),action.id);if(action.dialog)assert.ok(ids.includes(action.dialog),action.dialog);}}const adapter=scope==='user'?'app-shell.js':'admin.js';assert.ok(html.indexOf('ui-config.js')<html.indexOf(adapter));assert.ok(html.indexOf('ui-shell.js')<html.indexOf(adapter));assert.ok(html.indexOf('ui-shell.css')>html.indexOf('app-shell.css'));}
 const html=read('index.html');const notification=html.slice(html.indexOf('id="view-notifications"'),html.indexOf('id="view-notification-detail"'));assert.ok(!notification.includes('<h2'));assert.ok(!html.includes('notification-detail-dialog'));assert.ok(html.includes('id="notification-back"'));
});
test('shared drawer prevents hidden focus, traps Tab and restores opener on Escape',()=>{
 function node(){const handlers={};return {hidden:false,disabled:false,inert:false,attrs:{},handlers,classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)},contains(v){return this.values.has(v)}},addEventListener(k,fn){handlers[k]=fn},setAttribute(k,v){this.attrs[k]=v},focus(){document.activeElement=this},getClientRects(){return [1]}};}
 const document={handlers:{},body:node(),addEventListener(k,fn){this.handlers[k]=fn},title:''},window={};const nav=node(),opener=node(),closer=node(),scrim=node(),last=node();nav.querySelectorAll=()=>[closer,last];
 vm.runInNewContext(read('ui-shell.js'),{window,document,UIConfig:config});const drawer=window.UIShell.drawer({nav,opener,closer,scrim});assert.equal(nav.inert,true);opener.handlers.click();assert.equal(nav.inert,false);assert.equal(document.activeElement,closer);last.focus();let prevented=false;document.handlers.keydown({key:'Tab',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(document.activeElement,closer);document.handlers.keydown({key:'Escape'});assert.equal(nav.inert,true);assert.equal(scrim.hidden,true);assert.equal(document.activeElement,opener);drawer.close();
});
