const { configurationStatus, config } = require('../backend/services/googleIdentity');
const values = {
  GOOGLE_CLIENT_ID: 'test-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fake-secret-used-only-for-tests',
  GOOGLE_REDIRECT_URI: 'http://localhost:8001/api/auth/google/callback',
  PORT: '8001'
};
test('valid localhost settings enable Google OAuth', () => {
  expect(configurationStatus(values)).toEqual(expect.objectContaining({ configured: true, code: 'ready' }));
});
test('a missing credential is diagnosed without leaking any secrets', () => {
  const result = configurationStatus({...values, GOOGLE_CLIENT_SECRET: ''});
  expect(result).toEqual(expect.objectContaining({ configured: false, code: 'missing_settings' }));
  expect(result.message).toContain('GOOGLE_CLIENT_SECRET');
  expect(result.message).not.toContain(values.GOOGLE_CLIENT_ID);
});
test('placeholder credentials cannot enable Google sign in', () => {
  expect(configurationStatus({...values, GOOGLE_CLIENT_ID: 'your_actual_client_id'}).configured).toBe(false);
});
test('mismatched callback port disables link with a specific, safe action', () => {
  const result = configurationStatus({...values, GOOGLE_REDIRECT_URI:'http://localhost:8000/api/auth/google/callback'});
  expect(result.code).toBe('port_mismatch');
  expect(result.message).toContain('port 8000');
  expect(result.message).toContain('port 8001');
  expect(result.message).not.toContain(values.GOOGLE_CLIENT_SECRET);
});
test('wrong callback route and non-local HTTP callback are blocked', () => {
  expect(configurationStatus({...values, GOOGLE_REDIRECT_URI:'http://localhost:8001/unrelated'}).code).toBe('invalid_redirect');
  expect(configurationStatus({...values, GOOGLE_REDIRECT_URI:'http://example.com/api/auth/google/callback', PORT:''}).code).toBe('invalid_redirect');
});
test('HTTPS deployments may use a reverse proxy with a different internal port', () => {
  expect(configurationStatus({...values, GOOGLE_REDIRECT_URI:'https://rolesphere.example/api/auth/google/callback'}).configured).toBe(true);
});
test('config returns null when localhost callback and server ports mismatch', () => {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  try {
    Object.assign(process.env, values, {GOOGLE_REDIRECT_URI:'http://localhost:8000/api/auth/google/callback'});
    expect(config()).toBeNull();
    process.env.GOOGLE_REDIRECT_URI = values.GOOGLE_REDIRECT_URI;
    expect(config()?.clientId).toBe(values.GOOGLE_CLIENT_ID);
  } finally {
    for (const [key, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[key]; else process.env[key] = v;
    }
  }
});
