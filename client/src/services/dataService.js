/**
 * dataService.js
 *
 * Unified data access layer that routes to mock data (demo) or real API
 * (production) based on the VITE_DEMO_MODE environment variable.
 *
 * Components import from this file instead of directly from mockData.js
 * or apiClient.js. This avoids scattering IS_DEMO_MODE checks across
 * every page component.
 *
 * Pattern:
 *   export async function fetchSomething(token, params) {
 *     if (IS_DEMO) return demoImpl(params);
 *     return apiImpl(token, params);
 *   }
 *
 * Each function returns a consistent shape regardless of mode.
 */

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ── Lazy mock imports ────────────────────────────────────────────
// Only loaded when IS_DEMO is true, keeping production bundles lean.
async function getMockData() {
  return import('./mockData.js');
}

// ── API imports ──────────────────────────────────────────────────
import { portalApiPost } from './apiClient';

// =====================================================================
// USER APPROVAL
// =====================================================================

export async function fetchPendingUsers(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const users = mock.getPendingRegistrations();
    return { users, count: users.length };
  }
  const data = await portalApiPost('/users/pending', { token });
  return {
    users: (data?.users || []).map((u) => ({ ...u, registered_at: u.created_at })),
    count: Number(data?.count || 0),
  };
}

export async function approveUser(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    mock.approveRegistration(payload.profile_id, {
      full_name: payload.full_name,
      phone: payload.phone,
      unit_id: payload.unit_id,
      occupancy_status: payload.occupancy_status,
      role: payload.role,
      approved_by: payload.approved_by,
    });
    return { ok: true };
  }
  return portalApiPost('/users/approve', {
    token,
    body: {
      profile_id: payload.profile_id,
      role: payload.role,
      unit_id: payload.unit_id,
      approval_note: payload.approval_note || '',
    },
  });
}

export async function rejectUser(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    mock.rejectRegistration(payload.profile_id, payload.approval_note, payload.rejected_by);
    return { ok: true };
  }
  return portalApiPost('/users/reject', {
    token,
    body: {
      profile_id: payload.profile_id,
      approval_note: payload.approval_note,
    },
  });
}

// =====================================================================
// DASHBOARD / HOME
// =====================================================================

export async function fetchDashboardData(token, { role, period } = {}) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return {
      report: mock.computeReport(period),
      pendingRegistrationCount: mock.isStaffRole(role) ? mock.getPendingRegistrations().length : 0,
      pendingPaymentCount: mock.isBendaharaOrAbove(role) ? mock.getPendingPayments().length : 0,
    };
  }

  // Production: fetch real pending counts
  let pendingRegistrationCount = 0;
  let pendingPaymentCount = 0;

  try {
    const { isStaffRole, isBendaharaOrAbove } = await import('./dataHelpers.js');
    if (isStaffRole(role)) {
      const result = await portalApiPost('/users/pending', { token });
      pendingRegistrationCount = Number(result?.count || 0);
    }
    // pendingPaymentCount will be wired when payment verification API exists
  } catch {
    // Silently fallback to 0 — dashboard should not crash for badge counts
  }

  return {
    report: null, // Will be wired when billing report API exists
    pendingRegistrationCount,
    pendingPaymentCount,
  };
}

// =====================================================================
// UNITS
// =====================================================================

export async function fetchUnits(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockUnits.map((u) => ({
      ...u,
      _occupant: mock.getUnitOccupant(u.id) || null,
    }));
  }
  const data = await portalApiPost('/units/list', { token });
  return data?.units || [];
}

export async function fetchUnitOccupant(token, unitId) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getUnitOccupant(unitId);
  }
  return null;
}

// =====================================================================
// RESIDENTS
// =====================================================================

export async function fetchResidents(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockProfiles.filter((p) => p.approval_status === 'approved');
  }
  const data = await portalApiPost('/residents/list', { token });
  return data?.residents || [];
}

// =====================================================================
// SETTINGS
// =====================================================================

export async function fetchSettings(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockSettings;
  }
  const data = await portalApiPost('/settings/get', { token });
  return data;
}

export async function updateSettings(token, settingsData) {
  if (IS_DEMO) {
    const mock = await getMockData();
    Object.assign(mock.mockSettings, settingsData);
    return { ok: true };
  }
  await portalApiPost('/settings/update', { token, body: settingsData });
  return { ok: true };
}

