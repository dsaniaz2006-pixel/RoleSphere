'use strict';

/** Shared logout for all role-specific and legacy routes.
 * Wait for the server-side session to be revoked and expire the browser cookie.
 */
function logout(req, res) {
  const finish = () => {
    res.clearCookie('connect.sid', { path: '/' });
    res.clearCookie('rs_token', { path: '/' });
    res.set('Cache-Control', 'no-store');
    res.redirect('/login');
  };
  if (!req.session) return finish();
  req.session.destroy(error => {
    if (error) {
      console.error('Logout session deletion failed:', error.message);
      return res.status(503).json({ success: false, error: 'Unable to complete sign-out. Please retry.' });
    }
    finish();
  });
}

module.exports = { logout };
