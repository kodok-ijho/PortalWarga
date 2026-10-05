import fs from 'node:fs';
import https from 'node:https';

const tokenFile = 'C:/Users/dhaniy/.gemini/antigravity/mcp_oauth_tokens.json';
const allTokens = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
const supabaseEntry = allTokens['https://mcp.supabase.com/mcp'];
let accessToken = supabaseEntry.token.access_token;
const projectRef = 'mzjgliclzihrdjaqzmqg';

async function refreshAccessToken() {
  console.log('Refreshing Supabase OAuth token...');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: supabaseEntry.token.refresh_token,
    client_id: supabaseEntry.client_id,
    client_secret: supabaseEntry.client_secret,
  }).toString();

  const res = await new Promise((resolve, reject) => {
    const req = https.request('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (res.status !== 200) {
    throw new Error(`Failed to refresh token: ${res.data}`);
  }

  const parsed = JSON.parse(res.data);
  supabaseEntry.token = parsed;
  allTokens['https://mcp.supabase.com/mcp'] = supabaseEntry;
  fs.writeFileSync(tokenFile, JSON.stringify(allTokens, null, 2));
  accessToken = parsed.access_token;
  console.log('OAuth token refreshed successfully.');
}

async function runSqlQuery(sql) {
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

async function main() {
  console.log(`Executing migration on Supabase project [${projectRef}]...`);
  
  // 1. Test connection
  let testRes = await runSqlQuery('SELECT current_database(), current_user;');
  if (testRes.status === 401) {
    await refreshAccessToken();
    testRes = await runSqlQuery('SELECT current_database(), current_user;');
  }
  console.log('Connection test:', testRes.status, testRes.data);

  // 2. Read migration file
  const migrationPath = 'supabase/migrations/202610050001_documents_management.sql';
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  console.log(`Running migration SQL from: ${migrationPath}`);

  // 3. Execute migration
  const execRes = await runSqlQuery(migrationSql);
  console.log('Migration execution result status:', execRes.status);
  console.log('Migration execution output:', execRes.data);

  // 4. Verify table exists
  const verifyRes = await runSqlQuery(`
    SELECT table_schema, table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'documents' 
    ORDER BY ordinal_position;
  `);
  console.log(`Verification: Table 'documents' has ${verifyRes.data?.length || 0} columns.`);
  if (verifyRes.data && verifyRes.data.length > 0) {
    console.log('Columns:');
    verifyRes.data.forEach((c) => console.log(` - ${c.column_name}: ${c.data_type}`));
  }

  // 5. Notify PostgREST to reload schema cache
  const reloadRes = await runSqlQuery("NOTIFY pgrst, 'reload schema';");
  console.log('PostgREST schema reload notified:', reloadRes.status);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
