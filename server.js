require('dotenv').config();
const mongoose = require('mongoose');
const net = require('net');
const { createServer: createHttpServer } = require('node:http');
const { createServer: createHttpsServer } = require('node:https');
const { httpsEnabled, loadTlsOptions, validateHttpsEnvironment } = require('./backend/config/tls');
const { createApp } = require('./app');
const setupSocket = require('./backend/realtime/socketServer');
const { resolveListeningPort } = require('./backend/config/runtimePorts');
const { startMonthlyReports } = require('./backend/services/monthlyReports');
const { assertServerEnvironment } = require('./backend/config/environment');
// 1. ADDED IMPORT HERE
const { backfillPendingEmployees } = require('./backend/services/employeeMigration');

async function availablePort(preferred, attempts = 20) {
  for (let port = preferred; port < preferred + attempts; port++) {
    const free = await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', error => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
        else reject(error);
      });
      probe.listen(port, () => probe.close(() => resolve(true)));
    });
    if (free) return port;
    console.warn(`Port ${port} is occupied; trying ${port + 1}...`);
  }
  throw new Error(`No available port found near ${preferred}`);
}

async function start() {
  const { port: preferredPort } = assertServerEnvironment(process.env);
  // Fail on incorrect HTTPS settings before opening the database or sockets.
  validateHttpsEnvironment(process.env);
  const tlsOptions = loadTlsOptions(process.env);
  const port = resolveListeningPort(preferredPort, await availablePort(preferredPort), process.env);
  process.env.PORT = String(port);
  if (port !== preferredPort) {
    console.warn(`Port ${preferredPort} is occupied; using ${port} instead.`);
    if (process.env.BASE_URL) {
      try {
        const url = new URL(process.env.BASE_URL);
        if (['localhost', '127.0.0.1'].includes(url.hostname)) {
          url.port = String(port);
          process.env.BASE_URL = url.origin;
        }
      } catch (_) { console.warn('BASE_URL is not a valid URL; please check .env'); }
    }
  }
  const googleStatus = require('./backend/services/googleIdentity').configurationStatus();
  if (!googleStatus.configured) {
    console.warn(`\n⚠ Google login unavailable: ${googleStatus.message}`);
    console.warn('  Run npm run doctor:google for a safe checklist (no secrets shown).\n');
  }
  
  await mongoose.connect(process.env.MONGO_URI);
  
  // 2. ADDED BACKFILL CALL HERE (right after DB connection)
  await backfillPendingEmployees(); 

  const app = createApp(); const server = tlsOptions ? createHttpsServer(tlsOptions, app) : createHttpServer(app);
  const io = setupSocket(server, app.get('sessionMiddleware')); app.set('io', io);
  const monthly = startMonthlyReports();
  server.on('error', error => {
    console.error(`Unable to start RoleSphere on port ${port}: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, () => console.log(`\n🌐 RoleSphere Website: ${httpsEnabled(process.env) ? 'https' : 'http'}://localhost:${port}\n`));
  async function shutdown() {
    monthly?.stop(); io.close(); server.close();
    await app.get('sessionStore').close(); await mongoose.disconnect();
  }
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
  return { app, server };
}
if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { start };