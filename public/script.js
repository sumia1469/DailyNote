/* public/script.js */

/* 전역 토큰 (localStorage 에 저장) */
let token = localStorage.getItem('token') || '';
let currentWorklogs = [];
let currentFilterDate = '';
let currentPermissions = {};
const canUse = key => currentPermissions[key] !== false;
const selectedWorklogIds = new Set();
let duplicatingWorklogs = false;
function updateCopyButton() {
  const button = document.getElementById('duplicate-worklog-btn');
  button.disabled = duplicatingWorklogs || !canUse('worklogCreate') || selectedWorklogIds.size === 0;
  button.textContent = duplicatingWorklogs ? '복제 중…' : selectedWorklogIds.size ? `선택 일지 복제 (${selectedWorklogIds.size})` : '선택 일지 복제';
}


/* Compatibility helpers delegate to the common loading module. */
function startLoading(message) { return AppLoading.begin(message); }
function withLoading(message, action) { return AppLoading.run(message, action); }
function loadingFetch(url, options = {}) { return AppLoading.fetch(url, options); }

/* 공통 fetch (Authorization 자동 삽입) */
async function authFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await loadingFetch(url, {
    ...options,
    headers
  });
  // 인증이 만료되었거나 유효하지 않은 경우 로그인 화면으로 이동
  if (response.status === 401) {
    token = '';
    localStorage.removeItem('token');
    showLoginScreen();
  }
  return response;
}

/* 화면전환 */
function showLoginScreen() {
  document.getElementById('login-section').style.display = 'flex';
  document.getElementById('main-section').style.display = 'none';
  window.AppShell?.reset();
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.value = '';
  }
}

async function showMainScreen() {
  const response = await authFetch('/api/auth/me');
  if (!response.ok) return false;
  const user = await response.json();
  if (user.mustChangePassword) {
    location.replace('/change-password.html');
    return false;
  }
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'block';
  currentPermissions=user.permissions||{};
  document.getElementById('admin-page-btn').hidden = !['boards','notifications','files','appearance','users','permissions'].some(key=>currentPermissions[key]);
  document.querySelector('.notification-section').hidden=!canUse('notificationRead');
  document.querySelector('.upload-section').hidden=!canUse('fileRead')&&!canUse('fileUpload');
  document.querySelector('.worklog-section').hidden=!canUse('worklogRead')&&!canUse('worklogCreate');
  document.getElementById('upload-form').hidden=!canUse('fileUpload');
  document.querySelector('.search-panel').hidden=!canUse('worklogRead');
  document.getElementById('worklog-list').hidden=!canUse('worklogRead');
  document.getElementById('file-list').hidden=!canUse('fileRead');
  if(!canUse('worklogRead')){currentWorklogs=[];selectedWorklogIds.clear();document.getElementById('worklog-list').replaceChildren();}
  if(!canUse('fileRead'))document.getElementById('file-list').replaceChildren();
  document.getElementById('open-worklog-btn').hidden=!canUse('worklogCreate');
  document.getElementById('duplicate-worklog-btn').hidden=true;
  updateCopyButton();
  window.AppShell?.configure(user);
  return true;
}

/* 로그인 — 성공 시 토큰 저장 → UI 전환 */
document
  .getElementById('login-form')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const loginMessage = document.getElementById('login-msg');
    const submitButton = form.querySelector(
      'button[type="submit"]'
    );
    const payload = {
      username: form.username.value.trim(),
      password: form.password.value
    };
    loginMessage.textContent = '';
    submitButton.disabled = true;
    submitButton.textContent = '로그인 중...';
    try {
      const response = await loadingFetch('/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.message || '로그인에 실패했습니다.'
        );
      }
      token = data.token;
      localStorage.setItem('token', token);
      if (data.mustChangePassword) { location.replace('/change-password.html'); return; }
      if (!await showMainScreen()) return;
      await Promise.all([
        loadNoti(),
        loadFiles(),
        loadList()
      ]);
    } catch (error) {
      loginMessage.textContent = error.message;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = '로그인';
    }
  });

/* 로그아웃 */
document.getElementById('logout-btn').addEventListener('click', () => {
  document.getElementById('admin-page-btn').hidden = true;
  token = '';
  currentWorklogs = [];
  selectedWorklogIds.clear();
  updateCopyButton();
  currentFilterDate = '';
  localStorage.removeItem('token');
  closeWorklogModal();
  showLoginScreen();
});

