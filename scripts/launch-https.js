#!/usr/bin/env node
'use strict';
require('dotenv').config();
if (process.env.HTTPS_ENABLED !== 'true') {
  console.error('HTTPS is not configured. Run npm run https:setup first.');
  process.exitCode=1;
} else {
  require('../server').start().catch(error => { console.error(error.message); process.exitCode=1; });
}
