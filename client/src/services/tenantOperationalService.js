/**
 * tenantOperationalService.js
 *
 * Layanan operasional generik multi-tenant untuk manajemen unit,
 * pengaturan tenant (komponen tagihan, rekening kas), dan data operasional.
 * Mendukung dual-mode: Supabase production & Mock Demo mode.
 */

import { supabase } from './supabaseClient';
import { mockUnits } from './mockData';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// In-memory cache unit untuk demo mode agar interaksi setup wizard terasa nyata
let demoTenantUnitsMap = new Map();

/**
 * Generate kode undangan unik berbasis nama tenant (misal: "RW-PALM-9F2B")
 */
export function generateInviteCode(tenantName = '') {
  const clean = tenantName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'RW';
  const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RW-${clean}-${randomHex}`;
}

/**
 * Mengambil detail tenant beserta settings
 */
export async function fetchTenantDetails(tenantId) {
  if (!tenantId) return null;

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return {
      id: tenantId,
      name: 'Palm Village RT 05',
      type: 'rt_rw',
      address: 'Jl. Boulevard Palm No. 1',
      contact_phone: '081234567890',
      settings: {
        ipl_components: [
          { name: 'Keamanan', amount: 80000 },
          { name: 'Kebersihan', amount: 30000 },
          { name: 'Kas RT', amount: 20000 },
          { name: 'DDC (Sosial)', amount: 10000 },
        ],
        due_day: 10,
        bank_account: {
          bank_name: 'BCA',
          account_number: '8830123456',
          account_holder: 'Kas RT 05 Palm Village',
        },
        invite_code: 'RW-PALM-2026',
        onboarding_completed: true,
      },
    };
  }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, type, owner_id, address, contact_phone, settings, created_at, updated_at')
    .eq('id', tenantId)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantDetails error:', error);
    throw error;
  }

  return data;
}

/**
 * Memperbarui profil dan settings tenant
 */
export async function updateTenantProfileAndSettings(tenantId, { name, address, contact_phone, settings }) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) payload.name = name.trim();
  if (address !== undefined) payload.address = address ? address.trim() : null;
  if (contact_phone !== undefined) payload.contact_phone = contact_phone ? contact_phone.trim() : null;
  if (settings !== undefined) payload.settings = settings;

  if (IS_DEMO) {
    return { id: tenantId, ...payload };
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(payload)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantProfileAndSettings error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengambil daftar unit milik tenant
 */
export async function fetchTenantUnits(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    if (demoTenantUnitsMap.has(tenantId)) {
      return demoTenantUnitsMap.get(tenantId);
    }
    // Fallback default demo units
    const formatted = mockUnits.map((u) => ({
      id: u.id,
      tenant_id: tenantId,
      label: `Blok ${u.block} No. ${u.unit_number}`,
      status: u.is_occupied ? 'active' : 'vacant',
      metadata: { block: u.block, unit_number: u.unit_number, size: u.size },
    }));
    demoTenantUnitsMap.set(tenantId, formatted);
    return formatted;
  }

  const { data, error } = await supabase
    .from('tenant_units')
    .select('id, tenant_id, label, status, metadata, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantUnits error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Membuat banyak unit sekaligus (bulk insert) untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {Array<{ label: string, status?: string, metadata?: object }>} unitsList
 */
export async function bulkCreateTenantUnits(tenantId, unitsList = []) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!unitsList || unitsList.length === 0) return [];

  const rows = unitsList.map((u) => ({
    tenant_id: tenantId,
    label: typeof u === 'string' ? u.trim() : u.label.trim(),
    status: u.status || 'active',
    metadata: u.metadata || {},
  }));

  if (IS_DEMO) {
    const existing = demoTenantUnitsMap.get(tenantId) || [];
    const newItems = rows.map((r, idx) => ({
      ...r,
      id: Date.now() + idx,
      created_at: new Date().toISOString(),
    }));
    const combined = [...existing, ...newItems];
    demoTenantUnitsMap.set(tenantId, combined);
    return newItems;
  }

  const { data, error } = await supabase
    .from('tenant_units')
    .insert(rows)
    .select();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] bulkCreateTenantUnits error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengambil informasi tenant dan unit via kode undangan
 */
export async function getInviteDetails(inviteCode) {
  if (!inviteCode) return { found: false, message: 'Kode undangan tidak boleh kosong.' };

  if (IS_DEMO) {
    return {
      found: true,
      tenant_id: 'demo-tenant-rtrw',
      tenant_name: 'Palm Village RT 05',
      tenant_type: 'rt_rw',
      address: 'Jl. Boulevard Palm No. 1',
      contact_phone: '081234567890',
      units: [
        { id: 1, label: 'Blok A-01', status: 'active' },
        { id: 2, label: 'Blok A-02', status: 'active' },
        { id: 3, label: 'Blok A-03', status: 'active' },
        { id: 4, label: 'Blok A-04', status: 'active' },
        { id: 5, label: 'Blok A-05', status: 'active' },
        { id: 6, label: 'Blok A-06', status: 'active' },
      ],
    };
  }

  const { data, error } = await supabase.rpc('get_invite_details', {
    p_code: inviteCode.trim(),
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] getInviteDetails error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengajukan permohonan bergabung ke tenant (warga pendaftar)
 */
export async function requestJoinTenant({ tenantId, userId, unitId, fullName, phone, occupancyStatus }) {
  if (!tenantId || !userId) {
    throw new Error('Tenant ID dan User ID wajib disertakan.');
  }

  const payload = {
    tenant_id: tenantId,
    user_id: userId,
    unit_id: unitId ? Number(unitId) : null,
    full_name: fullName.trim(),
    phone: phone ? phone.trim() : null,
    occupancy_status: occupancyStatus || 'owner_occupied',
    role: 'anggota',
    status: 'pending',
  };

  if (IS_DEMO) {
    return { id: `mem-demo-${Date.now()}`, ...payload };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .insert(payload)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Anda sudah terdaftar atau pernah mengajukan pendaftaran di komunitas ini.');
    }
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] requestJoinTenant error:', error);
    throw error;
  }

  return data;
}

/**
 * Mengambil daftar pendaftar anggota yang masih pending di sebuah tenant
 */
export async function fetchPendingTenantMembers(tenantId) {
  if (!tenantId) return [];

  if (IS_DEMO || String(tenantId).startsWith('demo-')) {
    return [
      {
        id: 'mock-pending-1',
        tenant_id: tenantId,
        user_id: 'user-p1',
        unit_id: 3,
        full_name: 'Budi Santoso',
        phone: '081298765432',
        role: 'anggota',
        status: 'pending',
        occupancy_status: 'owner_occupied',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        tenant_units: { id: 3, label: 'Blok A-03' },
      },
      {
        id: 'mock-pending-2',
        tenant_id: tenantId,
        user_id: 'user-p2',
        unit_id: 5,
        full_name: 'Dewi Lestari',
        phone: '081311223344',
        role: 'anggota',
        status: 'pending',
        occupancy_status: 'tenant',
        created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
        tenant_units: { id: 5, label: 'Blok A-05' },
      },
    ];
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .select(`
      id,
      tenant_id,
      user_id,
      unit_id,
      full_name,
      phone,
      role,
      status,
      occupancy_status,
      created_at,
      tenant_units:unit_id (
        id,
        label
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchPendingTenantMembers error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Mengambil seluruh anggota tenant (approved atau sesuai opsi status)
 * @param {string} tenantId
 * @param {object} opts - { status }
 */
export async function fetchTenantMembers(tenantId, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.mockResidents || [];
  }

  let query = supabase
    .from('tenant_members')
    .select(`
      id,
      tenant_id,
      user_id,
      unit_id,
      full_name,
      phone,
      role,
      status,
      occupancy_status,
      created_at,
      tenant_units:unit_id (
        id,
        label,
        metadata
      )
    `)
    .eq('tenant_id', tenantId);

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantMembers error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Menyetujui pendaftaran anggota tenant
 */
export async function approveTenantMember(memberId, { role = 'anggota', unitId, occupancyStatus }) {
  if (!memberId) throw new Error('Member ID wajib disertakan.');

  const updateData = {
    status: 'approved',
    role: role || 'anggota',
    updated_at: new Date().toISOString(),
  };

  if (unitId !== undefined) updateData.unit_id = unitId ? Number(unitId) : null;
  if (occupancyStatus !== undefined) updateData.occupancy_status = occupancyStatus;

  if (IS_DEMO) {
    return { id: memberId, ...updateData };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .update(updateData)
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] approveTenantMember error:', error);
    throw error;
  }

  return data;
}

/**
 * Menolak pendaftaran anggota tenant
 */
export async function rejectTenantMember(memberId) {
  if (!memberId) throw new Error('Member ID wajib disertakan.');

  if (IS_DEMO) {
    return { id: memberId, status: 'rejected' };
  }

  const { data, error } = await supabase
    .from('tenant_members')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantMember error:', error);
    throw error;
  }

  return data;
}