/* 공지 — GET /api/notifications */
async function loadNoti() {
  if(!canUse('notificationRead'))return;
  const notificationList = document.getElementById('noti-list');
  notificationList.innerHTML = '';

  try {
    const res = await authFetch('/api/notifications');

    if (!res.ok) {
      throw new Error('공지를 불러오지 못했습니다.');
    }
    const notifications = await res.json();
    if (!Array.isArray(notifications) || notifications.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'notification-empty';
      emptyItem.textContent = '새로운 공지이 없습니다.';
      notificationList.appendChild(emptyItem);
      return;
    }
    notifications.forEach(notification => {
      const item = document.createElement('li');
      item.className = 'notification-item';
      if (!notification.isRead) {
        item.classList.add('unread');
      }
      const content = document.createElement('button');
      content.type = 'button';
      content.className = 'notification-content';
      content.setAttribute('aria-label',(notification.title||notification.message||'공지')+' 상세 보기');
      content.addEventListener('click', () => { location.hash='notifications/'+notification.id; });
      const message = document.createElement('span');
      message.className = 'notification-message';
      message.textContent = notification.title || notification.message || '';
      const createdAt = document.createElement('small');
      createdAt.className = 'notification-date';
      createdAt.textContent = notification.createdAt
        ? new Date(notification.createdAt).toLocaleDateString('ko-KR', {month:'numeric',day:'numeric'})
        : '';
      content.appendChild(message);
      content.appendChild(createdAt);
      item.appendChild(content);
      if (!notification.isRead) {
        const readButton = document.createElement('button');
        readButton.type = 'button';
        readButton.className = 'secondary-btn';
        readButton.textContent = '읽음';
        readButton.addEventListener('click', async () => {
          readButton.disabled = true;
          try {
            const readResponse = await authFetch(`/api/notifications/${notification.id}`, {method: 'PUT'});
            if (!readResponse.ok) {
              throw new Error('공지 처리에 실패했습니다.');
            }
            await loadNoti();
          } catch (error) {
            alert(error.message);
            readButton.disabled = false;
          }
        });
        item.appendChild(readButton);
      }
      notificationList.appendChild(item);
    });
  } catch (error) {
    const errorItem = document.createElement('li');
    errorItem.className = 'notification-empty';
    errorItem.textContent = error.message;
    notificationList.appendChild(errorItem);
  }
}

window.NotificationPage = (function(){
  let version=0;
  return {cancel(){version++;},async load(id){
    const current=++version,state=document.getElementById('notification-page-state'),message=document.getElementById('notification-page-message'),date=document.getElementById('notification-page-date'),title=document.getElementById('notification-page-title');
    title.textContent='';title.hidden=true;state.textContent='공지를 불러오는 중입니다…';message.textContent='';date.textContent='';date.removeAttribute('datetime');
    try{
      const response=await authFetch('/api/notifications/'+encodeURIComponent(id));if(current!==version)return;
      if(!response.ok)throw new Error(response.status===404?'공지를 찾을 수 없습니다. 삭제되었거나 접근할 수 없는 공지입니다.':'공지를 불러오지 못했습니다.');
      const note=await response.json();if(current!==version)return;message.textContent=note.message||'';title.textContent=note.title||'';title.hidden=!note.title;
      if(note.createdAt){date.textContent=new Date(note.createdAt).toLocaleString('ko-KR');date.dateTime=note.createdAt;}state.textContent='';
      if(!note.isRead){const read=await authFetch('/api/notifications/'+encodeURIComponent(id),{method:'PUT'});if(current!==version)return;if(!read.ok)state.textContent='읽음 처리에 실패했습니다. 공지 목록에서 다시 시도해 주세요.';else await loadNoti();}
    }catch(error){if(current===version)state.textContent=error.message;}
  }};
})();

/* 파일 업로드 — 원본을 작은 조각으로 전송 */
document.getElementById('upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const file = document.getElementById('file-input').files[0];
  if (!file) return;
  const button = e.target.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const buttonText=button.textContent;
  document.getElementById('file-upload-status').textContent='';
  button.disabled = true;
  try {
    await withLoading('파일을 업로드하고 있습니다…', async () => {
      const send=async payload=>{const res=await authFetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw new Error(data.message||'파일을 업로드하지 못했습니다.');return data;};
      await FileTransfer.upload(file,send,percent=>{button.textContent='업로드 '+percent+'%';});
      document.getElementById('file-input').value = '';
      document.getElementById('upload-dialog').close();
      await loadFiles();
    });
  } catch (error) {
    document.getElementById('file-upload-status').textContent='업로드 실패: '+error.message;
  } finally {
    button.disabled = false;
    button.textContent=buttonText;
  }
});

