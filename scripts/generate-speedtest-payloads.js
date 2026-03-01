/**
 * Generates binary payload files for the speed test in public/speedtest/
 * Run: node scripts/generate-speedtest-payloads.js
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'speedtest');

mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: '1mb.bin', bytes: 1 * 1024 * 1024 },
  { name: '5mb.bin', bytes: 5 * 1024 * 1024 },
];

for (const { name, bytes } of sizes) {
  const buf = Buffer.alloc(bytes);
  writeFileSync(join(outDir, name), buf);
  console.log('Created', name, `(${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}
