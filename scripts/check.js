const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const roots = ['api', 'tests'];
const files = ['stripe-submit-override.js', 'multi-property-extension.js', 'v2-booking-bridge.js'];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
  }
}

for (const root of roots) collect(path.join(process.cwd(), root));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log('Syntax checked ' + files.length + ' JavaScript files.');