/**
 * Pure calculation helper untuk menyusun preview tagihan bulanan
 */
export function calculateBillingPreview({
  tenantId,
  period,
  units = [],
  settings = {},
  existingUnitIds = new Set(),
  unitMemberMap = new Map(),
}) {
  const iplComponents = settings.ipl_components || [
    { name: 'Keamanan Lingkungan', amount: 80000 },
    { name: 'Kebersihan & Sampah', amount: 30000 },
    { name: 'Kas Paguyuban / RT', amount: 20000 },
    { name: 'Dana Duka Cita (Sosial)', amount: 10000 },
  ];
  const totalAmount = iplComponents.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const dueDay = Number(settings.due_day) || 10;
  const dueDate = `${period}-${String(dueDay).padStart(2, '0')}`;

  const activeUnits = units.filter((u) => u.status !== 'inactive');
  const preview = [];
  const skipped = [];

  activeUnits.forEach((u) => {
    if (existingUnitIds.has(u.id)) {
      skipped.push({
        unit_id: u.id,
        label: u.label,
        reason: 'already_exists',
      });
      return;
    }

    const member = unitMemberMap.get(u.id) || null;

    preview.push({
      tenant_id: tenantId,
      unit_id: u.id,
      member_id: member?.id || null,
      period,
      amount: totalAmount,
      late_fee: 0,
      due_date: dueDate,
      status: 'unpaid',
      metadata: {
        bill_type: 'ipl',
        components: iplComponents,
        unit_label: u.label,
        member_name: member?.full_name || 'Belum Terdaftar / Kosong',
      },
      unit_info: u.label,
      resident_name: member?.full_name || 'Belum Terdaftar / Kosong',
    });
  });

  return {
    period,
    totalAmount,
    dueDate,
    preview,
    skipped,
  };
}

