'use strict';

const AppError = require('../errors/AppError');

/** Convert known framework/database errors into a safe, stable HTTP contract. */
function describeError(error) {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      code: error.code,
      message: error.expose ? error.message : 'Something went wrong'
    };
  }

  if (error?.code === 11000) {
    return { status: 409, code: 'DUPLICATE_RESOURCE', message: 'A record with these details already exists.' };
  }
  if (['CastError', 'ValidationError'].includes(error?.name)) {
    return { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid request data' };
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, code: 'UPLOAD_TOO_LARGE', message: 'Uploaded file exceeds the allowed size' };
  }
  if (error?.name === 'MulterError') {
    return { status: 400, code: 'UPLOAD_INVALID', message: 'The uploaded file could not be processed' };
  }
  if (error?.type === 'entity.too.large') {
    return { status: 413, code: 'REQUEST_TOO_LARGE', message: 'Request body exceeds the allowed size' };
  }
  if (error?.type === 'entity.parse.failed') {
    return { status: 400, code: 'INVALID_JSON', message: 'Request body contains invalid JSON' };
  }
  if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error?.name)) {
    return { status: 401, code: 'INVALID_TOKEN', message: 'Authentication token is invalid or expired' };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}

/** One error boundary for all route groups. Never leak stacks, queries or secrets. */
function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);

  const failure = describeError(error);
  // Do not log raw error messages or stacks here: database/driver messages can
  // contain connection details. Log stable context that is useful for triage.
  const context = {
    name: error?.name || 'Error',
    code: error?.code || failure.code,
    status: failure.status,
    method: req?.method,
    path: req?.originalUrl?.split('?')[0] || req?.path
  };
  if (failure.status >= 500) console.error('Request failed:', context);

  return res.status(failure.status).json({
    success: false,
    error: failure.message,
    message: failure.message, // additive alias for older clients that read `message`
    code: failure.code
  });
}

function handleNotFound(req, res) {
  if (req.xhr || req.path?.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
    return res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
  }
  return res.status(404).send('Page not found');
}

/** For promise-based handlers on Express 4: forwards sync and async failures. */
function asyncHandler(handler) {
  if (typeof handler !== 'function') throw new TypeError('asyncHandler expects a function');
  return function wrappedAsyncHandler(req, res, next) {
    return Promise.resolve().then(() => handler(req, res, next)).catch(next);
  };
}

module.exports = { handleError, handleNotFound, asyncHandler, describeError };
