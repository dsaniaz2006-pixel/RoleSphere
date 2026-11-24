const express     = require("express");
const mongoose    = require("mongoose");
const cookieParser = require("cookie-parser");
const path        = require("path");
const cors        = require("cors");
const serveUploads = require('./backend/middleware/serveUploads');
const { allowedOrigins } = require('./backend/config/allowedOrigins');

const { installDemoIsolation, demoIsolationMiddleware } = require('./backend/middleware/demoIsolation');
const { DEMO_ACCOUNTS, DEMO_PASSWORD } = require('./backend/config/demoAccounts');
// Install before route modules import/compile Mongoose models.
installDemoIsolation(mongoose);
const { registerRoutes } = require('./backend/http/registerRoutes');
const { createSecurityHeaders } = require('./backend/middleware/securityHeaders');
const { sameOriginWrites } = require('./backend/middleware/sameOriginWrites');
const { attachSession } = require('./backend/middleware/sessionStore');
const { handleError, handleNotFound } = require('./backend/middleware/errorHandling');
const { enforceRouteAccess } = require('./backend/middleware/routeAccess');

// ── App setup ─────────────────────────────────────────────────────────────────
function createApp({ store } = {}) {
  const app = express();
  app.use((req, res, next) => {
    res.locals.googleSignInEnabled = Boolean(require('./backend/services/googleIdentity').config());
    res.locals.demoEnabled = process.env.DEMO_MODE === 'true';
    res.locals.demoAccounts = DEMO_ACCOUNTS;
    res.locals.demoPassword = process.env.DEMO_PASSWORD || DEMO_PASSWORD;
    next();
  });
  app.locals.jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');


  // Apply security headers before static assets and all routes.
  app.use(createSecurityHeaders());

  // NOTE: uploads are NOT served here any more. They used to be mounted at this
  // point with `app.use("/uploads", express.static("uploads"))`, which was both
  // unauthenticated and above the session middleware — so it could not have
  // checked a session even if it wanted to. The guarded handler is mounted after
  // the session block instead. See backend/middleware/serveUploads.js.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(cors({
    origin: allowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

  app.use(sameOriginWrites);

  app.use(cookieParser());


  attachSession(app, { store });
  // Establish a demo-only async data scope after the session is available and before any route runs.
  app.use(demoIsolationMiddleware);
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ ready: mongoose.connection.readyState === 1 }));
  enforceRouteAccess(app);

  // ── Uploaded files ────────────────────────────────────────────────────────────
  // Mounted here, after the session middleware, because it needs req.session to
  // decide whether the caller may read the file at all.
  app.use("/uploads", serveUploads);

  // ── Template engine ───────────────────────────────────────────────────────────
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "frontend/views"));
  app.use(express.static(path.join(__dirname, "frontend/public")));

  registerRoutes(app);

  app.use(handleError);
  app.use(handleNotFound);

  return app;
}
module.exports = { createApp };
