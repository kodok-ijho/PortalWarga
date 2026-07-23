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
import { portalApiPost, portalApiUpload } from './apiClient';

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
      occupancy_status: payload.occupancy_status,
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

export async function fetchUsers(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getUserList();
  }
  const data = await portalApiPost('/users/list', { token });
  return data?.users || [];
}

export async function createUser(token, payload) {
  return createResident(token, payload);
}

export async function updateUser(token, id, payload) {
  return updateResident(token, id, payload);
}

export async function deactivateUser(token, id) {
  return deleteResident(token, id);
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

  // Production: fetch real pending counts and report
  let pendingRegistrationCount = 0;
  let pendingPaymentCount = 0;
  let report = null;

  try {
    const { isStaffRole, isBendaharaOrAbove } = await import('./dataHelpers.js');
    
    // Fetch pending registrations (for staff)
    if (isStaffRole(role)) {
      try {
        const result = await portalApiPost('/users/pending', { token });
        pendingRegistrationCount = Number(result?.count || 0);
      } catch (err) {
        console.warn('Failed to load pending registrations for dashboard:', err);
      }
    }

    // Fetch pending payments count (for bendahara/admin)
    if (isBendaharaOrAbove(role)) {
      try {
        const payments = await fetchPayments(token);
        pendingPaymentCount = payments.filter((p) => p.status === 'pending_verification').length;
      } catch (err) {
        console.warn('Failed to load pending payments count for dashboard:', err);
      }
    }

    // Fetch monthly report (for staff/pengurus and above)
    if (isStaffRole(role) && period) {
      try {
        const [yearStr, monthStr] = period.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (year && month) {
          const res = await fetchMonthlyFinance(token, { year, month });
          report = res?.report || null;
        }
      } catch (err) {
        console.warn('Failed to load monthly finance report for dashboard:', err);
      }
    }
  } catch (err) {
    console.error('Error in fetchDashboardData:', err);
  }

  return {
    report,
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
  
  try {
    const [resUnitsData, residents] = await Promise.all([
      portalApiPost('/units/list', { token }),
      fetchResidents(token).catch(() => [])
    ]);
    
    const units = resUnitsData?.units || [];
    
    return units.map((u) => {
      // Find occupant from approved residents
      const occupant = residents.find(
        (r) => r.unit_id === u.id && r.is_active
      ) || null;
      
      return {
        ...u,
        _occupant: occupant
      };
    });
  } catch (err) {
    console.error('Failed to fetch units with occupant data:', err);
    try {
      const resUnitsData = await portalApiPost('/units/list', { token });
      return resUnitsData?.units || [];
    } catch {
      return [];
    }
  }
}

export async function fetchUnitOccupant(token, unitId) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getUnitOccupant(unitId);
  }
  try {
    const residents = await fetchResidents(token);
    return residents.find((r) => r.unit_id === Number(unitId) && r.is_active) || null;
  } catch {
    return null;
  }
}

export async function upsertUnit(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const isEdit = !!payload.id;
    if (isEdit) {
      const idx = mock.mockUnits.findIndex((u) => u.id === payload.id);
      if (idx >= 0) {
        Object.assign(mock.mockUnits[idx], payload);
        return { ok: true, data: { unit: mock.mockUnits[idx] } };
      }
    } else {
      const newUnit = {
        ...payload,
        id: Date.now(),
      };
      mock.mockUnits.push(newUnit);
      return { ok: true, data: { unit: newUnit } };
    }
    return { ok: false, error: 'Not found' };
  }
  const data = await portalApiPost('/units/upsert', { token, body: payload });
  return { ok: true, data };
}

export async function deleteUnit(token, unitId) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const idx = mock.mockUnits.findIndex((u) => u.id === Number(unitId));
    if (idx >= 0) {
      mock.mockUnits.splice(idx, 1);
      return { ok: true };
    }
    return { ok: false, error: 'Unit not found' };
  }
  await portalApiPost('/units/delete', { token, body: { unit_id: unitId } });
  return { ok: true };
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

