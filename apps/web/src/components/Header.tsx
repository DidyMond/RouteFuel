import { RouteFuelLogo } from "./RouteFuelLogo";

/**
 * Header globale (vedi DESIGN.md — "Header (global pattern, identical on all
 * screens)"): brand centrato, avatar circolare a destra, placeholder
 * simmetrico a sinistra. Nessuna logica di navigazione/profilo in M0.
 */
export function Header() {
  return (
    <header className="fixed top-0 w-full z-30 pt-safe bg-surface/85 backdrop-blur-xl">
      <div className="h-[72px] px-gutter flex items-center justify-between relative max-w-md mx-auto">
        <div className="w-10 h-10" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2.5 pointer-events-auto">
            <RouteFuelLogo className="w-9 h-9 shrink-0" />
            <span className="font-headline-lg text-headline-md font-bold text-on-surface tracking-tight leading-none">
              RouteFuel
            </span>
          </div>
        </div>

        <div className="flex items-center z-10">
          <button
            type="button"
            aria-label="RF, profilo utente"
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-sm active:scale-95 transition-transform"
          >
            <span className="text-on-primary text-sm font-semibold">RF</span>
          </button>
        </div>
      </div>
    </header>
  );
}
