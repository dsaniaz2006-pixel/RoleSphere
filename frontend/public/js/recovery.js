(() => {
  for (const button of document.querySelectorAll('[data-password-toggle]')) {
    const field = document.getElementById(button.dataset.passwordToggle);
    const original = button.getAttribute('aria-label');
    button.addEventListener('click', () => { const show=field.type==='password';field.type=show?'text':'password';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',(show?'Hide':'Show')+original.slice(4)); });
  }
  const form=document.getElementById('recovery-form');if(!form)return;
  const password=document.getElementById('password'),confirm=document.getElementById('confirmPassword');
  const match=()=>{if(confirm)confirm.setCustomValidity(confirm.value&&confirm.value!==password.value?'Passwords do not match.':'');};
  password?.addEventListener('input',match);confirm?.addEventListener('input',match);
  form.addEventListener('submit',event=>{match();if(!form.reportValidity()){event.preventDefault();return;}const button=form.querySelector('[type=submit]');button.disabled=true;form.setAttribute('aria-busy','true');button.querySelector('span').textContent=password?'Updating your password…':'Sending reset link…';});
})();
