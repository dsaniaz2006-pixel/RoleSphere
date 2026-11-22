const jwt = require("jsonwebtoken");

/**
 * requireSession — checks req.session?.user or req.session?.admin
 * Drop-in replacement for your existing route guards.
 * Use this on any route that needs the user to be logged in.
 */
function requireSession(req, res, next) {
  const actor = req.session?.admin || req.session?.user;
  if (actor) {
    req.currentUser = { id: actor.id || actor._id, name: actor.name, email: actor.email, role: req.session?.admin ? 'Admin' : actor.role };
    return next();
  }
  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(401).json({ success: false, error: "Unauthorized. Please log in." });
  }
  res.redirect("/login");
}

/**
 * requireRole(...roles) — checks the session user has one of the given roles
 * Usage: router.get("/dashboard", requireRole("HR"), handler)
 *        router.get("/admin", requireRole("Admin"), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const sessionRole = req.session?.admin ? "Admin" : req.session?.user?.role;
    if (!sessionRole) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      return res.redirect("/login");
    }
    if (!roles.includes(sessionRole)) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(403).json({ success: false, error: "Forbidden — insufficient permissions" });
      }
      return res.status(403).render("403", { message: "You don't have permission to access this page." });
    }
    const actor = req.session?.admin || req.session?.user;
    req.currentUser = { id: actor.id || actor._id, name: actor.name, email: actor.email, role: sessionRole };
    next();
  };
}

/**
 * requireJWT — validates Authorization: Bearer <token> header
 * Used for API-only routes where no session exists (e.g. mobile clients)
 *
 * On success, sets req.jwtUser = { id, email, role, name }
 */
function requireJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.jwtUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Token invalid or expired" });
  }
}

/**
 * requireAuth — accepts EITHER a valid session OR a valid JWT
 * Good for routes that need to work with both the EJS frontend (sessions)
 * and future API clients (JWT)
 *
 * Sets req.currentUser = { id, email, role, name }
 */
function requireAuth(req, res, next) {
  // 1. Check session first
  if (req.session?.admin) {
    req.currentUser = {
      id:    req.session?.admin.id,
      email: req.session?.admin.email,
      name:  req.session?.admin.name,
      role:  "Admin"
    };
    return next();
  }

  if (req.session?.user) {
    req.currentUser = {
      id:    req.session?.user.id,
      email: req.session?.user.email,
      name:  req.session?.user.name,
      role:  req.session?.user.role
    };
    return next();
  }

  // 2. Fall back to JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
      req.currentUser = decoded;
      return next();
    } catch {
      return res.status(401).json({ success: false, error: "Token invalid or expired" });
    }
  }

  if (req.xhr || req.headers.accept?.includes("application/json")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  res.redirect("/login");
}

module.exports = { requireSession, requireRole, requireJWT, requireAuth };
