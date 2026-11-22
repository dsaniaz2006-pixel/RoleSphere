#!/usr/bin/env node
'use strict';

// Runs only on the user's own machine. Never packages a certificate/private key
// or uploads the mkcert local CA. Preserves existing credentials in .env.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const certDirectory = path.join(root, 'certs');
const certPath = path.join(certDirectory, 'localhost.pem');
const keyPath = path.join(certDirectory, 'localhost-key.pem');

function command(program, args) {
  const result = spawnSync(program, args, {stdio:'inherit'});
  if (result.error) {
    if (result.error.code === 'ENOENT') throw Error('mkcert is not installed. On macOS run: brew install mkcert');
    throw Error(`Unable to run ${program}: ${result.error.message}`);
  }
  if (result.status !== 0) throw Error(`${program} did not finish successfully (exit ${result.status}).`);
}
function updateEnv(existing, settings) {
  const used = new Set();
  const lines = existing.split(/\r?\n/).filter(line => {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (!match || !(match[1] in settings)) return true;
    if (used.has(match[1])) return false; // replace duplicates safely
    used.add(match[1]);
    return true;
  }).map(line => {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    return match && match[1] in settings ? `${match[1]}=${settings[match[1]]}` : line;
  });
  for (const [key,value] of Object.entries(settings)) if (!used.has(key)) lines.push(`${key}=${value}`);
  return lines.join('\n').trimEnd() + '\n';
}
function main() {
  if (!fs.existsSync(envPath)) throw Error('The project .env file is missing. Copy your EXISTING private .env from your previous RoleSphere project first. No credentials were included in this ZIP.');
  const original = fs.readFileSync(envPath,'utf8');
  const env = dotenv.parse(original);
  const port = String(env.PORT || '8001');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port)>65535) throw Error('PORT must be a valid TCP port.');
  const settings = {
    PORT:port, HTTPS_ENABLED:'true', TLS_CERT_PATH:'certs/localhost.pem', TLS_KEY_PATH:'certs/localhost-key.pem',
    COOKIE_SECURE:'true', TRUST_PROXY:'false', BASE_URL:`https://localhost:${port}`,
    GOOGLE_REDIRECT_URI:`https://localhost:${port}/api/auth/google/callback`
  };
  // Verify mkcert is installed and its local CA is trusted before modifying .env.
  command('mkcert', ['-install']);
  fs.mkdirSync(certDirectory, {recursive:true,mode:0o700});
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath) || process.argv.includes('--renew')) {
    command('mkcert', ['-cert-file',certPath,'-key-file',keyPath,'localhost','127.0.0.1','::1']);
  }
  fs.chmodSync(keyPath, 0o600);
  fs.chmodSync(certPath, 0o644);
  const {loadTlsOptions,validateHttpsEnvironment} = require('../backend/config/tls');
  const complete = {...env,...settings};
  loadTlsOptions(complete,root);
  validateHttpsEnvironment(complete);
  const backup = `${envPath}.https-backup-${`${new Date().toISOString().replace(/[-:.TZ]/g,'')}-${require('node:crypto').randomBytes(3).toString('hex')}`}`;
  fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
  const temp=`${envPath}.https-new`;
  try {
    fs.writeFileSync(temp,updateEnv(original,settings),{mode:0o600});
    fs.renameSync(temp,envPath);
  } catch (error) {
    try { fs.rmSync(temp,{force:true}); } catch (_) {}
    throw error;
  }
  console.log('\nRoleSphere local HTTPS is configured.');
  console.log(`Website: https://localhost:${port}`);
  console.log(`Google Cloud OAuth redirect to ADD: https://localhost:${port}/api/auth/google/callback`);
  console.log('Preserved all existing non-HTTPS .env settings and saved a private backup.');
  console.log('Next: npm run doctor:https && npm run doctor:google && npm run build && npm run dev:https');
  console.log('Do not share the private key, .env, or mkcert local CA key.');
}
try { main(); } catch(error) { console.error(`HTTPS setup failed: ${error.message}`); process.exitCode=1; }
