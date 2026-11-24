'use strict';

const {
  requireDemoPassword,
  getDatabaseName,
  validateSeedTarget,
  DEFAULT_DEMO_PASSWORD,
  SEED_CONFIRMATION
} = require('../scripts/seed');

test('demo seed uses the documented public demo password unless explicitly overridden', () => {
  expect(requireDemoPassword({})).toBe(DEFAULT_DEMO_PASSWORD);
  expect(requireDemoPassword({ DEMO_PASSWORD: 'PrivateDemoPassword!2026' })).toBe('PrivateDemoPassword!2026');
  expect(() => requireDemoPassword({ DEMO_PASSWORD: 'short' })).toThrow(/between 12 and 128/);
});

test('database name parser accepts a MongoDB Atlas multi-host connection URI', () => {
  const uri = 'mongodb://user:password@host-00.example.net:27017,host-01.example.net:27017,host-02.example.net:27017/EmployeeManage?ssl=true&authSource=admin&retryWrites=true';
  expect(getDatabaseName(uri)).toBe('EmployeeManage');
  expect(getDatabaseName('mongodb+srv://user:password@cluster.example.net/EmployeeManage?retryWrites=true')).toBe('EmployeeManage');
  expect(getDatabaseName('not-a-mongodb-uri')).toBeNull();
});

test('demo seed refuses to run without explicit mode, confirmation, and EmployeeManage target', () => {
  const base = {
    MONGO_URI: 'mongodb://127.0.0.1:27017/EmployeeManage',
    DEMO_MODE: 'true',
    DEMO_SEED_CONFIRM: SEED_CONFIRMATION
  };
  expect(() => validateSeedTarget({ ...base, DEMO_MODE: 'false' })).toThrow(/DEMO_MODE=true/);
  expect(() => validateSeedTarget({ ...base, DEMO_SEED_CONFIRM: '' })).toThrow(/DEMO_SEED_CONFIRM/);
  expect(() => validateSeedTarget({ ...base, MONGO_URI: 'mongodb://127.0.0.1:27017/rolesphere_demo' })).toThrow(/EmployeeManage/);
  expect(validateSeedTarget(base)).toBe('EmployeeManage');
});
