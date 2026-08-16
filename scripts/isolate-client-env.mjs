import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'client', '.env');
const quarantineDir = path.join(root, '.secrets-quarantine');
const backup = path.join(quarantineDir, 'client-dot-env.original');
const serverTarget = path.join(root, '.env.server.local');

const input = await readFile(source, 'utf8');
await mkdir(quarantineDir, { recursive: true });
await copyFile(source, backup);

const browserLines = [];
const serverLines = [];
for (const line of input.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
  if (!match || match[1].startsWith('VITE_')) browserLines.push(line);
  else serverLines.push(line);
}

let serverExisting = false;
try {
  await readFile(serverTarget, 'utf8');
  serverExisting = true;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (serverExisting) throw new Error(`${serverTarget} already exists; refusing to overwrite.`);

const browserTemp = `${source}.uat-safe.tmp`;
const serverTemp = `${serverTarget}.tmp`;
await writeFile(browserTemp, `${browserLines.join('\n').trim()}\n`, { encoding: 'utf8', flag: 'wx' });
await writeFile(serverTemp, `${serverLines.join('\n').trim()}\n`, { encoding: 'utf8', flag: 'wx' });
await rename(browserTemp, source);
await rename(serverTemp, serverTarget);

const movedKeys = serverLines
  .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1])
  .filter(Boolean);
console.log(`Moved ${movedKeys.length} server-only environment entries to an ignored root file.`);
console.log(`Keys moved (names only): ${movedKeys.join(', ')}`);
console.log(`Original retained in ignored quarantine: ${path.relative(root, backup).replaceAll('\\', '/')}`);
