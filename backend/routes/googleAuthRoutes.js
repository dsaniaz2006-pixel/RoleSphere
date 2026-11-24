const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { config, configurationStatus, authorizationUrl, exchangeCode, verifyIdToken } = require('../services/googleIdentity');
const { establishSession } = require('../services/authSession');
const { audit } = require('../services/auditService');
const Identity = require('../models/GoogleIdentity');
const models = { Admin: require('../models/Admin'), HR: require('../models/HR'), Manager: require('../models/Manager'), Employee: require('../models/Employee') };
const router = express.Router();
const dashboard = '/workbench?tab=profile&security=1';
const save = req => new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
const current = req => req.session?.admin || req.session?.user;
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const registerableRoles = new Set(['HR', 'Manager', 'Employee']);
const deriveNameFromEmail = email => {
  const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  const formatted = local.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (formatted || 'Google User').slice(0, 100);
};
const registerableRoles = new Set(['HR', 'Manager', 'Employee']);
const deriveNameFromEmail = email => {
  const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  const words = local.split(/\s+/).filter(Boolean);
  const formatted = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (formatted || 'Google User').slice(0, 100);
};
const messages = {
  unavailable: 'Google sign-in is not configured yet. Ask the administrator to set up Google OAuth.',
  cancelled: 'Google sign-in was cancelled. You can try again.',
  notLinked: 'This Google account is not connected to this role. Sign in with your email and password, then connect Google in My profile \u2192 Security.',
  wrongRole: 'That Google account is linked to a different role. Select the correct role.',
  pending: 'Your account is awaiting approval or has been rejected.',
  missing: 'This RoleSphere account could not be found.',
  mismatch: 'Use the Google account with the same verified email address as your RoleSphere account.',
  taken: 'That Google account is already connected to a different RoleSphere account.',
  alreadyRegistered: 'An account with this Google account or email already exists for this role. Sign in instead.',
  adminRegisterForbidden: 'Public administrator registration is disabled. Sign in with an existing administrator account.',
  invalid: 'Google sign-in could not be verified. Please try again.'
};
async function fail(req, res, message, role = 'Employee', linking = false, status = 302, targetPath = null) {
  if (linking && current(req)) {
    req.session.googleLinkNotice = { type: 'error', message };
    await save(req);
    return res.redirect(status, dashboard);
  }
  req.session.googleAuthNotice = { role, message };
  await save(req);
  return res.redirect(status, targetPath || ('/login/' + role));
}
router.get('/start', async (req, res, next) => {
  try {
    const settings = config();
    const rawIntent = req.query.intent;
    const intent = rawIntent === 'link' ? 'link' : rawIntent === 'register' ? 'register' : 'login';
    const sessionUser = current(req);
    const role = intent === 'link' ? (req.session.admin ? 'Admin' : sessionUser?.role) : req.query.role;
    if (!Object.hasOwn(models, role) || (intent === 'link' && !sessionUser)) {
      return res.status(400).json({ error: 'Select a valid role, or sign in before connecting Google.' });
    }
    if (intent === 'register' && (!registerableRoles.has(role) || role === 'Admin')) {
      return res.status(403).json({ error: messages.adminRegisterForbidden });
    }
    if (!settings) {
      const target = intent === 'register' ? ('/register/' + role) : null;
      return fail(req, res, messages.unavailable, role, intent === 'link', 302, target);
    }
    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    req.session.googleOAuth = {
      state, nonce, codeVerifier, role, intent,
      actorId: intent === 'link' ? String(sessionUser.id) : null,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    await save(req);
    res.set('Cache-Control', 'no-store');
    res.redirect(authorizationUrl(settings, { state, nonce, codeVerifier }));
  } catch (error) { next(error); }
});
router.get('/callback', async (req, res, next) => {
  const flow = req.session?.googleOAuth;
  const linking = flow?.intent === 'link';
  const registering = flow?.intent === 'register';
  const role = Object.hasOwn(models, flow?.role) ? flow.role : 'Employee';
  const failTarget = registering ? ('/register/' + role) : null;
  try {
    if (!flow || flow.expiresAt < Date.now() || !same(req.query.state, flow.state)) {
      return res.status(400).send('Invalid or expired Google sign-in request. Return to RoleSphere and try again.');
    }
    delete req.session.googleOAuth;
    await save(req);
    if (req.query.error) return fail(req, res, messages.cancelled, role, linking, 302, failTarget);
    const settings = config();
    if (!settings || typeof req.query.code !== 'string' || req.query.code.length > 4096) {
      return fail(req, res, messages.invalid, role, linking, 302, failTarget);
    }
    const idToken = await exchangeCode(settings, req.query.code, flow.codeVerifier);
    const google = await verifyIdToken(idToken, { clientId: settings.clientId, nonce: flow.nonce });
    if (linking) {
      const actor = current(req);
      const actorRole = req.session.admin ? 'Admin' : actor?.role;
      if (!actor || String(actor.id) !== flow.actorId || actorRole !== role) {
        return res.status(403).send('Session changed. Sign in again before connecting Google.');
      }
      const user = await models[role].findById(actor.id).select('email');
      if (!user || user.email.toLowerCase() !== google.email) {
        return fail(req, res, messages.mismatch, role, true);
      }
      const owner = await Identity.findOne({ sub: google.sub });
      const connected = await Identity.findOne({ role, userId: user._id });
      const wrongOwner = owner && (owner.role !== role || String(owner.userId) !== String(user._id));
      if (wrongOwner || (connected && connected.sub !== google.sub)) {
        return fail(req, res, messages.taken, role, true);
      }
      if (!connected) {
        try { await Identity.create({ sub: google.sub, userId: user._id, role }); }
        catch (error) {
          if (error.code === 11000) return fail(req, res, messages.taken, role, true);
          throw error;
        }
      }
      await audit(req, 'login.google.link', { type: role, id: user._id });
      req.session.googleLinkNotice = {
        type: 'success',
        message: 'Google account connected. You can now sign in with Google.'
      };
      await save(req);
      return res.redirect(dashboard);
    }
    if (registering) {
      if (!registerableRoles.has(role) || role === 'Admin') {
        return fail(req, res, messages.adminRegisterForbidden, 'Admin');
      }
      const existingSub = await Identity.findOne({ sub: google.sub });
      if (existingSub) {
        const msg = existingSub.role === role ? messages.alreadyRegistered : messages.wrongRole;
        return fail(req, res, msg, role);
      }
      const existingRoleUser = await models[role].findOne({ email: google.email });
      if (existingRoleUser) {
        return fail(req, res, messages.alreadyRegistered, role);
      }
      const generatedSecret = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(generatedSecret, 12);
      const payload = {
        name: deriveNameFromEmail(google.email),
        email: google.email,
        password: hashedPassword,
        preferredLogin: 'google',
        isApproved: false,
        status: 'pending',
        role
      };
      let createdUser;
      try {
        createdUser = await models[role].create(payload);
      } catch (error) {
        if (error.code === 11000) return fail(req, res, messages.alreadyRegistered, role);
        throw error;
      }
      try {
        await Identity.create({ sub: google.sub, userId: createdUser._id, role });
      } catch (error) {
        await models[role].findByIdAndDelete(createdUser._id).catch(() => {});
        if (error.code === 11000) return fail(req, res, messages.alreadyRegistered, role);
        throw error;
      }
      await audit(req, 'register.google.pending', { type: role, id: createdUser._id }, { email: google.email });
      await save(req);
      return res.redirect('/register-pending');
    }
    const identity = await Identity.findOne({ sub: google.sub, role });
    if (!identity) {
      const otherRole = await Identity.findOne({ sub: google.sub });
      return fail(req, res, otherRole ? messages.wrongRole : messages.notLinked, role);
    }
    const user = await models[role].findById(identity.userId);
    if (!user || user.email.trim().toLowerCase() !== google.email) {
      return fail(req, res, messages.missing, role);
    }
    if (role !== 'Admin' && (!user.isApproved || user.status !== 'approved')) {
      return fail(req, res, messages.pending, role);
    }
    const destination = await establishSession(req, user, role, { method: 'google' });
    res.redirect(destination);
  } catch (error) {
    console.error('Google sign-in failed:', error.message);
    try { return await fail(req, res, messages.invalid, role, linking, 302, failTarget); }
    catch (saveError) { next(saveError); }
  }
});
router.get('/methods', async (req, res, next) => {
  try {
    const actor = current(req);
    if (!actor) return res.status(401).json({ error: 'Sign in to manage login methods.' });
    const role = req.session.admin ? 'Admin' : actor.role;
    const [user, identity] = await Promise.all([
      models[role].findById(actor.id).select('preferredLogin +password'),
      Identity.findOne({ role, userId: actor.id })
    ]);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const notice = req.session.googleLinkNotice || null;
    if (notice) { delete req.session.googleLinkNotice; await save(req); }
    res.set('Cache-Control', 'no-store').json({
      linkedGoogle: Boolean(identity), passwordEnabled: Boolean(user.password),
      preferredLogin: identity && user.preferredLogin === 'google' ? 'google' : 'password',
      googleConfigured: configurationStatus().configured, googleSetupMessage: configurationStatus().configured ? null : configurationStatus().message, notice
    });
  } catch (error) { next(error); }
});
router.post('/preferred', async (req, res, next) => {
  try {
    const actor = current(req);
    if (!actor) return res.status(401).json({ error: 'Sign in first.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON request required.' });
    const method = req.body.method;
    if (!['password', 'google'].includes(method)) return res.status(400).json({ error: 'Choose email and password or Google.' });
    const role = req.session.admin ? 'Admin' : actor.role;
    const [user, linked] = await Promise.all([
      models[role].findById(actor.id).select('+password'), Identity.exists({ role, userId: actor.id })
    ]);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if ((method === 'google' && !linked) || (method === 'password' && !user.password)) return res.status(400).json({ error: 'Connect this login method first.' });
    user.preferredLogin = method;
    await user.save();
    await audit(req, 'login.method.change', { type: role, id: user._id }, { method });
    res.json({ success: true, preferredLogin: method });
  } catch (error) { next(error); }
});
router.post('/disconnect', async (req, res, next) => {
  try {
    const actor = current(req);
    if (!actor) return res.status(401).json({ error: 'Sign in first.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON request required.' });
    const role = req.session.admin ? 'Admin' : actor.role;
    const user = await models[role].findById(actor.id).select('+password');
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    if (!user.password || typeof req.body.password !== 'string' || req.body.password.length > 128 || !(await bcrypt.compare(req.body.password, user.password))) return res.status(403).json({ error: 'Enter your current RoleSphere password to disconnect Google.' });
    user.preferredLogin = 'password';
    await user.save();
    await Identity.deleteOne({ role, userId: actor.id });
    await audit(req, 'login.google.disconnect', { type: role, id: user._id });
    res.json({ success: true, preferredLogin: 'password' });
  } catch (error) { next(error); }
});
module.exports = router;