/* 파일 목록 — GET /api/files */
async function loadFiles() {
  if(!canUse('fileRead'))return;
  const fileList = document.getElementById('file-list');
  fileList.replaceChildren();
  try {
    const response = await authFetch('/api/files');
    if (!response.ok) {
      throw new Error('파일 목록을 불러오지 못했습니다.');
    }
    const files = await response.json();
    // 같은 ID가 중복 반환돼도 한번만 표시
    const uniqueFiles = Array.from(
      new Map(
        files.filter(Boolean).map(file => [String(file.id), file])
      ).values()
    );

    if (uniqueFiles.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'file-empty';
      emptyItem.textContent = '업로드된 파일이 없습니다.';
      fileList.appendChild(emptyItem);
      return;
    }
    uniqueFiles.forEach(file => {
      const item = document.createElement('li');
      item.className = 'file-item';
      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      const link = document.createElement(canUse('fileDownload')?'a':'span');
      if(canUse('fileDownload'))link.href = '#';
      link.textContent = file.originalName || file.filename || '파일 다운로드';
      link.addEventListener('click', async e => {
        e.preventDefault();
        if(!canUse('fileDownload'))return;
        try {
          const headers={Authorization:`Bearer ${localStorage.getItem('token')}`};
          const blob=await FileTransfer.download(file,async suffix=>{const response=await loadingFetch(`/api/upload/${file.id}${suffix}`,{headers});if(!response.ok)throw new Error(`다운로드 실패: ${response.status}`);return response.blob();});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.originalName || file.filename || 'download';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error('파일 다운로드 에러', error);
          alert('파일 다운로드에 실패했습니다.');
        }
      });
      // link.target = '_blank';
      // link.rel = 'noopener noreferrer';
      fileInfo.appendChild(link);
      const date = document.createElement('time');
      date.className = 'file-registration-date';
      const uploaded = new Date(file.uploadedAt || file.createdAt || '');
      date.textContent = Number.isNaN(uploaded.getTime()) ? '등록일 —' : '등록일 ' + uploaded.toLocaleDateString('ko-KR');
      if(!Number.isNaN(uploaded.getTime()))date.dateTime=uploaded.toISOString();
      fileInfo.appendChild(date);
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = '삭제';
      deleteButton.hidden=!canUse('fileDelete');
      deleteButton.className = 'file-delete-btn';
      deleteButton.addEventListener('click', async () => {
        const fileName = file.originalName || file.filename || '해당 파일';
        if (!confirm(`${fileName}을 삭제하시겠습니까?`)) {
          return;
        }
        deleteButton.disabled = true;
        deleteButton.textContent = '삭제중...';
        try {
          const deleteResponse = await authFetch(`/api/upload/${file.id}`, {method: 'DELETE'});
          if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json().catch(() => ({}));
            throw new Error(errorData.message || '파일을 삭제하지 못했습니다.');
          }
          await loadFiles();
        } catch (error) {
          alert(error.message);
          deleteButton.disabled = false;
          deleteButton.textContent = '삭제';
        }
      });
      item.appendChild(fileInfo);
      item.appendChild(deleteButton);
      fileList.appendChild(item);
    });
  } catch (error) {
    const errorItem = document.createElement('li');
    errorItem.className = 'file-empty';
    errorItem.textContent = error.message;
    fileList.appendChild(errorItem);
  }
}

/* 업무일지 공통함수 */
/* textarea 문자열을 배열로 변환 */
function linesToArray(value) {
  if (!value) return [];
  const result = [];
  const stack = [];
  let lastNode = null;
  value.split('\n').forEach(line => {
    // 원본 line으로 들여쓰기를 검사합니다.
    if (!line.trim()) {
      return;
    }
    const tabMatch = line.match(/^\t*/);
    const depth = tabMatch ? tabMatch[0].length : 0;
    const content=line.slice(depth);
    if(content.startsWith('\\ ')&&lastNode){lastNode.task+='\n'+content.slice(2);return;}
    const node = {task: content.startsWith('\\\\')?content.slice(1):content.trim(), checked: false, children: []};
    lastNode=node;
    if (depth === 0) {
      result.push(node);
    } else {
      const parent = stack[depth - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        result.push(node);
      }
    }
    stack[depth] = node;
    stack.length = depth + 1;
  });
  return result;
}

