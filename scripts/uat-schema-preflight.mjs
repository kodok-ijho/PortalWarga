import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const uatOverlay = path.join(root, 'supabase', 'uat', '202608110001_uat_safety_overlay.sql');
const uatRunContract = path.join(root, 'supabase', 'uat', '202608110002_uat_run_contract.sql');
const allowedTopLevelInsertTargets = new Set([
  'public.ipl_settings',
  'public.forum_categories',
  'storage.buckets',
]);
const allowedEmails = new Set(['denmas.dyudhiantoro@gmail.com']);
const findings = [];

function findTopLevelStatements(text, file) {
  let dollarTag = '';
  text.split(/\r?\n/).forEach((line, index) => {
    if (dollarTag) {
      if (line.includes(dollarTag)) dollarTag = '';
      return;
    }

    const openingTag = line.match(/\bas\s+(\$[A-Za-z0-9_]*\$)/i)?.[1];
    if (openingTag) {
      dollarTag = openingTag;
      return;
    }

    const statement = line.trim();
    if (/^(?:copy|truncate|delete\s+from|drop\s+(?:table|schema|type))\b/i.test(statement)) {
      findings.push(`${file}:${index + 1}: forbidden top-level statement`);
    }

    const insertTarget = statement.match(/^insert\s+into\s+([A-Za-z0-9_."]+)/i)?.[1]
      ?.replaceAll('"', '')
      .toLowerCase();
    if (insertTarget && !allowedTopLevelInsertTargets.has(insertTarget)) {
      findings.push(`${file}:${index + 1}: top-level insert target ${insertTarget} is not allowlisted`);
    }
  });
}

const names = (await readdir(migrationDir))
  .filter((name) => /^\d{12}_[a-z0-9_]+\.sql$/i.test(name))
  .sort();

if (!names.length) findings.push('No ordered migration files found.');
if (names[0] !== '202607080001_initial_production_schema.sql') {
  findings.push('Initial production migration is missing or not first.');
}

const manifestHash = createHash('sha256');
let createTableCount = 0;
let storageBucketConfigCount = 0;

for (const name of names) {
  const text = await readFile(path.join(migrationDir, name), 'utf8');
  manifestHash.update(name).update('\0').update(text).update('\0');
  createTableCount += (text.match(/^\s*create\s+table/gim) || []).length;
  storageBucketConfigCount += (text.match(/insert\s+into\s+storage\.buckets/gi) || []).length;

  findTopLevelStatements(text, name);

  if (/^\s*copy\s/gim.test(text)) findings.push(`${name}: COPY is forbidden.`);
  if (/insert\s+into\s+auth\.users/i.test(text)) findings.push(`${name}: auth.users seed is forbidden.`);
  if (/insert\s+into\s+storage\.objects/i.test(text)) findings.push(`${name}: storage object seed is forbidden.`);
  if (/https:\/\/[a-z0-9]+\.supabase\.co/i.test(text)) findings.push(`${name}: hardcoded Supabase project URL.`);
  if (/sb_secret_[A-Za-z0-9_-]+/i.test(text)) findings.push(`${name}: secret API key marker.`);

  for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
    if (!allowedEmails.has(email.toLowerCase())) findings.push(`${name}: unexpected email address.`);
  }
}

const initial = await readFile(
  path.join(migrationDir, '202607080001_initial_production_schema.sql'),
  'utf8'
);
if (!/insert\s+into\s+storage\.buckets[\s\S]{0,600}false/i.test(initial)) {
  findings.push('Initial payment-proofs bucket is not explicitly private.');
}
if (!/payment\.midtrans_environment[\s\S]{0,120}sandbox/i.test(initial)) {
  findings.push('Initial Midtrans environment is not sandbox.');
}

const overlay = await readFile(uatOverlay, 'utf8').catch(() => '');
if (!/UAT ONLY - DO NOT APPLY TO PRODUCTION/i.test(overlay)) {
  findings.push('UAT safety overlay warning is missing.');
}
if (
  !/monitoring\.payment_smoke_config/i.test(overlay)
  || !/jsonb_set\([\s\S]*?'\{enabled\}'[\s\S]*?'false'::jsonb/i.test(overlay)
) {
  findings.push('UAT safety overlay does not disable payment smoke monitoring.');
}

const runContract = await readFile(uatRunContract, 'utf8').catch(() => '');
for (const requiredPattern of [
  /UAT ONLY - DO NOT APPLY TO PRODUCTION/i,
  /create table if not exists public\.uat_runs/i,
  /create or replace function public\.assert_uat_environment/i,
  /create or replace function public\.create_uat_run/i,
  /create or replace function public\.inventory_uat_run/i,
  /create or replace function public\.cleanup_uat_run/i,
  /Delete UAT storage objects through the Storage API/i,
  /Delete UAT auth identities through the Auth Admin API/i,
  /revoke all on function public\.cleanup_uat_run\(uuid, text\) from public, anon, authenticated/i,
  /grant execute on function public\.cleanup_uat_run\(uuid, text\) to service_role/i,
]) {
  if (!requiredPattern.test(runContract)) {
    findings.push(`UAT run contract is missing required guard: ${requiredPattern}`);
  }
}
if (/grant\s+execute[\s\S]{0,120}\b(?:anon|authenticated)\b/i.test(runContract)) {
  findings.push('UAT run contract exposes a helper function to a browser role.');
}

if (findings.length) {
  console.error('UAT schema preflight failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log([
  'UAT schema preflight passed',
  `migrations=${names.length}`,
  `tables=${createTableCount}`,
  `bucket-configs=${storageBucketConfigCount}`,
  `manifest-sha256=${manifestHash.digest('hex')}`,
  'production-rows=none',
  'uat-overlay=separate',
  'uat-run-contract=server-only',
].join(' | '));
