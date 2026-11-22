'use strict';
/** Local HTTPS acceptance suite: real TLS socket, secure auth cookie,
 * working OAuth callback, secure Engine.IO socket transport, and redirects.
 * Uses a disposable self-signed test certificate, never production secrets.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const {spawn, execFileSync} = require('node:child_process');
const {validateHttpsEnvironment, loadTlsOptions} = require('../backend/config/tls');
const {resolveListeningPort} = require('../backend/config/runtimePorts');
const {configurationStatus} = require('../backend/services/googleIdentity');
const root = path.resolve(__dirname,'..');
const googleSettings={
  GOOGLE_CLIENT_ID:'test-id.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-private-secret',
  GOOGLE_REDIRECT_URI:'https://localhost:8001/api/auth/google/callback',
  BASE_URL:'https://localhost:8001',PORT:'8001',HTTPS_ENABLED:'true',COOKIE_SECURE:'true'
};

test('TDD: HTTPS refuses HTTP base URL or an HTTP/mismatched OAuth callback',()=>{
  expect(()=>validateHttpsEnvironment({...googleSettings,BASE_URL:'http://localhost:8001'})).toThrow(/BASE_URL must use HTTPS/);
  expect(()=>validateHttpsEnvironment({...googleSettings,GOOGLE_REDIRECT_URI:'http://localhost:8001/api/auth/google/callback'})).toThrow(/Google OAuth callback must/);
  expect(()=>validateHttpsEnvironment({...googleSettings,GOOGLE_REDIRECT_URI:'https://localhost:8000/api/auth/google/callback'})).toThrow(/Google OAuth callback must/);
  expect(()=>validateHttpsEnvironment(googleSettings)).not.toThrow();
  expect(configurationStatus({...googleSettings,GOOGLE_REDIRECT_URI:'http://localhost:8001/api/auth/google/callback'}).code).toBe('scheme_mismatch');
});
test('TDD: HTTPS cannot silently switch to an unregistered port',()=>{
  expect(()=>resolveListeningPort(8001,8002,{HTTPS_ENABLED:'true'})).toThrow(/fixed port/);
  expect(resolveListeningPort(8001,8001,{HTTPS_ENABLED:'true'})).toBe(8001);
});
test('TDD: missing certificate fails with a clear setup instruction, not an HTTP downgrade',()=>{
  expect(()=>loadTlsOptions({...googleSettings,TLS_CERT_PATH:'nonexistent/does-not-exist.pem'})).toThrow(/https:setup/);
});

let child,port,temp;
async function randomPort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const result=s.address().port;s.close(()=>resolve(result));});});}
function req(route,{method='GET',body,cookie,origin,forwardedProto,json=false}={}){
  const headers={Host:`localhost:${port}`};
  if(cookie) headers.Cookie=cookie;
  if(origin) headers.Origin=origin;
  if(forwardedProto) headers['X-Forwarded-Proto']=forwardedProto;
  if(body) headers['Content-Type']=json ? 'application/json' : 'application/x-www-form-urlencoded';
  return new Promise((resolve,reject)=>{
    const request=https.request({hostname:'127.0.0.1',port,path:route,method,rejectUnauthorized:false,headers},res=>{
      let data='';res.setEncoding('utf8');res.on('data',chunk=>data+=chunk);
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));
    });
    request.once('error',reject);
    if(body)request.write(json ? JSON.stringify(body) : new URLSearchParams(body).toString());
    request.end();
  });
}
beforeAll(async()=>{
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'rolesphere-https-test-'));
  const cert=path.join(temp,'test-cert.pem'),key=path.join(temp,'test-key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  port=await randomPort();
  child=spawn(process.execPath,[path.join(root,'tests/support/browser-fixture-server.js')],{
    cwd:root,stdio:'ignore',env:{...process.env,E2E_PORT:String(port),E2E_HTTPS:'true',TLS_CERT_PATH:cert,TLS_KEY_PATH:key}
  });
  let connected=false;
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('HTTPS test server quit before becoming ready');
    try{const result=await req('/healthz');if(result.status===200){connected=true;break;}}catch(_){ }
    await new Promise(r=>setTimeout(r,100));
  }
  if(!connected)throw Error('HTTPS test server did not respond');
});
afterAll(async()=>{
  if(child && child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>setTimeout(resolve,150));}
  if(temp)fs.rmSync(temp,{recursive:true,force:true});
});
test('E2E: TLS health, login secure cookie, Google HTTPS callback and same-origin checks',async()=>{
  const health=await req('/healthz');expect(health.status).toBe(200);
  const publicPage=await req('/login');expect(publicPage.status).toBe(200);
  expect(publicPage.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  expect(publicPage.headers['content-security-policy']).toContain('wss:');
  expect(publicPage.headers['strict-transport-security']).toBeUndefined(); // don't pin localhost in Chrome
  const login=await req('/api/auth/login',{method:'POST',body:{email:'browser@example.test',password:'BrowserPass!123',role:'Employee'}});
  expect(login.status).toBe(302);
  const cookie=login.headers['set-cookie'].find(value=>value.startsWith('connect.sid='));
  expect(cookie).toContain('Secure');expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Lax');
  expect(cookie).not.toContain('Expires=');
  const sid=cookie.split(';')[0];
  const page=await req('/account/login-methods',{cookie:sid});expect(page.status).toBe(200);
  const google=await req('/api/auth/google/start?intent=link',{cookie:sid});expect(google.status).toBe(302);
  const url=new URL(google.headers.location);
  expect(url.searchParams.get('redirect_uri')).toBe(`https://localhost:${port}/api/auth/google/callback`);
  const write=await req('/api/auth/google/preferred',{cookie:sid,method:'POST',body:{method:'google'},origin:`https://localhost:${port}`,forwardedProto:'http',json:true});
  expect(write.status).toBe(400); // reached app authentication logic, no false 403 from spoofed proxy header
  const bad=await req('/api/auth/google/preferred',{cookie:sid,method:'POST',body:{method:'google'},origin:`http://localhost:${port}`,json:true});
  expect(bad.status).toBe(403);
  const remembered=await req('/api/auth/login',{method:'POST',body:{email:'browser@example.test',password:'BrowserPass!123',role:'Employee',rememberMe:'on'}});
  const rememberedCookie=remembered.headers['set-cookie'].find(c=>c.startsWith('connect.sid='));
  expect(rememberedCookie).toContain('Secure');expect(rememberedCookie).toContain('Expires=');
  const logout=await req('/api/auth/logout',{cookie:sid});expect(logout.status).toBe(302);
});
test('E2E: Socket.IO Engine.IO handshake is served over the same HTTPS port',async()=>{
  const socket=await req('/socket.io/?EIO=4&transport=polling&t=abc123');
  expect(socket.status).toBe(200);
  expect(socket.body.startsWith('0{')).toBe(true);
});