/* textarea 배열을 문자열로 변환 */
function arrayToLines(items) {
  if (!Array.isArray(items)) return '';
  const lines = [];
  function appendItems(nodes, depth) {
    nodes.filter(Boolean).forEach(node => {
      if (typeof node === 'string') {
        lines.push(`${'\t'.repeat(depth)}${node}`);
        return;
      }
      if (node.task) {
        String(node.task).split('\n').forEach((line,index)=>lines.push('\t'.repeat(depth)+(index?'\\ ':line.startsWith('\\')?'\\':'')+line));
      }
      if (Array.isArray(node.children)) {
        appendItems(node.children, depth + 1);
      }
    });
  }
  appendItems(items, 0);
  return lines.join('\n');
}

// 오늘 날짜 YYYY-MM-DD 형태로 반환
function getTodayString() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

/** 업무일지 모달 열기 */
function openWorklogModal(worklog = null) {
  const modal = document.getElementById('worklog-modal');
  const form = document.getElementById('worklog-form');
  const modalTitle = document.getElementById('modal-title');
  const saveButton = document.getElementById('worklog-save-btn');
  form.reset();
  const isEdit = Boolean(worklog);
  modalTitle.textContent = isEdit ? '업무일지 수정' : '새 업무일지 등록';
  saveButton.textContent = isEdit ? '수정 완료' : '등록';
  form.worklogId.value = isEdit ? worklog.id : '';
  form.workDate.value = isEdit ? worklog.workDate : getTodayString();
  form.todo.value = isEdit ? arrayToLines(worklog.todo) : '';
  form.nextDayPlan.value = isEdit ? arrayToLines(worklog.nextDayPlan) : '';
  form.remarks.value = isEdit ? worklog.remarks || '' : '';
  form.memo.value = isEdit ? worklog.memo || '' : '';
  [form.todo, form.nextDayPlan, form.remarks, form.memo].forEach(input => input.dispatchEvent(new Event('input')));
  modal.classList.add('open');
  modal.querySelector('.modal-dialog').scrollTop = 0;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    document.getElementById('modal-close-btn').focus({preventScroll: true});
  }, 0);
}
/* 업무일지 모달 닫기 */
function closeWorklogModal() {
  const modal = document.getElementById('worklog-modal');
  const form = document.getElementById('worklog-form');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  form.reset();
}
/* 새 업무일지 버튼 */
document
  .getElementById('open-worklog-btn')
  .addEventListener('click', () => {
    openWorklogModal();
  })
/* 우측 상단 닫기 버튼 */
document.getElementById('modal-close-btn').addEventListener('click', () => {
  closeWorklogModal();
})
/* 취소 버튼 */
document.getElementById('modal-cancel-btn').addEventListener('click', () => {
  closeWorklogModal();
})
/* 모달 바깥 영역 클릭 */
document.querySelector('[data-modal-close]').addEventListener('click', () => {
  closeWorklogModal();
})
/* ESC로 모달 닫기 */
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('worklog-modal');
  if (e.key === 'Escape' && modal.classList.contains('open') && !document.getElementById('text-import-dialog').open && !document.getElementById('editor-add-dialog')?.open && !document.getElementById('reference-dialog')?.open) {
    closeWorklogModal();
  }
})

function mergeTodoChecked(newItems, previousItems) {
  const oldItems = Array.isArray(previousItems)
    ? previousItems.filter(Boolean) : [];
  return newItems.filter(Boolean).map(newItems => {
    const oldItem = oldItems.find(item => item.task === newItems.task)
    return {
      task: newItems.task,
      checked: oldItem ? Boolean(oldItem.checked) : false,
      children: mergeTodoChecked(
        newItems.children || [],
        oldItem && oldItem.children
      )
    }
  })
}

