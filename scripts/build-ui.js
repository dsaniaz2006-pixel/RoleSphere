'use strict';
const esbuild = require('esbuild');
const path = require('node:path');

/** Build settings shared by CLI and tests; all @/ imports resolve inside frontend/src. */
function createBuildOptions() {
  return {
    entryPoints: {
      'dashboard-background': 'frontend/src/dashboard/background.tsx',
      'premium-ui': 'frontend/src/premium.tsx',
      'workbench-ui': 'frontend/src/workbench.tsx',
      'component-enhancements': 'frontend/src/component-enhancements.tsx'
    },
    outdir: 'frontend/public/js',
    bundle: true,
    alias: { '@': path.resolve(__dirname, '../frontend/src') },
    minify: true,
    jsx: 'automatic',
    platform: 'browser',
    target: ['es2020'],
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'eof'
  };
}

async function main(args = process.argv.slice(2)) {
  const options = createBuildOptions();
  if (args.includes('--watch')) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log('Watching dashboard React components');
  } else {
    await esbuild.build(options);
    console.log('Dashboard React bundle built');
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createBuildOptions, main };
