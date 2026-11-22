// Compatibility exports for legacy controller imports.
// All authentication logic lives in the validated canonical route module.
const routes = require('../routes/authRoutes');
module.exports = { register: routes.register, login: routes.login };
