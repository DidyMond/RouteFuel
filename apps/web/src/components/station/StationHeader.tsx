import { BackIcon, BookmarkIcon, ShareIcon } from "../icons";
import { RouteFuelLogo } from "../RouteFuelLogo";

interface StationHeaderProps {
  onBack: () => void;
  saved: boolean;
  onToggleSaved: () => void;
  onShare: () => void;
  /** Salvataggio e condivisione hanno senso solo a stazione caricata. */
  actionsDisabled: boolean;
}

const iconButton =
  "w-10 h-10 rounded-full bg-surface-container-low text-on-surface-variant flex items-center justify-center transition-colors hover:text-on-surface active:scale-95 disabled:opacity-40 disabled:active:scale-100";

/**
 * Header delle schermate a pila (DESIGN.md — Header): indietro a sinistra, brand centrato, a destra salva,
 * condividi e avatar. Rispetta la safe-area (`pt-safe`) come l'header globale.
 */
export function StationHeader({ onBack, saved, onToggleSaved, onShare, actionsDisabled }: StationHeaderProps) {
  return (
    <header className="fixed top-0 w-full z-30 pt-safe bg-surface/85 backdrop-blur-xl">
      <div className="h-[72px] px-gutter max-w-md mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-space-sm">
        <div className="flex justify-start">
          <button type="button" onClick={onBack} aria-label="Torna ai risultati" className={iconButton}>
            <BackIcon />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <RouteFuelLogo className="w-8 h-8 shrink-0" />
          <span className="font-headline-lg text-headline-sm font-bold text-on-surface tracking-tight leading-none">RouteFuel</span>
        </div>

        <div className="flex items-center justify-end gap-space-xs">
          <button
            type="button"
            onClick={onToggleSaved}
            disabled={actionsDisabled}
            aria-pressed={saved}
            aria-label={saved ? "Rimuovi dai salvati" : "Salva per il ritorno"}
            className={`${iconButton} ${saved ? "text-on-primary-fixed-variant bg-primary/10" : ""}`}
          >
            <BookmarkIcon filled={saved} />
          </button>
          <button type="button" onClick={onShare} disabled={actionsDisabled} aria-label="Condividi la stazione" className={iconButton}>
            <ShareIcon />
          </button>
          <div
            role="img"
            aria-label="RF, profilo utente"
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-sm shrink-0"
          >
            <span className="text-on-primary text-sm font-semibold">RF</span>
          </div>
        </div>
      </div>
    </header>
  );
}
