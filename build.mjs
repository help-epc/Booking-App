import { copyFile, mkdir, writeFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await writeFile('public/.keep', 'Clean V3 booking application; root is served by api/mobile-index.js.\n');
await copyFile('index.html','public/index.html');
await copyFile('v3-experience.js','public/v3-experience.js');
await copyFile('multi-property-extension.js','public/multi-property-extension.js');
