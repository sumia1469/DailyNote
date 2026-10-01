const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('literal search safely marks content, cycles both ways, unfolds cards and clears without changing text',()=>{
 const nodes={},fields=[],sections=[{hidden:true},{hidden:true}];
 class Node {
  constructor(text=''){this.text=text;this.children=[];this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};}
  get textContent(){return this.children.length?this.children.map(n=>n.textContent).join(''):this.text;}
  set textContent(value){this.text=value;this.children=[];}
  append(...children){for(const child of children){if(child.fragment)this.append(...child.children);else {this.children.push(child);child.parentNode=this;}}}
  replaceChildren(...children){this.children=[];this.text='';this.append(...children);}
  replaceWith(node){const p=this.parentNode;p.children[p.children.indexOf(this)]=node;node.parentNode=p;}
  normalize(){}
  addEventListener(type,fn){this.listeners[type]=fn;}
  closest(){return {querySelectorAll:()=>sections};}
  scrollIntoView(options){this.scrolled=true;this.scrollOptions=options;assert.equal(nodes['worklog-search-nav'].hidden,false);}
 }
 const document={getElementById:id=>nodes[id]||(nodes[id]=new Node()),createElement:()=>new Node(),createTextNode:text=>new Node(text),createDocumentFragment:()=>Object.assign(new Node(),{fragment:true}),querySelector:()=>null,querySelectorAll:selector=>selector.includes('mark[')?fields.flatMap(n=>n.children.filter(c=>c.dataset.worklogMatch!==undefined)):fields};
 const window={},context={window,document,loadList:async()=>{}};vm.createContext(context);vm.runInContext(fs.readFileSync('public/worklog-search.js','utf8'),context);
 document.getElementById('search-dialog').close=()=>{};
 fields.push(new Node('prefix a+b <img src=x> a+b suffix'),new Node('second a+b context'));
 nodes['worklog-query'].value='a+b';
 return window.WorklogSearch.run().then(()=>{
  const marks=document.querySelectorAll('mark[');assert.equal(marks.length,3);assert.equal(marks[0].textContent,'a+b');assert.ok(marks[0].classes.has('search-current'));assert.equal(sections[0].hidden,false);assert.equal(marks[0].scrollOptions.block,'start');
  nodes['worklog-search-next'].listeners.click();assert.ok(marks[1].classes.has('search-current'));
  nodes['worklog-search-prev'].listeners.click();nodes['worklog-search-prev'].listeners.click();assert.ok(marks[2].classes.has('search-current'));
  assert.equal(fields[0].textContent,'prefix a+b <img src=x> a+b suffix');
  window.WorklogSearch.clear();assert.equal(document.querySelectorAll('mark[').length,0);assert.equal(fields[0].textContent,'prefix a+b <img src=x> a+b suffix');assert.equal(nodes['worklog-search-nav'].hidden,true);
 });
});