/**
 * Generate tagihan berkala (IPL bulanan) untuk seluruh unit aktif dalam sebuah tenant.
 * Membaca komponen IPL dan due_day yang telah diinputkan pada SetupWizard (tenants.settings).
 * 
 * @param {string} tenantId - UUID tenant
 * @param {object} options - { period: 'YYYY-MM', dry_run: boolean }
 */
export async function generateTenantBillingItems(tenantId, { period, dry_run = false } = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('Format periode harus YYYY-MM.');
  }

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  // 1. Ambil detail tenant (settings: ipl_components, due_day)
  const tenant = await fetchTenantDetails(tenantId);
  const settings = tenant?.settings || {};

  // 2. Ambil seluruh unit aktif milik tenant
  const units = await fetchTenantUnits(tenantId);

  // 3. Ambil data anggota yang menempati unit (approved members)
  let unitMemberMap = new Map();
  if (isDemoOrMock) {
    // Demo mock mapping
    units.forEach((u) => {
      unitMemberMap.set(u.id, {
        id: `mock-member-${u.id}`,
        full_name: `Penghuni ${u.label}`,
      });
    });
  } else {
    const { data: members, error: memErr } = await supabase
      .from('tenant_members')
      .select('id, unit_id, full_name, role, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .not('unit_id', 'is', null);

    if (!memErr && members) {
      members.forEach((m) => {
        unitMemberMap.set(m.unit_id, m);
      });
    }
  }

  // 4. Periksa tagihan yang sudah ada untuk periode ini agar tidak duplikat
  let existingUnitIds = new Set();
  if (!isDemoOrMock) {
    const { data: existingBills, error: billErr } = await supabase
      .from('billing_items')
      .select('unit_id')
      .eq('tenant_id', tenantId)
      .eq('period', period);

    if (!billErr && existingBills) {
      existingBills.forEach((b) => {
        if (b.unit_id) existingUnitIds.add(b.unit_id);
      });
    }
  }

  const { preview, skipped } = calculateBillingPreview({
    tenantId,
    period,
    units,
    settings,
    existingUnitIds,
    unitMemberMap,
  });

  // 5. Simpan ke database jika bukan dry_run
  if (!dry_run && preview.length > 0) {
    if (isDemoOrMock) {
      // Pada demo mode, preview dianggap berhasil dibuat
    } else {
      const rowsToInsert = preview.map((p) => ({
        tenant_id: p.tenant_id,
        unit_id: p.unit_id,
        member_id: p.member_id,
        period: p.period,
        amount: p.amount,
        late_fee: p.late_fee,
        due_date: p.due_date,
        status: p.status,
        metadata: p.metadata,
      }));

      const { error: insertErr } = await supabase
        .from('billing_items')
        .insert(rowsToInsert);

      if (insertErr) {
        // eslint-disable-next-line no-console
        console.error('[tenantOperationalService] generateTenantBillingItems insert error:', insertErr);
        throw new Error(insertErr.message || 'Gagal menyimpan tagihan ke database.');
      }
    }
  }

  return {
    dry_run,
    period,
    total_preview: preview.length,
    generated_count: dry_run ? 0 : preview.length,
    preview,
    skipped_count: skipped.length,
    skipped,
  };
}

