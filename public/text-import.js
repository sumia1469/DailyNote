(function() {
  const dialog = document.getElementById('text-import-dialog');
  if (!dialog) return;
  const $ = id => document.getElementById('import-' + id);
  const libraries = new Map();
  let target, opener, focusDestination, file, kind, job = 0, parser, ocr, pdfTask, busy = false;
  let photoDrafts = null, photoMode = 'body';
  function loadScript(path, name) {
    if (window[name]) return Promise.resolve(window[name]);
    if (!libraries.has(path)) libraries.set(path, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = path;
      script.onload = () => resolve(window[name]);
      script.onerror = () => {script.remove();libraries.delete(path);reject(Error('불러오기 구성 파일을 읽지 못했습니다. 사이트 파일을 확인해 주세요.'));};
      document.head.append(script);
    }));
    return libraries.get(path);
  }
  function setBusy(value) {
    busy = value; $('read').disabled = value || !file;
    $('apply').disabled = value || !$('preview').value.trim();
    ['file','sheet','column','encoding','ocr-language','ocr-layout','ocr-rotation','ocr-cleanup'].forEach(id => $(id).disabled = value);
    $('progress').hidden = !value;
    $('preview').readOnly = value;
  }
  function stop() {
    ++job;
    parser?.terminate(); parser = null;
    if (ocr) {ocr.terminate();ocr = null;}
    if (pdfTask) {pdfTask.destroy().catch(() => {});pdfTask = null;}
    setBusy(false);
  }
  function close() { stop(); dialog.close(); }
  function detect(selected) {
    const ext = selected.name.split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','webp','bmp'].includes(ext)) return 'image';
    if (['xlsx','xls','ods','csv','tsv'].includes(ext)) return 'excel';
    if (ext === 'docx') return 'docx';
    if (ext === 'pdf') return 'pdf';
    if (['txt','md','log','json','xml','html','htm'].includes(ext)) return 'text';
    throw Error('사진, 엑셀, TXT·CSV, PDF 또는 DOCX를 선택해 주세요. HWP·DOC·HEIC는 지원하지 않습니다.');
  }
  function selectFile() {
    stop(); file = $('file').files[0]; kind = ''; $('preview').value = '';photoDrafts=null;
    $('sheet-options').hidden = true; $('encoding-options').hidden = true; $('image-options').hidden = true;
    $('sheet').replaceChildren(); $('column').replaceChildren(new Option('모든 열', 'all'));
    $('status').textContent = ''; $('error').textContent = ''; $('read').disabled = !file;
    if (!file) return;
    try {
      kind = detect(file);
      $('encoding-options').hidden = kind !== 'text' && !/\.(csv|tsv)$/i.test(file.name);
      $('image-options').hidden = kind !== 'image';
      $('status').textContent = file.name + ' · 읽기를 누르면 내용을 추출합니다.';
    } catch (e) {$('error').textContent = e.message;$('read').disabled = true;}
  }
  function parseInWorker(buffer, options) {
    return new Promise((resolve, reject) => {
      parser = new Worker('text-import-worker.js');
      const worker = parser;
      worker.onmessage = ({data}) => {worker.terminate();if(parser===worker)parser=null;data.error ? reject(Error(data.error)) : resolve(data);};
      worker.onerror = () => {worker.terminate();if(parser===worker)parser=null;reject(Error('파일을 읽지 못했습니다. 파일 형식이나 손상 여부를 확인해 주세요.'));};
      worker.postMessage({...options, buffer}, [buffer]);
    });
  }
  function docxText(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('Word 문서가 손상되어 본문을 읽지 못했습니다.');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    return Array.from(doc.getElementsByTagNameNS(ns, 'p'), p => {
      let text = '';
      const walk = node => { if (node.namespaceURI === ns && node.localName === 't') text += node.textContent;
        else if (node.namespaceURI === ns && ['br','cr'].includes(node.localName)) text += '\n';
        else if (node.namespaceURI === ns && node.localName === 'tab') text += '  ';
        else Array.from(node.children || []).forEach(walk); };
      walk(p); return text;
    }).join('\n');
  }
  async function readPdf(buffer, token) {
    const pdfjs = await import('./vendor/pdf/pdf.min.mjs');
    if (token !== job) return '';
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf/pdf.worker.min.mjs', location.href).href;
    // Bundle all CJK character maps in one local archive; read only the requested map.
    let maps;
    class LocalPdfDataFactory {
      async fetch({kind, filename}) {
        if (kind !== 'cMapUrl') throw Error('이 PDF 글꼴 구성은 지원하지 않습니다.');
        if (!maps) maps = (async () => {
          const JSZip = await loadScript('vendor/jszip/jszip.min.js', 'JSZip');
          const response = await fetch(new URL('vendor/pdf/cmaps.zip', location.href));
          if (!response.ok) throw Error('PDF 한글 인식 파일을 읽지 못했습니다.');
          return JSZip.loadAsync(await response.arrayBuffer());
        })();
        const entry = (await maps).file(filename);
        if (!entry) throw Error('PDF 문자 맵을 찾을 수 없습니다.');
        return entry.async('uint8array');
      }
    }
    const task = pdfjs.getDocument({data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true,
      useWasm: false, useWorkerFetch: false, BinaryDataFactory: LocalPdfDataFactory, cMapPacked: true});
    pdfTask = task;
    try {
      const doc = await task.promise, pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        if (token !== job) return '';
        $('status').textContent = `PDF ${n}/${doc.numPages}쪽 읽는 중…`;
        const page = await doc.getPage(n), content = await page.getTextContent();
        pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
        page.cleanup();
      }
      return pages.join('\n');
    } finally {await task.destroy();if(pdfTask===task)pdfTask=null;}
  }
  async function imageCanvas(selected) {
    const url = URL.createObjectURL(selected), image = new Image();
    try {
      await new Promise((resolve,reject) => {image.onload=resolve;image.onerror=()=>reject(Error('사진을 열지 못했습니다. JPG 또는 PNG로 저장해 다시 선택해 주세요.'));image.src=url;});
      if (!image.naturalWidth || !image.naturalHeight) throw Error('사진 크기를 확인하지 못했습니다.');
      // Enlarge small text, composite transparency on white, and bound mobile memory use.
      const scale = Math.min(2,Math.max(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),4096/Math.max(image.naturalWidth,image.naturalHeight),Math.sqrt(8000000/(image.naturalWidth*image.naturalHeight)));
      const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
      const radians=Number($('ocr-rotation').value)*Math.PI/180, sideways=Number($('ocr-rotation').value)%180!==0;
      const canvas=document.createElement('canvas'); canvas.width=sideways?height:width;canvas.height=sideways?width:height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(radians);ctx.drawImage(image,-width/2,-height/2,width,height);
      return canvas;
    } finally {URL.revokeObjectURL(url);}
  }
  function enhance(canvas) {
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),pixels=ctx.getImageData(0,0,canvas.width,canvas.height),histogram=new Uint32Array(256);
    for(let i=0;i<pixels.data.length;i+=4){const grey=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);histogram[grey]++;}
    const count=canvas.width*canvas.height;
    let sum=0,low=0,high=255;
    for(let i=0;i<256;i++){sum+=histogram[i];if(sum>=count*.01){low=i;break;}}
    sum=0;for(let i=255;i>=0;i--){sum+=histogram[i];if(sum>=count*.01){high=i;break;}}
    for(let i=0;i<pixels.data.length;i+=4){let grey=.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2];if(high-low>=20)grey=Math.max(0,Math.min(255,(grey-low)*255/(high-low)));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=grey;}
    ctx.putImageData(pixels,0,0);
  }
  async function readImage(token) {
    const canvas=await imageCanvas(file);
    if(token!==job)return {};
    const Tesseract = await loadScript('vendor/ocr/tesseract.min.js','Tesseract');
    if (token !== job) return '';
    const worker = await Tesseract.createWorker($('ocr-language').value, 1, {
      workerPath: new URL('vendor/ocr/worker.min.js',location.href).href,
      corePath: new URL('vendor/ocr/core/',location.href).href,
      langPath: new URL('vendor/ocr/lang/',location.href).href,
      workerBlobURL: false, gzip: true, cacheMethod: 'none',
      logger: info => { if (token !== job) return;
        $('status').textContent = info.status === 'recognizing text' ? '사진에서 글자 읽는 중…' : '사진 인식 준비 중…';
        $('progress').value = Math.round((info.progress || 0) * 100);
      }
    });
    if (token !== job) {await worker.terminate();return '';}
    ocr = worker;
    try {
      const layout=$('ocr-layout').value, psm=layout==='column'?'4':layout==='sparse'?'11':'3';
      await worker.setParameters({tessedit_pageseg_mode:psm,user_defined_dpi:'300'});
      if(token!==job)return {};
      let best=(await worker.recognize(canvas,{rotateAuto:true})).data;
      if(token!==job)return {};
      if(!best.text.trim()||!Number.isFinite(best.confidence)||best.confidence<65){
        $('status').textContent='사진 대비·글자 배치를 보정해 다시 읽는 중…';
        enhance(canvas);
        await worker.setParameters({tessedit_pageseg_mode:layout==='auto'?'11':psm});
        if(token!==job)return {};
        const retry=(await worker.recognize(canvas,{rotateAuto:true})).data;
        if(retry.text.trim()&&(!best.text.trim()||retry.confidence>best.confidence))best=retry;
      }
      return {text:best.text,lowConfidence:!Number.isFinite(best.confidence)||best.confidence<65};
    }
    finally {await worker.terminate();if(ocr===worker)ocr=null;}
  }
  async function read() {
    if (!file || !kind || busy) return;
    const token = ++job;
    setBusy(true); $('error').textContent = ''; $('status').textContent = '텍스트 읽는 중…'; $('progress').removeAttribute('value');
    try {
      let result = {};
      if (kind === 'image') result = await readImage(token);
      else {
        const buffer = await file.arrayBuffer();
        if (token !== job) return;
        if (kind === 'pdf') result.text = await readPdf(buffer, token);
        else result = await parseInWorker(buffer, {kind, textFormat: /\.(csv|tsv)$/i.test(file.name), encoding: $('encoding').value, sheet: $('sheet').value, column: $('column').value || 'all'});
      }
      if (token !== job || !dialog.open) return;
      if (result.xml) result.text = docxText(result.xml);
      if (result.sheets) {
        const column = $('column').value || 'all';
        $('sheet').replaceChildren(...result.sheets.map(name => new Option(name, name, false, name===result.sheet)));
        $('column').replaceChildren(new Option('모든 열', 'all'), ...Array.from({length:result.width}, (_,i)=>new Option(`${i+1}번째 열`, String(i))));
        $('column').value = column;
        $('sheet-options').hidden = false;
      }
      const text = TextImportCore.normalize(result.text || '');
      if (!text.trim()) throw Error(kind === 'pdf' ? '추출할 텍스트가 없습니다. 스캔 PDF는 페이지를 사진으로 저장한 뒤 사진에서 불러오기를 이용하세요.' : '읽어낸 텍스트가 없습니다. 다른 사진·시트·열을 선택해 주세요.');
      $('preview').value = text;
      if(kind==='image'){
        photoDrafts={raw:text,body:TextImportCore.bodyText(text)};photoMode=$('ocr-cleanup').value;
        $('preview').value=photoDrafts[photoMode];
      }
      $('status').textContent = result.lowConfidence
        ? `${file.name} · 인식 품질이 낮습니다. 글자 부분을 크게 잘라 다시 선택하거나 언어·배치·방향을 바꿔 주세요. 결과를 원본과 비교해 수정한 뒤 넣어 주세요.`
        : `${file.name} · 읽기 완료. 내용을 확인·수정한 뒤 넣어 주세요.`;
    } catch (error) {if(token===job){$('error').textContent = String(error.message || error);$('status').textContent = '기존 입력 내용은 유지됩니다. 파일을 확인한 뒤 다시 읽어 주세요.';}}
    finally {if(token===job)setBusy(false);}
  }
  function open(targetId, importKind, button) {
    const destination=document.getElementById(targetId);
    if(!destination||destination.disabled||destination.readOnly)return;
    stop(); opener = button; target = destination;
    file = null; kind = ''; $('file').value = ''; $('preview').value = ''; $('error').textContent = '';
    photoDrafts=null;photoMode='body';$('ocr-cleanup').value='body';
    $('sheet-options').hidden = true; $('encoding-options').hidden = true; $('image-options').hidden = true;
    $('title').textContent = (importKind === 'image' ? '사진' : '파일') + '에서 텍스트 불러오기';
    $('file').accept = importKind === 'image' ? '.png,.jpg,.jpeg,.webp,.bmp' : '.xlsx,.xls,.ods,.csv,.tsv,.txt,.md,.log,.json,.xml,.html,.htm,.docx,.pdf';
    $('mode').value = 'append'; $('encoding').value = 'auto'; $('ocr-language').value = 'kor+eng';
    $('ocr-layout').value='auto';$('ocr-rotation').value='0';
    $('status').textContent = '파일을 선택해 주세요. 원본 파일은 서버에 업로드하지 않습니다.';
    setBusy(false); dialog.showModal();
  }
  window.TextImport={open};
  document.querySelectorAll('[data-text-import]').forEach(button => button.addEventListener('click',()=>open(button.dataset.textImport,button.dataset.importKind,button)));
  $('file').addEventListener('change', selectFile);
  $('read').addEventListener('click', read);
  ['sheet','column','encoding','ocr-language','ocr-layout','ocr-rotation'].forEach(id => $(id).addEventListener('change', read));
  $('ocr-cleanup').addEventListener('change',()=>{
    if(busy||kind!=='image'||!photoDrafts)return;
    photoDrafts[photoMode]=$('preview').value;photoMode=$('ocr-cleanup').value;
    $('preview').value=photoDrafts[photoMode];$('apply').disabled=!$('preview').value.trim();
  });
  $('preview').addEventListener('input',()=>{$('apply').disabled=busy||!$('preview').value.trim();});
  $('apply').addEventListener('click', () => {
    if (busy || !target || !$('preview').value.trim()) return;
    target.value = TextImportCore.combine(target.value, $('preview').value, $('mode').value);
    target.dispatchEvent(new Event('input', {bubbles:true}));
    const destination = target; focusDestination=destination; close(); destination.focus(); destination.setSelectionRange(destination.value.length,destination.value.length);
  });
  $('close').addEventListener('click', close); $('cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', event => {event.preventDefault();close();});
  dialog.addEventListener('close', () => {stop();const next=focusDestination||opener;focusDestination=null;next?.focus({preventScroll:true});});
  window.addEventListener('hashchange', () => {if(dialog.open)close();});
})();
