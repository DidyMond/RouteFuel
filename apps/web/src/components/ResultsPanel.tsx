import type { LivePricesInfo, ReferencePriceLevel, RefinementInfo } from "@routefuel/shared";
import type { SearchState } from "../hooks/useSearch";
import { formatDateTime, formatDuration, formatKm, formatPrice } from "../lib/format";
import { CheckIcon, InfoIcon, SpinnerIcon } from "./icons";
import { StationCard } from "./StationCard";

const ERROR_TITLES: Record<string, string> = {
  RATE_LIMITED: "Troppe ricerche ravvicinate",
  NO_ROUTE: "Percorso non trovato",
  NO_PRICE_DATA: "Prezzi non disponibili",
  BUDGET_EXHAUSTED: "Servizio temporaneamente non disponibile",
  NETWORK_ERROR: "Server non raggiungibile",
};

const REFERENCE_LEVEL_TEXT: Record<ReferencePriceLevel, (n: number) => string> = {
  on_route: (n) => `mediana di ${n} stazioni sul percorso`,
  corridor: (n) => `mediana di ${n} stazioni nel corridoio`,
  national: () => "mediana nazionale (poche stazioni sul tratto)",
};

/** Dichiara da dove vengono i prezzi: tempo reale (sito ufficiale) o file giornaliero MIMIT (indietro di 1-2 giorni). */
function PricesFreshnessNotice({ livePrices, dailyFileAt }: { livePrices: LivePricesInfo; dailyFileAt: string | null }) {
  const daily = dailyFileAt ? `file giornaliero MIMIT del ${formatDateTime(dailyFileAt)} (prezzi in vigore alle 8:00 del giorno prima)` : "file giornaliero MIMIT";
  let text: string;
  let live = false;
  switch (livePrices.status) {
    case "live":
      live = true;
      text = `Prezzi in tempo reale dal sito ufficiale Osservaprezzi${livePrices.oldestLiveAgeMinutes ? ` · aggiornati ${livePrices.oldestLiveAgeMinutes} min fa` : ""}`;
      break;
    case "partial":
      text = `Prezzi in tempo reale su ${livePrices.tilesLive} zone del percorso su ${livePrices.tilesTotal}; per il resto ${daily}`;
      break;
    case "unavailable":
      text = `Prezzi in tempo reale non raggiungibili al momento: uso il ${daily}`;
      break;
    default:
      text = `Prezzi dal ${daily}`;
  }
  return (
    <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
      {live ? <CheckIcon className="w-4 h-4 text-primary shrink-0" /> : <InfoIcon className="w-4 h-4 text-outline shrink-0" />}
      <span>{text}</span>
    </p>
  );
}

function RefinementNotice({ refinement }: { refinement: RefinementInfo }) {
  if (refinement.status === "pending") {
    return (
      <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
        <SpinnerIcon className="w-4 h-4 text-secondary" />
        Verifico le deviazioni reali delle migliori stazioni…
      </p>
    );
  }
  if (refinement.status === "done") {
    return (
      <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
        <CheckIcon className="w-4 h-4 text-primary" />
        Deviazioni verificate sul percorso reale per le migliori stazioni.
      </p>
    );
  }
  return (
    <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
      <InfoIcon className="w-4 h-4 text-outline" />
      {refinement.status === "skipped" ? "Stime di deviazione approssimate (verifica sul percorso reale sospesa)." : "Verifica non riuscita: le deviazioni sono stime approssimate."}
    </p>
  );
}

export function ResultsPanel({ state }: { state: SearchState }) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center justify-center gap-space-sm py-space-xl text-body-md font-body-md text-on-surface-variant">
        <SpinnerIcon className="text-primary" /> Calcolo il percorso e confronto i prezzi…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-lg bg-error-container text-on-error-container p-space-xl">
        <h2 className="text-headline-sm font-headline-sm">{ERROR_TITLES[state.error.code] ?? "Ricerca non riuscita"}</h2>
        <p className="mt-space-xs text-body-md font-body-md">{state.error.message}</p>
      </div>
    );
  }

  const { response, results, refinement } = state;

  return (
    <section aria-label="Risultati della ricerca" className="flex flex-col gap-space-lg">
      <div className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-sm p-space-xl flex flex-col gap-space-sm">
        <h2 className="text-headline-sm font-headline-sm text-on-surface">
          {results.length === 0
            ? "Nessuna stazione conveniente sul percorso"
            : `${results.length} ${results.length === 1 ? "stazione" : "stazioni"} lungo il percorso`}
        </h2>
        <p className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
          Percorso {formatKm(response.route.distanceKm)} · {formatDuration(response.route.durationMinutes)} · {response.candidatesEvaluated} stazioni
          valutate
        </p>
        <p className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
          Prezzo di riferimento €{formatPrice(response.referencePrice.value)}/L (
          {REFERENCE_LEVEL_TEXT[response.referencePrice.level](response.referencePrice.sampleSize)})
        </p>
        <PricesFreshnessNotice livePrices={response.livePrices} dailyFileAt={response.pricesUpdatedAt} />
        <RefinementNotice refinement={refinement} />
      </div>

      {results.length === 0 ? (
        <p className="text-body-md font-body-md text-on-surface-variant text-center">
          Prova ad aumentare la deviazione massima, a cambiare carburante o a disattivare "Solo Self".
        </p>
      ) : (
        <ol className="flex flex-col gap-space-lg">
          {results.map((result, index) => (
            <StationCard key={result.station.id} result={result} rank={index + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}
