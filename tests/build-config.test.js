'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createBuildOptions } = require('../scripts/build-ui');
const root = path.resolve(__dirname, '..');
test('all React dashboard entrypoints and shared @/ paths resolve after folder cleanup',()=>{
  const options = createBuildOptions();
  expect(options.bundle).toBe(true);
  expect(options.alias['@']).toBe(path.join(root,'frontend/src'));
  expect(options.outdir).toBe('frontend/public/js');
  for (const entry of Object.values(options.entryPoints)) expect(fs.existsSync(path.join(root,entry))).toBe(true);
  for (const component of ['activity-card','apple-calendar-picker','floating-panel','filtered-table','team-showcase']) {
    expect(fs.existsSync(path.join(options.alias['@'],'components/ui',component+'.tsx'))).toBe(true);
  }
});
