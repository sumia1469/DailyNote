const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync('public/mobile-inputs.css','utf8');
test('every HTML entry point loads the focus-safe stylesheet last and keeps user zoom available',()=>{
 for(const name of fs.readdirSync('public').filter(name=>name.endsWith('.html'))){const html=fs.readFileSync(path.join('public',name),'utf8');const head=html.slice(0,html.includes('</head>')?html.indexOf('</head>'):html.indexOf('<main>'));const sheets=[...head.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match=>match[1]);assert.equal(sheets.at(-1),'mobile-inputs.css',name);assert.match(head,/name="viewport"/);assert.doesNotMatch(head,/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?:[",;\s]|$)/i,name);}
});
test('shared mobile rule covers text controls and editable roots, while retaining large memo titles',()=>{
 assert.match(css,/-webkit-text-size-adjust:100%/);assert.match(css,/@media \(max-width:767px\), \(hover:none\) and \(pointer:coarse\)/);
 for(const selector of ['textarea','select','[contenteditable]:not([contenteditable=false])'])assert.ok(css.includes(selector));
 assert.match(css,/font-size:max\(16px,var\(--app-font-size,16px\),var\(--focus-font-size,16px\)\) !important/);assert.match(css,/\.memo-paper input \{ --focus-font-size:34px;/);assert.doesNotMatch(css,/transform\s*:|touch-action\s*:\s*none|zoom\s*:/);
});
test('successful login blurs its own field before changing screens; failures preserve focus',()=>{
 const source=fs.readFileSync('public/script.js','utf8');const start=source.indexOf(".getElementById('login-form')"),end=source.indexOf('/* 로그아웃 */',start),login=source.slice(start,end);const blur=login.indexOf('if (form.contains(document.activeElement)) document.activeElement.blur();');assert.ok(blur>login.indexOf('if (!response.ok)'));assert.ok(blur<login.indexOf('showMainScreen()'));assert.doesNotMatch(login,/maximum-scale|user-scalable|visualViewport\.scale\s*=/);
});