/* 업무일지 등록 및 수정 */
document.getElementById('worklog-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const id = form.worklogId.value;
  // 수정 중인 기존 업무일지 찾기
  const previousWorklog =
    currentWorklogs.find(worklog => String(worklog.id) === String(id));
  const inputTodo = linesToArray(form.todo.value)
  // 수정시 기존 업무명과 같은 todo는 완료 여부를 유지합니다.
  const todo = mergeTodoChecked(
    inputTodo, previousWorklog ? previousWorklog.todo : []
  )
  const payload = {
    workDate: form.workDate.value,
    todo,
    nextDayPlan: mergeTodoChecked(linesToArray(form.nextDayPlan.value), previousWorklog?.nextDayPlan || []),
    remarks: form.remarks.value.trim(),
    memo: form.memo.value.trim()
  };
  for(const key of ['remarks','memo'])payload[key+'Items']=mergeTodoChecked(linesToArray(payload[key]),previousWorklog?WorklogSections.read(previousWorklog,key,linesToArray,arrayToLines):[]);
  const url = id ? `/api/worklogs/${id}` : '/api/worklogs';
  const method = id ? 'PUT' : 'POST';
  const saveButton = document.getElementById('worklog-save-btn')
  const originalButtonText = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = '저장 중...';
  try {
    const response = await authFetch(url, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '업무일지를 저장하지 못했습니다.')
    }
    closeWorklogModal();
    await loadList(currentFilterDate);
  } catch (error) {
    alert(`오류: ${error.message}`)
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = originalButtonText;
  }
});

/*
** 공통버튼 생성
*/
function createButton(text, className, clickHandler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = className;
  button.addEventListener('click', clickHandler)
  return button;
}

/*
** TODO 항목 생성
*/
function createTodoItem(worklog, todo) {
  const label = document.createElement('div');
  label.className = 'todo-item';
  if (todo.checked) {
    label.classList.add('completed');
  }
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(todo.checked);
  checkbox.disabled=!canUse('worklogEdit');
  checkbox.setAttribute('aria-label', (todo.task || 'TODO 항목') + ' 완료');
  const text = document.createElement('div');
  text.tabIndex=0;
  text.className='todo-text-btn';
  References.render(text,todo.task || '');
  if(canUse('worklogEdit'))TodoInline.attach(label,text,todo,async (value,changes) => {
    const copy=JSON.parse(JSON.stringify(worklog.todo));
    const position=flattenTodoItems(worklog.todo).indexOf(todo);
    const target=flattenTodoItems(copy)[position];target.task=value;
    // Reverse sibling inserts to preserve the order entered by the user.
    changes.additions.filter(a=>a.kind==='child').forEach(a=>TodoTree.add(copy,target,a.kind,a.task));
    changes.additions.filter(a=>a.kind==='sibling').reverse().forEach(a=>TodoTree.add(copy,target,a.kind,a.task));
    const response=await authFetch(`/api/worklogs/${worklog.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({todo:copy})});
    if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.message||'TODO 내용을 저장하지 못했습니다.');}
    worklog.todo=copy;
    renderWorklogs(currentWorklogs);
  },worklog.todo);
  checkbox.addEventListener('change', async () => {
    const affected = flattenTodoItems([todo]);
    const previousStates = affected.map(item => ({item, checked: Boolean(item.checked)}));
    affected.forEach(item => { item.checked = checkbox.checked; });
    label.classList.toggle('completed', checkbox.checked);
    // Lock this card while saving so child edits cannot race with the parent update.
    const card=label.closest('.worklog-card');
    card.dataset.todoSaving='true';
    card.querySelectorAll('input[type="checkbox"], button')
      .forEach(input => { input.disabled = true; });
    try {
      const response = await authFetch(
        `/api/worklogs/${worklog.id}`,
        {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({todo: worklog.todo})
        }
      );
      if (!response.ok) {
        throw new Error('완료 상태를 저장하지 못했습니다.')
      }
      /**
       * 완료 건수 표시 갱신
       **/
      renderWorklogs(currentWorklogs)
    } catch (error) {
      previousStates.forEach(({item, checked}) => { item.checked = checked; });
      renderWorklogs(currentWorklogs);
      alert(error.message)
    }
  });
  label.appendChild(checkbox);
  label.appendChild(text);
  if(canUse('worklogEdit'))TodoDrag.attach(label,todo,worklog,async copy=>{
    const response=await authFetch(`/api/worklogs/${worklog.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({todo:copy})});
    if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.message||'항목 위치를 저장하지 못했습니다.');}
    worklog.todo=copy;if(label.isConnected)renderWorklogs(currentWorklogs);
  });
  return label;
}

/**
 * 빈 목록 화면 생성
 **/
function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  const title = document.createElement('strong')
  title.textContent = '등록된 업무일지가 없습니다.';
  const description = document.createElement('span');
  description.textContent = '새 일지 등록 버튼을 눌러 업무일지를 작성해보세요.';
  empty.appendChild(title);
  empty.appendChild(description);
  return empty;
}
/**
 * 계층형 TODO목록 출력
 **/
