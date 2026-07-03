import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="pv-card p-12 text-center">
      <p className="text-6xl font-bold text-forest-200">404</p>
      <h2 className="mt-3 text-lg font-bold text-forest-900">Halaman Tidak Ditemukan</h2>
      <p className="mt-2 text-sm text-forest-500">Halaman yang Anda cari tidak tersedia.</p>
      <Link
        to="/"
        className="pv-btn-primary mt-6"
      >
        ← Kembali ke Beranda
      </Link>
    </div>
  );
}
