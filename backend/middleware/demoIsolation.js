'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const DEMO_KEY = 'rolesphere-public-demo-v1';
const context = new AsyncLocalStorage();
const INSTALL_KEY = Symbol.for('rolesphere.demoIsolation.installed');

function getDemoContext() {
  return context.getStore() || null;
}

function runWithDemoContext(scope, callback) {
  return context.run(scope, callback);
}

function demoIsolationPlugin(schema) {
  if (!schema.path('demoKey')) {
    schema.add({ demoKey: { type: String, default: null, index: false } });
  }
  if (!schema.path('isDemo')) {
    schema.add({ isDemo: { type: Boolean, default: false } });
  }

  const applyReadScope = function applyReadScope(next) {
    const scope = getDemoContext();
    if (scope?.demoKey) this.and([{ demoKey: scope.demoKey }]);
    next();
  };

  schema.pre(['find', 'findOne', 'countDocuments', 'distinct'], applyReadScope);

  schema.pre('aggregate', function applyAggregateScope(next) {
    const scope = getDemoContext();
    if (!scope?.demoKey) return next();

    const pipeline = this.pipeline();
    const firstStage = pipeline[0] || {};
    const mustRemainFirst = ['$search', '$searchMeta', '$vectorSearch', '$geoNear']
      .some(stage => Object.prototype.hasOwnProperty.call(firstStage, stage));
    pipeline.splice(mustRemainFirst ? 1 : 0, 0, { $match: { demoKey: scope.demoKey } });
    next();
  });

  const applyWriteScope = function applyWriteScope(next) {
    const scope = getDemoContext();
    if (!scope?.demoKey) return next();

    // Every update/delete is constrained to demo-owned documents. A caller
    // cannot bypass this by supplying a real user's _id or email.
    this.and([{ demoKey: scope.demoKey }]);

    const operation = this.op;
    if (operation === 'replaceOne' || operation === 'findOneAndReplace') {
      const replacement = this.getUpdate() || {};
      if (Array.isArray(replacement)) {
        return next(new Error('Demo isolation does not allow replacement update pipelines.'));
      }
      replacement.demoKey = scope.demoKey;
      replacement.isDemo = true;
      this.setUpdate(replacement);
      return next();
    }

    const update = this.getUpdate();
    if (Array.isArray(update)) {
      return next(new Error('Demo isolation does not allow update pipelines.'));
    }
    if (update && typeof update === 'object' && !['deleteOne', 'deleteMany', 'findOneAndDelete'].includes(operation)) {
      update.$set = { ...(update.$set || {}), demoKey: scope.demoKey, isDemo: true };
      this.setUpdate(update);
    }
    next();
  };

  schema.pre(
    ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
    applyWriteScope
  );

  schema.pre('save', function protectDocumentSave(next) {
    const scope = getDemoContext();
    if (!scope?.demoKey) return next();
    if (!this.isNew && this.demoKey !== scope.demoKey) {
      return next(new Error('Demo isolation: a demo account cannot modify a non-demo record.'));
    }
    this.demoKey = scope.demoKey;
    this.isDemo = true;
    next();
  });

  schema.pre('insertMany', function protectInsertMany(next, documents) {
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

  schema.pre('bulkWrite', function protectBulkWrite(next) {
    if (getDemoContext()?.demoKey) {
      return next(new Error('Demo isolation: bulk writes are disabled for demo accounts.'));
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

  const scope = { demoKey: actor.demoKey || DEMO_KEY, actorId: String(actor.id || actor._id || '') };
  req.demoMode = true;
  req.demoKey = scope.demoKey;
  res.locals.demoMode = true;
  res.set('X-RoleSphere-Demo-Mode', 'read-write-demo-scope');
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