export async function createResident(token, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const newProfile = {
      ...payload,
      id: 'p-' + Date.now(),
      approval_status: 'approved',
      is_active: payload.is_active ?? true,
    };
    mock.mockProfiles.push(newProfile);
    return { ok: true, data: { profile: newProfile } };
  }
  const data = await portalApiPost('/residents/create', { token, body: payload });
  return { ok: true, data };
}

export async function updateResident(token, id, payload) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const idx = mock.mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      Object.assign(mock.mockProfiles[idx], payload);
      return { ok: true, data: { profile: mock.mockProfiles[idx] } };
    }
    return { ok: false, error: 'Not found' };
  }
  const data = await portalApiPost('/residents/update', { token, body: { id, ...payload } });
  return { ok: true, data };
}

export async function deleteResident(token, id) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const idx = mock.mockProfiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      mock.mockProfiles.splice(idx, 1);
      return { ok: true };
    }
    return { ok: false, error: 'Not found' };
  }
  await portalApiPost('/residents/delete', { token, body: { id } });
  return { ok: true };
}

export async function importResidentsCSV(token, residents, mode = 'upsert') {
  if (IS_DEMO) {
    const mock = await getMockData();
    if (mode === 'delete-insert') {
      const keepStaff = mock.mockProfiles.filter((p) => p.role !== 'warga');
      mock.mockProfiles.length = 0;
      mock.mockProfiles.push(...keepStaff, ...residents);
    } else {
      for (const m of residents) {
        const idx = mock.mockProfiles.findIndex(
          (p) =>
            (p.email && m.email && p.email.toLowerCase() === m.email.toLowerCase()) ||
            (p.full_name?.toLowerCase() === m.full_name?.toLowerCase() && p.unit_id === m.unit_id)
        );
        if (idx >= 0) {
          Object.assign(mock.mockProfiles[idx], m, { id: mock.mockProfiles[idx].id });
        } else {
          mock.mockProfiles.push(m);
        }
      }
    }
    return { ok: true, data: { imported_count: residents.length } };
  }
  const data = await portalApiPost('/residents/import-csv', { token, body: { residents, mode } });
  return { ok: true, data };
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

export async function fetchIPLSchemas(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.getIPLSchemas();
  }
  const settings = await fetchSettings(token);
  return settings?.ipl_schemas || [];
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

export async function updatePaymentSmokeTestSettings(token, smokeTest) {
  if (IS_DEMO) {
    const mock = await getMockData();
    mock.mockSettings.smoke_test = {
      ...(mock.mockSettings.smoke_test || {}),
      ...smokeTest,
    };
    return mock.mockSettings.smoke_test;
  }

  await portalApiPost('/settings/update', {
    token,
    body: { smoke_test: smokeTest },
  });
  return smokeTest;
}

export async function runPaymentSmokeTest(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    const startedAt = new Date().toISOString();
    const result = {
      status: 'pass',
      source: 'manual',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: 420,
      notification_sent: false,
      checks: [
        { key: 'database', label: 'Database Supabase', status: 'pass', message: 'Konfigurasi dapat dibaca dan status dapat disimpan.' },
        { key: 'drive_upload', label: 'Upload Google Drive', status: 'pass', message: 'File smoke test berhasil diunggah.' },
        { key: 'drive_share', label: 'Izin bukti bayar', status: 'pass', message: 'Izin reader-by-link berhasil diterapkan.' },
        { key: 'drive_cleanup', label: 'Cleanup Google Drive', status: 'pass', message: 'File smoke test dihapus permanen.' },
      ],
    };
    mock.mockSettings.smoke_test = {
      ...(mock.mockSettings.smoke_test || {}),
      last_run: result,
    };
    return result;
  }

  return portalApiPost('/monitoring/payment-smoke/run', { token });
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
    return normalizeBillMatrixRows(mock.getBillMatrix(year));
  }
  const data = await portalApiPost('/bills/matrix', { token, body: { year } });
  return normalizeBillMatrixRows(data?.matrix || []);
}

function toNumberOrOriginal(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
}

