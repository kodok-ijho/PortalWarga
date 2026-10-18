import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dns from 'node:dns/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Default target migration
const defaultMigrationFile = 'supabase/migrations/202610160001_optimize_matrix_indexes_and_rls_initplan.sql';
const targetMigrationPath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : defaultMigrationFile;

const isDryRun = process.argv.includes('--dry-run');
const isConfirmed = process.argv.includes('--execute') || process.argv.includes('--confirm');

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function resolveCredentials() {
  const envSearchPaths = [
    path.join(rootDir, '.env.local'),
    path.join(rootDir, '.env'),
    path.join(rootDir, 'client', '.env'),
    path.join(rootDir, 'client', '.env.local'),
  ];

  const mergedEnv = { ...process.env };
  const envSources = {};

  for (const p of envSearchPaths) {
    if (fs.existsSync(p)) {
      const relPath = path.relative(rootDir, p);
      const parsed = parseEnvFile(p);
      for (const [k, v] of Object.entries(parsed)) {
        if (!mergedEnv[k] || mergedEnv[k] === process.env[k]) {
          mergedEnv[k] = v;
          envSources[k] = relPath;
        }
      }
    }
  }

  // Extract project ref if available
  let projectRef = mergedEnv.SUPABASE_PROJECT_REF || (process.argv.find((a, i) => process.argv[i - 1] === '--project-ref') || null);
  if (!projectRef && (mergedEnv.VITE_SUPABASE_URL || mergedEnv.SUPABASE_URL)) {
    try {
      const u = new URL(mergedEnv.VITE_SUPABASE_URL || mergedEnv.SUPABASE_URL);
      const hostParts = u.hostname.split('.');
      if (hostParts.length >= 3 && hostParts[1] === 'supabase') {
        projectRef = hostParts[0];
      }
    } catch {}
  }
  if (!projectRef) {
    projectRef = 'mzjgliclzihrdjaqzmqg';
  }

  // Collect candidate connection strings
  const candidateConnections = [];

  // Priority 1: Explicit DATABASE_URL / SUPABASE_DB_URL
  if (mergedEnv.DATABASE_URL) {
    candidateConnections.push({ url: mergedEnv.DATABASE_URL, label: `DATABASE_URL (${envSources.DATABASE_URL || 'env'})` });

    // Auto-derive IPv4 pooler candidate if direct supabase host is used
    try {
      const u = new URL(mergedEnv.DATABASE_URL);
      if (u.hostname.endsWith('supabase.co')) {
        const region = projectRef === 'mzjgliclzihrdjaqzmqg' ? 'ap-southeast-2' : 'ap-southeast-1';
        const user = u.username || 'postgres';
        const pass = u.password;
        const poolerUser = user.includes('.') ? user : `${user}.${projectRef}`;
        candidateConnections.push({
          url: `postgresql://${poolerUser}:${pass}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
          label: `Auto-derived IPv4 Pooler (${region}:6543) dari DATABASE_URL`,
        });
      }
    } catch {}
  }

  if (mergedEnv.SUPABASE_DB_URL) {
    candidateConnections.push({ url: mergedEnv.SUPABASE_DB_URL, label: `SUPABASE_DB_URL (${envSources.SUPABASE_DB_URL || 'env'})` });
  }

  // Priority 2: Inferred pooler for projectRef (e.g. mzjgliclzihrdjaqzmqg in ap-southeast-2)
  const dbPassword = mergedEnv.SUPABASE_DB_PASSWORD || mergedEnv.DB_PASSWORD || mergedEnv.POSTGRES_PASSWORD;
  if (dbPassword && projectRef) {
    const region = projectRef === 'mzjgliclzihrdjaqzmqg' ? 'ap-southeast-2' : 'ap-southeast-1';
    candidateConnections.push({
      url: `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
      label: `Inferred Pooler (${region}:6543)`,
    });
    candidateConnections.push({
      url: `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
      label: `Inferred Pooler (${region}:5432)`,
    });
  }

  // Priority 3: SUPABASE_UAT_DB_URL_V3 / SUPABASE_UAT_DB_URL (only if targeting that project)
  if (projectRef === 'vfhaiusgtyufvnzuoduq') {
    if (mergedEnv.SUPABASE_UAT_DB_URL_V3) {
      let poolerUrl = mergedEnv.SUPABASE_UAT_DB_URL_V3;
      if (poolerUrl.includes('[YOUR-PASSWORD]') && mergedEnv.SUPABASE_UAT_DB_URL) {
        try {
          const u = new URL(mergedEnv.SUPABASE_UAT_DB_URL);
          if (u.password) {
            poolerUrl = poolerUrl.replace('[YOUR-PASSWORD]', encodeURIComponent(u.password));
          }
        } catch {}
      }
      if (!poolerUrl.includes('[YOUR-PASSWORD]')) {
        candidateConnections.push({ url: poolerUrl, label: `SUPABASE_UAT_DB_URL_V3 (${envSources.SUPABASE_UAT_DB_URL_V3 || 'env'})` });
      }
    }

    if (mergedEnv.SUPABASE_UAT_DB_URL) {
      candidateConnections.push({ url: mergedEnv.SUPABASE_UAT_DB_URL, label: `SUPABASE_UAT_DB_URL (${envSources.SUPABASE_UAT_DB_URL || 'env'})` });
    }
  }

  // Access token (for Supabase Management API)
  let accessToken = mergedEnv.SUPABASE_ACCESS_TOKEN;
  let tokenSource = envSources.SUPABASE_ACCESS_TOKEN || (accessToken ? 'environment' : null);

  return {
    candidateConnections,
    accessToken,
    tokenSource,
    projectRef,
  };
}

async function runSqlQueryViaHttp(sql, projectRef, accessToken) {
  const queryBody = JSON.stringify({ query: sql });
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(queryBody),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.write(queryBody);
    req.end();
  });
}

async function runSqlQueryViaPostgres(sql, connectionString) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  try {
    const result = await client.query(sql);
    return { ok: true, result };
  } finally {
    await client.end();
  }
}

async function diagnoseEndpoint(host) {
  try {
    const res = await dns.lookup(host);
    return `DNS OK (${res.address})`;
  } catch (err) {
    return `DNS FAIL (${err.code})`;
  }
}

async function main() {
  console.log('====================================================');
  console.log('🛡️  Portal Warga - Supabase Migration Runner');
  console.log('====================================================');
  console.log(`Migration script   : ${targetMigrationPath}`);
  console.log(`Dry run mode       : ${isDryRun ? 'YES (Simulasi)' : 'NO'}`);
  console.log(`Confirmed execution: ${isConfirmed ? 'YES' : 'NO'}`);
  console.log('----------------------------------------------------');

  const fullMigrationPath = path.resolve(rootDir, targetMigrationPath);
  if (!fs.existsSync(fullMigrationPath)) {
    throw new Error(`File migrasi tidak ditemukan: ${fullMigrationPath}`);
  }

  const migrationSql = fs.readFileSync(fullMigrationPath, 'utf8');
  console.log(`✅ File migrasi terbaca (${Buffer.byteLength(migrationSql)} bytes).`);

  const creds = resolveCredentials();
  console.log(`Project reference  : ${creds.projectRef}`);

  let pgConnectionSuccess = false;
  let activeDbUrl = null;
  const failureLogs = [];

  for (const cand of creds.candidateConnections) {
    console.log(`\n🔍 Menguji koneksi database (${cand.label})...`);
    const decodedUrl = decodeURIComponent(cand.url);
    if (decodedUrl.includes('[YOUR-PASSWORD]') || cand.url.includes('%5BYOUR-PASSWORD%5D')) {
      console.log('⚠️  Placeholder [YOUR-PASSWORD] terdeteksi. Silakan ganti dengan password database akun Supabase Anda.');
      failureLogs.push({ label: cand.label, error: 'Password masih berupa teks placeholder [YOUR-PASSWORD]' });
      continue;
    }

    try {
      const pingRes = await runSqlQueryViaPostgres('SELECT current_database(), current_user, version();', cand.url);
      console.log('✅ Koneksi Postgres BERHASIL:', pingRes.result.rows?.[0]);
      pgConnectionSuccess = true;
      activeDbUrl = cand.url;
      break;
    } catch (err) {
      console.log(`❌ Gagal koneksi via ${cand.label}:`, err.message);
      failureLogs.push({ label: cand.label, error: err.message });
    }
  }

  if (pgConnectionSuccess && activeDbUrl) {
    if (isDryRun || !isConfirmed) {
      console.log('\n🔒 SAFETY GATE: Koneksi terverifikasi. Untuk mengeksekusi migrasi live:');
      console.log(`node scripts/run-supabase-migration.mjs ${targetMigrationPath} --execute`);
      return;
    }

    console.log('\n🚀 Menjalankan migrasi SQL live via PostgreSQL Connection...');
    await runSqlQueryViaPostgres(migrationSql, activeDbUrl);
    console.log('✅ Migrasi SQL berhasil diterapkan!');

    console.log('\n🔄 Meminta PostgREST me-reload schema cache...');
    await runSqlQueryViaPostgres("NOTIFY pgrst, 'reload schema';", activeDbUrl);
    console.log('✅ PostgREST schema cache reloaded!');
    console.log('\n🎉 Selesai 100% secara aman!');
    return;
  }

  // Fallback to Supabase Management API if access token exists
  if (creds.accessToken) {
    console.log(`\n🔑 Kredensial HTTP API ditemukan via: ${creds.tokenSource}`);
    if (isDryRun || !isConfirmed) {
      console.log('\n🔒 SAFETY GATE: Menjalankan mode verifikasi koneksi HTTP API...');
      const testRes = await runSqlQueryViaHttp('SELECT current_database(), current_user, version();', creds.projectRef, creds.accessToken);
      console.log('Koneksi ke Supabase API:', (testRes.status >= 200 && testRes.status < 300) ? 'BERHASIL ✅' : 'GAGAL ❌', testRes.data);
      console.log('\nUntuk mengeksekusi migrasi ke database secara live:');
      console.log(`node scripts/run-supabase-migration.mjs ${targetMigrationPath} --execute`);
      return;
    }

    console.log('\n🚀 Menjalankan migrasi SQL live ke Supabase API...');
    const execRes = await runSqlQueryViaHttp(migrationSql, creds.projectRef, creds.accessToken);
    console.log('Status eksekusi migrasi:', execRes.status);
    console.log('Output eksekusi:', execRes.data);

    if (execRes.status >= 200 && execRes.status < 300) {
      console.log('\n🔄 Meminta PostgREST me-reload schema cache...');
      const reloadRes = await runSqlQueryViaHttp("NOTIFY pgrst, 'reload schema';", creds.projectRef, creds.accessToken);
      console.log('PostgREST schema cache reload status:', reloadRes.status);
      console.log('\n✅ Migrasi berhasil diterapkan secara aman!');
      return;
    } else {
      console.error('\n❌ Migrasi gagal dieksekusi via API:', execRes.data);
      process.exit(1);
    }
  }

  // Diagnostic status check
  console.log('\n====================================================');
  console.log('📊 STATUS DIAGNOSTIK KONEKSI');
  console.log('====================================================');
  const uatDns = await diagnoseEndpoint('db.vfhaiusgtyufvnzuoduq.supabase.co');
  const prodDns = await diagnoseEndpoint('db.mzjgliclzihrdjaqzmqg.supabase.co');
  console.log(`• UAT Project (vfhaiusgtyufvnzuoduq)  : ${uatDns}`);
  console.log(`• Prod Project (mzjgliclzihrdjaqzmqg) : ${prodDns}`);

  if (failureLogs.length > 0) {
    console.log('\nDetail kegagalan percobaan:');
    failureLogs.forEach((f) => console.log(`  - [${f.label}]: ${f.error}`));
  }

  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
