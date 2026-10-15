import React, { Component } from 'react';
import { AiOutlineWarning, AiOutlineReload, AiOutlineHome } from 'react-icons/ai';

/**
 * ErrorBoundary - Pelindung aplikasi dari crash rendering tidak terduga.
 * Mengusung tema Palm Village (forest & gold) dengan tampilan mobile-friendly,
 * pesan yang ramah non-teknis, serta tombol pemulihan cepat.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Catat log error ke console tanpa membeberkan kredensial rahasia
    console.error('[PortalWarga ErrorBoundary] Tertangkap error render:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    window.location.href = '/';
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({
            error: this.state.error,
            resetErrorBoundary: this.handleReset,
          });
        }
        return this.props.fallback;
      }

      return (
        <div className="min-h-[70vh] flex items-center justify-center p-4 bg-forest-50/50">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-forest-100 shadow-elevated p-6 sm:p-8 text-center animate-fadeIn">
            {/* Header Brand & Ikon Peringatan */}
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gold-50 border border-gold-300/60 flex items-center justify-center shadow-inner">
                  <AiOutlineWarning className="text-3xl text-gold-600" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-forest-800 border-2 border-white flex items-center justify-center">
                  <img src="/logo.png" alt="Logo" className="w-4 h-4 rounded-full object-cover" />
                </div>
              </div>
            </div>

            {/* Judul & Pesan Ramah Non-Teknis */}
            <h2 className="text-xl sm:text-2xl font-bold text-forest-900 font-display">
              Terjadi Kendala Memuat Halaman
            </h2>
            <p className="mt-2 text-sm text-forest-600 leading-relaxed max-w-md mx-auto">
              Mohon maaf atas ketidaknyamanan ini. Terjadi kendala teknis saat memproses tampilan. 
              <span className="font-medium text-forest-800 block mt-1">
                Data warga dan akun Anda tetap tersimpan dengan aman.
              </span>
            </p>

            {/* Tombol Aksi Pemulihan */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gold-500 hover:bg-gold-400 text-forest-950 font-bold px-5 py-2.5 text-sm transition-all shadow-md shadow-gold-500/20 active:scale-95"
              >
                <AiOutlineReload className="text-base" />
                <span>Coba Lagi</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-forest-200 hover:bg-forest-100/80 text-forest-800 font-semibold px-5 py-2.5 text-sm transition-all active:scale-95"
              >
                <AiOutlineHome className="text-base" />
                <span>Kembali ke Beranda</span>
              </button>
            </div>

            {/* Detail Teknis (Opsional & Collapsible agar tidak menakuti warga) */}
            {this.state.error && (
              <div className="mt-6 pt-4 border-t border-forest-100 text-left">
                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="text-[11px] font-semibold text-forest-500 hover:text-forest-700 underline focus:outline-none"
                >
                  {this.state.showDetails ? 'Sembunyikan Informasi Teknis' : 'Tampilkan Informasi Teknis'}
                </button>

                {this.state.showDetails && (
                  <div className="mt-2 p-3 rounded-lg bg-forest-900 text-forest-200 text-xs font-mono overflow-x-auto max-h-40 leading-tight">
                    <p className="font-bold text-gold-400 mb-1">
                      {this.state.error.name}: {this.state.error.message}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="text-[10px] text-forest-300 whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
