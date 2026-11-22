const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'frontend', 'public', 'vendor');
fs.mkdirSync(root, { recursive: true });
for (const [source, target] of [['dompurify/dist/purify.min.js', 'purify.min.js'], ['sortablejs/Sortable.min.js', 'sortable.min.js']]) fs.copyFileSync(require.resolve(source), path.join(root, target));
