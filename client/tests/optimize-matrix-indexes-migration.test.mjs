import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
const targetMigrationName = '202610160001_optimize_matrix_indexes_and_rls_initplan.sql';

console.log('🧪 Testing Matrix Indexes & RLS InitPlan SQL Migration...');

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

// 2. Verify composite indexes
assert.match(
  sqlContent,
  /create\s+index\s+if\s+not\s+exists\s+idx_payments_ipl_bill_status\s+on\s+public\.payments\s*\(\s*ipl_bill_id\s*,\s*status\s*\)/i,
  'Must create composite index idx_payments_ipl_bill_status on payments(ipl_bill_id, status)'
);

assert.match(
  sqlContent,
  /create\s+index\s+if\s+not\s+exists\s+idx_ipl_bills_period_status\s+on\s+public\.ipl_bills\s*\(\s*period\s*,\s*status\s*\)/i,
  'Must create composite index idx_ipl_bills_period_status on ipl_bills(period, status)'
);

assert.match(
  sqlContent,
  /create\s+index\s+if\s+not\s+exists\s+idx_ipl_bills_unit_period\s+on\s+public\.ipl_bills\s*\(\s*unit_id\s*,\s*period\s*\)/i,
  'Must create composite index idx_ipl_bills_unit_period on ipl_bills(unit_id, period)'
);

// 3. Verify RLS InitPlan wrapping for is_staff and current_profile_id
assert.match(
  sqlContent,
  /drop\s+policy\s+if\s+exists\s+"bills_select_own_or_staff"\s+on\s+public\.ipl_bills/i,
  'Must drop previous bills_select_own_or_staff policy before re-creating'
);

assert.match(
  sqlContent,
  /\(select\s+public\.is_staff\(\)\)/i,
  'Must wrap public.is_staff() in a scalar subquery (select ...) for InitPlan optimization'
);

assert.match(
  sqlContent,
  /drop\s+policy\s+if\s+exists\s+"payments_select_own_or_staff"\s+on\s+public\.payments/i,
  'Must drop previous payments_select_own_or_staff policy before re-creating'
);

assert.match(
  sqlContent,
  /drop\s+policy\s+if\s+exists\s+"profiles_select_self_or_staff"\s+on\s+public\.profiles/i,
  'Must drop previous profiles_select_self_or_staff policy before re-creating'
);

// 4. Verify RPC execution grants
assert.match(
  sqlContent,
  /grant\s+execute\s+on\s+function\s+public\.get_annual_matrix_summary/i,
  'Must grant execute on get_annual_matrix_summary'
);

console.log('✅ All Matrix Indexes & RLS InitPlan migration tests passed successfully!');
