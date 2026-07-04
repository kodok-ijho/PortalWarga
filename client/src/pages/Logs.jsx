import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  mockLogSettings,
  mockLoginLogs,
  mockAccessLogs,
  mockTransactionLogs,
  formatDate,
  formatRupiah,
  isAdminRole,
} from '../services/mockData';

export default function Logs() {
  const { role } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('login');
  const [search, setSearch] = useState('');
  
  // Toggles state
  const [loginEnabled, setLoginEnabled] = useState(mockLogSettings.loginLogEnabled);
  const [accessEnabled, setAccessEnabled] = useState(mockLogSettings.accessLogEnabled);
  const [transactionEnabled, setTransactionEnabled] = useState(mockLogSettings.transactionLogEnabled);

  // Guard: Admin-only
  if (!isAdminRole(role)) {
    return <Navigate to="/" replace />;
  }

  // Handle setting toggles
  const handleToggle = (type) => {
    if (type === 'login') {
      mockLogSettings.loginLogEnabled = !loginEnabled;
      setLoginEnabled(!loginEnabled);
      toast.success(`Log Login berhasil ${!loginEnabled ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } else if (type === 'access') {
      mockLogSettings.accessLogEnabled = !accessEnabled;
      setAccessEnabled(!accessEnabled);
      toast.success(`Log Akses berhasil ${!accessEnabled ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } else if (type === 'transaction') {
      mockLogSettings.transactionLogEnabled = !transactionEnabled;
      setTransactionEnabled(!transactionEnabled);
      toast.success(`Log Transaksi berhasil ${!transactionEnabled ? 'diaktifkan' : 'dinonaktifkan'}.`);
    }
  };

  // Filtered lists
  const filteredLoginLogs = mockLoginLogs.filter((l) => {
    if (!loginEnabled) return false;
    return l.email?.toLowerCase().includes(search.toLowerCase()) || l.ip?.includes(search);
  });

  const filteredAccessLogs = mockAccessLogs.filter((a) => {
    if (!accessEnabled) return false;
    return a.userName?.toLowerCase().includes(search.toLowerCase()) || a.page?.toLowerCase().includes(search.toLowerCase());
  });

  const filteredTransactionLogs = mockTransactionLogs.filter((t) => {
    if (!transactionEnabled) return false;
    return (
      t.userName?.toLowerCase().includes(search.toLowerCase()) ||
      t.action?.toLowerCase().includes(search.toLowerCase()) ||
      t.details?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-forest-900">Sistem Log Keamanan &amp; Akses</h2>
        <p className="text-sm text-forest-500">
          Pantau riwayat login, akses halaman, dan transaksi keuangan warga komplek.
        </p>
      </div>

      {/* Log Settings Card */}
      <div className="pv-card p-4 bg-forest-50/30 border border-forest-100 space-y-3">
        <h3 className="text-xs font-bold text-forest-800 uppercase tracking-wider">Konfigurasi Logging</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Toggle Login */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-forest-100 shadow-sm">
            <div>
              <p className="text-xs font-semibold text-forest-800">Log Aktivitas Login</p>
              <p className="text-[10px] text-forest-500">Catat login berhasil/gagal</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={loginEnabled}
                onChange={() => handleToggle('login')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-forest-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-500"></div>
            </label>
          </div>

          {/* Toggle Access */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-forest-100 shadow-sm">
            <div>
              <p className="text-xs font-semibold text-forest-800">Log Akses Halaman</p>
              <p className="text-[10px] text-forest-500">Catat navigasi menu admin/warga</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={accessEnabled}
                onChange={() => handleToggle('access')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-forest-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-500"></div>
            </label>
          </div>

          {/* Toggle Transaction */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-forest-100 shadow-sm">
            <div>
              <p className="text-xs font-semibold text-forest-800">Log Transaksi Keuangan</p>
              <p className="text-[10px] text-forest-500">Catat pembayaran &amp; pengeluaran</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={transactionEnabled}
                onChange={() => handleToggle('transaction')}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-forest-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-500"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
        <div className="flex border-b border-forest-100 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('login'); setSearch(''); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'login'
                ? 'border-gold-500 text-gold-600 font-semibold'
                : 'border-transparent text-forest-500 hover:text-forest-800'
            }`}
          >
            🔒 Log Login
          </button>
          <button
            onClick={() => { setActiveTab('access'); setSearch(''); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'access'
                ? 'border-gold-500 text-gold-600 font-semibold'
                : 'border-transparent text-forest-500 hover:text-forest-800'
            }`}
          >
            🧭 Log Akses
          </button>
          <button
            onClick={() => { setActiveTab('transaction'); setSearch(''); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'transaction'
                ? 'border-gold-500 text-gold-600 font-semibold'
                : 'border-transparent text-forest-500 hover:text-forest-800'
            }`}
          >
            💸 Log Transaksi
          </button>
        </div>
        <input
          type="text"
          placeholder="Cari kata kunci log..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pv-input text-sm md:w-64"
        />
      </div>

      {/* Table Card */}
      <div className="pv-card overflow-hidden">
        {/* Tab 1: Log Login */}
        {activeTab === 'login' && (
          <div>
            {!loginEnabled ? (
              <p className="text-sm text-forest-400 text-center py-10">Log Aktivitas Login sedang dinonaktifkan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forest-100 bg-forest-50/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Waktu</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Email</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-forest-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Alamat IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest-100">
                    {filteredLoginLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-forest-400">Tidak ada log login.</td>
                      </tr>
                    ) : (
                      filteredLoginLogs.map((l) => (
                        <tr key={l.id} className="hover:bg-forest-50/50">
                          <td className="px-4 py-3 text-forest-500 text-xs whitespace-nowrap">{formatDate(l.timestamp)}</td>
                          <td className="px-4 py-3 font-medium text-forest-900">{l.email}</td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                              l.status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {l.status === 'success' ? 'Berhasil' : 'Gagal'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-forest-600 font-mono text-xs">{l.ip}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Log Akses */}
        {activeTab === 'access' && (
          <div>
            {!accessEnabled ? (
              <p className="text-sm text-forest-400 text-center py-10">Log Akses Halaman sedang dinonaktifkan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forest-100 bg-forest-50/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Waktu</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Pengguna</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Halaman yang Diakses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest-100">
                    {filteredAccessLogs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-forest-400">Tidak ada log akses halaman.</td>
                      </tr>
                    ) : (
                      filteredAccessLogs.map((a) => (
                        <tr key={a.id} className="hover:bg-forest-50/50">
                          <td className="px-4 py-3 text-forest-500 text-xs whitespace-nowrap">{formatDate(a.timestamp)}</td>
                          <td className="px-4 py-3 font-semibold text-forest-900">{a.userName}</td>
                          <td className="px-4 py-3 text-forest-700 font-mono text-xs">{a.page}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Log Transaksi */}
        {activeTab === 'transaction' && (
          <div>
            {!transactionEnabled ? (
              <p className="text-sm text-forest-400 text-center py-10">Log Transaksi Keuangan sedang dinonaktifkan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forest-100 bg-forest-50/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Waktu</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Pengguna</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Aksi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Rincian</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-forest-600 uppercase">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest-100">
                    {filteredTransactionLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-forest-400">Tidak ada log transaksi.</td>
                      </tr>
                    ) : (
                      filteredTransactionLogs.map((t) => (
                        <tr key={t.id} className="hover:bg-forest-50/50">
                          <td className="px-4 py-3 text-forest-500 text-xs whitespace-nowrap">{formatDate(t.timestamp)}</td>
                          <td className="px-4 py-3 font-semibold text-forest-900 whitespace-nowrap">{t.userName}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold leading-none ${
                              t.action.includes('Lunas') || t.action.includes('Bayar') || t.action.includes('Catat Pembayaran')
                                ? 'bg-emerald-50 text-emerald-700'
                                : t.action.includes('Pengaturan')
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-red-50 text-red-700'
                            }`}>
                              {t.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-forest-700">{t.details}</td>
                          <td className="px-4 py-3 text-right font-semibold text-forest-950 whitespace-nowrap">
                            {t.amount ? formatRupiah(t.amount) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
