'use strict';

/** One error boundary for all route groups. Never leak stacks or secrets. */
function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error('Request failed:', error.message);
  const validation = ['CastError', 'ValidationError'].includes(error.name);
  const tooLarge = error.code === 'LIMIT_FILE_SIZE';
  const status = validation ? 400 : tooLarge ? 413 : 500;
  return res.status(status).json({ success: false, error: validation ? 'Invalid request data' : tooLarge ? 'Uploaded file exceeds the allowed size' : 'Something went wrong' });
}
function handleNotFound(req, res) {
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(404).json({ success: false, error: 'Route not found' });
  }
  return res.status(404).send('Page not found');
}
/** For promise-based handlers on Express 4: next(error) catches rejections. */
const asyncHandler = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);
module.exports = { handleError, handleNotFound, asyncHandler };
