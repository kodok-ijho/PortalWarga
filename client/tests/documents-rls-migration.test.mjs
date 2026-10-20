import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
const targetMigrationName = '202610190001_documents_rls_and_storage_policies.sql';

console.log('🧪 Testing Documents RLS & Storage Policies SQL Migration...');

// 1. Verify file presence and naming convention
const files = await readdir(migrationsDir);
assert.ok(
  files.includes(targetMigrationName),
  `Migration file ${targetMigrationName} must exist in supabase/migrations`
);

assert.match(
  targetMigrationName,
  /^\d{12}_[a-z0-9_]+\.sql$/i,
  'Migration file must strictly follow 12-digit timestamp convention'
);

const sqlContent = await readFile(path.join(migrationsDir, targetMigrationName), 'utf8');

// 2. Verify RLS enabled on public.documents
assert.match(
  sqlContent,
  /alter\s+table\s+public\.documents\s+enable\s+row\s+level\s+security/i,
  'Must explicitly enable row level security on public.documents'
);

// 3. Verify SELECT policy permits staff and granular resident access
assert.match(
  sqlContent,
  /create\s+policy\s+"documents_select_policy"\s+on\s+public\.documents\s+for\s+select/i,
  'Must create documents_select_policy'
);

assert.match(
  sqlContent,
  /\(select\s+public\.is_staff\(\)\)/i,
  'Must check staff role using public.is_staff()'
);

assert.match(
  sqlContent,
  /is_viewable_by_warga\s*=\s*true/i,
  'Must permit residents to view documents where is_viewable_by_warga = true'
);

// 4. Verify INSERT policy permits staff for all and resident for resident category only
assert.match(
  sqlContent,
  /create\s+policy\s+"documents_insert_policy"\s+on\s+public\.documents\s+for\s+insert/i,
  'Must create documents_insert_policy'
);

assert.match(
  sqlContent,
  /category\s*=\s*'resident'/i,
  'Must enforce resident category for non-staff uploaders'
);

// 5. Verify UPDATE and DELETE policies
assert.match(
  sqlContent,
  /create\s+policy\s+"documents_update_policy"\s+on\s+public\.documents\s+for\s+update/i,
  'Must create documents_update_policy'
);

assert.match(
  sqlContent,
  /create\s+policy\s+"documents_delete_policy"\s+on\s+public\.documents\s+for\s+delete/i,
  'Must create documents_delete_policy'
);

// 6. Verify storage bucket definition & object policies
assert.match(
  sqlContent,
  /insert\s+into\s+storage\.buckets/i,
  'Must register documents storage bucket'
);

assert.match(
  sqlContent,
  /create\s+policy\s+"documents_storage_select"\s+on\s+storage\.objects/i,
  'Must configure documents storage select policy'
);

console.log('✅ All Documents RLS & Storage Policies migration tests passed successfully!');
