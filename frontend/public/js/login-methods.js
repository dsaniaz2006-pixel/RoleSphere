(() => {
  const q = id => document.getElementById(id);
  const feedback = q('login-methods-feedback');
  const loading = q('login-methods-loading');
  const controls = q('login-methods-controls');
  const googleConnect = q('connect-google');
  const googleConnected = q('google-connected');
  const googleDisconnect = q('disconnect-google-form');
  async function api(url, method = 'GET', data) {
    const response = await fetch(url, {method, headers:{'Accept':'application/json',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
    if (response.status === 401) { location.assign('/login'); throw new Error('Please sign in again.'); }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to update settings.');
    return body;
  }
  function message(text, isError = false) { feedback.textContent = text; feedback.classList.toggle('is-error', isError); }
  function show(methods) {
    loading.hidden = true; controls.hidden = false;
    q('password-status').textContent = methods.passwordEnabled ? 'Available' : 'Unavailable';
    q('google-status').textContent = methods.linkedGoogle ? 'Connected to this account' : 'Not connected';
    googleConnect.hidden = methods.linkedGoogle || !methods.googleConfigured;
    googleConnected.hidden = !methods.linkedGoogle;
    googleDisconnect.hidden = !methods.linkedGoogle;
    if (!methods.googleConfigured && !methods.linkedGoogle) {
      q('google-status').textContent = 'Google OAuth configuration needs attention';
      message(methods.googleSetupMessage || 'Google OAuth is not configured on this server.', true);
    }
    document.querySelectorAll('[name=loginMethod]').forEach(input => {
      input.checked = input.value === methods.preferredLogin;
      input.disabled = input.value === 'google' ? !methods.linkedGoogle : !methods.passwordEnabled;
    });
    if (methods.notice) message(methods.notice.message, methods.notice.type !== 'success');
  }
  async function start() { try { show(await api('/api/auth/google/methods')); } catch (error) { loading.textContent = error.message; } }
  document.querySelectorAll('[name=loginMethod]').forEach(input => input.addEventListener('change', async () => {
    message(''); const disabled = [...document.querySelectorAll('[name=loginMethod]')];disabled.forEach(el => el.disabled = true);
    try { const data = await api('/api/auth/google/preferred','POST',{method: input.value}); message(`Preferred login changed to ${data.preferredLogin === 'google' ? 'Google' : 'email and password'}.`);
      try { localStorage.setItem('rolesphere.login-method-preference', JSON.stringify({ method:data.preferredLogin, role:document.querySelector('.settings-role')?.textContent.trim() })); } catch (_) {} }
    catch (error) { message(error.message, true); }
    finally { await start(); }
  }));
  googleDisconnect.addEventListener('submit', async event => {
    event.preventDefault(); const password = q('disconnect-google-password').value;
    if (!password) return;
    const submit = googleDisconnect.querySelector('[type=submit]');submit.disabled = true;
    try { await api('/api/auth/google/disconnect','POST',{password});googleDisconnect.reset(); await start();try { localStorage.setItem('rolesphere.login-method-preference', JSON.stringify({ method:'password', role:document.querySelector('.settings-role')?.textContent.trim() })); } catch (_) {} message('Google disconnected. Your email and password login still works.'); }
    catch (error) { message(error.message, true); }
    finally { submit.disabled = false; }
  });
  start();
})();
