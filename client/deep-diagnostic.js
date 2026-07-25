/**
 * DEEP DIAGNOSTIC: Compare what /bills/matrix returns for Admin vs Warga
 * by calling the n8n endpoint with their respective JWT tokens.
 *
 * This script:
 * 1. Launches a real browser
 * 2. Navigates to the app
 * 3. Injects session for Warga user
 * 4. Calls /bills/matrix and /payments/list from browser context
 * 5. Dumps the raw cell.payment data for Unit 13, Sept 2026
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const N8N_URL = 'https://n8n-icyxwmjq.runner.web.id/webhook/portal-v1';

const ADMIN_PROFILE = {
  id: '938f5281-6df8-4dd6-89e7-56e4675a2932',
  email: 'dyudhiantoro@gmail.com',
  full_name: 'Dhani Yudhiantoro',
  role: 'admin',
  approval_status: 'approved',
  is_active: true
};

const WARGA_PROFILE = {
  id: '5a391470-76fc-4cfe-b362-3a81182333ee',
  email: 'denmas.dyudhiantoro@gmail.com',
  full_name: 'Denmas Dhani',
  role: 'warga',
  unit_id: 13,
  approval_status: 'approved',
  is_active: true
};

function makeMockToken(profile) {
  const payload = {
    sub: profile.id,
    email: profile.email,
    role: profile.role,
    unit_id: profile.unit_id || null,
    exp: Math.floor(Date.now() / 1000) + 3600 * 24,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `mock.${b64}.token`;
}

async function queryAsUser(profileName, profile) {
  const token = makeMockToken(profile);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing as: ${profileName} (${profile.email}, role=${profile.role})`);
  console.log(`   Token (first 40 chars): ${token.substring(0, 40)}...`);
  console.log(`${'='.repeat(70)}`);

  // Call /bills/matrix
  console.log(`\n📊 Calling POST ${N8N_URL}/bills/matrix ...`);
  try {
    const res = await fetch(`${N8N_URL}/bills/matrix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ year: 2026 }),
    });
    const text = await res.text();
    console.log(`   Status: ${res.status}`);

    if (res.ok) {
      try {
        const json = JSON.parse(text);
        const matrixData = json?.data?.matrix || json?.matrix || [];
        console.log(`   Matrix rows: ${matrixData.length}`);

        // Find Unit 13
        const unit13 = matrixData.find(r => r?.unit?.id === 13 || String(r?.unit?.id) === '13');
        if (unit13) {
          console.log(`   ✅ Found Unit 13: Blok ${unit13.unit?.block}/${unit13.unit?.unit_number}`);
          const cells = unit13.cells || [];
          // Find Sept 2026 cell
          const septCell = cells.find(c => c?.bill?.period === '2026-09');
          if (septCell) {
            console.log(`\n   📋 SEPTEMBER 2026 CELL DATA:`);
            console.log(`   cell.status: ${septCell.status}`);
            console.log(`   cell.bill.id: ${septCell.bill?.id}`);
            console.log(`   cell.bill.status: ${septCell.bill?.status}`);
            console.log(`   cell.bill.due_date: ${septCell.bill?.due_date}`);
            console.log(`   cell.bill.paid_at: ${septCell.bill?.paid_at}`);
            console.log(`\n   📋 PAYMENT OBJECT IN CELL:`);
            if (septCell.payment) {
              console.log(`   payment keys: ${Object.keys(septCell.payment).join(', ')}`);
              console.log(`   payment.id: ${septCell.payment.id}`);
              console.log(`   payment.status: ${septCell.payment.status}`);
              console.log(`   payment.paid_at: ${septCell.payment.paid_at}`);
              console.log(`   payment.created_at: ${septCell.payment.created_at}`);
              console.log(`   payment.method: ${septCell.payment.method}`);
              console.log(`   payment.proof_file_url: ${septCell.payment.proof_file_url}`);
              console.log(`   payment.proof_file_name: ${septCell.payment.proof_file_name}`);
              console.log(`   payment.receipt_file: ${septCell.payment.receipt_file}`);
              console.log(`   payment.receipt_file_url: ${septCell.payment.receipt_file_url}`);
              console.log(`   payment.proof_file_path: ${septCell.payment.proof_file_path}`);
              console.log(`   payment.metadata: ${JSON.stringify(septCell.payment.metadata)}`);
              console.log(`\n   📋 FULL PAYMENT JSON:`);
              console.log(JSON.stringify(septCell.payment, null, 2));
            } else {
              console.log(`   ❌ cell.payment is NULL/undefined`);
            }
            console.log(`\n   📋 FULL CELL JSON:`);
            console.log(JSON.stringify(septCell, null, 2).substring(0, 2000));
          } else {
            console.log(`   ❌ Sept 2026 cell NOT found. Available periods:`);
            cells.forEach(c => console.log(`      ${c?.bill?.period}: ${c?.status}`));
          }
        } else {
          console.log(`   ❌ Unit 13 NOT found in matrix. Available units:`);
          matrixData.slice(0, 5).forEach(r => console.log(`      Unit ${r?.unit?.id}: ${r?.unit?.block}/${r?.unit?.unit_number}`));
        }
      } catch (parseErr) {
        console.log(`   ❌ JSON parse error: ${parseErr.message}`);
        console.log(`   Raw (first 500): ${text.substring(0, 500)}`);
      }
    } else {
      console.log(`   ❌ Error response: ${text.substring(0, 300)}`);
    }
  } catch (err) {
    console.log(`   ❌ Fetch error: ${err.message}`);
  }

  // Call /payments/list
  console.log(`\n💳 Calling POST ${N8N_URL}/payments/list ...`);
  try {
    const res = await fetch(`${N8N_URL}/payments/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ scopeUnitId: 13, unit_id: 13 }),
    });
    const text = await res.text();
    console.log(`   Status: ${res.status}`);

    if (res.ok) {
      try {
        const json = JSON.parse(text);
        const payments = json?.data || json?.payments || (Array.isArray(json) ? json : []);
        console.log(`   Payments count: ${Array.isArray(payments) ? payments.length : 'N/A (type: ' + typeof payments + ')'}`);
        if (Array.isArray(payments) && payments.length > 0) {
          payments.forEach((p, i) => {
            console.log(`\n   Payment[${i}]:`);
            console.log(`     id: ${p.id}`);
            console.log(`     ipl_bill_id: ${p.ipl_bill_id}`);
            console.log(`     paid_at: ${p.paid_at}`);
            console.log(`     created_at: ${p.created_at}`);
            console.log(`     status: ${p.status}`);
            console.log(`     proof_file_url: ${p.proof_file_url}`);
            console.log(`     receipt_file: ${p.receipt_file}`);
            console.log(`     metadata: ${JSON.stringify(p.metadata)}`);
          });
        }
      } catch (parseErr) {
        console.log(`   ❌ JSON parse error. Raw (first 500): ${text.substring(0, 500)}`);
      }
    } else {
      console.log(`   ❌ Error response: ${text.substring(0, 300)}`);
    }
  } catch (err) {
    console.log(`   ❌ Fetch error: ${err.message}`);
  }
}

(async () => {
  console.log('🔬 DEEP DIAGNOSTIC: Comparing Admin vs Warga API responses\n');
  await queryAsUser('ADMIN', ADMIN_PROFILE);
  await queryAsUser('WARGA', WARGA_PROFILE);
  console.log('\n✅ Diagnostic complete.');
})();
