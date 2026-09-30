import { NavLink } from "react-router-dom";
import { GasStationIcon, SearchIcon } from "./icons";

interface BottomNavProps {
  /** La scheda Risultati è raggiungibile solo dopo una ricerca riuscita. */
  hasResults: boolean;
}

const base = "flex flex-col items-center gap-0.5 py-1 px-space-lg rounded-full transition-colors";
const active = "bg-primary-fixed/30 text-on-primary-fixed-variant";
const inactive = "text-on-surface-variant hover:text-on-surface";

/**
 * Navigazione globale (DESIGN.md — Bottom Navigation): pillola flottante con icona sopra e etichetta sotto.
 * Ci sono solo le schede che portano a schermate esistenti: «Percorso» (Screen 4) è sospesa e «Impostazioni»
 * (Screen 5) arriva in Milestone 4.
 */
export function BottomNav({ hasResults }: BottomNavProps) {
  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-full bg-surface/85 backdrop-blur-xl shadow-lg border border-outline-variant/30 px-space-md py-space-sm"
    >
      <div className="flex items-center justify-around">
        <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
          <SearchIcon />
          <span className="text-label-sm font-label-sm whitespace-nowrap">Cerca</span>
        </NavLink>
        {hasResults ? (
          <NavLink to="/results" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>
            <GasStationIcon />
            <span className="text-label-sm font-label-sm whitespace-nowrap">Risultati</span>
          </NavLink>
        ) : (
          <span aria-disabled="true" title="Fai prima una ricerca" className={`${base} text-on-surface-variant opacity-50 cursor-not-allowed`}>
            <GasStationIcon />
            <span className="text-label-sm font-label-sm whitespace-nowrap">Risultati</span>
          </span>
        )}
      </div>
    </nav>
  );
}
