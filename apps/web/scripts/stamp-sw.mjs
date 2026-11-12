// After `next build`: write the build id into out/sw.js so each release installs a new service worker.
import { readFileSync, writeFileSync } from 'node:fs';

const buildId = readFileSync(new URL('../.next/BUILD_ID', import.meta.url), 'utf8').trim();
const file = new URL('../out/sw.js', import.meta.url);
const sw = readFileSync(file, 'utf8');
if (!sw.includes('__BUILD_ID__')) throw new Error('sw.js has no __BUILD_ID__ placeholder');
writeFileSync(file, sw.replaceAll('__BUILD_ID__', buildId));
console.log(`sw.js stamped with build ${buildId}`);
