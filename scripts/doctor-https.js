#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root,'.env');
console.log('\nRoleSphere local HTTPS diagnosis');
console.log('-------------------------------');
if (!fs.existsSync(envPath)) {
  console.error('NOT READY: No .env in this project. Copy the existing private .env here first.');
  process.exitCode = 1;
} else {
  const parsed=dotenv.config({path:envPath});
  if(parsed.error) { console.error('NOT READY: Unable to read .env'); process.exitCode=1; }
  else try {
    const {httpsEnabled,loadTlsOptions,validateHttpsEnvironment}=require('../backend/config/tls');
    if(!httpsEnabled(process.env)) throw Error('HTTPS_ENABLED must be true. Run npm run https:setup.');
    validateHttpsEnvironment(process.env);
    loadTlsOptions(process.env,root);
    if(process.env.COOKIE_SECURE !== 'true') throw Error('COOKIE_SECURE must be true for local HTTPS.');
    const {configurationStatus} = require('../backend/services/googleIdentity');
    const google=configurationStatus();
    console.log('HTTPS: READY (valid, matching local TLS certificate and key)');
    console.log('Secure cookies: ENABLED');
    console.log('Google OAuth:',google.configured?'READY':'NOT READY');
    if(!google.configured) console.log(google.message);
    console.log(`Open: ${process.env.BASE_URL}`);
    console.log('A browser trust check is still needed; use: curl -Iv '+process.env.BASE_URL+'/healthz');
    // HTTPS readiness is independent of whether Google sign-in was configured.
  } catch(error) {
    console.error('HTTPS: NOT READY — '+error.message);
    process.exitCode=1;
  }
}
