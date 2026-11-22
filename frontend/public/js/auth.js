(() => {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const folders = [...document.querySelectorAll('.gf-root')];
  for (const [index, folder] of folders.entries()) {
    function size() { folder.style.setProperty('--folder-scale', folder.getBoundingClientRect().width / 340); }
    size(); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(size).observe(folder); else window.addEventListener('resize',size);
    const hit = folder.querySelector('.gf-hit');
    function open(value) {
      folder.toggleAttribute('data-open',value); hit.setAttribute('aria-expanded',String(value));
      hit.setAttribute('aria-label',`${value ? 'Close' : 'Open'} ${folder.id.replace('folder-','')} folder`);
      folder.querySelectorAll('.gf-sheet').forEach(link => { link.tabIndex = value ? 0 : -1; });
    }
    hit.addEventListener('click', () => { const opening=!folder.hasAttribute('data-open'); for(const other of folders) { if(other===folder)continue; other.removeAttribute('data-open'); other.querySelector('.gf-hit').setAttribute('aria-expanded','false'); other.querySelector('.gf-hit').setAttribute('aria-label','Open '+other.id.replace('folder-','')+' folder'); other.querySelectorAll('.gf-sheet').forEach(link=>{link.tabIndex=-1;}); } open(opening); });
    folder.addEventListener('keydown',event => { if(event.key==='Escape') { open(false); hit.focus(); } });
    if (!reducedMotion) {
      folder.addEventListener('pointermove',event => { if(event.pointerType==='touch')return; const r=folder.getBoundingClientRect(); folder.style.setProperty('--gf-px',((event.clientX-r.left)/r.width-.5)*2); folder.style.setProperty('--gf-py',((event.clientY-r.top)/r.height-.5)*2); });
      folder.addEventListener('pointerleave',()=>{ folder.style.setProperty('--gf-px',0); folder.style.setProperty('--gf-py',0); });
    }
    setTimeout(()=>folder.setAttribute('data-entered',''),reducedMotion?0:index*100+50);
    window.RoleSphereArt?.paint(folder.querySelector('canvas'),folder.dataset.art,Number(folder.dataset.seed));
  }
  for (const button of document.querySelectorAll('[data-password-toggle]')) {
    button.addEventListener('click',()=>{ const field=document.getElementById(button.dataset.passwordToggle); const show=field.type==='password'; field.type=show?'text':'password'; button.setAttribute('aria-pressed',String(show)); button.setAttribute('aria-label',`${show?'Hide':'Show'} ${field.id==='confirm-password'?'confirmation password':'password'}`); });
  }
  const form=document.getElementById('auth-form'); if(!form)return;
  const email=document.getElementById('email');
  const remember=document.getElementById('rememberMe');
  const selectedRole=form.querySelector('[name=role]').value;
  try {
    const saved=JSON.parse(localStorage.getItem('rolesphere.remembered-email') || 'null');
    if(remember && saved && saved.expiresAt>Date.now() && saved.role===selectedRole){if(!email.value)email.value=saved.email;remember.checked=true;}
  } catch (_) {}
  const confirm=document.getElementById('confirm-password'); const password=document.getElementById('password');
  function matching(){ if(confirm)confirm.setCustomValidity(confirm.value && confirm.value!==password.value ? 'Passwords do not match.':''); }
  confirm?.addEventListener('input',matching); password.addEventListener('input',matching);
  const error=document.getElementById('auth-error'); const submit=form.querySelector('[type=submit]'); const label=submit.querySelector('span'); const progress=document.getElementById('auth-progress');
  // Use a normal browser form POST for sign-in. Chrome and other password
  // managers recognize successful native form navigations more reliably than
  // fetch-based sign-ins, allowing them to offer to save/fill credentials.
  // Local hint only: never reveal linked accounts via an unauthenticated API.
  // Server-side preference is authoritative; this makes the preferred button
  // prominent on the same browser where the user chose it.
  if (document.body.dataset.mode === 'login') {
    try {
      const preferred = JSON.parse(localStorage.getItem('rolesphere.login-method-preference') || 'null');
      if (preferred?.method === 'google' && preferred.role === selectedRole) {
        const group = document.getElementById('google-signin-group');
        if (group?.querySelector('a.google-auth-button')) {
          form.before(group);
          const heading = group.querySelector('.form-divider span');
          if (heading) heading.textContent = 'YOUR PREFERRED SIGN-IN';
        }
      }
    } catch (_) { /* blocked local storage should never break sign-in */ }

    form.addEventListener('submit', () => {
      if (!form.checkValidity()) return;
      if (remember) {
        try {
          if (remember.checked) localStorage.setItem('rolesphere.remembered-email', JSON.stringify({email:email.value,role:selectedRole,expiresAt:Date.now()+30*86400000}));
          else localStorage.removeItem('rolesphere.remembered-email');
        } catch (_) {}
      }
    });
    return;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault(); matching(); if(!form.reportValidity())return;
    error.hidden=true; error.textContent=''; const original=label.textContent; submit.disabled=true; form.setAttribute('aria-busy','true'); label.textContent=document.body.dataset.mode==='register'?'Creating your account…':'Signing you in…'; progress.textContent=label.textContent;
    try {
      const values=Object.fromEntries(new FormData(form));
      const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(values),credentials:'same-origin'});
      if(response.redirected && response.ok) { const target=new URL(response.url,location.href); if(target.origin!==location.origin)throw new Error('Unexpected sign-in response.'); if(remember){try{if(remember.checked)localStorage.setItem('rolesphere.remembered-email',JSON.stringify({email:email.value,role:selectedRole,expiresAt:Date.now()+30*86400000}));else localStorage.removeItem('rolesphere.remembered-email');}catch(_){}}
        location.assign(target.href); return; }
      let message='Please check your details and try again.';
      if(response.headers.get('content-type')?.includes('application/json')) { const result=await response.json(); message=result.error || message;
        if(result.code==='WRONG_ROLE' && ['Admin','HR','Manager','Employee'].includes(result.role) && result.redirect==='/login/'+result.role){
          error.textContent=message;error.hidden=false;error.setAttribute('tabindex','-1');error.focus();
          const link=document.createElement('a');link.className='auth-role-switch';link.href=result.redirect;link.textContent='Continue to '+result.role+' sign in ↗';error.append(document.createElement('br'),link);
          password.value='';form.classList.add('auth-redirecting');
          progress.textContent='Opening '+result.role+' sign in.';
          setTimeout(()=>location.assign(result.redirect),1800);return;
        } }
      else { const page=new DOMParser().parseFromString(await response.text(),'text/html'); message=page.querySelector('#auth-error')?.textContent.trim() || message; }
      if(response.status===429)message='Too many sign-in attempts. Please try again in 15 minutes.';
      throw new Error(message);
    } catch(failure) { error.textContent=failure instanceof TypeError ? 'We couldn’t connect. Check your connection and try again.' : failure.message; error.hidden=false; error.setAttribute('tabindex','-1'); error.focus(); }
    finally { if(!form.classList.contains('auth-redirecting')){submit.disabled=false;form.removeAttribute('aria-busy');label.textContent=original;progress.textContent='';} }
  });
})();
