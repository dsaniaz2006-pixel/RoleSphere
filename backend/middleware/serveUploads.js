// ─────────────────────────────────────────────────────────────────────────────
// serveUploads.js — replaces `app.use("/uploads", express.static("uploads"))`.
//
// The static handler served every uploaded file to anyone who asked, with no
// session check and no headers. Three consequences:
//
//   1. Task submissions, complaint attachments and announcement files were
//      readable by anonymous visitors who knew or guessed a filename.
//   2. Because the files sit on the app's own origin, an uploaded .html or
//      .svg executed as first-party script. Session cookie theft from there is
//      trivial.
//   3. Browsers were free to MIME-sniff, so a mislabelled file could still be
//      treated as markup.
//
// This middleware requires a session, refuses to leave the uploads directory,
// forces download for anything that is not a known-safe image, and tells the
// browser not to sniff.
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path");
const fs   = require("fs");
const { UPLOAD_ROOT, IMAGE_EXTS } = require("./uploadConfig");

function isLoggedIn(req) {
  return Boolean(req.session && (req.session.admin || req.session.user));
}

module.exports = function serveUploads(req, res, next) {
  // Only GET and HEAD. Nothing should ever POST to a file path.
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  if (!isLoggedIn(req)) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(401).json({ success: false, error: "Please log in to view this file." });
    }
    return res.status(401).send("Please log in to view this file.");
  }

  // req.path is already percent-decoded by express. A null byte can truncate a
  // path inside the filesystem layer, so reject it outright rather than trying
  // to normalise it away.
  const rel = decodeURIComponent(req.path).replace(/^\/+/, "");
  if (rel.includes("\0")) {
    return res.status(400).send("Bad request");
  }

  // Resolve, then prove the result is still inside UPLOAD_ROOT. path.resolve
  // collapses "..", so this catches traversal without needing to pattern-match
  // for it. The trailing separator matters: without it, a sibling directory
  // named "uploads-backup" would pass a naive startsWith check.
  const target = path.resolve(UPLOAD_ROOT, rel);
  if (target !== UPLOAD_ROOT && !target.startsWith(UPLOAD_ROOT + path.sep)) {
    return res.status(403).send("Forbidden");
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return next();   // fall through to the 404 handler

    const ext = path.extname(target).toLowerCase();

    // Never let the browser guess. Combined with the extension whitelist in
    // uploadConfig.js, this is what stops an uploaded file from running as
    // script on our origin.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

    if (IMAGE_EXTS.includes(ext)) {
      // Profile photos have to render in an <img>, so they stay inline. Safe
      // because the whitelist admits only raster formats — .svg is excluded
      // precisely because it can carry script.
      res.setHeader("Content-Disposition", "inline");
    } else {
      // Everything else downloads instead of rendering. Even if a bad file got
      // past the filter, "attachment" means the browser will not execute it.
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(target)}"`);
    }

    res.sendFile(target, (sendErr) => {
      if (sendErr && !res.headersSent) next(sendErr);
    });
  });
};
