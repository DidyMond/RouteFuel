import type { SearchFuelType, StationDetailResponse } from "@routefuel/shared";
import { formatPrice, formatShortDate } from "../../lib/format";
import { fuelLabel } from "../../lib/stationView";

type Selected = StationDetailResponse["selected"];

const isSelectedCombination = (selected: Selected, fuelType: SearchFuelType, isSelf: boolean) =>
  selected.fuelType === fuelType && selected.isSelf === isSelf;

/**
 * Listino della stazione: una tile per ogni combinazione carburante × modalità con prezzo recente (dati MIMIT).
 * La combinazione scelta nella ricerca è evidenziata. Nessuna tile per ciò che la stazione non vende.
 */
export function PriceMatrix({ detail }: { detail: StationDetailResponse }) {
  const { prices, selected } = detail;

  return (
    <section aria-label="Listino carburanti" className="rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 p-space-lg flex flex-col gap-space-md">
      <div className="flex items-baseline justify-between gap-space-sm">
        <h2 className="text-headline-sm font-headline-sm text-on-surface">Listino carburanti</h2>
        <span className="text-body-sm font-body-sm text-on-surface-variant text-right">Prezzi MIMIT Osservaprezzi</span>
      </div>

      {prices.length === 0 ? (
        <p role="status" className="text-body-md font-body-md text-on-surface-variant">
          Nessun prezzo recente disponibile per questa stazione.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-space-sm">
          {prices.map((entry) => {
            const chosen = isSelectedCombination(selected, entry.fuelType, entry.isSelf);
            return (
              <li
                key={`${entry.fuelType}-${entry.isSelf ? "self" : "servito"}`}
                data-testid="price-tile"
                data-fuel={entry.fuelType}
                data-mode={entry.isSelf ? "self" : "servito"}
                aria-current={chosen ? "true" : undefined}
                className={`rounded-DEFAULT p-space-md flex flex-col gap-space-xs min-w-0 ${
                  chosen ? "bg-primary/10 ring-2 ring-primary" : "bg-surface-container-low"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-headline-sm font-headline-sm text-on-surface">{fuelLabel(entry.fuelType)}</span>
                  <span className="inline-flex items-center h-[20px] px-space-sm rounded-full bg-surface-container-lowest text-on-surface-variant text-label-sm font-label-sm">
                    {entry.isSelf ? "Self" : "Servito"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-1">
                  <span className={`text-numeric-stat font-numeric-stat tabular-nums leading-tight ${chosen ? "text-on-primary-fixed-variant" : "text-on-surface"}`}>
                    {formatPrice(entry.price)}
                  </span>
                  <span className="text-label-md font-label-md text-on-surface-variant">€/L</span>
                </div>
                <span className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
                  {chosen ? "Scelto nella ricerca · " : ""}
                  prezzo del {formatShortDate(entry.communicatedAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
