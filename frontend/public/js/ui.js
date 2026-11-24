/* Shared behavioral helpers. Visual design is intentionally deferred. */
window.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
// Legacy views have many HTML rendering paths. Sanitize every sink as defense in depth,
// including concatenation paths; data stays data after inline handlers are migrated.
if (window.DOMPurify) {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { ...descriptor, set(value) { descriptor.set.call(this, DOMPurify.sanitize(String(value ?? ''), { ADD_ATTR: ['target'] })); } });
  const insert = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(position, value) { return insert.call(this, position, DOMPurify.sanitize(String(value ?? ''))); };
}
window.showToast = (message, type = 'ok') => {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role','status'); box.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:1000;max-width:24rem'; document.body.append(box); }
  const item = document.createElement('p'); item.textContent = message;
  item.style.cssText = `padding:1rem;margin:.5rem;background:${type === 'bad' ? '#fee2e2' : '#dcfce7'};color:#111;border:1px solid #aaa;border-radius:.5rem`;
  box.append(item); setTimeout(() => item.remove(), 3500);
};
window.rsHandlers = window.rsHandlers || {};
for (const name of ['click','change','submit','input','error','keydown','keyup','focus','blur','mouseover','mouseout']) {
  document.addEventListener(name, event => {
    const element = event.target.closest?.(`[data-rs-${name}]`);
    if (!element) return;
    const handler = window.rsHandlers[element.getAttribute(`data-rs-${name}`)];
    if (!handler) return;
    const result = handler.call(element, event);
    if (result === false) { event.preventDefault(); event.stopPropagation(); }
  }, true);
}
window.rsConfirm = message => new Promise(resolve => {
  const dialog = document.createElement('dialog'); const text = document.createElement('p'); text.textContent = message;
  const yes = document.createElement('button'); yes.textContent = 'Confirm';
  const no = document.createElement('button'); no.textContent = 'Cancel';
  const close = answer => { dialog.close(); dialog.remove(); resolve(answer); };
  yes.addEventListener('click', () => close(true)); no.addEventListener('click', () => close(false));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
  dialog.append(text, yes, no); document.body.append(dialog); dialog.showModal();
});
function dashboardUrl(role) { return { Admin:'/api/admin/dashboard', HR:'/hr/dashboard', Manager:'/manager/dashboard', Employee:'/employee/dashboard' }[role] || '/login'; }
window.rsDashboardUrl = dashboardUrl;
function installPalette(user) {
  const dialog = document.createElement('dialog'); dialog.id = 'command-palette'; dialog.setAttribute('aria-label', 'Search RoleSphere');
  dialog.style.cssText = 'width:min(92vw,40rem);padding:1rem;border:1px solid #999;border-radius:.5rem';
  const label = document.createElement('label'); label.textContent = 'Search people, tasks or commands';
  const input = document.createElement('input'); input.type = 'search'; input.style.cssText = 'display:block;width:100%;padding:.5rem;border:1px solid #999'; label.append(input);
  const results = document.createElement('div'); results.setAttribute('role','listbox');
  const commands = [
    { name:'Open dashboard', url:dashboardUrl(user.role) },
    { name:'Open workspace', url:'/workspace' },
    ...(['Admin','HR'].includes(user.role) ? [{ name:'Analytics', url:'/workspace?tab=analytics' },{ name:'People and organization', url:'/workspace?tab=people' }] : []),
    ...(user.role === 'Admin' ? [{ name:'Activity log', url:'/workspace?tab=activity' }] : []),
    ...(['Employee','Manager'].includes(user.role) ? [{ name:'Task board', url:'/workspace?tab=board' }, { name:'Mark attendance', url:dashboardUrl(user.role) + '?section=attendance' }] : []),
    ...(['Employee','HR'].includes(user.role) ? [{ name:'Apply for leave', url:dashboardUrl(user.role) + '?section=leave' }] : []),
    { name:'Toggle theme', action: () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem('rs-theme', next); } catch {} document.dispatchEvent(new CustomEvent('rs:theme')); } }
  ];
  let active = 0; let entries = []; let request;
  function render(values) {
    entries = values; active = 0; results.replaceChildren();
    for (const [index, entry] of entries.entries()) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = entry.name + (entry.type ? ` (${entry.type})` : '');
      button.style.cssText = 'display:block;text-align:left;padding:.6rem;width:100%'; button.setAttribute('role','option');
      button.addEventListener('click', () => choose(index)); results.append(button);
    }
    if (!entries.length) { const empty = document.createElement('p'); empty.textContent = 'No results'; results.append(empty); }
    highlight();
  }
  function highlight() { [...results.querySelectorAll('button')].forEach((b, i) => { b.setAttribute('aria-selected', String(i === active)); b.style.background = i === active ? '#e0e7ff' : ''; }); }
  function choose(index) { const item = entries[index]; if (!item) return; dialog.close(); if (item.action) item.action(); else location.href = item.url; }
  input.addEventListener('input', async () => {
    request?.abort(); request = new AbortController(); const q = input.value.trim();
    const staticResults = commands.filter(c => c.name.toLowerCase().includes(q.toLowerCase())); render(staticResults);
    if (q.length < 2) return;
    try { const response = await fetch('/api/search?q=' + encodeURIComponent(q), { signal:request.signal, headers:{ Accept:'application/json' } });
      const data = await response.json(); if (response.ok) render([...staticResults, ...data.data]);
    } catch (error) { if (error.name !== 'AbortError') showToast('Search unavailable', 'bad'); }
  });
  input.addEventListener('keydown', event => {
    if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); active = entries.length ? (active + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length : 0; highlight(); }
    if (event.key === 'Enter') { event.preventDefault(); choose(active); }
  });
  const close = document.createElement('button'); close.textContent = 'Close'; close.addEventListener('click', () => dialog.close());
  dialog.append(label, results, close); document.body.append(dialog);
  window.openCommandPalette = () => { render(commands); dialog.showModal(); input.focus(); };
  document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); window.openCommandPalette(); } });
}
document.addEventListener('DOMContentLoaded', async () => {
  try { const response = await fetch('/api/auth/me', { headers:{ Accept:'application/json' } }); if (!response.ok) return;
    const { user } = await response.json(); installPalette(user);
    if (user.role === 'Admin') {
      const sidebar = document.querySelector('body > aside');
      if (sidebar) {
        const toggle = document.createElement('button'); toggle.textContent = 'Menu'; toggle.type = 'button'; toggle.className = 'md:hidden fixed top-2 left-2 z-50 bg-white border p-2'; toggle.setAttribute('aria-expanded','false');
        toggle.addEventListener('click', () => { const opening = sidebar.classList.contains('hidden'); sidebar.classList.toggle('hidden', !opening); sidebar.classList.toggle('fixed', opening); sidebar.classList.toggle('inset-y-0', opening); sidebar.classList.toggle('z-40', opening); toggle.setAttribute('aria-expanded',String(opening)); });
        document.body.append(toggle);
      }
    }
    if (location.pathname === dashboardUrl(user.role)) {
      const section = new URLSearchParams(location.search).get('section');
      if (section) { const target = user.role === 'Employee' ? ({ leave:'leaveSection', attendance:'attendanceSection' }[section] || section) : section; window.showSection?.(target); }
    }
  } catch { /* Public forms remain usable when unauthenticated. */ }
});
