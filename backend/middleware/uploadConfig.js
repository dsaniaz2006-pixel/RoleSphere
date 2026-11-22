// ─────────────────────────────────────────────────────────────────────────────
// uploadConfig.js — one place that decides what may be uploaded and how it is
// named on disk.
//
// Why this file exists: there were five separate multer configs across four
// route files. Two of them had a fileFilter and a size limit. Three had
// neither, so /submitTask and /announcements accepted any file of any size.
// Combined with /uploads being served as static files from the same origin as
// the app, an uploaded .html or .svg became stored XSS against every logged-in
// user. One shared config means the rule cannot silently differ per route.
// ─────────────────────────────────────────────────────────────────────────────

const path   = require("path");
const fs     = require("fs");
const crypto = require("crypto");
const multer = require("multer");

// Resolve against this file, not process.cwd(). The old configs used a bare
// "uploads/" string, which multer resolves relative to the directory the
// process was started from — so launching the server from anywhere other than
// the project root wrote files to a different folder than the one being served.
const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

// Extension whitelists.
//
// Every extension a browser will execute in our own origin is deliberately
// absent: no .html, .htm, .xhtml, .shtml, .svg, .js, .mjs, .xml, .swf. .svg is
// the one people forget — it is an image everywhere else and a script host here.
const DOC_EXTS   = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
                    ".txt", ".csv", ".zip"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

// Checking the extension alone is not enough, and checking the MIME type alone
// is worse — multer reports whatever Content-Type the client claims. Requiring
// the two to agree means a mismatched pair is rejected, and the extension is
// what actually governs how the file gets served later.
const MIME_BY_EXT = {
  ".pdf":  ["application/pdf"],
  ".doc":  ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls":  ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".ppt":  ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".txt":  ["text/plain"],
  ".csv":  ["text/csv", "application/csv", "text/plain"],
  ".zip":  ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
  ".jpg":  ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png":  ["image/png"],
  ".webp": ["image/webp"],
  ".gif":  ["image/gif"]
};

const MAX_DOC_BYTES   = 10 * 1024 * 1024;  // 10 MB
const MAX_IMAGE_BYTES = 2  * 1024 * 1024;  // 2 MB

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// The old scheme was `Date.now() + "-" + file.originalname`. Two problems.
//
// First, originalname is attacker-controlled and was written to disk verbatim,
// so the stored name could carry path separators, null bytes, leading dots, or
// a second extension.
//
// Second, a millisecond timestamp is guessable. Anyone could walk /uploads with
// a script and pull down other people's task submissions and complaint
// attachments. 16 random bytes is not walkable.
//
// The original filename is not lost — store it in the database alongside the
// path if you want to show it back to the user.
function randomName(originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return `${crypto.randomBytes(16).toString("hex")}${ext}`;
}

function makeStorage(subdir) {
  const dir = subdir ? path.join(UPLOAD_ROOT, subdir) : UPLOAD_ROOT;
  return multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        ensureDir(dir);
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => cb(null, randomName(file.originalname))
  });
}

function makeFilter(allowedExts) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (!allowedExts.includes(ext)) {
      return cb(new UploadRejected(
        `File type "${ext || "unknown"}" is not allowed. Accepted: ${allowedExts.join(", ")}`
      ));
    }

    const expected = MIME_BY_EXT[ext] || [];
    if (expected.length && !expected.includes(file.mimetype)) {
      return cb(new UploadRejected(
        `The file's content type (${file.mimetype}) does not match its "${ext}" extension.`
      ));
    }

    cb(null, true);
  };
}

// A distinct error type so the handler below can tell "user sent a bad file"
// (422) apart from "the disk is full" (500).
class UploadRejected extends Error {
  constructor(message) {
    super(message);
    this.name = "UploadRejected";
  }
}

// ── Configured multer instances ───────────────────────────────────────────────

const taskMulter = multer({
  storage:    makeStorage("task-submissions"),
  fileFilter: makeFilter(DOC_EXTS.concat(IMAGE_EXTS)),
  limits:     { fileSize: MAX_DOC_BYTES, files: 1 }
});

const announcementMulter = multer({
  storage:    makeStorage("announcements"),
  fileFilter: makeFilter(DOC_EXTS.concat(IMAGE_EXTS)),
  limits:     { fileSize: MAX_DOC_BYTES, files: 1 }
});

const complaintMulter = multer({
  storage:    makeStorage("complaints"),
  // Narrower than the others on purpose: this preserves the original
  // complaintRoutes.js whitelist rather than silently widening what a removal
  // complaint may carry.
  fileFilter: makeFilter([".jpg", ".jpeg", ".pdf"]),
  limits:     { fileSize: MAX_DOC_BYTES, files: 1 }
});

const photoMulter = multer({
  storage:    makeStorage("profile-photos"),
  fileFilter: makeFilter(IMAGE_EXTS),
  limits:     { fileSize: MAX_IMAGE_BYTES, files: 1 }
});

// ── Error handling ────────────────────────────────────────────────────────────
// This codebase has no central express error handler, so a rejected upload
// previously became an unhandled error: the request hung or the process died.
// Each uploader below handles its own failures and answers with JSON, which is
// what the dashboards' fetch calls already expect.

function wrap(instance, field) {
  const mw = instance.single(field);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (!err) { req._multipartParsed = true; return require('./validation').validateWrite(req, res, next); }

      if (err.name === "UploadRejected") {
        return res.status(422).json({ success: false, error: err.message });
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, error: "That file is too large." });
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(422).json({ success: false, error: "Only one file may be attached." });
      }

      console.error("Upload failed:", err.message);
      return res.status(500).json({ success: false, error: "Upload failed. Please try again." });
    });
  };
}

module.exports = {
  UPLOAD_ROOT,
  IMAGE_EXTS,
  taskUpload:         (field) => wrap(taskMulter,         field),
  announcementUpload: (field) => wrap(announcementMulter, field),
  complaintUpload:    (field) => wrap(complaintMulter,    field),
  photoUpload:        (field) => wrap(photoMulter,        field)
};
