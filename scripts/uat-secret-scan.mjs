import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const scanRoots = ['api', 'client', 'scripts'];
const ignoredDirectories = new Set(['node_modules', '.git', '.secrets-quarantine', 'coverage']);
const findings = [];
const intentionalGuardFiles = new Set([
  'client/uatProxyConfig.js',
  'client/tests/uat-proxy-config.test.mjs',
  'scripts/uat-secret-scan.mjs',
]);
const protectedCredentialFiles = new Set(['client/uat.env']);

const rules = [
  {
    id: 'PRIVILEGED_VITE_ASSIGNMENT',
    test: (text) => /(?:^|[\r\n])\s*VITE_[A-Z0-9_]*(?:SERVICE_ROLE|JWT_SECRET|LEGACY_JWT|PASSWORD|PRIVATE_KEY|UAT_KEY|BASIC_AUTH|SECRET)\s*=/im.test(text),
  },
  {
    id: 'SUPABASE_SECRET_TOKEN',
    test: (text) => /sb_secret_[A-Za-z0-9_-]{12,}/.test(text),
  },
  {
    id: 'PRIVATE_KEY_BLOCK',
    test: (text) => /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),
  },
];

async function visit(target) {
  const info = await stat(target);
  if (info.isDirectory()) {
    if (ignoredDirectories.has(path.basename(target))) return;
    for (const entry of await readdir(target)) {
      await visit(path.join(target, entry));
    }
    return;
  }

  const relative = path.relative(root, target).replaceAll('\\', '/');
  if (protectedCredentialFiles.has(relative)) {
    const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8').catch(() => '');
    let ignored = false;
    for (const rawLine of gitignore.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === relative) ignored = true;
      if (line === `!${relative}`) ignored = false;
    }
    if (!ignored) findings.push({ file: relative, rule: 'PROTECTED_ENV_NOT_IGNORED' });
    return;
  }
  if (relative === 'client/src/staging.env' || relative.startsWith('client/src/staging.env.')) {
    findings.push({ file: relative, rule: 'FORBIDDEN_CLIENT_STAGING_ENV' });
  }
  if (/\.(?:png|jpe?g|gif|ico|woff2?|pdf|zip)$/i.test(relative)) return;

  const text = await readFile(target, 'utf8').catch(() => '');
  for (const rule of rules) {
    if (rule.clientOnly && !relative.startsWith('client/')) continue;
    if (intentionalGuardFiles.has(relative) && rule.id === 'PRIVILEGED_VITE_ASSIGNMENT') continue;
    if (rule.test(text)) findings.push({ file: relative, rule: rule.id });
  }

  if (/^client\/\.env(?:\.|$)/i.test(relative) && !/\.example$/i.test(relative)) {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (!match) continue;
      const key = match[1];
      if (/^VITE_.*(?:SERVICE_ROLE|JWT_SECRET|LEGACY_JWT|PASSWORD|PRIVATE_KEY|UAT_KEY|BASIC_AUTH|SECRET)/i.test(key)) {
        findings.push({ file: relative, rule: 'PRIVILEGED_VITE_ASSIGNMENT' });
      }
      if (/^(?:N8N_BASIC_AUTH_|N8N_UAT_KEY|SUPABASE_SERVICE_ROLE|SUPABASE_LEGACY_JWT_SECRET|MIDTRANS_SERVER_KEY)/i.test(key)) {
        findings.push({ file: relative, rule: 'SERVER_SECRET_IN_CLIENT_ENV' });
      }
    }
  }

  if (relative.startsWith('client/') || relative.startsWith('client/dist/')) {
    const jwtMatches = text.matchAll(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}/g);
    for (const match of jwtMatches) {
      let role = '';
      try {
        const payload = match[0].split('.')[1].replaceAll('-', '+').replaceAll('_', '/').padEnd(4 * Math.ceil(match[0].split('.')[1].length / 4), '=');
        role = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role || '';
      } catch {
        role = 'invalid';
      }
      if (role !== 'anon') findings.push({ file: relative, rule: `NON_ANON_JWT_ROLE:${role || 'missing'}` });
    }
  }
}

for (const scanRoot of scanRoots) {
  await visit(path.join(root, scanRoot)).catch((error) => {
    findings.push({ file: scanRoot, rule: `SCAN_ERROR:${error.code || error.message}` });
  });
}

const unique = [...new Map(findings.map((item) => [`${item.file}:${item.rule}`, item])).values()];
if (unique.length) {
  console.error('UAT secret scan failed. Matched values are intentionally redacted.');
  for (const finding of unique) console.error(`- ${finding.file}: ${finding.rule}`);
  process.exit(1);
}

console.log('UAT secret scan passed (no privileged client-side secret patterns found).');
