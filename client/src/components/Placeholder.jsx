/**
 * Komponen placeholder sementara untuk halaman yang belum diimplementasi (Phase 1/2).
 */
export default function Placeholder({ title, description, phase }) {
  return (
    <div className="pv-card p-10 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-100 text-forest-600 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-forest-900">{title}</h2>
      <p className="mt-2 text-sm text-forest-600 max-w-md mx-auto">
        {description}
      </p>
      {phase && (
        <span className="inline-block mt-4 pv-badge bg-gold-50 text-gold-700 border border-gold-200">
          🚧 {phase}
        </span>
      )}
    </div>
  );
}
