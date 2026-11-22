/* Run before styles: a single persisted theme across landing, auth and workspaces. */
(() => {
  const root = document.documentElement;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  let preference = null;
  try { preference = localStorage.getItem('rolesphere.theme'); } catch (_) {}
  const theme = preference === 'dark' || preference === 'light' ? preference : media?.matches ? 'dark' : 'light';
  function apply(value, persist = true) {
    if (value !== 'light' && value !== 'dark') return;
    root.dataset.theme = value;
    root.classList.toggle('dark', value === 'dark');
    root.style.colorScheme = value;
    if (persist) { try { localStorage.setItem('rolesphere.theme', value); } catch (_) {} }
    window.dispatchEvent(new CustomEvent('rolesphere:theme', { detail: value }));
  }
  apply(theme, false);
  window.RoleSphereTheme = { set: apply, toggle: () => apply(root.dataset.theme === 'dark' ? 'light' : 'dark') };
  window.addEventListener('storage', event => {
    if (event.key === 'rolesphere.theme' && ['light', 'dark'].includes(event.newValue)) apply(event.newValue, false);
  });
})();