/**
 * Mengambil daftar billing_items milik tenant (dengan filter period, status, unitId)
 */
export async function fetchTenantBillingItems(tenantId, { period, status, unitId } = {}) {
  if (!tenantId) return [];

  if (IS_DEMO) {
    return [];
  }

  let query = supabase
    .from('billing_items')
    .select(`
      id,
      tenant_id,
      unit_id,
      member_id,
      period,
      amount,
      late_fee,
      due_date,
      status,
      qris_ref,
      metadata,
      created_at,
      tenant_units:unit_id (
        id,
        label
      ),
      tenant_members:member_id (
        id,
        full_name,
        phone
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (period) query = query.eq('period', period);
  if (status) query = query.eq('status', status);
  if (unitId) query = query.eq('unit_id', unitId);

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantBillingItems error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Mengambil dan membentuk matriks tagihan multi-bulan (12 periode) generik untuk sebuah tenant
 * @param {string} tenantId - UUID tenant
 * @param {number} year - Tahun buku (misal 2026 -> Jul 2026 s/d Jun 2027)
 * @param {object} opts - { scopeUnitId }
 */
export async function fetchTenantBillMatrix(tenantId, year = 2026, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.getBillMatrix(year, opts);
  }

  // 1. Tentukan 12 periode tahun buku (Juli YYYY s/d Juni YYYY+1)
  const periods = [
    `${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`,
    `${year + 1}-01`, `${year + 1}-02`, `${year + 1}-03`, `${year + 1}-04`, `${year + 1}-05`, `${year + 1}-06`
  ];

  // 2. Ambil units
  let units = await fetchTenantUnits(tenantId);
  if (opts.scopeUnitId) {
    units = units.filter((u) => Number(u.id) === Number(opts.scopeUnitId));
  }

  // 3. Ambil approved members
  const { data: members } = await supabase
    .from('tenant_members')
    .select('id, unit_id, full_name, phone, occupancy_status, role')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved');

  const unitMemberMap = new Map();
  (members || []).forEach((m) => {
    if (m.unit_id) unitMemberMap.set(m.unit_id, m);
  });

  // 4. Ambil billing_items untuk rentang 12 periode ini
  let billQuery = supabase
    .from('billing_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('period', periods);

  if (opts.scopeUnitId) {
    billQuery = billQuery.eq('unit_id', opts.scopeUnitId);
  }

  const { data: bills } = await billQuery;
  const billMap = new Map();
  const billIds = [];
  (bills || []).forEach((b) => {
    billMap.set(`${b.unit_id}_${b.period}`, b);
    billIds.push(b.id);
  });

  // 5. Ambil payments jika ada billIds
  const paymentMap = new Map();
  if (billIds.length > 0) {
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('billing_item_id', billIds);

    (payments || []).forEach((p) => {
      paymentMap.set(p.billing_item_id, p);
    });
  }

  // 6. Susun struktur baris matriks sesuai format konsisten PortalWarga
  const rows = units.map((unit) => {
    const resident = unitMemberMap.get(unit.id) || null;

    const cells = periods.map((period) => {
      const bill = billMap.get(`${unit.id}_${period}`) || null;
      const payment = bill ? paymentMap.get(bill.id) || null : null;

      return {
        period,
        status: bill ? bill.status : 'none',
        bill: bill
          ? {
              ...bill,
              unit_id: unit.id,
              amount: Number(bill.amount || 0),
              late_fee: Number(bill.late_fee || 0),
            }
          : null,
        payment: payment || null,
      };
    });

    return {
      unit: {
        id: unit.id,
        label: unit.label,
        block: unit.metadata?.block || unit.label,
        unit_number: unit.metadata?.unit_number || '',
        is_occupied: Boolean(resident),
        occupancy_status: resident?.occupancy_status || (resident ? 'owner_occupied' : 'owner_vacant'),
      },
      resident,
      residents: resident ? [resident] : [],
      cells,
    };
  });

  return rows;
}

/**
 * Mengambil daftar pembayaran tenant generik (payments + billing_items + members + units)
 * @param {string} tenantId - UUID tenant
 * @param {object} opts - { status }
 */
export async function fetchTenantPayments(tenantId, opts = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.mockPayments;
  }

  let query = supabase
    .from('payments')
    .select(`
      id,
      tenant_id,
      billing_item_id,
      member_id,
      amount,
      method,
      transaction_id,
      status,
      proof_url,
      verified_by,
      verified_at,
      paid_at,
      metadata,
      created_at,
      updated_at,
      billing_items:billing_item_id (
        id,
        period,
        amount,
        late_fee,
        unit_id,
        status,
        tenant_units:unit_id (
          id,
          label,
          metadata
        )
      ),
      tenant_members:member_id (
        id,
        full_name,
        phone,
        role,
        occupancy_status
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (opts.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantPayments error:', error);
    throw error;
  }

  return (data || []).map((p) => {
    const bill = p.billing_items || {};
    const unit = bill.tenant_units || {};
    const member = p.tenant_members || {};
    const meta = p.metadata || {};

    const proofFileUrl = p.proof_url || meta.proof_file_url || meta.proof_url || '';
    const proofFileName =
      meta.proof_file_name ||
      meta.receipt_file ||
      (proofFileUrl ? proofFileUrl.split('/').pop().split('?')[0] : '');

    return {
      ...p,
      id: p.id,
      tenant_id: p.tenant_id,
      billing_item_id: p.billing_item_id || bill.id || '',
      resident_id: p.member_id || member.id || '',
      unit_id: bill.unit_id || unit.id || '',
      period: bill.period || meta.period || '',
      amount: Number(p.amount ?? bill.amount ?? 0),
      method: p.method || 'bank_transfer',
      status: p.status === 'completed' ? 'verified' : p.status,
      paid_at: p.paid_at || p.created_at,
      verified_by: meta.verified_by_name || p.verified_by || '',
      verified_at: p.verified_at,
      rejection_reason: meta.rejection_reason || '',
      proof_file_url: proofFileUrl,
      proof_file_name: proofFileName,
      receipt_file: proofFileName,
      metadata: meta,
      _bill: {
        id: bill.id,
        period: bill.period,
        amount: Number(bill.amount || 0),
        unit_id: bill.unit_id,
        status: bill.status,
      },
      _profile: member.id ? member : null,
      _unit: unit.id
        ? {
            id: unit.id,
            label: unit.label,
            block: unit.metadata?.block || unit.label,
            unit_number: unit.metadata?.unit_number || '',
          }
        : null,
    };
  });
}

/**
 * Memverifikasi / menyetujui pembayaran manual (bank_transfer/cash) untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { verifiedBy, note }
 */
export async function verifyTenantPayment(tenantId, paymentId, { verifiedBy, note } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    const payment = mock.verifyPayment(paymentId, { verifiedBy, note });
    return {
      success: true,
      paymentId,
      status: 'verified',
      payment: payment || { id: paymentId, status: 'verified', verified_by: verifiedBy },
    };
  }

  const { data: currentPayment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, billing_item_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] verifyTenantPayment fetch error:', fetchErr);
    throw fetchErr;
  }

  const updatedMetadata = {
    ...(currentPayment.metadata || {}),
    verified_by_name: verifiedBy || 'Pengurus',
    verification_note: note || '',
  };

  const { error: payErr } = await supabase
    .from('payments')
    .update({
      status: 'completed',
      verified_at: new Date().toISOString(),
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', paymentId);

  if (payErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] verifyTenantPayment update error:', payErr);
    throw payErr;
  }

  if (currentPayment.billing_item_id) {
    const { error: billErr } = await supabase
      .from('billing_items')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', currentPayment.billing_item_id);

    if (billErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] verifyTenantPayment billing update error:', billErr);
    }
  }

  return { success: true, paymentId, status: 'completed' };
}

/**
 * Menolak bukti pembayaran manual untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { rejectedBy, reason }
 */
export async function rejectTenantPayment(tenantId, paymentId, { rejectedBy, reason } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    const payment = mock.rejectPayment(paymentId, { rejectedBy, reason });
    return {
      success: true,
      paymentId,
      status: 'rejected',
      payment: payment || { id: paymentId, status: 'rejected', rejected_by: rejectedBy, rejection_reason: reason },
    };
  }

  const { data: currentPayment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, billing_item_id, metadata')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantPayment fetch error:', fetchErr);
    throw fetchErr;
  }

  const updatedMetadata = {
    ...(currentPayment.metadata || {}),
    rejected_by_name: rejectedBy || 'Pengurus',
    rejection_reason: reason || '',
    rejected_at: new Date().toISOString(),
  };

  const { error: payErr } = await supabase
    .from('payments')
    .update({
      status: 'rejected',
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', paymentId);

  if (payErr) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] rejectTenantPayment update error:', payErr);
    throw payErr;
  }

  if (currentPayment.billing_item_id) {
    const { error: billErr } = await supabase
      .from('billing_items')
      .update({
        status: 'unpaid',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', currentPayment.billing_item_id);

    if (billErr) {
      // eslint-disable-next-line no-console
      console.error('[tenantOperationalService] rejectTenantPayment billing update error:', billErr);
    }
  }

  return { success: true, paymentId, status: 'rejected' };
}

/**
 * Memperbarui rincian pembayaran untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} paymentId - UUID payment
 * @param {object} param2 - { unit_id, amount, method, paid_at, note }
 */
export async function updateTenantPayment(tenantId, paymentId, { unit_id, amount, method, paid_at, note } = {}) {
  if (!tenantId || !paymentId) throw new Error('tenantId dan paymentId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.updatePayment(paymentId, { unit_id, amount, method, paid_at, note });
  }

  const updateFields = {
    updated_at: new Date().toISOString(),
  };
  if (amount !== undefined && amount !== null && amount !== '') updateFields.amount = Number(amount);
  if (method) updateFields.method = method;
  if (paid_at) updateFields.paid_at = paid_at;

  const { data: current, error: fetchErr } = await supabase
    .from('payments')
    .select('id, metadata, billing_item_id')
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .single();

  if (fetchErr) throw fetchErr;

  if (note !== undefined) {
    updateFields.metadata = {
      ...(current.metadata || {}),
      note: String(note).trim(),
    };
  }

  const { data, error } = await supabase
    .from('payments')
    .update(updateFields)
    .eq('tenant_id', tenantId)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantPayment error:', error);
    throw error;
  }

  if (unit_id && current.billing_item_id) {
    await supabase
      .from('billing_items')
      .update({ unit_id, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', current.billing_item_id);
  }

  return data;
}

/**
 * Mengambil daftar pengeluaran kas tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} filters - { category, month }
 */
export async function fetchTenantExpenses(tenantId, filters = {}) {
  if (!tenantId) return [];

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.mockExpenses || [];
  }

  let query = supabase
    .from('expenses')
    .select('id, tenant_id, category, amount, description, receipt_url, recorded_by, metadata, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] fetchTenantExpenses error:', error);
    throw error;
  }

  return (data || []).map((exp) => {
    const meta = exp.metadata || {};
    const date = meta.date || (exp.created_at ? exp.created_at.substring(0, 10) : '');
    const receiptFile = exp.receipt_url ? exp.receipt_url.split('/').pop().split('?')[0] : '';
    return {
      ...exp,
      amount: Number(exp.amount || 0),
      date,
      expense_date: date,
      receipt_file_url: exp.receipt_url || '',
      file_url: exp.receipt_url || '',
      receipt_file: receiptFile,
    };
  });
}

