(function(){
  'use strict';
  const types={files:{name:'파일',right:'fileRead'},memos:{name:'메모',right:'memoRead'},worklogs:{name:'일지·일정',right:'worklogRead'}};
  let user=null,session=0,searchJob=0,detailJob=0,searchController,detailController,edit,records=[],active=0;
  const dialog=document.createElement('dialog');dialog.id='reference-dialog';dialog.className='journal-dialog reference-dialog';dialog.dataset.uiBound='true';dialog.setAttribute('aria-labelledby','reference-title');
  dialog.innerHTML='<div class="journal-dialog-header"><h2 id="reference-title">참조 추가</h2><button type="button" id="reference-close" class="shell-icon" data-icon="close" aria-label="참조 닫기"></button></div><div id="reference-search-controls" class="reference-search-controls"><select id="reference-type" aria-label="참조 종류"></select><input id="reference-query" type="search" aria-label="파일 메모 일정 검색" placeholder="제목·내용 검색"></div><div id="reference-url-controls" hidden><div class="form-field"><label for="reference-url">링크 주소</label><input id="reference-url" type="url" placeholder="https:// 또는 http://"></div><div class="form-field"><label for="reference-label">표시 이름 (선택)</label><input id="reference-label" maxlength="200"></div><button type="button" id="reference-add-url" class="primary-btn">링크 추가</button></div><p id="reference-status" role="status" aria-live="polite"></p><div id="reference-results" class="reference-results" role="listbox" aria-label="참조 검색 결과"></div><p class="reference-hint">↑↓ 선택 · Enter 연결 · Esc 취소. 취소하면 입력한 @ 또는 # 문자를 유지합니다.</p>';
  document.body.append(dialog);
  const $=id=>document.getElementById('reference-'+id);
  const panel=document.createElement('section');panel.id='view-reference-detail';panel.className='reference-detail';panel.hidden=true;
  panel.innerHTML='<h2 id="reference-detail-title"></h2><p id="reference-detail-state" role="status" aria-live="polite"></p><div id="reference-detail-content" class="reference-detail-content"></div>';
  document.getElementById('worklog-section').parentElement.append(panel);
  // Image overlays keep the source list mounted, including search and scroll position.
  let imageJob=0,imageController,imageObjectUrl;
  const preview=document.createElement('dialog');preview.id='reference-image-preview';preview.className='journal-dialog reference-image-preview';preview.dataset.uiBound='true';preview.setAttribute('aria-labelledby','reference-image-title');
  preview.innerHTML='<div class="journal-dialog-header"><h2 id="reference-image-title">이미지 미리보기</h2><button type="button" class="shell-icon" data-icon="close" aria-label="이미지 미리보기 닫기"></button></div><p class="reference-image-state" role="status" aria-live="polite"></p><button type="button" class="reference-image-open" aria-label="이미지 크게 보기" hidden><img alt=""></button><p class="reference-hint">이미지를 누르면 크게 볼 수 있습니다.</p>';
  const viewer=document.createElement('dialog');viewer.id='reference-image-viewer';viewer.className='reference-image-viewer';viewer.dataset.uiBound='true';viewer.setAttribute('aria-label','이미지 크게 보기');
  viewer.innerHTML='<div class="reference-image-toolbar"><button type="button" class="secondary-btn" aria-label="이미지 확대 축소">원본 크기</button><button type="button" class="shell-icon" data-icon="close" aria-label="큰 이미지 닫기"></button></div><div class="reference-image-stage"><img alt=""></div>';
  document.body.append(preview,viewer);window.AppIcons?.render(preview);window.AppIcons?.render(viewer);
  const previewImage=preview.querySelector('img'),previewButton=preview.querySelector('.reference-image-open'),imageState=preview.querySelector('.reference-image-state'),largeImage=viewer.querySelector('img');
  function disposeImage(){++imageJob;imageController?.abort();viewer.close();preview.close();previewImage.removeAttribute('src');largeImage.removeAttribute('src');if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);imageObjectUrl=null;}
  function closeImage(){if(history.state?.referenceImage)history.back();else disposeImage();}
  function enlarge(src,name){largeImage.src=src;largeImage.alt=name;viewer.classList.remove('is-original');viewer.querySelector('.secondary-btn').textContent='원본 크기';history.pushState({...history.state,referenceImage:'viewer'},'',location.href);viewer.showModal();}
  preview.querySelector('[data-icon=close]').addEventListener('click',closeImage);
  viewer.querySelector('[data-icon=close]').addEventListener('click',closeImage);
  previewButton.addEventListener('click',()=>enlarge(previewImage.src,previewImage.alt));
  viewer.querySelector('.secondary-btn').addEventListener('click',event=>{const original=viewer.classList.toggle('is-original');event.currentTarget.textContent=original?'화면에 맞추기':'원본 크기';});
  for(const overlay of [preview,viewer]){
    overlay.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();closeImage();});
    overlay.addEventListener('click',event=>{if(event.target!==overlay)return;const box=overlay.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeImage();});
  }
  window.addEventListener('popstate',()=>{
    if(history.state?.referenceImage==='preview'){viewer.close();largeImage.removeAttribute('src');}
    else if(history.state?.referenceImage!=='viewer')disposeImage();
  });
  function showPreview(name){disposeImage();preview.querySelector('h2').textContent=name||'이미지 미리보기';previewButton.hidden=true;imageState.textContent='이미지를 불러오는 중…';history.pushState({...history.state,referenceImage:'preview'},'',location.href);preview.showModal();}
  async function openFileImage(id,hash){
    showPreview('이미지 미리보기');const version=imageJob,current=session;imageController=new AbortController();const signal=imageController.signal;
    try{
      if(!can('files'))throw Error('이 참조를 조회할 권한이 없습니다.');
      const files=await get('/api/files',signal),item=files.find(file=>String(file.id)===id);
      if(version!==imageJob||current!==session)return;
      if(!item)throw Error('삭제되었거나 접근할 수 없는 참조입니다.');
      const mime=String(item.mimeType||'').toLowerCase();
      const fallback=/\.(png|jpe?g|webp|gif|bmp|avif|ico)$/i.test(item.originalName||item.filename||'');
      const isImage=/^image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon)$/.test(mime)||(['','application/octet-stream'].includes(mime)&&fallback);
      if(!isImage){disposeImage();history.replaceState({referenceReturn:location.hash},'',hash);window.AppShell?.refresh();return;}
      if(user.permissions?.fileDownload===false)throw Error('이미지를 조회할 파일 다운로드 권한이 없습니다.');
      preview.querySelector('h2').textContent=item.originalName||item.filename||'이미지 미리보기';
      const blob=await FileTransfer.download(item,async suffix=>{const response=await fetch('/api/upload/'+item.id+suffix,{headers:{Authorization:'Bearer '+localStorage.getItem('token')},signal});if(!response.ok)throw Error('이미지를 불러오지 못했습니다.');return response.blob();});
      if(version!==imageJob||current!==session)return;
      imageObjectUrl=URL.createObjectURL(blob);previewImage.alt=item.originalName||'참조 이미지';
      previewImage.onload=()=>{if(version!==imageJob)return;imageState.textContent='';previewButton.hidden=false;};
      previewImage.onerror=()=>{if(version===imageJob)imageState.textContent='이 이미지는 브라우저에서 표시할 수 없습니다.';};
      previewImage.src=imageObjectUrl;
    }catch(error){if(version===imageJob&&current===session)imageState.textContent=error.message;}
  }
  function can(kind){return Boolean(user&&user.permissions?.[types[kind]?.right]!==false);}
  async function get(path,signal){
    const response=await fetch(path,{headers:{Authorization:'Bearer '+localStorage.getItem('token')},signal});
    const result=await response.json();if(!response.ok)throw Error(result.message||'참조를 불러오지 못했습니다.');return result;
  }
  function flatten(items){return (Array.isArray(items)?items:[]).filter(Boolean).flatMap(item=>typeof item==='string'?[item]:[item.task||'',...flatten(item.children)]);}
  function describe(kind,item){const title=kind==='files'?(item.originalName||item.filename||'파일'):kind==='memos'?(item.title||'제목 없는 메모'):(item.workDate+' · '+ReferenceCore.plain(flatten(item.todo)[0]||'업무일지'));
    return {kind,id:item.id,title,search:ReferenceCore.plain(title+' '+(kind==='memos'?item.text||'':kind==='worklogs'?[...flatten(item.todo),...flatten(item.nextDayPlan),item.memo||'',item.remarks||''].join(' '):''))};}
  function render(node,text){
    node.dataset.referenceSource=String(text||'');node.replaceChildren();for(const part of ReferenceCore.parts(text)){
      if(!part.href){node.append(document.createTextNode(part.text));continue;}
      const link=document.createElement('a');link.textContent=part.text;link.href=part.href;link.className='reference-link';link.dataset.referenceToken=part.token;
      if(part.kind==='url'){link.target='_blank';link.rel='noopener noreferrer';}
      node.append(link);
    }
  }
  function choose(index){active=index;const buttons=[...$('results').children];buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));buttons[index]?.scrollIntoView({block:'nearest'});}
  function filtered(){const query=$('query').value.toLocaleLowerCase(),type=$('type').value;return records.filter(item=>(type==='all'||type===item.kind)&&item.search.toLocaleLowerCase().includes(query));}
  function list(){const found=filtered();$('results').replaceChildren();active=0;for(const item of found.slice(0,100)){const button=document.createElement('button');button.type='button';button.className='reference-result';button.setAttribute('role','option');button.setAttribute('aria-selected','false');const title=document.createElement('span');title.textContent=item.title;const meta=document.createElement('small');meta.textContent=types[item.kind].name;button.append(title,meta);button.addEventListener('focus',()=>choose([...$('results').children].indexOf(button)));button.addEventListener('click',()=>insert(ReferenceCore.internal(item.kind,item.id,item.title)));$('results').append(button);}choose(0);
    $('status').textContent=(found.length?`${found.length}개 결과${found.length>100?' · 처음 100개 표시, 검색어로 좁혀 주세요.':''}`:'검색 결과가 없습니다.')+(edit?.searchErrors||'');
  }
  async function search(){const version=++searchJob,current=session;searchController?.abort();searchController=new AbortController();const signal=searchController.signal;records=[];$('results').replaceChildren();$('status').textContent='검색 대상을 불러오는 중…';
    const kinds=Object.keys(types).filter(can);const results=await Promise.allSettled(kinds.map(async kind=>{const items=await get('/api/'+kind,signal);if(!Array.isArray(items))throw Error('목록 형식을 확인해 주세요.');return items.filter(item=>Number.isSafeInteger(item.id)&&item.id>0).map(item=>describe(kind,item));}));
    if(version!==searchJob||current!==session||!dialog.open||!edit)return;
    results.forEach(result=>{if(result.status==='fulfilled')records.push(...result.value);});edit.searchErrors=results.flatMap((r,i)=>r.status==='rejected'?[' · '+types[kinds[i]].name+' 조회 실패']:[]).join('');list();
  }
  function close(){++searchJob;searchController?.abort();dialog.close();}
  function insert(text){if(!edit||edit.target.value!==edit.value||!edit.target.isConnected||edit.target.disabled||edit.target.readOnly){$('status').textContent='입력 내용이 변경되었습니다. 닫고 다시 참조를 선택해 주세요.';return;}
    const destination=edit.target;destination.setRangeText(text,edit.from,edit.to,'end');close();destination.focus({preventScroll:true});destination.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function open(target,from,to,kind){if(!user||target.disabled||target.readOnly)return;
    edit={target,from,to,value:target.value};$('title').textContent=kind==='@'?'파일·메모·일정 참조':'URL 링크 추가';$('search-controls').hidden=kind!=='@';$('url-controls').hidden=kind!=='#';$('results').hidden=kind!=='@';$('status').textContent='';$('results').replaceChildren();$('query').value='';$('url').value='';$('label').value='';
    $('type').replaceChildren(new Option('전체','all'),...Object.entries(types).filter(([k])=>can(k)).map(([k,t])=>new Option(t.name,k)));dialog.showModal();if(kind==='@'){$('query').focus();search();}else $('url').focus();
  }
  document.addEventListener('input',event=>{const target=event.target;if(event.isComposing||!['@','#'].includes(event.data)||!(target instanceof HTMLTextAreaElement||target instanceof HTMLInputElement))return;
    if(!(['todo','next-day-plan','memo','remarks'].includes(target.id)||target.closest('.todo-inline-editor')))return;
    const end=target.selectionStart,from=end-1;if(target.value[from]!==event.data||from>0&&!/[\s(]/u.test(target.value[from-1]))return;open(target,from,end,event.data);
  });
  $('query').addEventListener('input',list);$('type').addEventListener('change',list);$('close').addEventListener('click',close);
  $('add-url').addEventListener('click',()=>{try{insert(ReferenceCore.external($('label').value,$('url').value.trim()));}catch(error){$('status').textContent=error.message;}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{if(event.isComposing||event.target===$('close'))return;if(event.key==='Escape'){event.stopPropagation();return;}if($('search-controls').hidden){if(event.key==='Enter'){event.preventDefault();$('add-url').click();}return;}if(!['ArrowUp','ArrowDown','Enter'].includes(event.key))return;const items=[...$('results').children];if(!items.length)return;event.preventDefault();event.stopPropagation();if(event.key==='Enter')items[active]?.click();else choose((active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length);});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
  function section(title,text){const heading=document.createElement('h3');heading.textContent=title;const body=document.createElement('div');render(body,text);$('detail-content').append(heading,body);}
  function tree(title,items){const heading=document.createElement('h3');heading.textContent=title;$('detail-content').append(heading);function build(nodes){const list=document.createElement('ul');for(const item of Array.isArray(nodes)?nodes:[]){if(!item)continue;const row=document.createElement('li'),text=document.createElement('span');if(typeof item!=='string')row.append(document.createTextNode(item.checked?'☑ ':'☐ '));render(text,typeof item==='string'?item:item.task||'');row.append(text);if(item.children?.length)row.append(build(item.children));list.append(row);}return list;}$('detail-content').append(build(items));}
  function cancelDetail(){++detailJob;detailController?.abort();$('detail-content').replaceChildren();}
  async function loadDetail(kind,id,strict=false){cancelDetail();close();const version=detailJob,current=session;detailController=new AbortController();const signal=detailController.signal;$('detail-title').textContent=types[kind].name+' 참조';$('detail-state').textContent='불러오는 중…';if(!can(kind)){$('detail-state').textContent='이 참조를 조회할 권한이 없습니다.';return;}
    try{let item;if(kind==='memos')item=await get('/api/memos/'+id,signal);else{const items=await get('/api/'+kind,signal);item=items.find(x=>String(x.id)===String(id));}
      if(version!==detailJob||current!==session)return;if(!item)throw Error('삭제되었거나 접근할 수 없는 참조입니다.');$('detail-title').textContent=describe(kind,item).title;$('detail-state').textContent='';
      if(kind==='worklogs'){tree('TODO',item.todo);tree('익일 계획',item.nextDayPlan);section('비고',item.remarks||'');section('메모',item.memo||'');}
      if(kind==='memos'){section('본문',item.text||'');for(const attachment of Array.isArray(item.attachments)?item.attachments:[]){if(!/^data:(image\/(png|jpeg|webp)|audio\/(webm|mp4|ogg|wav|mpeg))(;codecs=[\w.-]+)?;base64,/i.test(attachment.data||''))continue;const media=document.createElement(attachment.kind==='audio'?'audio':'img');media.src=attachment.data;if(attachment.kind==='audio')media.controls=true;else media.alt=attachment.name||'메모 사진';$('detail-content').append(media);}}
      if(kind==='files'){section('파일 정보',[item.mimeType||'파일',item.sizeBytes!=null?item.sizeBytes+' bytes':'',item.uploadedAt||item.createdAt||''].filter(Boolean).join('\n'));if(user.permissions?.fileDownload!==false){const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent='파일 다운로드';button.addEventListener('click',async()=>{button.disabled=true;try{const blob=await FileTransfer.download(item,async query=>{const response=await fetch('/api/upload/'+item.id+query,{headers:{Authorization:'Bearer '+localStorage.getItem('token')},signal});if(!response.ok)throw Error('파일을 내려받지 못했습니다.');return response.blob();});if(version!==detailJob||current!==session)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=item.originalName||'파일';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){if(version===detailJob)$('detail-state').textContent=error.message;}finally{button.disabled=false;}});$('detail-content').append(button);}}
    }catch(error){if(version===detailJob&&current===session){$('detail-state').textContent='참조를 열지 못했습니다. 삭제되었거나 접근 권한이 없을 수 있습니다.';if(strict===true)throw error;}}
  }
  document.addEventListener('click',event=>{const image=event.target.closest('#reference-detail-content img');if(image){enlarge(image.src,image.alt);return;}const link=event.target.closest('a.reference-link');if(!link)return;if(document.querySelector('[data-todo-editing],[data-todo-saving]')){event.preventDefault();return;}if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;const ref=link.hash.match(/^#(files|memos|worklogs)\/([1-9]\d*)$/);if(ref&&link.origin===location.origin&&link.pathname===location.pathname){event.preventDefault();if(ref[1]==='files'){history.replaceState({...history.state,referenceScroll:window.AppShell?.scroll.top??window.scrollY},'',location.href);openFileImage(ref[2],link.hash);}else window.AppShell?.openReference(link.hash);}});
  window.addEventListener('hashchange',()=>{close();disposeImage();});
  window.References={render,loadDetail,cancelDetail,panel,configure(value){disposeImage();user=value;session++;close();cancelDetail();},reset(){disposeImage();user=null;session++;close();cancelDetail();records=[];edit=null;}};
  window.AppIcons?.render(dialog);
})();


