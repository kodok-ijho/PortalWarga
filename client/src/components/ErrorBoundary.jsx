import React from 'react';

/**
 * ErrorBoundary — Menangkap error render React tak terduga dan mencegah layar putih (blank screen).
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled application render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.removeItem('pv_demo_session');
      localStorage.removeItem('pv_active_tenant_id');
    } catch (_e) {
      // ignore
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-forest-950 via-[#071f13] to-forest-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-forest-900/90 border border-gold-500/40 rounded-2xl p-6 md:p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-gold-400 border border-gold-500/30 flex items-center justify-center text-3xl mx-auto mb-4">
              ⚠️
            </div>
            <span className="text-[10px] font-bold tracking-widest text-gold-400 uppercase bg-gold-500/10 px-2.5 py-1 rounded-full border border-gold-500/30 inline-block mb-2">
              Terjadi Kendala Tampilan
            </span>
            <h1 className="text-xl font-bold text-white font-display mb-2">
              Halaman Mengalami Gangguan
            </h1>
            <p className="text-xs text-forest-200 leading-relaxed mb-6">
              Sistem mendeteksi kendala pada sesi peramban Anda. Silakan muat ulang halaman atau kembali ke beranda untuk melanjutkan.
            </p>

            {this.state.error?.message && (
              <div className="text-left bg-forest-950 p-3 rounded-xl border border-forest-800 text-[11px] text-rose-300 font-mono mb-6 overflow-x-auto">
                {String(this.state.error.message)}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-gold-500 to-amber-400 hover:from-gold-400 hover:to-amber-300 text-forest-950 font-bold text-xs transition-all shadow-lg"
              >
                Muat Ulang Halaman
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 rounded-xl bg-forest-800 hover:bg-forest-700 text-forest-200 text-xs transition-colors border border-forest-700"
              >
                Reset Sesi &amp; Kembali ke Beranda
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