const unitCollator = new Intl.Collator('id-ID', {
  numeric: true,
  sensitivity: 'base',
});

function normalizeBillMatrixRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const unit = {
        ...(row?.unit || {}),
        id: toNumberOrOriginal(row?.unit?.id),
        is_occupied: row?.unit?.is_occupied === false ? false : true,
        occupancy_status:
          row?.unit?.occupancy_status ||
          row?.resident?.occupancy_status ||
          (row?.unit?.is_occupied === false ? 'owner_vacant' : 'unknown'),
      };

      const resident = row?.resident
        ? {
            ...row.resident,
            unit_id:
              row.resident.unit_id !== undefined
                ? toNumberOrOriginal(row.resident.unit_id)
                : unit.id,
            occupancy_status: row.resident.occupancy_status || unit.occupancy_status,
          }
        : null;

      const rawCells = Array.isArray(row?.cells) ? row.cells : [];
      const cells = Array.from({ length: 12 }, (_, index) => {
        const cell = rawCells[index] || null;
        if (!cell?.bill) return null;

        const bill = {
          ...cell.bill,
          unit_id: toNumberOrOriginal(cell.bill.unit_id ?? unit.id),
          amount: Number(cell.bill.amount || 0),
          late_fee: Number(cell.bill.late_fee || 0),
        };

        return {
          ...cell,
          status: cell.status || bill.status,
          bill,
        };
      });

      return { ...row, unit, resident, cells };
    })
    .sort((a, b) => {
      const blockCompare = unitCollator.compare(
        String(a.unit?.block || ''),
        String(b.unit?.block || '')
      );
      if (blockCompare !== 0) return blockCompare;

      const unitCompare = unitCollator.compare(
        String(a.unit?.unit_number || ''),
        String(b.unit?.unit_number || '')
      );
      if (unitCompare !== 0) return unitCompare;

      return Number(a.unit?.id || 0) - Number(b.unit?.id || 0);
    });
}

// =====================================================================
// PAYMENTS
// =====================================================================

export async function submitManualPayment(token, { bill_id, method, amount, file, proof_file, note, paid_at }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.recordResidentPayment([bill_id], { method, receiptFile: file || proof_file, note });
  }
  
  if (file) {
    return portalApiUpload('/payments/manual/submit', {
      token,
      file,
      fields: { bill_id, method, amount, note, paid_at }
    });
  } else {
    return portalApiPost('/payments/manual/submit', {
      token,
      body: { bill_id, method, amount, proof_file, note, paid_at }
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
  const result = await portalApiPost('/payments/list', { token });
  const rawPayments = result?.payments || [];

  return rawPayments.map(p => {
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
      token: "demo-token-" + Math.random().toString(36).substring(2, 10),
      redirect_url: "https://app.sandbox.midtrans.com/snap/v2/vtweb/demo-token",
      parent_order_id: "PV-QRIS-demo-" + Date.now(),
      total_amount: 150000
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
    return { chain: mock.computeRunningBalance(year, month) };
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
      report: mock.computeReport(period),
      expenses: mock.getExpensesForPeriod(period),
      cashPayments: mock.getPaymentsByMonth(year, month)
    };
  }
  return portalApiPost('/reports/monthly-finance', {
    token,
    body: { year, month }
  });
}

// =====================================================================
// PROFILE
// =====================================================================

/**
 * Update the current user's profile (production mode).
 * Sends editable fields to n8n backend which persists to Supabase.
 * Demo mode is handled directly in AuthContext (no API call needed).
 */
export async function updateProfileApi(token, { full_name, phone, avatar_url }) {
  return portalApiPost('/profile/update', {
    token,
    body: { full_name, phone, avatar_url },
  });
}

// =====================================================================
// EXPENSES
// =====================================================================

export async function fetchExpenses(token) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.mockExpenses;
  }
  const result = await portalApiPost('/expenses/list', { token });
  return result?.expenses || [];
}

