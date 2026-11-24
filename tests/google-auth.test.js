const crypto = require('node:crypto');
const request = require('supertest');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
jest.mock('../backend/services/auditService', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
const Identity = require('../backend/models/GoogleIdentity');
const Employee = require('../backend/models/Employee');
const { createApp } = require('../app');
const { verifyIdToken } = require('../backend/services/googleIdentity');

const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format:'jwk' }), kid:'test-key', alg:'RS256', use:'sig' };
const sign = (claims) => {
  const header = Buffer.from(JSON.stringify({ alg:'RS256',kid:'test-key',typ:'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const content = `${header}.${body}`;
  return `${content}.${crypto.sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url')}`;
};
const claims = (nonce, overrides={}) => ({iss:'https://accounts.google.com',aud:'test-client',exp:Math.floor(Date.now()/1000)+900,iat:Math.floor(Date.now()/1000),nonce,sub:'google-sub-123',email:'employee@example.test',email_verified:true,...overrides});
let user, linked, app, agent, oldFetch;
async function googleFlow(intent='login', role='Employee', payload={}) {
  const start = await agent.get('/api/auth/google/start').query({intent,role});
  expect(start.status).toBe(302);
  expect(start.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  const params = new URL(start.headers.location).searchParams;
  expect(params.get('scope')).toBe('openid email profile');
  expect(params.get('code_challenge_method')).toBe('S256');
  const token = sign(claims(params.get('nonce'),payload));
  global.fetch = jest.fn(async url => {
    if (url === 'https://oauth2.googleapis.com/token') return { ok:true,json:async()=>({id_token:token}) };
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return { ok:true,headers:{get:()=> 'public,max-age=300'},json:async()=>({keys:[jwk]}) };
    throw Error('Unexpected URL ' + url);
  });
  return agent.get('/api/auth/google/callback').query({state:params.get('state'),code:'fake-authorized-code'});
}
beforeAll(async () => {
  process.env.SESSION_SECRET='google-auth-test-secret';
  process.env.GOOGLE_CLIENT_ID='test-client';
  process.env.GOOGLE_CLIENT_SECRET='test-secret';
  process.env.GOOGLE_REDIRECT_URI='http://localhost:8000/api/auth/google/callback';
  oldFetch=global.fetch;
  user={_id:new mongoose.Types.ObjectId(),name:'Employee One',email:'employee@example.test',isApproved:true,status:'approved',preferredLogin:'password',password:await bcrypt.hash('ValidPass123',4),save:jest.fn(async()=>user)};
  const query = value => { const promise=Promise.resolve(value);promise.select=jest.fn().mockResolvedValue(value);return promise; };
  jest.spyOn(Employee,'findOne').mockImplementation(async()=>query(user));
  // Mongoose queries must be both thenable and support .select().
  Employee.findOne.mockImplementation(()=>query(user));
  jest.spyOn(Employee,'findById').mockImplementation(()=>query(user));
  jest.spyOn(Identity,'findOne').mockImplementation(filter=>Promise.resolve(linked && (
    filter.sub ? linked.sub===filter.sub && (!filter.role || filter.role===linked.role) : linked.role===filter.role && String(linked.userId)===String(filter.userId)
  ) ? linked : null));
  jest.spyOn(Identity,'exists').mockImplementation(()=>Promise.resolve(Boolean(linked)));
  jest.spyOn(Identity,'create').mockImplementation(async data => {linked={...data};return linked;});
  jest.spyOn(Identity,'deleteOne').mockImplementation(async()=>{linked=null;return {deletedCount:1};});
  app=createApp({store:new session.MemoryStore()}); agent=request.agent(app);
});
afterAll(() => {global.fetch=oldFetch;jest.restoreAllMocks();});
test('registration still requires email; Google button appears when configured', async () => {
  const register=await request(app).get('/register/Employee');
  expect(register.status).toBe(200); expect(register.text).toContain('name="email"');
  const login=await request(app).get('/login/Employee');
  expect(login.text).toContain('Continue with Google');
  expect(login.text).toContain('/api/auth/google/start?role=Employee');
});
test('anonymous users cannot change account login methods', async () => {
  expect((await request(app).post('/api/auth/google/preferred').send({method:'google'})).status).toBe(401);
  expect((await request(app).post('/api/auth/google/disconnect').send({password:'ValidPass123'})).status).toBe(401);
});
test('Google ID tokens must be signed and have correct issuer, audience, nonce and verified email', async () => {
  global.fetch=jest.fn(async()=>({ok:true,headers:{get:()=>''},json:async()=>({keys:[jwk]})}));
  const options={clientId:'test-client',nonce:'nonce123'};
  const signed=sign(claims('nonce123'));
  expect((await verifyIdToken(signed,options)).sub).toBe('google-sub-123');
  await expect(verifyIdToken(sign(claims('wrong')),options)).rejects.toThrow();
  await expect(verifyIdToken(sign(claims('nonce123',{aud:'other-app'})),options)).rejects.toThrow();
  await expect(verifyIdToken(sign(claims('nonce123',{email_verified:false})),options)).rejects.toThrow();
  await expect(verifyIdToken(signed.slice(0,-3)+'abc',options)).rejects.toThrow();
});
test('password user connects Google, chooses method and requires password to disconnect', async () => {
  const login=await agent.post('/api/auth/login').send({email:user.email,password:'ValidPass123',role:'Employee'});
  expect(login.status).toBe(302);
  expect((await agent.get('/api/auth/google/methods')).body.linkedGoogle).toBe(false);
  expect((await agent.post('/api/auth/google/preferred').send({method:'google'})).status).toBe(400);
  const connect=await googleFlow('link');
  expect(connect.status).toBe(302);expect(connect.headers.location).toContain('/workbench?tab=profile&security=1');
  const methods=await agent.get('/api/auth/google/methods');
  expect(methods.body.linkedGoogle).toBe(true);expect(methods.body.notice.type).toBe('success');
  const preference=await agent.post('/api/auth/google/preferred').send({method:'google'});
  expect(preference.status).toBe(200);expect(user.preferredLogin).toBe('google');
  const bad=await agent.post('/api/auth/google/disconnect').send({password:'wrong-password'});
  expect(bad.status).toBe(403);expect(linked).toBeTruthy();
  const disconnected=await agent.post('/api/auth/google/disconnect').send({password:'ValidPass123'});
  expect(disconnected.status).toBe(200);expect(linked).toBeNull();expect(user.preferredLogin).toBe('password');
});
test('Google login is denied before linking, and succeeds after explicit linking', async () => {
  await agent.get('/logout');
  const rejected=await googleFlow('login');
  expect(rejected.status).toBe(302);expect(rejected.headers.location).toBe('/login/Employee');
  const error=await agent.get('/login/Employee');
  expect(error.text).toContain('not connected to this role');
  await agent.post('/api/auth/login').send({email:user.email,password:'ValidPass123',role:'Employee'});
  expect((await googleFlow('link')).status).toBe(302);
  await agent.get('/logout');
  const loggedIn=await googleFlow('login');
  expect(loggedIn.status).toBe(302);
  expect(loggedIn.headers.location).toBe('/employee/dashboard');
  expect((await agent.get('/api/auth/me')).body.user.role).toBe('Employee');
  await agent.get('/logout');
  user.isApproved=false;
  expect((await googleFlow('login')).status).toBe(302);
  const pending=await agent.get('/login/Employee');expect(pending.text).toContain('awaiting approval');
  user.isApproved=true;
});
test('OAuth state mismatch is blocked before token exchange', async () => {
  const response=await agent.get('/api/auth/google/start?intent=login&role=Employee');
  expect(response.status).toBe(302);
  const bad=await agent.get('/api/auth/google/callback?state=bad-state&code=fake');
  expect(bad.status).toBe(400);
});
test('profile login settings are protected by role-based sessions', async () => {
  expect((await request(app).get('/account/login-methods')).status).toBe(302);
  await agent.post('/api/auth/login').send({email:user.email,password:'ValidPass123',role:'Employee'});
  const page=await agent.get('/account/login-methods');
  expect(page.status).toBe(200);expect(page.text).toContain('Preferred login method');
});

test('linking blocks a different verified Google email and an identity owned by another role', async () => {
  linked=null;
  const wrongEmail=await googleFlow('link','Employee',{email:'unrelated@gmail.com'});
  expect(wrongEmail.status).toBe(302);
  expect(linked).toBeNull();
  expect((await agent.get('/api/auth/google/methods')).body.notice.message).toContain('same verified email');
  linked={sub:'google-sub-123',role:'Admin',userId:new mongoose.Types.ObjectId()};
  const alreadyUsed=await googleFlow('link');
  expect(alreadyUsed.status).toBe(302);
  expect(linked.role).toBe('Admin');
  expect((await agent.get('/api/auth/google/methods')).body.notice.message).toContain('different RoleSphere account');
});

test('registration page renders Continue with Google for role and creates pending account for new Google user', async () => {
  await agent.get('/logout');
  const regPage = await agent.get('/register/Employee');
  expect(regPage.status).toBe(200);
  expect(regPage.text).toContain('Continue with Google');
  expect(regPage.text).toContain('/api/auth/google/start?role=Employee&amp;intent=register');

  const previousUser = user;
  const previousLinked = linked;
  user = null;
  linked = null;
  let createdPayload = null;
  Employee.findOne.mockImplementation(() => {
    const q = Promise.resolve(null);
    q.select = jest.fn().mockResolvedValue(null);
    return q;
  });
  jest.spyOn(Employee, 'create').mockImplementation(async data => {
    createdPayload = { _id: new mongoose.Types.ObjectId(), ...data };
    return createdPayload;
  });
  jest.spyOn(Employee, 'findByIdAndDelete').mockResolvedValue(null);

  try {
    const result = await googleFlow('register', 'Employee', { email: 'new.hire@example.test', sub: 'google-sub-new-1' });
    expect(result.status).toBe(302);
    expect(result.headers.location).toBe('/register-pending');
    expect(createdPayload).toBeTruthy();
    expect(createdPayload.email).toBe('new.hire@example.test');
    expect(createdPayload.isApproved).toBe(false);
    expect(createdPayload.status).toBe('pending');
    expect(createdPayload.preferredLogin).toBe('google');
    expect(linked).toEqual(expect.objectContaining({ sub: 'google-sub-new-1', role: 'Employee', userId: createdPayload._id }));
  } finally {
    user = previousUser;
    linked = previousLinked;
    Employee.create.mockRestore();
    Employee.findByIdAndDelete.mockRestore();
    const query = value => { const promise = Promise.resolve(value); promise.select = jest.fn().mockResolvedValue(value); return promise; };
    Employee.findOne.mockImplementation(() => query(user));
  }
});

test('Google registration rejects Admin role and prevents duplicate account creation', async () => {
  const adminStart = await request(app).get('/api/auth/google/start').query({ intent: 'register', role: 'Admin' });
  expect(adminStart.status).toBe(403);

  linked = { sub: 'google-sub-123', role: 'Employee', userId: user._id };
  const createSpy = jest.spyOn(Employee, 'create').mockResolvedValue(user);
  try {
    const dup = await googleFlow('register', 'Employee');
    expect(dup.status).toBe(302);
    expect(dup.headers.location).toBe('/login/Employee');
    expect(createSpy).not.toHaveBeenCalled();
  } finally {
    createSpy.mockRestore();
    linked = null;
  }
});