/**
 * Mencatat pengeluaran baru untuk tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - { date, category, amount, description, file, recordedBy }
 */
export async function createTenantExpense(tenantId, { date, category, amount, description, file, recordedBy } = {}) {
  if (!tenantId) throw new Error('Tenant ID wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.addExpense({
      date,
      category,
      amount,
      description,
      receipt_file: file ? file.name : null,
    });
  }

  const expenseDate = date || new Date().toISOString().substring(0, 10);
  const payload = {
    tenant_id: tenantId,
    category: category || 'Lain-lain',
    amount: Number(amount || 0),
    description: description ? description.trim() : null,
    receipt_url: file ? file.name : null,
    recorded_by: recordedBy || null,
    metadata: {
      date: expenseDate,
      file_name: file ? file.name : null,
    },
    created_at: new Date(expenseDate).toISOString(),
  };

  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] createTenantExpense error:', error);
    throw error;
  }

  return data;
}

/**
 * Memperbarui pengeluaran tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} expenseId - UUID expense
 * @param {object} param2 - { date, category, amount, description, file }
 */
export async function updateTenantExpense(tenantId, expenseId, { date, category, amount, description, file } = {}) {
  if (!tenantId || !expenseId) throw new Error('tenantId dan expenseId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.updateExpense(expenseId, {
      date,
      category,
      amount,
      description,
      receipt_file: file ? file.name : null,
    });
  }

  const updateFields = {
    updated_at: new Date().toISOString(),
  };
  if (category) updateFields.category = category;
  if (amount !== undefined && amount !== '') updateFields.amount = Number(amount);
  if (description !== undefined) updateFields.description = description ? description.trim() : null;
  if (file) updateFields.receipt_url = file.name;

  if (date) {
    updateFields.metadata = { date };
    updateFields.created_at = new Date(date).toISOString();
  }

  const { data, error } = await supabase
    .from('expenses')
    .update(updateFields)
    .eq('tenant_id', tenantId)
    .eq('id', expenseId)
    .select()
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] updateTenantExpense error:', error);
    throw error;
  }

  return data;
}

