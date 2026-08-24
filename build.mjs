const { mkdir, writeFile } = require('node:fs/promises');
await mkdir('public', { recursive: true });
await writeFile('public/.keep', 'Clean V3 booking application; root is served by api/mobile-index.js.\n');