export async function generateBills(token, { period, dry_run }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const existing = mock.mockIPLBills.filter(b => b.period === period);
    const mockUnits = mock.mockUnits;
    const schemas = mock.mockSettings.ipl_schemas;
    const due_day = mock.mockSettings.due_day;
    const due_date = `${period}-${String(due_day).padStart(2, '0')}`;
    
    const schemaKomplit = schemas.find(s => s.id === 'schema-komplit') || schemas[0];
    const schemaBasic = schemas.find(s => s.id === 'schema-basic') || schemas[1] || schemas[0];
    
    const preview = [];
    const skipped = [];
    
    mockUnits.forEach(unit => {
      const exists = existing.some(b => b.unit_id === unit.id);
      if (exists) {
        skipped.push({ unit_id: unit.id, block: unit.block, unit_number: unit.unit_number, reason: 'already_exists' });
        return;
      }
      
      const amount = unit.is_occupied ? schemaKomplit.components.reduce((s, c) => s + c.amount, 0) : schemaBasic.components.reduce((s, c) => s + c.amount, 0);
      const recipient = mock.getBillRecipient(unit.id);
      
      preview.push({
        unit_id: unit.id,
        resident_id: recipient?.id || null,
        period,
        amount,
        late_fee: 0,
        due_date,
        status: 'pending',
        notes: `Tagihan IPL Periode ${period}`,
        unit_info: `Blok ${unit.block}/${unit.unit_number}`,
        resident_name: recipient ? recipient.full_name : 'Belum Terdaftar/Kosong',
      });
    });
    
    if (!dry_run) {
      mock.mockIPLBills.push(...preview.map(p => ({ ...p, id: `bill-${Date.now()}-${p.unit_id}` })));
    }
    
    return {
      dry_run,
      period,
      total_preview: preview.length,
      preview,
      skipped_count: skipped.length,
      skipped,
    };
  }
  
  const data = await portalApiPost('/bills/generate', {
    token,
    body: { period, dry_run },
  });
  return data;
}

export async function fetchBillMatrix(token, year) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getBillMatrix(year);
  }
  const data = await portalApiPost('/bills/matrix', { token, body: { year } });
  return data?.matrix || [];
}

// =====================================================================
// PAYMENTS
// =====================================================================

export async function submitManualPayment(token, { bill_id, method, amount, file, proof_file, note }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.recordResidentPayment([bill_id], { method, receiptFile: file || proof_file, note });
  }
  
  if (file) {
    return portalApiUpload('/payments/manual/submit', {
      token,
      file,
      fields: { bill_id, method, amount, note }
    });
  } else {
    return portalApiPost('/payments/manual/submit', {
      token,
      body: { bill_id, method, amount, proof_file, note }
    });
  }
}

export async function createCashPayment(token, { bill_id, amount, file, note, paid_at }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.recordManualPayment(bill_id, {
      method: 'cash',
      paidAt: paid_at,
      note,
      receiptFile: file,
    });
  }
  
  if (file) {
    return portalApiUpload('/payments/cash/create', {
      token,
      file,
      fields: { bill_id, amount, note, paid_at }
    });
  } else {
    return portalApiPost('/payments/cash/create', {
      token,
      body: { bill_id, amount, note, paid_at }
    });
  }
}

export async function approveManualPayment(token, { payment_id, note }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.verifyPayment(payment_id, { verifiedBy: 'Demo Staff', note });
  }
  return portalApiPost('/payments/manual/approve', {
    token,
    body: { payment_id, note }
  });
}

export async function rejectManualPayment(token, { payment_id, note }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.rejectPayment(payment_id, { rejectedBy: 'Demo Staff', reason: note });
  }
  return portalApiPost('/payments/manual/reject', {
    token,
    body: { payment_id, note }
  });
}

export async function fetchPayments(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockPayments;
  }
  const { supabase } = await import('./supabaseClient.js');
  const { data, error } = await supabase
    .from('payments')
    .select('*, ipl_bills(period, unit_id, amount), profiles(full_name, email)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  
  return (data || []).map(p => {
    return {
      ...p,
      // Map database 'completed' status to 'verified' for the UI expectations
      status: p.status === 'completed' ? 'verified' : p.status,
      metadata: typeof p.metadata === 'string' ? JSON.parse(p.metadata) : (p.metadata || {}),
      _bill: p.ipl_bills,
      _profile: p.profiles,
    };
  });
}

export async function createQrisPayment(token, { bill_ids }) {
  if (IS_DEMO) {
    return {
      ok: true,
      data: {
        token: "demo-token-" + Math.random().toString(36).substring(2, 10),
        redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/demo-token",
        parent_order_id: "PV-QRIS-demo-" + Date.now(),
        total_amount: 150000
      }
    };
  }
  return portalApiPost('/payments/qris/create', {
    token,
    body: { bill_ids }
  });
}

export async function fetchRunningBalance(token, { year, month }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return { ok: true, data: { chain: mock.computeRunningBalance(year, month) } };
  }
  return portalApiPost('/reports/running-balance', {
    token,
    body: { year, month }
  });
}

export async function fetchMonthlyFinance(token, { year, month }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const period = `${year}-${String(month).padStart(2, '0')}`;
    return {
      ok: true,
      data: {
        report: mock.computeReport(period),
        expenses: mock.getExpensesForPeriod(period),
        cashPayments: mock.getPaymentsByMonth(year, month)
      }
    };
  }
  return portalApiPost('/reports/monthly-finance', {
    token,
    body: { year, month }
  });
}

// =====================================================================
// MODE CHECK EXPORT
// =====================================================================

export { IS_DEMO };
