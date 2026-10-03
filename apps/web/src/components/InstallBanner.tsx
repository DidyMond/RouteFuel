import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { CloseIcon } from "./icons";

/**
 * Banner discreto per installare RouteFuel (DESIGN.md: `rounded-lg`, `shadow-md`, `bg-surface-container-lowest`).
 * Compare solo se il browser offre l'installazione, una volta per sessione. Sta nel flusso della Home (in cima, sopra il
 * form): una riga compatta che non copre nulla, nemmeno su schermi stretti.
 */
export function InstallBanner() {
  const { canInstall, install, dismiss } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <aside
      aria-label="Installa l'app"
      className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-md p-space-sm pl-space-md flex items-center gap-space-md"
    >
      <img src="/logo.svg" alt="" width={32} height={32} className="shrink-0 rounded-DEFAULT" />
      <button
        type="button"
        onClick={() => void install()}
        className="flex-1 min-w-0 h-10 rounded-full bg-primary text-on-primary text-label-lg font-label-lg hover:brightness-95 active:scale-[0.99] transition"
      >
        Installa RouteFuel
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Non ora"
        title="Non ora"
        className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-on-surface-variant hover:text-on-surface bg-surface-container-low"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </aside>
  );
}
