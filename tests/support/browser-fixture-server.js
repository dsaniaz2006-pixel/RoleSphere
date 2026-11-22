/* Browser E2E fixture: real Express routes and real DOM, but no external DB or
 * Google credentials. ONLY for local automated tests; never import in server.js.
 */
process.env.SESSION_SECRET = 'browser-e2e-only-secret';
process.env.JWT_SECRET = 'browser-e2e-only-jwt';
process.env.PORT = String(process.env.E2E_PORT || 18765);
process.env.HTTPS_ENABLED = process.env.E2E_HTTPS === 'true' ? 'true' : 'false';
process.env.TRUST_PROXY = 'false';
process.env.BASE_URL = `${process.env.HTTPS_ENABLED === 'true' ? 'https' : 'http'}://localhost:${process.env.PORT}`;
process.env.GOOGLE_CLIENT_ID = 'browser-test.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'browser-test-secret';
process.env.GOOGLE_REDIRECT_URI = `${process.env.BASE_URL}/api/auth/google/callback`;
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const session = require('express-session');
const auditService = require('../../backend/services/auditService');
auditService.audit = async () => {};
const Employee = require('../../backend/models/Employee');
const Identity = require('../../backend/models/GoogleIdentity');
const user = {
  _id: new mongoose.Types.ObjectId(), id: null,
  name: 'Browser Employee', email: 'browser@example.test', role:'Employee',
  isApproved: true, status: 'approved', preferredLogin: 'password',
  phone: '', dob:'', bio:'',
  password: bcrypt.hashSync('BrowserPass!123', 4),
  async save() { return this; }
};
user.id = String(user._id);
const query = value => ({
  select() { return this; },
  lean() { return Promise.resolve(value); },
  then(ok,bad) { return Promise.resolve(value).then(ok,bad); }
});
Employee.findOne = ({email}) => query(email === user.email ? user : null);
Employee.findById = id => query(String(id) === user.id ? user : null);
Identity.findOne = async () => null;
Identity.exists = async () => null;
const { createApp } = require('../../app');
const app = createApp({ store: new session.MemoryStore() });
const server = process.env.HTTPS_ENABLED === 'true'
  ? require('node:https').createServer(require('../../backend/config/tls').loadTlsOptions(), app)
  : require('node:http').createServer(app);
const io = require('../../backend/realtime/socketServer')(server, app.get('sessionMiddleware'));
server.listen(Number(process.env.PORT), '127.0.0.1', () => {
  process.stdout.write(`E2E fixture listening on ${process.env.PORT}\n`);
});
function close() { io.close(); server.close(() => process.exit(0)); }
process.on('SIGTERM', close); process.on('SIGINT', close);