export async function createExpense(token, { date, category, amount, description, file }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.addExpense({ date, category, amount, description, receipt_file: file ? file.name : null });
  }

  if (file) {
    return portalApiUpload('/expenses/create', {
      token,
      file,
      fields: { expense_date: date, category, amount, description }
    });
  } else {
    return portalApiPost('/expenses/create', {
      token,
      body: { expense_date: date, category, amount, description }
    });
  }
}

export async function updateExpense(token, id, { date, category, amount, description, file }) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.updateExpense(id, { date, category, amount, description, receipt_file: file ? file.name : null });
  }

  if (file) {
    return portalApiUpload('/expenses/update', {
      token,
      file,
      fields: { expense_id: id, expense_date: date, category, amount, description }
    });
  } else {
    return portalApiPost('/expenses/update', {
      token,
      body: { expense_id: id, expense_date: date, category, amount, description }
    });
  }
}

export async function deleteExpense(token, id) {
  if (IS_DEMO) {
    const mock = await getMockData();
    return mock.deleteExpense(id);
  }
  return portalApiPost('/expenses/delete', {
    token,
    body: { expense_id: id }
  });
}

export async function fetchAuditLogs(token, filters = {}) {
  if (IS_DEMO) {
    const mock = await getMockData();
    // Transform mock login logs
    const loginLogsMapped = (mock.mockLoginLogs || []).map((l) => ({
      id: l.id,
      created_at: l.timestamp,
      actor_email: l.email,
      actor_name: l.email.split('@')[0],
      action: l.status === 'success' ? 'login.success' : 'login.failed',
      entity_type: 'auth',
      entity_id: null,
      metadata: { status: l.status, ip: l.ip },
      ip_address: l.ip,
    }));

    // Transform mock access logs
    const accessLogsMapped = (mock.mockAccessLogs || []).map((a) => {
      const actorEmail = a.userName.toLowerCase().replace(/[^a-z0-9]/g, '') + '@palmvillage.id';
      return {
        id: a.id,
        created_at: a.timestamp,
        actor_email: actorEmail,
        actor_name: a.userName,
        action: 'page.view',
        entity_type: 'navigation',
        entity_id: a.page,
        metadata: { page: a.page },
        ip_address: '192.168.1.1',
      };
    });

    // Transform mock transaction logs
    const transactionLogsMapped = (mock.mockTransactionLogs || []).map((t) => {
      const actorEmail = t.userName.toLowerCase().replace(/[^a-z0-9]/g, '') + '@palmvillage.id';
      const actionKey = t.action === 'Catat Pengeluaran' ? 'expense.create' : (t.action === 'Bayar IPL' ? 'payment.submit' : (t.action === 'Catat Pembayaran' ? 'payment.approve' : 'settings.update'));
      const entityKey = t.action === 'Catat Pengeluaran' ? 'expense' : (t.action === 'Ubah Pengaturan' ? 'settings' : 'payment');
      return {
        id: t.id,
        created_at: t.timestamp,
        actor_email: actorEmail,
        actor_name: t.userName,
        action: actionKey,
        entity_type: entityKey,
        entity_id: t.id,
        metadata: { details: t.details, amount: t.amount },
        ip_address: '192.168.1.2',
      };
    });

    // Combine all
    let allLogs = [...loginLogsMapped, ...accessLogsMapped, ...transactionLogsMapped];

    // Apply filters
    const { action, search, limit = 100, offset = 0 } = filters;

    if (action) {
      allLogs = allLogs.filter((l) => l.action === action);
    }

    if (search) {
      const q = search.toLowerCase();
      allLogs = allLogs.filter((l) =>
        (l.actor_email || '').toLowerCase().includes(q) ||
        (l.actor_name || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q) ||
        (l.entity_type || '').toLowerCase().includes(q)
      );
    }

    // Sort descending by date
    allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const totalCount = allLogs.length;
    const sliced = allLogs.slice(offset, offset + limit);

    return {
      logs: sliced,
      total_count: totalCount,
    };
  }

  // Production path: hit /logs/list n8n endpoint
  return portalApiPost('/logs/list', {
    token,
    body: filters,
  });
}

// =====================================================================
// MODE CHECK EXPORT
// =====================================================================

export { IS_DEMO };

