import type { StationResult } from "@routefuel/shared";
import { formatDetourMinutes, formatEuro, formatKm, formatPrice, formatShortDate } from "../lib/format";

interface StationCardProps {
  result: StationResult;
  rank: number;
}

/**
 * Card semplice di M1 (la card completa con Info/Naviga e badge brand con logo è Milestone 2).
 * Nessuna ombra "hover": la card non è ancora cliccabile (DESIGN.md — Elevation).
 */
export function StationCard({ result, rank }: StationCardProps) {
  const { station } = result;
  const saves = result.netSavings > 0;
  const estimated = result.detourSource === "proxy";

  return (
    <li className="rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-sm p-space-xl flex flex-col gap-space-md">
      <div className="flex items-start justify-between gap-space-md">
        <div className="min-w-0">
          <p className="text-label-md font-label-md text-on-surface-variant">
            {rank}. {station.bandiera || station.gestore}
            {station.tipoImpianto === "autostradale" && " · Autostrada"}
          </p>
          <h3 className="text-headline-sm font-headline-sm text-on-surface truncate">{station.nomeImpianto}</h3>
          <p className="text-body-sm font-body-sm text-on-surface-variant truncate">
            {station.indirizzo ? `${station.indirizzo.trim()} · ` : ""}
            {station.comune} ({station.provincia})
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-numeric-stat font-numeric-stat text-on-surface tabular-nums">
            €{formatPrice(result.price)}
            <span className="text-body-sm font-body-sm text-on-surface-variant">/L</span>
          </p>
          <p className="text-label-sm font-label-sm text-on-surface-variant">{result.isSelf ? "Self" : "Servito"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-space-sm">
        <span
          className={`inline-flex items-center h-[22px] px-space-md rounded-full text-label-sm font-label-sm tabular-nums ${
            saves ? "bg-primary/10 text-primary" : "bg-error-container text-on-error-container"
          }`}
        >
          {saves ? `Risparmi ${estimated ? "~" : ""}${formatEuro(result.netSavings)}` : `Non conviene ${estimated ? "~" : ""}${formatEuro(result.netSavings)}`}
        </span>

        <span
          className="inline-flex items-center h-[22px] px-space-md rounded-full bg-secondary/10 text-secondary text-label-sm font-label-sm tabular-nums"
          title={estimated ? "Stima geometrica, in attesa di verifica sul percorso reale" : "Verificato sul percorso reale"}
        >
          {estimated ? "~" : ""}+{formatKm(result.detourKm)} · +{formatDetourMinutes(result.detourMinutes)}
        </span>

        {result.servitoOnly && (
          <span className="inline-flex items-center h-[22px] px-space-md rounded-full bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm">
            Solo servito
          </span>
        )}
      </div>

      <p className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
        A {formatKm(result.alongRouteKm)} dalla partenza · {formatKm(result.lateralDistanceKm)} dal tracciato · prezzo del{" "}
        {formatShortDate(result.priceUpdatedAt)}
      </p>
    </li>
  );
}
