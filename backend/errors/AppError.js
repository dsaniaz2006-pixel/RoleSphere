'use strict';

/**
 * Error type for expected application failures.
 *
 * Throw AppError from controllers/services for failures that should become a
 * known HTTP response. Unexpected failures should remain ordinary Errors and
 * be handled as HTTP 500 by the central error boundary.
 */
class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', expose } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
      ? statusCode
      : 500;
    this.code = typeof code === 'string' && code.trim() ? code : 'INTERNAL_ERROR';
    this.expose = typeof expose === 'boolean' ? expose : this.statusCode < 500;
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }
}

module.exports = AppError;
