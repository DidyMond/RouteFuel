/**
 * Search bar "glow" della Home (vedi mockup/1._home_ricerca_percorso e
 * DESIGN.md). Puramente statica in M0: nessun input reale, nessuna chiamata
 * a un provider di geocoding (Milestone 1).
 */
export function SearchBar() {
  return (
    <section className="flex flex-col gap-2 pt-1">
      <div className="relative w-full my-2">
        <div className="absolute -inset-4 sm:-inset-6 bg-gradient-to-r from-primary-fixed/40 via-primary/25 to-secondary-fixed/30 rounded-full blur-2xl z-0 pointer-events-none transform -rotate-1 scale-105" />
        <div
          role="button"
          tabIndex={0}
          className="cursor-pointer group relative z-10 bg-surface-container-lowest border border-surface-container-high/80 hover:border-primary/50 rounded-full px-6 h-14 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
        >
          <SearchIcon className="text-primary" />
          <span className="font-headline-sm text-[16px] font-bold text-on-surface truncate">Dove vuoi andare?</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant self-center border border-surface-container-high/60 mb-6">
        <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant">
          Trova il carburante al minor costo sul tuo tragitto
        </span>
      </div>
    </section>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-6 h-6 ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
