/** Regressions discovered during the November predeployment audit.
 * These tests deliberately cover safe runtime configuration and the browser
 * request boundary without requiring a live MongoDB or Google credentials.
 */
const request = require('supertest');
const session = require('express-session');
const { createApp } = require('../app');
const { resolveListeningPort } = require('../backend/config/runtimePorts');

const googleEnv = {
  GOOGLE_CLIENT_ID: 'real-looking-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'real-looking-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:8000/api/auth/google/callback',
};

test('TDD: an occupied OAuth callback port must fail instead of silently moving to another port', () => {
  expect(() => resolveListeningPort(8000, 8001, googleEnv)).toThrow(/Port 8000 is occupied/);
});

test('TDD: port fallback remains available for installations without Google login', () => {
  expect(resolveListeningPort(8000, 8001, {})).toBe(8001);
  expect(resolveListeningPort(8000, 8000, googleEnv)).toBe(8000);
});

process.env.SESSION_SECRET ||= 'test-secret-predeploy-only';
const app = createApp({ store: new session.MemoryStore() });

test('TDD: cross-origin form posts are blocked even when the caller uses localhost on a different port', async () => {
  const result = await request(app).post('/api/auth/google/preferred')
    .set('Origin', 'http://localhost:3000')
    .set('Host', 'localhost:8001')
    .set('Content-Type','application/json')
    .send({method:'google'});
  expect(result.status).toBe(403);
  expect(result.body.error).toMatch(/origin/i);
});

test('TDD: same-origin requests and scripted requests without Origin still reach normal auth checks', async () => {
  const same = await request(app).post('/api/auth/google/preferred')
    .set('Host', 'localhost:8001').set('Origin', 'http://localhost:8001')
    .set('Content-Type', 'application/json').send({method:'google'});
  expect(same.status).toBe(401);
  const scripted = await request(app).post('/api/auth/google/preferred')
    .set('Content-Type','application/json').send({method:'google'});
  expect(scripted.status).toBe(401);
});

afterAll(async () => { await app.get('sessionStore').close?.(); });


test('TDD: every public logout clears the express-session cookie rather than leaving a stale browser credential', async () => {
  for (const path of ['/api/auth/logout', '/logout']) {
    const response = await request(app).get(path);
    expect(response.status).toBe(302);
    const cookies = response.headers['set-cookie'] || [];
    expect(cookies.some(c => c.startsWith('connect.sid=') && /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(c))).toBe(true);
  }
});
