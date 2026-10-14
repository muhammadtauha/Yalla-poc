'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const mods = { './engine': 'src/core/engine.js', './seed': 'src/core/seed.js', './service': 'src/core/service.js' };
const bundle =
  'const __defs = {}; const __cache = {};\n' +
  'const __require = (n) => { n = n.replace(/^\\.\\/core\\//, "./"); if (!__cache[n]) { const m = { exports: {} }; __defs[n](m, m.exports, __require); __cache[n] = m.exports; } return __cache[n]; };\n' +
  Object.entries(mods)
    .map(([n, f]) => `__defs[${JSON.stringify(n)}] = function (module, exports, require) {\n${read(f)}\n};`)
    .join('\n') +
  '\n';

let html = read('public/index.html');
html = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('public/styles.css')}\n</style>`)
  .replace('<script src="api-http.js"></script>', `<script>\n${bundle}\n${read('public/api-local.js')}\n</script>`)
  .replace('<script src="app.js"></script>', `<script>\n${read('public/app.js')}\n</script>`)
  .replace('Feed lab</span>', 'Feed lab · standalone demo</span>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/yalla-demo.html'), html);
console.log('Wrote dist/yalla-demo.html (' + Math.round(html.length / 1024) + ' KB)');