/**
 * Menghapus pengeluaran tenant
 * @param {string} tenantId - UUID tenant
 * @param {string} expenseId - UUID expense
 */
export async function deleteTenantExpense(tenantId, expenseId) {
  if (!tenantId || !expenseId) throw new Error('tenantId dan expenseId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return mock.deleteExpense(expenseId);
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', expenseId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[tenantOperationalService] deleteTenantExpense error:', error);
    throw error;
  }

  return { success: true, id: expenseId };
}

/**
 * Mengambil ringkasan laporan keuangan bulanan tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - { year, month }
 */
export async function fetchTenantMonthlyFinance(tenantId, { year, month }) {
  if (!tenantId) throw new Error('tenantId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const baseReport = mock.computeReport(period);
    const expenses = mock.getExpensesForPeriod(period);
    const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalIncome = Number(baseReport?.totalCollected || 0);
    return {
      report: {
        ...baseReport,
        total_income: totalIncome,
        total_expense: totalExpense,
        net_income: totalIncome - totalExpense,
        cash_inflow: totalIncome,
        cash_outflow: totalExpense,
        balance: totalIncome - totalExpense,
      },
      expenses,
      cashPayments: mock.getPaymentsByMonth(year, month),
    };
  }

  const periodStr = `${year}-${String(month).padStart(2, '0')}`;

  // 1. Ambil seluruh payment completed/verified pada tenant ini
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      method,
      status,
      paid_at,
      created_at,
      billing_items:billing_item_id (
        id,
        period,
        unit_id
      )
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['completed', 'verified']);

  // Filter payments untuk bulan yang bersangkutan
  const monthlyPayments = (payments || []).filter((p) => {
    const billPeriod = p.billing_items?.period;
    const paidMonth = (p.paid_at || p.created_at || '').substring(0, 7);
    return billPeriod === periodStr || paidMonth === periodStr;
  });

  const totalIncome = monthlyPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // 2. Ambil expenses pada bulan yang bersangkutan
  const allExpenses = await fetchTenantExpenses(tenantId);
  const monthlyExpenses = allExpenses.filter((e) => {
    const expDate = e.date || e.expense_date || (e.created_at ? e.created_at.substring(0, 7) : '');
    return expDate.startsWith(periodStr);
  });

  const totalExpense = monthlyExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const netIncome = totalIncome - totalExpense;

  return {
    report: {
      period: periodStr,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_income: netIncome,
      cash_inflow: totalIncome,
      cash_outflow: totalExpense,
      balance: netIncome,
    },
    expenses: monthlyExpenses,
    cashPayments: monthlyPayments,
  };
}

