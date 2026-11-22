const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function options(query, allowed = ['name', 'email', 'createdAt', 'status'], fallback = 'name') {
  const page = Math.max(1, Math.min(100000, parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(50, parseInt(query.limit, 10) || 20));
  const raw = typeof query.sort === 'string' ? query.sort : fallback;
  const field = raw.replace(/^-/, '');
  const sort = { [allowed.includes(field) ? field : fallback]: raw.startsWith('-') ? -1 : 1, _id: 1 };
  return { page, limit, skip: (page - 1) * limit, sort, q: String(query.q || '').trim().slice(0, 80) };
}
async function list(Model, filter, query, select, allowed, fallback) {
  const opt = options(query, allowed, fallback);
  const [data, total] = await Promise.all([
    Model.find(filter).select(select).sort(opt.sort).skip(opt.skip).limit(opt.limit).lean(),
    Model.countDocuments(filter)
  ]);
  return { data, total, page: opt.page, limit: opt.limit };
}
module.exports = { escapeRegex, options, list };
