'use strict';

const { requireDemoPassword } = require('../scripts/seed');

test('demo seed requires a unique local password', () => {
  expect(() => requireDemoPassword({})).toThrow(/DEMO_PASSWORD/);
  expect(() => requireDemoPassword({ DEMO_PASSWORD: 'short' })).toThrow(/at least 12 characters/);
  expect(() => requireDemoPassword({ DEMO_PASSWORD: 'replace-with-your-own-password' })).toThrow(/unique DEMO_PASSWORD/);
  expect(requireDemoPassword({ DEMO_PASSWORD: 'LocalDemoSecret!2026' })).toBe('LocalDemoSecret!2026');
});
