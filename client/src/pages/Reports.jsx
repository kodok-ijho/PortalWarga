import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell as PieCell, Legend,
  AreaChart, Area
} from 'recharts';
import { AiOutlinePrinter, AiOutlineDownload } from 'react-icons/ai';
import Papa from 'papaparse';
import { useAuth, IS_DEMO_MODE } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Placeholder from '../components/Placeholder';
import {
  computeReport,
  getAvailableYears,
  getBillsForYear,
  getExpensesForPeriod,
  getPaymentsByMonth,
  MONTHS_LONG,
  formatRupiah,
  formatDate,
  billStatusLabel,
  hasMinRole,
  computeRunningBalance,
  getMonthBalance
} from '../services/mockData';

const PIE_COLORS = ['#1a3d2e', '#d4af37', '#e2c462'];

export default function Reports() {
  const { role } = useAuth();
  const toast = useToast();

  const years = getAvailableYears();
  const [year, setYear] = useState(years[0] || new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const period = `${year}-${String(month).padStart(2, '0')}`;
  const report = useMemo(() => computeReport(period), [period]);
  const expenses = useMemo(() => getExpensesForPeriod(period), [period]);
  
  // Running Balance dan Rincian untuk bulan terpilih
  const monthlyBalance = useMemo(() => getMonthBalance(year, month), [year, month]);
  const totalCashIn = monthlyBalance.totalIncome;
  const totalExpenses = monthlyBalance.totalExpense;
  const netBalance = totalCashIn - totalExpenses;
  const openingBalance = monthlyBalance.openingBalance;
  const closingBalance = monthlyBalance.closingBalance;

  // Laporan B: kas masuk IPL berdasarkan TANGGAL PEMBAYARAN
  const cashPayments = useMemo(() => getPaymentsByMonth(year, month), [year, month]);

  // Seluruh run untuk grafik tren dan tabel kumulatif (dari Jan 2025 sampai bulan terpilih)
  const runningChain = useMemo(() => computeRunningBalance(year, month), [year, month]);

  // Data tren untuk AreaChart
  const trenData = useMemo(() => {
    return runningChain.map((item) => {
      const [y, m] = item.period.split('-');
      const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return {
        name: `${monthsShort[parseInt(m) - 1]} ${y.substring(2)}`,
        Pemasukan: item.totalIncome,
        Pengeluaran: item.totalExpense,
        Saldo: item.closingBalance,
      };
    });
  }, [runningChain]);

  // Data untuk bar chart per blok
  const blockData = report.byBlock.map((b) => ({
    name: `Blok ${b.block}`,
    Terkumpul: b.collected,
    Tunggakan: b.billed - b.collected,
  }));

  // Data untuk pie chart lunas/belum
  const pieData = [
    { name: 'Lunas', value: report.paidCount, color: '#1a3d2e' },
    { name: 'Belum/Tunggakan', value: report.billCount - report.paidCount, color: '#d4af37' },
  ];

  // Daftar bulan yang ada data-nya di tahun terpilih
  const availableMonths = useMemo(() => {
    const set = new Set(
      getBillsForYear(year).map((b) => parseInt(b.period.split('-')[1], 10))
    );
    return [...set].sort((a, b) => a - b);
  }, [year]);

  // Staff-only (pengurus, bendahara, admin)
  if (!hasMinRole(role, 'pengurus')) {
    return <Navigate to="/" replace />;
  }

  const handleExportCSV = () => {
    const header = ['Unit', 'Blok', 'Penghuni', 'Jumlah', 'Status', 'Tanggal Bayar'];
    const rows = report.details.map((d) => [
      d.unitNumber, d.block, d.residentName, d.amount, billStatusLabel(d.status), d.paidAt ? formatDate(d.paidAt) : '-',
    ]);
    const csv = Papa.unparse({
      fields: header,
      data: [
        ...rows,
        [],
        ['Ringkasan', '', '', '', '', ''],
        ['Total Tagihan', '', '', '', '', report.totalBilled],
        ['Total Terkumpul', '', '', '', '', report.totalCollected],
        ['Tunggakan', '', '', '', '', report.totalOutstanding],
        ['% Koleksi', '', '', '', '', report.collectionRate.toFixed(1) + '%'],
      ],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan_ipl_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan CSV berhasil di-export.');
  };

  const handlePrint = () => {
    toast.info('Membuka dialog print/PDF...');
    setTimeout(() => window.print(), 300);
  };

  if (!IS_DEMO_MODE) {
    return (
      <Placeholder
        title="Laporan Keuangan IPL"
        description="Hubungkan ke Supabase untuk melihat laporan keuangan real."
        phase="Phase 1 — MVP"
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header & filter */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-forest-900">Laporan Keuangan IPL</h2>
          <p className="text-sm text-forest-500">
            Periode: {MONTHS_LONG[month - 1]} {year}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="pv-input w-auto text-sm"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{MONTHS_LONG[m - 1]}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="pv-input w-auto text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={handlePrint} className="pv-btn-ghost text-xs">
            <AiOutlinePrinter /> PDF
          </button>
          <button onClick={handleExportCSV} className="pv-btn-ghost text-xs">
            <AiOutlineDownload /> CSV
          </button>
        </div>
      </div>

      {report.billCount === 0 ? (
        <div className="pv-card p-10 text-center text-forest-400 text-sm">
          Tidak ada data tagihan untuk periode {MONTHS_LONG[month - 1]} {year}.
        </div>
      ) : (
        <>
          {/* Section A: Alur Kas (Running Balance) */}
          <div>
            <h3 className="text-xs font-bold text-forest-600 uppercase tracking-wider mb-2">Alur Kas (Running Balance)</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard label="Saldo Awal Kas" value={formatRupiah(openingBalance)} icon="🏦" color="bg-gold-50 text-gold-700 border border-gold-200" />
              <SummaryCard label="Pemasukan IPL" value={`+ ${formatRupiah(totalCashIn)}`} icon="💰" color="bg-emerald-50 text-emerald-700 border border-emerald-200" />
              <SummaryCard label="Pengeluaran Kas" value={`- ${formatRupiah(totalExpenses)}`} icon="💸" color="bg-red-50 text-red-700 border border-red-200" />
              <SummaryCard label="Saldo Akhir Kas" value={formatRupiah(closingBalance)} icon="📈" color="bg-forest-800 text-gold-400" />
            </div>
          </div>

          {/* Section B: Kinerja Tagihan IPL (Koleksi) */}
          <div>
            <h3 className="text-xs font-bold text-forest-600 uppercase tracking-wider mb-2">Koleksi Tagihan Bulanan</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard label="Total Tagihan" value={formatRupiah(report.totalBilled)} icon="📋" color="bg-forest-100 text-forest-800 border border-forest-200" />
              <SummaryCard label="Terkumpul" value={formatRupiah(report.totalCollected)} icon="✅" color="bg-emerald-50 text-emerald-700 border border-emerald-200" />
              <SummaryCard label="Tunggakan" value={formatRupiah(report.totalOutstanding)} icon="⏳" color="bg-amber-50 text-amber-700 border border-amber-200" />
              <SummaryCard label="% Koleksi" value={`${report.collectionRate.toFixed(1)}%`} icon="📊" color="bg-blue-50 text-blue-700 border border-blue-200" />
            </div>
          </div>

          {/* Grafik Tren Running Balance */}
          <div className="pv-card p-5">
            <h3 className="text-sm font-semibold text-forest-800 mb-4">
              Tren Arus Kas & Saldo Kumulatif (Sejak Jan 2025)
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={trenData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d4af37" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#dde9e2" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#3d6e51' }} />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#3d6e51' }} 
                  tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip 
                  formatter={(v) => formatRupiah(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #dde9e2' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Pemasukan" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="Pengeluaran" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpense)" />
                <Area type="monotone" dataKey="Saldo" stroke="#d4af37" fillOpacity={1} fill="url(#colorBalance)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Grafik Kinerja Lainnya */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bar chart per blok */}
            <div className="pv-card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-forest-800 mb-4">
                Koleksi Tagihan per Blok
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={blockData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dde9e2" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#3d6e51' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#3d6e51' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <Tooltip
                    formatter={(v) => formatRupiah(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #dde9e2' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Terkumpul" fill="#1a3d2e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Tunggakan" fill="#d4af37" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart lunas/belum */}
            <div className="pv-card p-5">
              <h3 className="text-sm font-semibold text-forest-800 mb-4">
                Status Pembayaran Tagihan
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ value }) => value}
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => (
                      <PieCell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [`${v} tagihan`, n]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabel Histori Running Balance Kumulatif */}
          <div className="pv-card overflow-hidden">
            <div className="px-5 py-3 border-b border-forest-100 bg-forest-50">
              <h3 className="text-sm font-semibold text-forest-800">
                Histori Running Balance (Sejak Januari 2025)
              </h3>
              <p className="text-[11px] text-forest-500 mt-0.5">
                Perkembangan saldo kas dari bulan ke bulan secara runut. Saldo Akhir otomatis bergulir menjadi Saldo Awal bulan berikutnya.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-forest-100 bg-white">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Periode</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-forest-600 uppercase">Saldo Awal</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-forest-600 uppercase">Pemasukan (+)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-forest-600 uppercase">Pengeluaran (-)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-forest-600 uppercase">Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-forest-100">
                  {runningChain.map((item) => {
                    const isSelectedMonth = item.year === year && item.month === month;
                    return (
                      <tr 
                        key={item.period} 
                        className={`hover:bg-forest-50 transition-colors ${isSelectedMonth ? 'bg-gold-50/50 font-semibold' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-forest-700 whitespace-nowrap">
                          {formatPeriodLabel(item.period)}
                          {isSelectedMonth && (
                            <span className="ml-2 pv-badge bg-gold-500 text-forest-900 text-[9px]">Bulan Ini</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-forest-600 whitespace-nowrap">
                          {formatRupiah(item.openingBalance)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 whitespace-nowrap">
                          + {formatRupiah(item.totalIncome)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-red-600 whitespace-nowrap">
                          - {formatRupiah(item.totalExpense)}
                        </td>
                        <td className={`px-4 py-2.5 text-right whitespace-nowrap ${item.closingBalance >= 0 ? 'text-forest-900' : 'text-red-700 font-bold'}`}>
                          {formatRupiah(item.closingBalance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Laporan B: Kas Masuk IPL (basis tanggal pembayaran) ── */}
          <div className="pv-card overflow-hidden">
            <div className="px-5 py-3 border-b border-forest-100 bg-forest-50">
              <h3 className="text-sm font-semibold text-forest-800">
                Rincian Kas Masuk IPL — {MONTHS_LONG[month - 1]} {year}
              </h3>
              <p className="text-[11px] text-forest-500 mt-0.5">
                Berdasarkan tanggal pembayaran, tanpa memandang periode tagihan IPL yang dilunasi.
              </p>
            </div>
            {cashPayments.length === 0 ? (
              <div className="p-10 text-center text-forest-400 text-sm">
                Belum ada pembayaran yang tercatat pada {MONTHS_LONG[month - 1]} {year}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forest-100 bg-white">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Tgl Bayar</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Penghuni</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-forest-600 uppercase">Periode IPL</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-forest-600 uppercase">Jumlah</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-forest-600 uppercase">Metode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest-100">
                    {cashPayments.map((p) => (
                      <tr key={p.paymentId} className="hover:bg-forest-50">
                        <td className="px-4 py-2.5 text-forest-600 text-xs whitespace-nowrap">
                          {formatDate(p.paidAt)}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-forest-900 whitespace-nowrap">
                          {p.block}/{p.unitNumber}
                        </td>
                        <td className="px-4 py-2.5 text-forest-700">{p.residentName}</td>
                        <td className="px-4 py-2.5 text-forest-600">{formatPeriodLabel(p.period)}</td>
                        <td className="px-4 py-2.5 text-right text-forest-700 whitespace-nowrap">
                          {formatRupiah(p.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`pv-badge ${methodBadgeColor(p.method)}`}>
                            {methodLabel(p.method)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-forest-200 bg-forest-50 font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-forest-800">TOTAL KAS MASUK</td>
                      <td className="px-4 py-3 text-right text-forest-900">{formatRupiah(totalCashIn)}</td>
                      <td className="px-4 py-3 text-center text-forest-400 text-[11px] font-normal">
                        {cashPayments.length} transaksi
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Section Pengeluaran ── */}
          <div className="pv-card p-5">
            <h3 className="text-sm font-semibold text-forest-800 mb-4">
              Rincian Pengeluaran Kas — {MONTHS_LONG[month - 1]} {year}
            </h3>
            {expenses.length === 0 ? (
              <p className="text-sm text-forest-400 text-center py-6">
                Tidak ada pengeluaran tercatat pada periode ini.
              </p>
            ) : (
              <div className="space-y-2">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-start justify-between gap-3 py-2 border-b border-forest-50 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="pv-badge bg-forest-50 text-forest-600">{exp.category}</span>
                        <span className="text-[11px] text-forest-400">{formatDate(exp.date)}</span>
                      </div>
                      <p className="text-xs text-forest-600 mt-1 line-clamp-2">{exp.description}</p>
                    </div>
                    <span className="font-medium text-red-600 text-sm shrink-0">
                      − {formatRupiah(exp.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Neraca: Pemasukan vs Pengeluaran ── */}
          <div className="pv-card overflow-hidden">
            <div className="px-5 py-3 border-b border-forest-100 bg-forest-800">
              <h3 className="text-sm font-semibold text-gold-400">
                Neraca Arus Kas — {MONTHS_LONG[month - 1]} {year}
              </h3>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-forest-50">
                <span className="text-forest-600 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                  Saldo Awal Bulan (Carry-forward)
                </span>
                <span className="font-semibold text-forest-800">{formatRupiah(openingBalance)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-forest-50">
                <span className="text-forest-600 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  Pemasukan IPL Bulan Ini
                </span>
                <span className="font-semibold text-emerald-600">+ {formatRupiah(totalCashIn)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-forest-50">
                <span className="text-forest-600 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500"></span>
                  Pengeluaran Kas Bulan Ini
                </span>
                <span className="font-semibold text-red-600">− {formatRupiah(totalExpenses)}</span>
              </div>
              <div className="flex justify-between items-center py-3 mt-2 bg-forest-50 rounded-lg px-3">
                <span className="font-semibold text-forest-800">Saldo Akhir Bulan</span>
                <span className={`font-bold text-base ${closingBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatRupiah(closingBalance)}
                </span>
              </div>
              <p className="text-[11px] text-forest-400 pt-1">
                Laporan ini dihitung menggunakan basis kas masuk running balance (kumulatif), dimulai dari Januari 2025 (Saldo Awal Kas = Rp 15.000.000 dari peralihan pengurus sebelumnya).
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers untuk Laporan B (Kas Masuk IPL) ──────────────────────

/** Format "2026-01" → "Januari 2026" untuk kolom Periode IPL. */
function formatPeriodLabel(period) {
  if (!period || typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) return period || '-';
  const [y, m] = period.split('-');
  return `${MONTHS_LONG[parseInt(m, 10) - 1]} ${y}`;
}

/** Label metode pembayaran. */
function methodLabel(method) {
  switch (method) {
    case 'qris':
      return 'QRIS';
    case 'cash':
      return 'Tunai';
    case 'bank_transfer':
      return 'Transfer';
    default:
      return method || '-';
  }
}

/** Warna badge lembut per metode pembayaran. */
function methodBadgeColor(method) {
  switch (method) {
    case 'qris':
      return 'bg-forest-50 text-forest-700';
    case 'cash':
      return 'bg-gold-50 text-gold-700';
    case 'bank_transfer':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function SummaryCard({ label, value, icon, color }) {
  return (
    <div className={`no-print rounded-xl p-4 ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-lg font-bold mt-2">{value}</p>
      <p className="text-[11px] mt-0.5 opacity-80">{label}</p>
    </div>
  );
}
