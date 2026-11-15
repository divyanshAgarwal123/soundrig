import fs from 'node:fs';
import {bundleModule} from './bundle.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks);
if (input.length > 65536) throw Error('Rig too large');
const rig = JSON.parse(input.toString('utf8'));
const source = Object.fromEntries(['core', 'processor', 'player', 'samples'].map(n => [n,
  fs.readFileSync(new URL(n === 'processor' ? 'worklet.mjs' : n + '.mjs', import.meta.url), 'utf8')]));
process.stdout.write(bundleModule(source, rig));
