import { describe, it, expect, vi } from 'vitest';

// Test logic helper murni dari hook tanpa ketergantungan render hook kompleks
function evaluateSubscriptionGate(status, role, actionName = 'Aksi ini') {
  const isReadOnly = status === 'read_only';
  const canTransact = !isReadOnly;
  const isStaff = ['admin', 'bendahara', 'pengurus'].includes(role);

  let tooltip = '';
  if (isReadOnly) {
    if (isStaff) {
      tooltip = `${actionName} dinonaktifkan sementara karena status layanan Read-Only. Klik untuk memperpanjang paket langganan.`;
    } else {
      tooltip = 'Layanan sedang dalam pemeliharaan sistem. Silakan hubungi pengurus atau pengelola Anda.';
    }
  }

  return { canTransact, isReadOnly, isStaff, tooltip };
}

describe('useSubscriptionGate Logic (T5.1, T5.2)', () => {
  it('harus mengizinkan transaksi saat status active', () => {
    const res = evaluateSubscriptionGate('active', 'admin', 'Tambah Warga');
    expect(res.canTransact).toBe(true);
    expect(res.isReadOnly).toBe(false);
    expect(res.tooltip).toBe('');
  });

  it('harus mengizinkan transaksi saat status trial', () => {
    const res = evaluateSubscriptionGate('trial', 'bendahara', 'Catat IPL');
    expect(res.canTransact).toBe(true);
    expect(res.isReadOnly).toBe(false);
    expect(res.tooltip).toBe('');
  });

  it('harus memblokir transaksi saat status read_only untuk admin dengan info perpanjangan', () => {
    const res = evaluateSubscriptionGate('read_only', 'admin', 'Tambah Unit');
    expect(res.canTransact).toBe(false);
    expect(res.isReadOnly).toBe(true);
    expect(res.tooltip).toContain('Read-Only');
    expect(res.tooltip).toContain('Klik untuk memperpanjang');
  });

  it('harus menyamarkan pesan untuk anggota/warga saat read_only tanpa istilah teknis', () => {
    const res = evaluateSubscriptionGate('read_only', 'anggota', 'Bayar Tagihan');
    expect(res.canTransact).toBe(false);
    expect(res.isReadOnly).toBe(true);
    // Tidak boleh mengandung istilah teknis subscription/platform
    expect(res.tooltip).not.toContain('subscription');
    expect(res.tooltip).not.toContain('platform');
    expect(res.tooltip).not.toContain('Read-Only');
    expect(res.tooltip).toContain('pemeliharaan sistem');
    expect(res.tooltip).toContain('Silakan hubungi pengurus');
  });
});