function appendTodoNodes(container, nodes, worklog, depth = 0) {
  if (!Array.isArray(nodes)) {
    return
  }
  nodes.filter(Boolean).forEach(todo => {
    if (!todo) {
      return
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'todo-node';
    wrapper.style.marginLeft = `${depth * 32}px`;
    const todoItem = createTodoItem(worklog, todo);
    if (Array.isArray(todo.children) && todo.children.length > 0) {
      todoItem.classList.add('todo-parent')
    } else {
      todoItem.classList.add('todo-child')
    }
    wrapper.appendChild(todoItem);
    container.appendChild(wrapper);
    appendTodoNodes(container, todo.children, worklog, depth + 1)
  })
}

/**
 * 완료 개수 계산
 **/
function flattenTodoItems(items) {
  const result = [];
  if (!Array.isArray(items)) {
    return result;
  }
  items.filter(Boolean).forEach(item => {
    result.push(item);
    if (Array.isArray(item.children)) {
      result.push(...flattenTodoItems(item.children))
    }
  })
  return result;
}

/**
 * 카드 하단 생성 함수 추가
 **/
function createInfoSection(title, value) {
  const section = document.createElement('section');
  section.className = 'card-info-section';
  const heading = document.createElement('h4');
  heading.className = 'card-info-title';
  heading.textContent = title;
  section.appendChild(heading);
  const values = Array.isArray(value)
    ? value
    : String(value || '')
      .split('\n')
      .map(item => item.trimEnd())
      .filter(item => item.trim())
  if (values.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'card-info-empty';
    empty.textContent = '등록된 내용이 없습니다.';
    section.appendChild(empty);
    return section
  }
  const list = document.createElement('ul');
  list.className = 'card-info-list';
  values.forEach(valueItem => {
    const item = document.createElement('li');
    References.render(item,typeof valueItem === 'string' ? valueItem : valueItem.task || '');
    list.appendChild(item);
  });
  section.appendChild(list);
  return section
}

/**
 * 익일 계획
 **/
function createPlanTree(items, depth = 0) {
  const list = document.createElement('ul');
  list.className = 'plan-tree';
  list.dataset.depth = depth;
  if (!Array.isArray(items)) {
    return list
  }
  items.filter(Boolean).forEach(plan => {
    const item = document.createElement('li');
    item.className = 'plan-tree-item';
    const text = document.createElement('span');
    text.className = 'plan-tree-text';
    References.render(text,typeof plan === 'string' ? plan : plan.task || '');
    item.appendChild(text);

    if (
      typeof plan !== 'string' &&
      Array.isArray(plan.children) &&
      plan.children.length > 0
    ) {
      item.classList.add('has-children')
      const childList = createPlanTree(plan.children, depth + 1);
      item.appendChild(childList);
    }
    list.appendChild(item);
  });
  return list;
}

/**
 * 업무 일지 목록 화면 생성
 **/
function renderWorklogs(worklogs) {
  const availableIds = new Set((Array.isArray(worklogs) ? worklogs : []).map(item => String(item.id)));
  for (const id of selectedWorklogIds) if (!availableIds.has(id)) selectedWorklogIds.delete(id);
  updateCopyButton();
  const container =
    document.getElementById(
      'worklog-list'
    )
  container.innerHTML = '';
  if (!Array.isArray(worklogs) || worklogs.length === 0) {
    container.appendChild(createEmptyState());
    window.WorklogSearch?.refresh();
    return;
  }
  worklogs.forEach(worklog => {
    const todoList = Array.isArray(worklog.todo)
      ? worklog.todo.filter(todo => todo !== null)
      : [];
    const nextDayPlanList = Array.isArray(worklog.nextDayPlan)
      ? worklog.nextDayPlan
      : [];
    const allTodoItems = flattenTodoItems(todoList);
    const completedCount = allTodoItems.filter(todo => Boolean(todo.checked)).length;
    const totalCount = allTodoItems.length;
    const isAllCompleted = totalCount > 0 && completedCount === totalCount;
    /*업무일지 카드*/
    const card = document.createElement('article');
    card.className = 'worklog-card';
    card.classList.toggle('is-selected', selectedWorklogIds.has(String(worklog.id)));
    /*카드헤더*/
    const cardHeader = document.createElement('div')
    cardHeader.className = 'card-header';
    const dateWrap = document.createElement('div');
    dateWrap.className = 'card-date-wrap';
    const workDate = document.createElement('div');
    workDate.className = 'card-date';
    workDate.textContent = worklog.workDate || '-';
    const progress = document.createElement('span');
    progress.className = 'progress-badge';
    if (isAllCompleted) {
      progress.classList.add('complete');
    }
    progress.textContent = `${completedCount} / ${totalCount} 완료`;
    dateWrap.appendChild(workDate);
    dateWrap.appendChild(progress);
    const cardActions = document.createElement('div');
    cardActions.className = 'card-actions';
    const editButton = createButton('수정', 'edit-btn', () => {
      openWorklogModal(worklog);
    });
    const deleteButton = createButton('삭제', 'danger-btn', async () => {
      const confirmed = await JournalControls.confirmDelete(worklog.workDate);
      if (!confirmed) {
        return;
      }
      deleteButton.disabled = true;
      deleteButton.textContent = '삭제 중...';
      try {
        const response = await authFetch(`/api/worklogs/${worklog.id}`, {
          method: 'DELETE'
        });
        if (!response.ok) {
          throw new Error('업무일지를 삭제하지 못했습니다.')
        }
        await loadList(currentFilterDate)
      } catch (error) {
        alert(error.message);
        deleteButton.disabled = false;
        deleteButton.textContent = '삭제';
      }
    });


    cardHeader.appendChild(dateWrap);
    cardHeader.appendChild(cardActions);
    /* 카드 본문 */
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    const sectionServices={canEdit:canUse('worklogEdit'),parse:linesToArray,serialize:arrayToLines,render:()=>renderWorklogs(currentWorklogs),save:async(log,payload)=>{const response=await authFetch(`/api/worklogs/${log.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.message||'내용을 저장하지 못했습니다.');}}};
    cardBody.append(WorklogSections.create(worklog,'todo','TODO',sectionServices),WorklogSections.create(worklog,'nextDayPlan','익일 계획',sectionServices));
    const cardFooter=document.createElement('div');cardFooter.className='card-footer';cardFooter.append(WorklogSections.create(worklog,'remarks','비고',sectionServices),WorklogSections.create(worklog,'memo','메모',sectionServices));

    /*카드 하단End*/
    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    card.appendChild(cardFooter);
    JournalControls.addCardMenu(card, worklog, {duplicate:()=>duplicateWorklogs([worklog]),edit:()=>editButton.click(),remove:()=>deleteButton.click()}, {create:canUse('worklogCreate'),edit:canUse('worklogEdit'),remove:canUse('worklogDelete')});
    container.appendChild(card);
  });
  window.WorklogSearch?.refresh();
}

/**
 * 업무일지 목록 조회 - 여기부터 2026-09-10
 **/
async function loadList(date = '') {
  if(!canUse('worklogRead'))return;
  currentFilterDate = date;
  JournalControls.updateFilter(date);
  const container = document.getElementById('worklog-list');
  container.innerHTML = `
    <div class="empty-state">
      <strong>업무일지를 불러오는 중입니다.</strong>
      <span>잠시만 기다려주세요.</span>
    </div>
  `;
  const url = date
    ? `/api/worklogs?date=${encodeURIComponent(date)}`
    : '/api/worklogs';
  try {
    const response = await authFetch(url);
    if (!response.ok) {
      throw new Error('업무일지 목록을 불러오지 못했습니다.');
    }
    currentWorklogs = await response.json();
    renderWorklogs(currentWorklogs)
  } catch (error) {
    container.innerHTML = '';
    const errorState = document.createElement('div');
    errorState.className = 'empty-state';
    const title = document.createElement('strong');
    title.textContent = '목록 조회 오류';
    const message = document.createElement('span');
    message.textContent = error.message;
    errorState.appendChild(title);
    errorState.appendChild(message);
    container.appendChild(errorState);
  }
}

/**
 * 날짜 조회
 **/
document.getElementById('filter-btn').addEventListener('click', async () => {
  const date = document.getElementById('filter-date').value;
  document.getElementById('search-dialog').close();
  await loadList(date);
})
/**
 * 전체 조회
 **/
document.getElementById('reset-filter-btn').addEventListener('click', () => {
  const date = document.getElementById('filter-date').value = '';
  document.getElementById('search-dialog').close();
  document.getElementById('worklog-query').value='';
  window.WorklogSearch?.clear();
  loadList('');
})

/* Touch controls and Tab / Shift+Tab use the same line-based editor. */
;['todo', 'next-day-plan', 'memo'].forEach(id => {
  const textarea = document.getElementById(id);
  const toolbar = document.querySelector('[data-editor="' + id + '"]');
  function updateButtons() {
    ['indent', 'outdent'].forEach(action => {
      const result = ListEditor.changeDepth(textarea.value, textarea.selectionStart,
        textarea.selectionEnd, action === 'indent' ? 1 : -1);
      toolbar.querySelector('[data-action="' + action + '"]').disabled = result.value === textarea.value;
    });
  }
  function apply(action) {
    const result = action === 'add'
      ? ListEditor.addLine(textarea.value, textarea.selectionStart, textarea.selectionEnd)
      : ListEditor.changeDepth(textarea.value, textarea.selectionStart, textarea.selectionEnd,
        action === 'indent' ? 1 : -1);
    textarea.value = result.value;
    textarea.focus({preventScroll: true});
    textarea.setSelectionRange(result.start, result.end);
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
  }
  toolbar.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) event.preventDefault();
  });
  toolbar.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (button && !button.disabled) apply(button.dataset.action);
  });
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      apply(event.shiftKey ? 'outdent' : 'indent');
    } else if (event.key === 'Enter' && !event.isComposing) {
      const lineStart = textarea.value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
      const indent = textarea.value.slice(lineStart, textarea.selectionStart).match(/^\t*/)[0];
      if (indent) {
        event.preventDefault();
        textarea.setRangeText('\n' + indent, textarea.selectionStart, textarea.selectionEnd, 'end');
        textarea.dispatchEvent(new Event('input', {bubbles: true}));
      }
    }
  });
  ['input', 'click', 'keyup', 'select', 'focus'].forEach(event =>
    textarea.addEventListener(event, updateButtons));
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === textarea) updateButtons();
  });
  updateButtons();
});
/**
 * 최초 화면 로드
 **/
if (token) {
  showMainScreen().then(ready => ready && Promise.all([
    loadNoti(),
    loadFiles(),
    loadList()
  ])).catch(() => { showLoginScreen(); document.getElementById('login-msg').textContent='접속을 확인하지 못했습니다. 다시 로그인해 주세요.'; });
} else {
  showLoginScreen();
}

/* Independently collapse the notification and file cards. */
document.querySelectorAll('.card-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    const body = document.getElementById(button.getAttribute('aria-controls'));
    body.hidden = expanded;
    button.setAttribute('aria-expanded', String(!expanded));
    button.setAttribute('aria-label', button.dataset.cardTitle + (expanded ? ' 펼치기' : ' 접기'));
    button.closest('.content-card').classList.toggle('is-collapsed', expanded);
  });
});

function askCopyMode() {
  const dialog = document.getElementById('copy-confirm-dialog');
  return new Promise(resolve => {
    const finish = value => { dialog.close(); resolve(value); };
    document.getElementById('copy-yes-btn').onclick = () => finish(true);
    document.getElementById('copy-no-btn').onclick = () => finish(false);
    document.getElementById('copy-cancel-btn').onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.showModal();
  });
}
/* Duplicate only the selected journal cards using today's date. */
async function duplicateWorklogs(sources) {
  if (duplicatingWorklogs || !canUse('worklogCreate')) return;
  if (!sources.length) return;
  duplicatingWorklogs = true;
  updateCopyButton();
  const message = document.getElementById('worklog-action-msg');
  message.textContent = '';
  let success = 0;
  const failed = [];
  const today = getTodayString();
  try {
    const removeChecked = await askCopyMode();
    if (removeChecked === null) return;
    await withLoading('선택한 일지를 오늘 날짜로 복제하고 있습니다…', async () => {
      for (const source of sources) {
        try {
          const response = await authFetch('/api/worklogs', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(WorklogCopy.makeCopy(source, today, removeChecked))
          });
          if (!response.ok) throw new Error((await response.json()).message || '복제 실패');
          success++;
          selectedWorklogIds.delete(String(source.id));
        } catch (error) { failed.push(error.message); }
      }
      if (!failed.length) {
        document.getElementById('filter-date').value = today;
        await loadList(today);
      } else await loadList(currentFilterDate);
    });
    message.textContent = failed.length ? `${success}개 복제 완료, ${failed.length}개 실패: ${failed[0]}` : `${success}개 일지를 오늘(${today}) 날짜로 복제했습니다.`;
  } finally {
    duplicatingWorklogs = false;
    updateCopyButton();
  }
}
document.getElementById('duplicate-worklog-btn').addEventListener('click', () => duplicateWorklogs(currentWorklogs.filter(item => selectedWorklogIds.has(String(item.id)))));





