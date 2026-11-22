// Offline diagnostic: never display or transmit Google OAuth credentials.
const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
console.log('\nRoleSphere Google OAuth diagnosis');
console.log('-------------------------------');
if (!fs.existsSync(envPath)) {
  console.error('FAIL: .env is missing in the RoleSphere project root.');
  console.error('Create it from .env.example and fill in your existing database, session and Google OAuth values.');
  process.exitCode = 1;
} else {
  const parsed = dotenv.config({ path: envPath });
  if (parsed.error) {
    console.error('FAIL: Could not read the project .env file.');
    process.exitCode = 1;
  } else {
    const { configurationStatus } = require('../backend/services/googleIdentity');
    const diagnosis = configurationStatus();
    // Never output Client ID, Client Secret, environment values, or the raw .env content.
    console.log(`Google OAuth: ${diagnosis.configured ? 'READY' : 'NOT READY'}`);
    console.log(diagnosis.message);
    console.log('Reminder: the exact redirect URI must be registered under Google Auth Platform → Clients.');
    console.log('After changing .env, stop the previous RoleSphere process and run npm start again.');
    console.log('Open the same port shown in the startup message, then My profile → Security.');
    if (!diagnosis.configured) process.exitCode = 1;
  }
}
