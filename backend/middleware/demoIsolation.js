'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const DEMO_KEY = 'rolesphere-public-demo-v1';
const context = new AsyncLocalStorage();
const INSTALL_KEY = Symbol.for('rolesphere.demoIsolation.installed');
const SAFE_POST_READ_PATHS = new Set(['/employee/getTasks']);
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getDemoContext() {
  return context.getStore() || null;
}

function runWithDemoContext(scope, callback) {
  return context.run(scope, callback);
}

function addDemoScope(query) {
  const scope = getDemoContext();
  if (scope?.demoKey) query.where({ demoKey: scope.demoKey });
}

function demoIsolationPlugin(schema) {
  schema.add({
    demoKey: { type: String, default: null, index: false },
    isDemo: { type: Boolean, default: false },
    demoSeedId: { type: String, default: null }
  });

  for (const method of ['find', 'findOne', 'countDocuments', 'distinct']) {
    schema.pre(method, function scopeDemoRead(next) {
      addDemoScope(this);
      next();
    });
  }

  schema.pre('estimatedDocumentCount', function blockUnscopedEstimate(next) {
    if (getDemoContext()?.demoKey) {
      return next(new Error('Demo isolation: use countDocuments so results remain scoped to demo data.'));
    }
    next();
  });

  schema.pre('aggregate', function scopeDemoAggregate(next) {
    const scope = getDemoContext();
    if (!scope?.demoKey) return next();

    const pipeline = this.pipeline();
    const firstStage = pipeline[0] || {};
    const mustRemainFirst = ['$search', '$searchMeta', '$vectorSearch', '$geoNear']
      .some(stage => Object.prototype.hasOwnProperty.call(firstStage, stage));
    pipeline.splice(mustRemainFirst ? 1 : 0, 0, { $match: { demoKey: scope.demoKey } });
    next();
  });

  const queryWriteMethods = [
    'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne',
    'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'
  ];

  for (const method of queryWriteMethods) {
    schema.pre(method, function scopeDemoWrite(next) {
      const scope = getDemoContext();
      if (!scope?.demoKey) return next();

      this.where({ demoKey: scope.demoKey });

      const update = this.getUpdate();
      if (update && !Array.isArray(update)) {
        for (const operator of Object.keys(update)) {
          if (operator.startsWith('$') && update[operator] && typeof update[operator] === 'object') {
            delete update[operator].demoKey;
            delete update[operator].isDemo;
            delete update[operator].demoSeedId;
          }
        }

        if (method === 'replaceOne' || method === 'findOneAndReplace') {
          update.demoKey = scope.demoKey;
          update.isDemo = true;
        } else if (!['deleteOne', 'deleteMany', 'findOneAndDelete'].includes(method)) {
          update.$set = {
            ...(update.$set || {}),
            demoKey: scope.demoKey,
            isDemo: true
          };
        }
        this.setUpdate(update);
      }

      next();
    });
  }

  schema.pre('save', function protectDemoSave(next) {
    const scope = getDemoContext();
    if (!scope?.demoKey) return next();
    if (!this.isNew && this.demoKey !== scope.demoKey) {
      return next(new Error('Demo isolation: a demo account cannot modify a non-demo record.'));
    }
    this.demoKey = scope.demoKey;
    this.isDemo = true;
    next();
  });

  schema.pre('insertMany', function protectDemoInsertMany(next, documents) {
    const scope = getDemoContext();
    if (!scope?.demoKey) return next();
    try {
      for (const document of documents || []) {
        if (document.demoKey && document.demoKey !== scope.demoKey) {
          throw new Error('Demo isolation: cannot insert a record into another data scope.');
        }
        document.demoKey = scope.demoKey;
        document.isDemo = true;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  schema.pre('bulkWrite', function blockDemoBulkWrites(next) {
    if (getDemoContext()?.demoKey) {
      return next(new Error('Demo isolation: bulk writes are disabled for public demo accounts.'));
    }
    next();
  });
}

function installDemoIsolation(mongoose) {
  if (mongoose[INSTALL_KEY]) return;
  mongoose.plugin(demoIsolationPlugin);
  Object.defineProperty(mongoose, INSTALL_KEY, { value: true, configurable: false });
}

function demoIsolationMiddleware(req, res, next) {
  const actor = req.session?.admin || req.session?.user;
  if (!actor || (actor.isDemo !== true && actor.demoKey !== DEMO_KEY)) return next();

  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({
      success: false,
      code: 'DEMO_MODE_DISABLED',
      error: 'Public demo access is currently disabled.'
    });
  }

  const scope = {
    demoKey: actor.demoKey || DEMO_KEY,
    actorId: String(actor.id || actor._id || '')
  };
  req.demoMode = true;
  req.demoKey = scope.demoKey;
  res.locals.demoMode = true;
  res.set('X-RoleSphere-Demo-Mode', 'true');

  if (req.path.startsWith('/uploads')) {
    return res.status(404).send('Files are not available in the public demo.');
  }

  // Public demo sessions are intentionally read-only. The sole POST exception
  // is a legacy endpoint that reads the signed-in employee's task list.
  if (STATE_CHANGING_METHODS.has(req.method)) {
    if (req.method !== 'POST' || !SAFE_POST_READ_PATHS.has(req.path)) {
      return res.status(403).json({
        success: false,
        code: 'DEMO_READ_ONLY',
        error: 'This is a read-only demo account. Changes are disabled.'
      });
    }
  }

  // Block legacy state-changing GET endpoints too.
  if (req.method === 'GET' && /\/(?:delete|remove|approve|reject|edit|update|reset-password)(?:\/|$)/i.test(req.path)) {
    return res.status(403).json({
      success: false,
      code: 'DEMO_READ_ONLY',
      error: 'This is a read-only demo account. Changes are disabled.'
    });
  }

  return context.run(scope, next);
}

module.exports = {
  DEMO_KEY,
  demoIsolationPlugin,
  installDemoIsolation,
  demoIsolationMiddleware,
  getDemoContext,
  runWithDemoContext
};
