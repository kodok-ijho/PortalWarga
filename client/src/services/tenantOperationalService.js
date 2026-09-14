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

  if (IS_DEMO) {
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

  if (IS_DEMO) {
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

  if (IS_DEMO) {
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

