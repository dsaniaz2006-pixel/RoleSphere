const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');
let checks = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (['node_modules','.git','uploads'].includes(entry.name)) continue;
    const file = path.join(dir,entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (file.endsWith('.js')) { new vm.Script(fs.readFileSync(file,'utf8'), { filename:file }); checks++; }
    if (file.endsWith('.ejs')) { ejs.compile(fs.readFileSync(file,'utf8'), { filename:file }); checks++; }
  }
}
walk(path.join(__dirname,'..')); console.log(`Syntax and EJS compilation: ${checks} files passed`);
