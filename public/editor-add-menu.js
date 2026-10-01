(function() {
  const dialog = document.createElement('dialog');
  dialog.id = 'editor-add-dialog'; dialog.className = 'card-menu-dialog editor-add-dialog';
  dialog.dataset.uiBound = 'true'; dialog.setAttribute('aria-label', '항목 추가 방법');
  let target, opener;
  function close() { dialog.close(); }
  function choice(label, icon, action) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = label; button.dataset.icon = icon;
    button.addEventListener('click', () => {close();action();}); dialog.append(button);
  }
  choice('직접 항목 추가', 'plus', () => {
    const value = ListEditor.addLine(target.value, target.selectionStart, target.selectionEnd);
    target.value = value.value; target.focus({preventScroll:true}); target.setSelectionRange(value.start,value.end);
    target.dispatchEvent(new Event('input',{bubbles:true}));
  });
  choice('사진에서 불러오기', 'camera', () => TextImport.open(target.id,'image',opener));
  choice('파일에서 불러오기', 'files', () => TextImport.open(target.id,'file',opener));
  choice('닫기', 'close', close);
  document.body.append(dialog); AppIcons.render(dialog);
  document.querySelectorAll('[data-action="add-menu"]').forEach(button => button.addEventListener('click', () => {
    target = document.getElementById(button.closest('[data-editor]').dataset.editor); opener = button;
    if (!target || target.disabled || target.readOnly) return;
    button.setAttribute('aria-expanded','true'); button.focus({preventScroll:true}); dialog.showModal();
    const r = button.getBoundingClientRect();
    dialog.style.left = Math.max(12,Math.min(innerWidth-dialog.offsetWidth-12,r.right-dialog.offsetWidth))+'px';
    dialog.style.top = Math.max(12,Math.min(innerHeight-dialog.offsetHeight-12,r.bottom+8))+'px';
  }));
  dialog.addEventListener('close', () => {opener?.setAttribute('aria-expanded','false');});
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) close();
  });
  dialog.addEventListener('keydown', event => {
    const buttons = [...dialog.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    const next = event.key==='ArrowDown'?(index+1)%buttons.length:event.key==='ArrowUp'?(index+buttons.length-1)%buttons.length:event.key==='Home'?0:event.key==='End'?buttons.length-1:null;
    if(next!==null){event.preventDefault();buttons[next].focus();}
  });
  window.addEventListener('hashchange', () => {if(dialog.open)close();});
})();
