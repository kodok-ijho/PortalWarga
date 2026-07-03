import { IS_DEMO_MODE } from '../hooks/useAuth';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-forest-200 bg-forest-800">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="h-8 w-auto rounded object-cover ring-1 ring-gold-500/30" />
          <span className="text-sm text-forest-300 font-display">
            Palm Village
          </span>
          {IS_DEMO_MODE && (
            <span className="inline-flex items-center rounded bg-amber-400/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-amber-400/30">
              Demo
            </span>
          )}
        </div>
        <p className="text-xs text-forest-400">
          &copy; {new Date().getFullYear()} Palm Village. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
