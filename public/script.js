/* public/script.js */

/* 전역 토큰 (localStorage 에 저장) */
let token = localStorage.getItem('token') || '';
let currentWorklogs = [];
let currentFilterDate = '';

/* 공통 fetch (Authorization 자동 삽입) */
async function authFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, {
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
  const passwordInput = document.getElementById('password');
  if (passwordInput) {
    passwordInput.value = '';
  }
}

function showMainScreen() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'grid';
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
      const response = await fetch('/api/auth/login', {
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
      showMainScreen();
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
  token = '';
  currentWorklogs = [];
  currentFilterDate = '';
  localStorage.removeItem('token');
  closeWorklogModal();
  showLoginScreen();
});

/* 알림 — GET /api/notifications */
async function loadNoti() {
  const notificationList = document.getElementById('noti-list');
  notificationList.innerHTML = '';

  try {
    const res = await authFetch('/api/notifications');

    if (!res.ok) {
      throw new Error('알림을 불러오지 못했습니다.');
    }
    const notifications = await res.json();
    if (!Array.isArray(notifications) || notifications.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'notification-empty';
      emptyItem.textContent = '새로운 알림이 없습니다.';
      notificationList.appendChild(emptyItem);
      return;
    }
    notifications.forEach(notification => {
      const item = document.createElement('li');
      item.className = 'notification-item';
      if (!notification.isRead) {
        item.classList.add('unread');
      }
      const content = document.createElement('div');
      content.className = 'notification-content';
      const message = document.createElement('span');
      message.className = 'notification-message';
      message.textContent = notification.message || '';
      const createdAt = document.createElement('small');
      createdAt.className = 'notification-date';
      createdAt.textContent = notification.createdAt
        ? new Date(notification.createdAt).toLocaleString()
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
              throw new Error('알림 처리에 실패했습니다.');
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

/* 파일 업로드 — POST /api/upload (base64) */
document.getElementById('upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const file = document.getElementById('file-input').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    const payload = {filename: file.name, mime: file.type, data: base64};
    const res = await authFetch('/api/upload', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      alert('업로드 성공');
      loadFiles();
    } else {
      alert('업로드 실패: ' + (data.message || ''));
    }
  };
  reader.readAsDataURL(file);
});

/* 파일 목록 — GET /api/files */
async function loadFiles() {
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
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = file.originalName || file.filename || '파일 다운로드';
      link.addEventListener('click', async e => {
        e.preventDefault();
        try {
          const response = await fetch(`/api/upload/${file.id}`, {
            method: 'GET',
            headers: {Authorization: `Bearer ${localStorage.getItem('token')}`}
          });
          if (!response.ok) {
            throw new Error(`다운로드 실패: ${response.status}`);
          }
          const blob = await response.blob();
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
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'X';
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
  let currentParent = null;
  value.split('\n').forEach(line => {
    // 원본 line으로 들여쓰기를 검사합니다.
    if (!line.trim()) {
      return;
    }
    const tabMatch = line.match(/^\t*/);
    const depth = tabMatch ? tabMatch[0].length : 0;
    const node = {task: line.trim(), checked: false, children: []};
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
        lines.push(`${'\t'.repeat(depth)}${node.task}`);
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
  const modalTitle = document.getElementById('worklog-title');
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
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    form.workDate.focus();
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
  if (e.key === 'Escape' && modal.classList.contains('open')) {
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
    nextDayPlan: linesToArray(form.nextDayPlan.value),
    remarks: form.remarks.value.trim(),
    memo: form.memo.value.trim()
  };
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
  const label = document.createElement('label');
  label.className = 'todo-item';
  if (todo.checked) {
    label.classList.add('completed');
  }
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(todo.checked);
  const text = document.createElement('span');
  text.textContent = todo.task || '';
  checkbox.addEventListener('change', async () => {
    const affected = flattenTodoItems([todo]);
    const previousStates = affected.map(item => ({item, checked: Boolean(item.checked)}));
    affected.forEach(item => { item.checked = checkbox.checked; });
    label.classList.toggle('completed', checkbox.checked);
    // Lock this card while saving so child edits cannot race with the parent update.
    label.closest('.worklog-card').querySelectorAll('input[type="checkbox"]')
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
  label.appendChild(text)
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
      .map(item => item.trim())
      .filter(Boolean)
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
    item.textContent = typeof valueItem === 'string'
      ? valueItem
      : valueItem.task || '';
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
    text.textContent = typeof plan === 'string'
      ? plan
      : plan.task || '';
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
  const container =
    document.getElementById(
      'worklog-list'
    )
  container.innerHTML = '';
  if (!Array.isArray(worklogs) || worklogs.length === 0) {
    container.appendChild(createEmptyState());
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
      const confirmed = confirm(`${worklog.workDate} 업무일지를 삭제하시겠습니까?`);
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

    cardActions.appendChild(editButton);
    cardActions.appendChild(deleteButton);
    cardHeader.appendChild(dateWrap);
    cardHeader.appendChild(cardActions);
    /* 카드 본문 */
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    //TODO영역
    const todoSection = document.createElement('section');
    todoSection.className = 'card-section';
    const todoTitle = document.createElement('h3');
    todoTitle.textContent = 'TO-DO';
    const todoContainer = document.createElement('div');
    todoContainer.className = 'todo-list';
    if (todoList.length === 0) {
      const emptyTodo = document.createElement('p');
      emptyTodo.className = 'section-empty';
      emptyTodo.textContent = '등록된 TO-DO가 없습니다.'
      todoContainer.appendChild(emptyTodo);
    } else {
      appendTodoNodes(todoContainer, todoList, worklog)
    }
    todoSection.appendChild(todoTitle);
    todoSection.appendChild(todoContainer);
    /* 익일 계획 영역 */
    const planSection = document.createElement('section');
    planSection.className = 'card-section';
    const planTitle = document.createElement('h3');
    planTitle.textContent = '익일 계획'

    planSection.appendChild(planTitle);
    if (nextDayPlanList.length === 0) {
      const emptyPlan = document.createElement('p');
      emptyPlan.className = 'section-empty';
      emptyPlan.textContent = '등록된 익일 계획이 없습니다.';
      planSection.appendChild(planTitle);
      planSection.appendChild(emptyPlan);
    } else {
      const planTree = createPlanTree(nextDayPlanList);
      planSection.appendChild(planTree)
    }
    cardBody.appendChild(todoSection);
    cardBody.appendChild(planSection);
    /*카드 하단*/
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer';
    const remarksSection = createInfoSection('비고', worklog.remarks);
    const memoSection = createInfoSection('메모', worklog.memo);
    cardFooter.appendChild(remarksSection);
    cardFooter.appendChild(memoSection);
    /*카드 하단End*/
    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    card.appendChild(cardFooter);
    container.appendChild(card);
  })
}

/**
 * 업무일지 목록 조회 - 여기부터 2026-09-10
 **/
async function loadList(date = '') {
  currentFilterDate = date;
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
document.getElementById('filter-btn').addEventListener('click', () => {
  const date = document.getElementById('filter-date').value;
  loadList(date);
})
/**
 * 전체 조회
 **/
document.getElementById('reset-filter-btn').addEventListener('click', () => {
  const date = document.getElementById('filter-date').value = '';
  loadList('');
})

/* Touch controls and Tab / Shift+Tab use the same line-based editor. */
;['todo', 'next-day-plan'].forEach(id => {
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
  showMainScreen();
  Promise.all([
    loadNoti(),
    loadFiles(),
    loadList()
  ]);
} else {
  showLoginScreen();
}
