(() => {
  const role = document.body.dataset.role;
  const params = new URLSearchParams(location.search);
  const status = document.getElementById('workspace-status');
  let person = params.get('person'); let task = params.get('task');
  let peoplePage = 1; let auditPage = 1; let charts = [];
  const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value ?? ''; if (className) el.className = className; return el; };
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...options.headers } });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed'); return result;
  }
  const run = action => action().catch(error => { status.textContent = error.message; showToast(error.message, 'bad'); });
  function table(container, headers, rows) {
    container.replaceChildren(); if (!rows.length) { container.append(text('p','No records found.')); return; }
    const table = document.createElement('table'); const head = document.createElement('tr');
    headers.forEach(h => head.append(text('th', h))); const thead = document.createElement('thead'); thead.append(head); table.append(thead);
    const tbody = document.createElement('tbody'); rows.forEach(values => { const row = document.createElement('tr'); values.forEach(v => row.append(text('td',v))); tbody.append(row); }); table.append(tbody); container.append(table);
  }
  function paging(id, page, total, limit, change) {
    const box = document.getElementById(id); box.replaceChildren(text('span', `Page ${page} · ${total} records `));
    for (const [label, to, disabled] of [['Previous', page - 1, page <= 1], ['Next', page + 1, page * limit >= total]]) {
      const button = text('button', label); button.disabled = disabled; button.addEventListener('click', () => run(() => change(to))); box.append(button);
    }
  }
  async function analytics() {
    const endpoints = ['attendance-trend','task-status','leave-by-month','dept-headcount'];
    const results = await Promise.all(endpoints.map(e => api('/api/analytics/' + e)));
    charts.forEach(c => c.destroy()); charts = [];
    if (!window.Chart) { status.textContent = 'Chart library unavailable. Data loaded successfully.'; return; }
    const configs = [
      ['attendance-chart','line',results[0].data.map(r => r._id.slice(5)),[{ label:'Present', data:results[0].data.map(r => r.present), borderColor:'#4f46e5' },{ label:'Late', data:results[0].data.map(r => r.late), borderColor:'#d97706' }]],
      ['tasks-chart','doughnut',results[1].data.map(r => r._id),[{ label:'Tasks', data:results[1].data.map(r => r.n), backgroundColor:['#818cf8','#fbbf24','#4ade80','#f87171'] }]],
      ['leaves-chart','bar',results[2].data.map(r => r._id),[{ label:'Working days', data:results[2].data.map(r => r.n), backgroundColor:'#818cf8' }]],
      ['departments-chart','bar',results[3].data.map(r => r._id),[{ label:'Employees', data:results[3].data.map(r => r.n), backgroundColor:'#4f46e5' }]]
    ];
    for (const [id, type, labels, datasets] of configs) charts.push(new Chart(document.getElementById(id), { type, data:{ labels, datasets }, options:{ responsive:true, indexAxis: id === 'departments-chart' ? 'y' : 'x', plugins:{ legend:{ position:'bottom' } }, ...(type !== 'doughnut' ? { scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } } : {}) } }));
  }
  async function people() {
    const form = document.getElementById('people-filter'); const query = new URLSearchParams(new FormData(form));
    query.set('page',peoplePage); query.set('limit','20'); if (person) query.set('id', person);
    const result = await api(`/api/people/${query.get('type')}?${query}`);
    table(document.getElementById('people-results'), ['Name','Email','Department','Status'], result.data.map(p => [p.name,p.email,p.department || 'Unassigned',p.status]));
    paging('people-paging',result.page,result.total,result.limit, async page => { peoplePage = page; await people(); });
    if (role === 'Manager') return;
    const org = await api('/api/people/org'); const box = document.getElementById('org-chart'); box.replaceChildren();
    for (const manager of [...org.data,{ name:'Unassigned',reports:org.unassigned }]) {
      const branch = document.createElement('div'); branch.append(text('strong',manager.name)); const ul = document.createElement('ul');
      manager.reports.forEach(e => ul.append(text('li',`${e.name} · ${e.department || 'Unassigned'}`))); if (!manager.reports.length) ul.append(text('li','No direct reports')); branch.append(ul); box.append(branch);
    }
  }
  async function activity() {
    const query = new URLSearchParams(new FormData(document.getElementById('audit-filter'))); query.set('page',auditPage);
    const result = await api('/api/activity?' + query);
    table(document.getElementById('audit-results'), ['Time (IST)','Actor','Role','Action','Target'], result.data.map(a => [new Date(a.createdAt).toLocaleString('en-IN',{ timeZone:'Asia/Kolkata' }),a.actorName,a.actorRole,a.action,[a.targetType,a.targetId].filter(Boolean).join(' ')]));
    paging('audit-paging',result.page,result.total,result.limit, async page => { auditPage = page; await activity(); });
  }
  async function allCards(url) {
    const cards = []; let page = 1; let total;
    do { const result = await api(url + (url.includes('?') ? '&' : '?') + `page=${page}&limit=50`); cards.push(...result.data); total = result.total; page++; } while (cards.length < total);
    return cards;
  }
  function board(containerId, cards, statuses, type) {
    const box = document.getElementById(containerId); box.replaceChildren();
    for (const name of statuses) {
      const column = text('div','', 'column'); column.append(text('h3',name));
      const list = text('div','', 'cards'); list.dataset.status = name; column.append(list); box.append(column);
      for (const card of cards.filter(c => (c.status || (c.completed ? 'Done' : 'Pending')) === name)) {
        const el = text('article','', 'task'); el.dataset.id = card._id; el.dataset.status = name;
        el.append(text('h4',card.title || card.text)); if (card.description) el.append(text('p',card.description));
        if (card.deadline) el.append(text('p','Due ' + new Date(card.deadline).toLocaleDateString('en-IN')));
        if (card.submission) { const link = text('a','Download submission'); link.href = card.submission; el.append(link); }
        const moves = type === 'todos' ? statuses.filter(s => s !== name) : role === 'Manager' && name === 'Submitted' ? ['Approved','Rejected'] : role === 'Employee' && name === 'Pending' ? ['Submitted'] : [];
        for (const to of moves) { const button = text('button',to); button.addEventListener('click', () => run(() => move(card._id,to,type))); el.append(button); }
        list.append(el);
      }
      if (!list.children.length) list.append(text('p','No cards', 'muted'));
      if (window.Sortable) Sortable.create(list, { group:containerId, animation:150, draggable:'.task', onAdd: evt => run(async () => { const id = evt.item.dataset.id; try { await move(id,name,type); } catch (err) { evt.from.append(evt.item); throw err; } }) });
    }
  }
  async function move(id, to, type) {
    if (type === 'todos') await api(`/api/board/todos/${id}/status`, { method:'PATCH',body:JSON.stringify({ status:to }) });
    else if (role === 'Manager') {
      if (!['Approved','Rejected'].includes(to)) throw new Error('Managers may only approve or reject Submitted tasks');
      if (!await rsConfirm(`Mark this task ${to}?`)) { await boards(); return; }
      await api(`/manager/tasks/${id}/status`, { method:'PATCH',body:JSON.stringify({ status:to }) });
    } else {
      if (to !== 'Submitted') throw new Error('Use Submit to move a Pending task');
      await api('/employee/submitTask', { method:'POST',body:JSON.stringify({ taskId:id }) });
    }
    showToast('Card updated'); await boards();
  }
  async function boards() {
    const cards = await allCards('/api/board/tasks' + (task ? '?id=' + encodeURIComponent(task) : ''));
    board('task-board',cards,['Pending','Submitted','Approved','Rejected'],'tasks');
    if (role === 'Employee') board('todo-board',await allCards('/api/board/todos'),['Pending','In Progress','Done'],'todos');
  }
  const loaders = { analytics,people,activity,board:boards };
  async function activate(name) {
    const button = document.querySelector(`[data-tab="${name}"]`); if (!button) return;
    document.querySelectorAll('main > section').forEach(s => { s.hidden = s.id !== name; });
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
    status.textContent = 'Loading…'; await loaders[name](); status.textContent = '';
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => run(() => activate(b.dataset.tab))));
  document.getElementById('back-dashboard').href = rsDashboardUrl(role);
  document.getElementById('people-filter')?.addEventListener('submit', event => { event.preventDefault(); person = null; peoplePage = 1; run(people); });
  document.getElementById('audit-filter')?.addEventListener('submit', event => { event.preventDefault(); auditPage = 1; run(activity); });
  document.getElementById('todo-add')?.addEventListener('submit', event => { event.preventDefault(); run(async () => { const form = event.target; await api('/employee/addTodo',{ method:'POST',body:JSON.stringify({ text:form.elements.text.value }) }); form.reset(); await boards(); }); });
  if (person) { const type = { Employee:'employees',Manager:'managers',HR:'hrs' }[params.get('type')]; if (type) document.querySelector('#people-filter [name=type]').value = type; }
  document.addEventListener('rs:theme', () => { if (!document.getElementById('analytics').hidden) run(analytics); });
  run(() => activate(person ? 'people' : task ? 'board' : params.get('tab') || (['Admin','HR'].includes(role) ? 'analytics' : 'board')));
})();
