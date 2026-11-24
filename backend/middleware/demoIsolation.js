'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const DEMO_KEY = 'rolesphere-public-demo-v1';
const context = new AsyncLocalStorage();
const INSTALL_KEY = Symbol.for('rolesphere.demoIsolation.installed');
const SAFE_POST_READ_PATHS = new Set([
  '/employee/getTasks',
  '/employee/getLeaves',
  '/employee/getWorkReports',
  '/employee/getTodos',
  '/employee/getManagerReports',
  '/manager/getMyTasks'
]);
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getDemoContext() {
  return context.getStore() || null;
}

function runWithDemoContext(scope, callback) {
  return context.run(scope, callback);
}

// Internal operations such as the explicit demo seeder may inspect both data
// scopes. Never expose this helper to request handlers or browser code.
function runWithSystemContext(callback) {
  return context.run({ system: true }, callback);
}

function addReadScope(query) {
  const scope = getDemoContext();
  if (scope?.system) return;
  query.where({ demoKey: scope?.demoKey || null });
}

function stripReservedFields(update) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return;
  delete update.demoKey;
  delete update.isDemo;
  delete update.demoSeedId;
  for (const value of Object.values(update)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    delete value.demoKey;
    delete value.isDemo;
    delete value.demoSeedId;
  }
}

function demoIsolationPlugin(schema) {
  schema.add({
    demoKey: { type: String, default: null, index: false },
    isDemo: { type: Boolean, default: false },
    demoSeedId: { type: String, default: null }
  });

  for (const method of ['find', 'findOne', 'countDocuments', 'distinct']) {
    schema.pre(method, function scopeReadsByDataOwner(next) {
      addReadScope(this);
      next();
    });
  }

  schema.pre('estimatedDocumentCount', function blockUnscopedEstimate(next) {
    if (!getDemoContext()?.system) {
      return next(new Error('Data isolation: use countDocuments so results remain scoped to the current data owner.'));
    }
    next();
  });

  schema.pre('aggregate', function scopeAggregatesByDataOwner(next) {
    const scope = getDemoContext();
    if (scope?.system) return next();

    const pipeline = this.pipeline();
    const firstStage = pipeline[0] || {};
    const mustRemainFirst = ['$search', '$searchMeta', '$vectorSearch', '$geoNear', '$documents']
      .some(stage => Object.prototype.hasOwnProperty.call(firstStage, stage));
    pipeline.splice(mustRemainFirst ? 1 : 0, 0, {
      $match: { demoKey: scope?.demoKey || null }
    });
    next();
  });

  const queryWriteMethods = [
    'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne',
    'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'
  ];

  for (const method of queryWriteMethods) {
    schema.pre(method, function scopeWritesByDataOwner(next) {
      const scope = getDemoContext();
      if (scope?.system) return next();

      this.where({ demoKey: scope?.demoKey || null });

      const update = this.getUpdate();
      if (Array.isArray(update)) {
        return next(new Error('Data isolation: update pipelines are disabled outside trusted system operations.'));
      }
      if (update) {
        stripReservedFields(update);

        if (method === 'replaceOne' || method === 'findOneAndReplace') {
          update.demoKey = scope?.demoKey || null;
          update.isDemo = Boolean(scope?.demoKey);
          update.demoSeedId = scope?.demoKey ? update.demoSeedId || null : null;
        } else if (scope?.demoKey && !['deleteOne', 'deleteMany', 'findOneAndDelete'].includes(method)) {
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

  schema.pre('save', function protectDocumentDataOwner(next) {
    const scope = getDemoContext();
    if (scope?.system) return next();
    if (scope?.demoKey) {
      if (!this.isNew && this.demoKey !== scope.demoKey) {
        return next(new Error('Demo isolation: a demo account cannot modify a non-demo record.'));
      }
      this.demoKey = scope.demoKey;
      this.isDemo = true;
      return next();
    }

    // A normal account cannot mark its own records as demo data.
    this.demoKey = null;
    this.isDemo = false;
    this.demoSeedId = null;
    next();
  });

  schema.pre('insertMany', function protectBulkInsertDataOwner(next, documents) {
    const scope = getDemoContext();
    if (scope?.system) return next();
    try {
      for (const document of documents || []) {
        if (scope?.demoKey) {
          if (document.demoKey && document.demoKey !== scope.demoKey) {
            throw new Error('Demo isolation: cannot insert a record into another data scope.');
          }
          document.demoKey = scope.demoKey;
          document.isDemo = true;
        } else {
          document.demoKey = null;
          document.isDemo = false;
          document.demoSeedId = null;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  schema.pre('bulkWrite', function blockUnscopedBulkWrites(next) {
    if (!getDemoContext()?.system) {
      return next(new Error('Data isolation: bulk writes are disabled outside trusted system operations.'));
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

  // Public demo sessions are intentionally read-only. These POST endpoints
  // only retrieve lists; every state-changing request remains blocked.
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
  runWithDemoContext,
  runWithSystemContext
};
