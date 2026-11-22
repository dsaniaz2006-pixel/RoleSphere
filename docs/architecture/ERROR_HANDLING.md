# Error handling

## Request path

1. Route middleware validates input and identity/role access.
2. Controllers and services return successful responses or forward failures with `next(error)` / `asyncHandler`.
3. `AppError` represents an expected application failure and carries an HTTP status, stable machine-readable code, and safe public message.
4. `backend/middleware/errorHandling.js` converts known Mongoose, Multer, body-parser, and JWT failures into the shared response shape.
5. Unknown errors become a generic HTTP 500 response. The response never contains a stack trace, raw database message, query, or credential.

## API error shape

```json
{
  "success": false,
  "error": "A safe message for the caller",
  "code": "VALIDATION_ERROR"
}
```

The `code` field is additive; existing clients can continue to read `success` and `error`.

## Usage

```js
const AppError = require('../errors/AppError');
const { asyncHandler } = require('../middleware/errorHandling');

router.get('/example/:id', asyncHandler(async (req, res) => {
  const record = await Record.findById(req.params.id);
  if (!record) throw new AppError('Record not found', { statusCode: 404, code: 'RECORD_NOT_FOUND' });
  res.json({ success: true, data: record });
}));
```

Do not catch an error merely to return a generic 500 from an individual route. Prefer forwarding it to the global boundary. Keep best-effort side effects (for example, sending a notification after a primary write) explicitly isolated and logged, so their failure does not undo the primary business action.

## Remaining migration work

Several legacy routes/controllers still have local `try/catch` blocks because they render HTML with page-specific error states or preserve historical response contracts. Migrate them feature-by-feature with integration tests; do not bulk-rewrite response handling.
