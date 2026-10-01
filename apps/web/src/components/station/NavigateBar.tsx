import { MoreIcon, NavigateIcon } from "../icons";

interface NavigateBarProps {
  stationName: string;
  /** Apre la navigazione esterna (app scelta in base al sistema; null → l'host mostra il menu). */
  onNavigate: () => void;
  /** Apre il menu con Google Maps, Apple Maps e Waze. */
  onChooseApp: () => void;
  disabled?: boolean;
}

/**
 * CTA flottante «Apri nel Navigatore» con sfocatura progressiva sotto (il contenuto scorre e sfuma dietro). Safe-area
 * aware. Il pulsante secondario apre sempre il menu di scelta dell'app, qualunque sia il sistema.
 */
export function NavigateBar({ stationName, onNavigate, onChooseApp, disabled = false }: NavigateBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
      <div data-testid="progressive-blur" aria-hidden="true" className="progressive-blur absolute inset-x-0 bottom-0 h-40">
        <span />
        <span />
        <span />
      </div>
      <div className="relative max-w-md mx-auto px-gutter pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pointer-events-auto">
        <div className="rounded-lg bg-surface/85 backdrop-blur-xl shadow-lg border border-outline-variant/30 p-space-md flex items-center gap-space-sm">
          <button
            type="button"
            onClick={onNavigate}
            disabled={disabled}
            aria-label={`Apri nel Navigatore: ${stationName}`}
            className="flex-1 min-h-12 h-12 rounded-full bg-primary text-on-primary text-headline-sm font-headline-sm flex items-center justify-center gap-space-sm shadow-sm hover:brightness-95 active:scale-[0.98] transition disabled:opacity-50"
          >
            <NavigateIcon className="w-5 h-5" />
            Apri nel Navigatore
          </button>
          <button
            type="button"
            onClick={onChooseApp}
            disabled={disabled}
            aria-label="Scegli l'app di navigazione"
            className="w-12 h-12 shrink-0 rounded-full bg-surface-container-low text-on-surface flex items-center justify-center border border-outline-variant/40 hover:border-primary transition-colors active:scale-95 disabled:opacity-50"
          >
            <MoreIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