/**
 * Mengambil saldo kas berjalan tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} param1 - { year, month }
 */
export async function fetchTenantRunningBalance(tenantId, { year, month }) {
  if (!tenantId) throw new Error('tenantId wajib disertakan.');

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');
  if (isDemoOrMock) {
    const mock = await import('./mockData');
    return { chain: mock.computeRunningBalance(year, month) };
  }

  // Sederhanakan kalkulasi chain bulanan dari data tenant
  const monthly = await fetchTenantMonthlyFinance(tenantId, { year, month });
  const currentNet = monthly.report?.net_income || 0;

  return {
    chain: [
      {
        month: Number(month),
        year: Number(year),
        period: `${year}-${String(month).padStart(2, '0')}`,
        income: monthly.report?.total_income || 0,
        totalIncome: monthly.report?.total_income || 0,
        expense: monthly.report?.total_expense || 0,
        totalExpense: monthly.report?.total_expense || 0,
        balance: currentNet,
        closingBalance: currentNet,
        openingBalance: 0,
      },
    ],
  };
}

/**
 * Mengambil ringkasan data operasional & dashboard tenant
 * @param {string} tenantId - UUID tenant
 * @param {object} options - { role, period } ('YYYY-MM')
 */
export async function fetchTenantDashboardData(tenantId, { role = 'admin', period } = {}) {
  if (!tenantId) throw new Error('tenantId wajib disertakan.');

  const resolvedPeriod = period || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = resolvedPeriod.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;

  const isDemoOrMock = IS_DEMO || String(tenantId).startsWith('demo-');

  if (isDemoOrMock) {
    const [units, members, pendingMembers, pendingPayments, monthlyFinance, billMatrix] = await Promise.all([
      fetchTenantUnits(tenantId),
      fetchTenantMembers(tenantId),
      fetchPendingTenantMembers(tenantId),
      fetchTenantPayments(tenantId, { status: 'pending' }),
      fetchTenantMonthlyFinance(tenantId, { year, month }),
      fetchTenantBillMatrix(tenantId, year),
    ]);

    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.status === 'active' || u.is_occupied).length;
    const vacantUnits = totalUnits - occupiedUnits;

    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let billCount = 0;

    (billMatrix || []).forEach((row) => {
      const targetCell = row.cells?.find((c) => c?.bill?.period === resolvedPeriod) || row.cells?.[0];
      if (targetCell?.bill) {
        billCount++;
        const amt = Number(targetCell.bill.amount || 0);
        totalBilled += amt;
        if (targetCell.status === 'paid' || targetCell.bill.status === 'paid') {
          totalCollected += amt;
        } else {
          totalOutstanding += amt;
        }
      }
    });

    if (billCount === 0 && totalUnits > 0) {
      billCount = totalUnits;
    }

    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

    return {
      period: resolvedPeriod,
      year,
      month,
      pendingRegistrationCount: pendingMembers.length,
      pendingPaymentCount: pendingPayments.length,
      units: {
        total: totalUnits,
        occupied: occupiedUnits,
        vacant: vacantUnits,
      },
      members: {
        total: members.length,
      },
      finance: {
        totalIncome: monthlyFinance.report?.total_income || 0,
        totalExpense: monthlyFinance.report?.total_expense || 0,
        netCashflow: monthlyFinance.report?.net_income || 0,
      },
      billing: {
        totalBilled,
        totalCollected,
        totalOutstanding,
        billCount,
        collectionRate,
      },
      recentPayments: pendingPayments.slice(0, 5),
    };
  }

  // Production Mode dengan Supabase
  const [units, members, pendingMembers, pendingPayments, monthlyFinance, billMatrix] = await Promise.all([
    fetchTenantUnits(tenantId).catch(() => []),
    fetchTenantMembers(tenantId).catch(() => []),
    fetchPendingTenantMembers(tenantId).catch(() => []),
    fetchTenantPayments(tenantId, { status: 'pending' }).catch(() => []),
    fetchTenantMonthlyFinance(tenantId, { year, month }).catch(() => ({ report: {} })),
    fetchTenantBillMatrix(tenantId, year).catch(() => []),
  ]);

  const totalUnits = units.length;
  const occupiedUnits = units.filter((u) => u.status === 'active').length;
  const vacantUnits = totalUnits - occupiedUnits;

  let totalBilled = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let billCount = 0;

  (billMatrix || []).forEach((row) => {
    const targetCell = row.cells?.find((c) => c?.bill?.period === resolvedPeriod) || row.cells?.[0];
    if (targetCell?.bill) {
      billCount++;
      const amt = Number(targetCell.bill.amount || 0);
      totalBilled += amt;
      if (targetCell.status === 'paid' || targetCell.bill.status === 'paid') {
        totalCollected += amt;
      } else {
        totalOutstanding += amt;
      }
    }
  });

  if (billCount === 0 && totalUnits > 0) {
    billCount = totalUnits;
  }

  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  return {
    period: resolvedPeriod,
    year,
    month,
    pendingRegistrationCount: pendingMembers.length,
    pendingPaymentCount: pendingPayments.length,
    units: {
      total: totalUnits,
      occupied: occupiedUnits,
      vacant: vacantUnits,
    },
    members: {
      total: members.length,
    },
    finance: {
      totalIncome: monthlyFinance.report?.total_income || 0,
      totalExpense: monthlyFinance.report?.total_expense || 0,
      netCashflow: monthlyFinance.report?.net_income || 0,
    },
    billing: {
      totalBilled,
      totalCollected,
      totalOutstanding,
      billCount,
      collectionRate,
    },
    recentPayments: pendingPayments.slice(0, 5),
  };
}

