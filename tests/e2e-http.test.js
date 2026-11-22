/** End-to-end HTTP+DOM acceptance check.
 * Uses a real Node child process and real Express routes, an in-memory fixture
 * account instead of MongoDB, and jsdom rather than a real browser. The latter
 * is deliberate: this suite cannot replace Chromium/Playwright E2E testing.
 */
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
let child, base;

function randomPort() {
  return new Promise((resolve,reject) => {
    const server=net.createServer();
    server.once('error', reject);
    server.listen(0,'127.0.0.1',()=>{
      const port=server.address().port;
      server.close(()=>resolve(port));
    });
  });
}
async function waitForServer() {
  for (let i=0;i<75;i++) {
    if (child.exitCode !== null) throw Error(`E2E fixture exited with ${child.exitCode}`);
    try { const r = await fetch(base+'/healthz'); if (r.ok) return; } catch (_) {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('E2E fixture did not start');
}
async function http(route, {cookie='',method='GET',body,origin}={}) {
  const headers={};
  if (cookie) headers.Cookie=cookie;
  if (origin) headers.Origin=origin;
  if (body) headers['Content-Type']='application/x-www-form-urlencoded';
  return fetch(base+route, {method,headers,body:body?new URLSearchParams(body):undefined,redirect:'manual'});
}

beforeAll(async()=>{
  const port=await randomPort();base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,[path.join(__dirname,'support/browser-fixture-server.js')],{
    cwd:path.join(__dirname,'..'),env:{...process.env,E2E_PORT:String(port)},stdio:'ignore'
  });
  await waitForServer();
});
afterAll(()=>{if(child && child.exitCode===null)child.kill('SIGTERM');});

test('E2E: login form -> password authentication -> live security settings DOM -> Google OAuth redirect -> logout', async()=>{
  const guest=await http('/login/Employee');
  expect(guest.status).toBe(200);
  const loginHtml=await guest.text();
  const loginDom=new JSDOM(loginHtml);
  expect(loginDom.window.document.querySelector('input[name=email]')).toBeTruthy();
  expect(loginDom.window.document.querySelector('input[name=password]')).toBeTruthy();
  expect(loginDom.window.document.querySelector('a.google-auth-button')?.getAttribute('href'))
    .toBe('/api/auth/google/start?role=Employee&intent=login');
  loginDom.window.close();

  expect((await http('/account/login-methods')).status).toBe(302);
  const logged=await http('/api/auth/login',{method:'POST',body:{email:'browser@example.test',password:'BrowserPass!123',role:'Employee'}});
  expect(logged.status).toBe(302);
  expect(logged.headers.get('location')).toBe('/employee/dashboard');
  const cookie=logged.headers.get('set-cookie')?.split(';')[0];
  expect(cookie).toContain('connect.sid=');

  const protectedPage=await http('/account/login-methods',{cookie});
  expect(protectedPage.status).toBe(200);
  const dom = new JSDOM(await protectedPage.text(),{ url:base+'/account/login-methods',runScripts:'outside-only'});
  dom.window.fetch = (route,options={}) => fetch(new URL(route,base), {
    ...options,headers:{ ...(options.headers||{}),Cookie:cookie },redirect:'manual'
  });
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../frontend/public/js/login-methods.js'),'utf8'));
  for(let i=0;i<40 && dom.window.document.getElementById('login-methods-controls').hidden;i++){
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  expect(dom.window.document.getElementById('login-methods-controls').hidden).toBe(false);
  expect(dom.window.document.getElementById('google-status').textContent).toContain('Not connected');
  expect(dom.window.document.querySelector('input[value=google]').disabled).toBe(true);
  expect(dom.window.document.getElementById('connect-google').hidden).toBe(false);
  dom.window.close();

  const start=await http('/api/auth/google/start?intent=link',{cookie});
  expect(start.status).toBe(302);
  const target=new URL(start.headers.get('location'));
  expect(target.hostname).toBe('accounts.google.com');
  expect(target.searchParams.get('redirect_uri')).toBe(`http://localhost:${new URL(base).port}/api/auth/google/callback`);
  expect(target.searchParams.get('code_challenge_method')).toBe('S256');
  expect(target.searchParams.get('state')?.length).toBeGreaterThan(20);
  expect(target.searchParams.get('nonce')?.length).toBeGreaterThan(20);

  const switched=await fetch(base+'/api/auth/google/preferred',{
    method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({method:'google'})
  });
  expect(switched.status).toBe(400);
  const logout=await http('/api/auth/logout',{cookie});
  expect(logout.status).toBe(302);
  expect(logout.headers.get('set-cookie')).toContain('connect.sid=');
  const after=await http('/api/auth/me',{cookie});
  expect(after.status).toBe(401);
});


test('TDD: Remember Me persists for 30 days while normal login uses a browser-session cookie', async()=>{
  const regular=await http('/api/auth/login',{method:'POST',body:{email:'browser@example.test',password:'BrowserPass!123',role:'Employee'}});
  expect(regular.status).toBe(302);
  const regularCookie=regular.headers.get('set-cookie') || '';
  expect(regularCookie).toContain('connect.sid=');
  expect(regularCookie).not.toMatch(/(?:^|;\s*)(?:Expires|Max-Age)=/i);
  const remembered=await http('/api/auth/login',{method:'POST',body:{email:'browser@example.test',password:'BrowserPass!123',role:'Employee',rememberMe:'on'}});
  expect(remembered.status).toBe(302);
  const rememberedCookie=remembered.headers.get('set-cookie') || '';
  expect(rememberedCookie).toContain('connect.sid=');
  const expiration=/(?:^|;\s*)Expires=([^;]+)/i.exec(rememberedCookie);
  expect(expiration).toBeTruthy();
  const remaining=new Date(expiration[1]).getTime()-Date.now();
  expect(remaining).toBeGreaterThan(29*86400000);
  expect(remaining).toBeLessThanOrEqual(30*86400000);
});
