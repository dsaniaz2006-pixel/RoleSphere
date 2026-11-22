const fs=require('fs');
const path=require('path');
const request=require('supertest');
const session=require('express-session');
const ejs=require('ejs');
const {JSDOM}=require('jsdom');
const {createApp}=require('../app');
process.env.SESSION_SECRET ||= 'auth-ui-test-secret';
const app=createApp({store:new session.MemoryStore()});
const client=fs.readFileSync(path.join(__dirname,'../frontend/public/js/auth.js'),'utf8');
function render(role='Employee',mode='login',error=null){return ejs.renderFile(path.join(__dirname,'../frontend/views/partials/auth-page.ejs'),{selectedRole:role,mode,error});}
async function dom(role='Employee',mode='login',error=null){
 const page=new JSDOM(await render(role,mode,error),{url:`http://localhost/${mode}/${role}`,runScripts:'outside-only',pretendToBeVisual:true});
 page.window.matchMedia=()=>({matches:true});
 page.window.fetch=jest.fn(); page.window.eval(client); return page;
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
test.each(['/login','/register','/login/Employee','/login/HR','/login/Manager','/login/Admin','/register/Employee','/register/HR','/register/Manager'])('glass auth renders at %s',async url=>{
 const response=await request(app).get(url);expect(response.status).toBe(200);const page=new JSDOM(response.text);expect(page.window.document.querySelector('.gf-root')).toBeTruthy();expect(page.window.document.querySelector('script[src="/js/auth.js"]')).toBeTruthy();expect(page.window.document.querySelector('script[src*="react"]')).toBeNull();page.window.close();
});
test('admin registration remains unavailable',async()=>{const response=await request(app).get('/register/Admin');expect(response.status).toBe(302);expect(response.headers.location).toBe('/login/Admin');});
test('role folders reveal keyboard-reachable sign-in and registration choices',async()=>{
 const page=await dom();const folder=page.window.document.querySelector('.gf-root');const hit=folder.querySelector('.gf-hit');hit.click();expect(hit.getAttribute('aria-expanded')).toBe('true');expect([...folder.querySelectorAll('.gf-sheet')].map(a=>a.tabIndex)).toEqual([0,0]);expect(folder.querySelector('a[href="/register/Employee"]')).toBeTruthy();hit.dispatchEvent(new page.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(hit.getAttribute('aria-expanded')).toBe('false');expect(folder.querySelector('.gf-sheet').tabIndex).toBe(-1);page.window.close();
});
test('password visibility has accurate accessible state',async()=>{const page=await dom();const button=page.window.document.querySelector('[data-password-toggle]');const field=page.window.document.getElementById('password');button.click();expect(field.type).toBe('text');expect(button.getAttribute('aria-pressed')).toBe('true');button.click();expect(field.type).toBe('password');expect(button.getAttribute('aria-label')).toBe('Show password');page.window.close();});
test('registration does not send mismatched passwords',async()=>{const page=await dom('Employee','register');const document=page.window.document;document.getElementById('name').value='A Person';document.getElementById('email').value='a@example.test';document.getElementById('password').value='Password123';document.getElementById('confirm-password').value='Different123';document.getElementById('auth-form').dispatchEvent(new page.window.Event('submit',{bubbles:true,cancelable:true}));await settle();expect(page.window.fetch).not.toHaveBeenCalled();expect(document.getElementById('confirm-password').validationMessage).toBe('Passwords do not match.');page.window.close();});
test('login preserves native form navigation for browser password managers',async()=>{const page=await dom();const d=page.window.document;d.getElementById('email').value='a@example.test';d.getElementById('password').value='Password123';const event=new page.window.Event('submit',{bubbles:true,cancelable:true});d.getElementById('auth-form').dispatchEvent(event);expect(event.defaultPrevented).toBe(false);expect(page.window.fetch).not.toHaveBeenCalled();expect(d.getElementById('auth-form').method).toBe('post');expect(d.getElementById('password').autocomplete).toBe('current-password');page.window.close();});
test('native login errors remain visible after client initialization',async()=>{const page=await dom('Employee','login','Invalid credentials');expect(page.window.document.getElementById('auth-error').textContent).toBe('Invalid credentials');expect(page.window.document.getElementById('auth-error').hidden).toBe(false);page.window.close();});
test('error text is escaped rather than interpreted as markup',async()=>{const html=await render('Employee','login','<img src=x onerror=alert(1)>');const page=new JSDOM(html);expect(page.window.document.querySelector('#auth-error img')).toBeNull();expect(page.window.document.querySelector('#auth-error').textContent).toContain('<img');page.window.close();});

test('HTTP development keeps successful fetch redirects on HTTP',async()=>{
 const old=process.env.COOKIE_SECURE;process.env.COOKIE_SECURE='false';
 try {
  const local=createApp({store:new session.MemoryStore()});const response=await request(local).get('/login');
  expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  expect(response.headers['strict-transport-security']).toBeUndefined();
  expect(response.headers['content-security-policy']).toContain("form-action 'self'");
 } finally {if(old===undefined)delete process.env.COOKIE_SECURE;else process.env.COOKIE_SECURE=old;}
});
test('HTTPS deployments retain upgrade and HSTS protection',async()=>{
 const old=process.env.COOKIE_SECURE;process.env.COOKIE_SECURE='true';
 try {
  const secure=createApp({store:new session.MemoryStore()});const response=await request(secure).get('/login');
  expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
 } finally {if(old===undefined)delete process.env.COOKIE_SECURE;else process.env.COOKIE_SECURE=old;}
});
