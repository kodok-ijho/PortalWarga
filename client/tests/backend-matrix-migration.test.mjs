import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
const targetMigrationName = '202610150001_backend_matrix_and_idempotency.sql';

console.log('🧪 Testing Backend Matrix & Idempotency SQL Migration...');

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

// 2. Verify payment_webhook_events table definition & idempotency constraint
assert.match(
  sqlContent,
  /create\s+table\s+if\s+not\s+exists\s+public\.payment_webhook_events/i,
  'Must create public.payment_webhook_events table'
);

assert.match(
  sqlContent,
  /constraint\s+uq_payment_webhook_events_provider_event\s+unique\s*\(\s*provider\s*,\s*event_id\s*\)/i,
  'Must have unique constraint on (provider, event_id) for webhook idempotency'
);

assert.match(
  sqlContent,
  /alter\s+table\s+public\.payment_webhook_events\s+enable\s+row\s+level\s+security/i,
  'Must enable RLS on payment_webhook_events'
);

assert.match(
  sqlContent,
  /idx_payment_webhook_events_order_id/i,
  'Must create index on order_id'
);

assert.match(
  sqlContent,
  /idx_payment_webhook_events_status/i,
  'Must create index on status'
);

// 3. Verify pessimistic locking (SELECT ... FOR UPDATE) in payment verification
assert.match(
  sqlContent,
  /create\s+or\s+replace\s+function\s+public\.verify_payment_transaction/i,
  'Must create verify_payment_transaction function'
);

const forUpdateMatches = sqlContent.match(/for\s+update/gi) || [];
assert.ok(
  forUpdateMatches.length >= 4,
  `Expected at least 4 pessimistic locks (FOR UPDATE), found: ${forUpdateMatches.length}`
);

// Verify lock on payments and ipl_bills inside verify_payment_transaction
assert.match(
  sqlContent,
  /select\s+\*\s+into\s+target_payment\s+from\s+public\.payments\s+where\s+id\s*=\s*p_payment_id\s+for\s+update/i,
  'Must lock payment row FOR UPDATE in verify_payment_transaction'
);

assert.match(
  sqlContent,
  /select\s+\*\s+into\s+target_bill\s+from\s+public\.ipl_bills\s+where\s+id\s*=\s*target_payment\.ipl_bill_id\s+for\s+update/i,
  'Must lock ipl_bills row FOR UPDATE in verify_payment_transaction'
);

// 4. Verify idempotent webhook processing function
assert.match(
  sqlContent,
  /create\s+or\s+replace\s+function\s+public\.process_payment_webhook_with_lock/i,
  'Must create process_payment_webhook_with_lock function'
);

// 5. Verify PostgreSQL RPC get_annual_matrix_summary
assert.match(
  sqlContent,
  /create\s+or\s+replace\s+function\s+public\.get_annual_matrix_summary\s*\(\s*p_year\s+int/i,
  'Must create get_annual_matrix_summary(p_year int) RPC function'
);

assert.match(
  sqlContent,
  /returns\s+jsonb/i,
  'get_annual_matrix_summary must return jsonb for client efficiency'
);

// Check fiscal year periods: July to June
assert.match(
  sqlContent,
  /p_year::text\s*\|\|\s*'-07'/i,
  'Must include July of p_year as start of fiscal period'
);

assert.match(
  sqlContent,
  /\(p_year\s*\+\s*1\)::text\s*\|\|\s*'-06'/i,
  'Must include June of p_year+1 as end of fiscal period'
);

// Check aggregation metrics
assert.match(sqlContent, /total_billed/i, 'Must compute total_billed');
assert.match(sqlContent, /total_paid/i, 'Must compute total_paid');
assert.match(sqlContent, /total_pending/i, 'Must compute total_pending');
assert.match(sqlContent, /total_overdue/i, 'Must compute total_overdue');
assert.match(sqlContent, /paid_count/i, 'Must compute paid_count');

// Check security definer and search_path
assert.match(sqlContent, /security\s+definer/i, 'Functions must be security definer');
assert.match(sqlContent, /set\s+search_path\s*=\s*public/i, 'Functions must specify set search_path = public');

// 6. Check execution grants
assert.match(
  sqlContent,
  /grant\s+execute\s+on\s+function\s+public\.get_annual_matrix_summary/i,
  'Must grant execute on get_annual_matrix_summary'
);

console.log('✅ All Backend Matrix & Idempotency migration tests passed successfully!');
