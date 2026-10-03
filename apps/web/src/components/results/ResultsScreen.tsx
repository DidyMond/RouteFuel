import type { RefinementInfo, StationResult } from "@routefuel/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchState } from "../../hooks/useSearch";
import { useStopRoute } from "../../hooks/useStopRoute";
import { formatPrice } from "../../lib/format";
import { launchNavigation } from "../../lib/navigation";
import { describeExclusions, type RouteExclusions } from "../../lib/routeOptions";
import { applyFilters, bestStationId, DEFAULT_SORT, fuelModeLabel, referenceLevelText, type SortMode } from "../../lib/stationView";
import { CheckIcon, InfoIcon, RouteIcon, SavingsIcon, SlidersIcon, SpinnerIcon } from "../icons";
import type { MapStation } from "./MapCanvas";
import { MapView } from "./MapView";
import { NavigateSheet } from "./NavigateSheet";
import { PricesBanner } from "./PricesBanner";
import { ResultCard } from "./ResultCard";
import { RouteOptionsSheet } from "./RouteOptionsSheet";
import { TelemetryCapsule } from "./TelemetryCapsule";

type SuccessState = Extract<SearchState, { status: "success" }>;

/** Schede mostrate subito: l'elenco completo resta a un tap ("Mostra altre"), la mappa e i filtri lavorano sempre su tutte. */
export const INITIAL_CARDS = 20;

const SORTS: ReadonlyArray<{ mode: SortMode; label: string; title: string; Icon: typeof SavingsIcon }> = [
  { mode: "savings", label: "Più conveniente", title: "Risparmio netto maggiore per prime", Icon: SavingsIcon },
  { mode: "detour", label: "Minor deviazione", title: "Meno chilometri extra per prime (a pari km, la più vicina alla strada)", Icon: RouteIcon },
];

function Chip({
  active,
  disabled,
  onClick,
  small,
  children,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  small?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  // DESIGN.md — Interactive States: attivo bg-primary/text-on-primary, inattivo bg-surface-container-low senza bordo.
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full shrink-0 whitespace-nowrap transition-colors disabled:cursor-not-allowed ${
        small ? "h-8 px-space-md text-label-sm font-label-sm" : "h-9 px-space-lg text-label-md font-label-md"
      } ${active ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"} ${
        disabled ? (active ? "opacity-80" : "opacity-50") : ""
      }`}
    >
      {children}
    </button>
  );
}

function RefinementNotice({ refinement }: { refinement: RefinementInfo }) {
  if (refinement.status === "done") return null;
  const pending = refinement.status === "pending";
  return (
    <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
      {pending ? <SpinnerIcon className="w-4 h-4 text-secondary" /> : <InfoIcon className="w-4 h-4 text-outline" />}
      {pending
        ? "Verifico le deviazioni reali delle migliori stazioni…"
        : refinement.status === "skipped"
          ? "Deviazioni stimate (verifica sul percorso reale sospesa)."
          : "Verifica non riuscita: le deviazioni sono stime approssimate."}
    </p>
  );
}

/**
 * Screen 2 — Risultati & Mappa. Mappa sopra (40% dell'altezza) e bottom sheet con filtri e schede sotto; su schermi
 * larghi il foglio diventa una barra laterale sopra la mappa. Ordinamento e filtri sono solo client-side.
 */
export function ResultsScreen({
  state,
  onOpenStation,
  routeDefaults,
  onApplyRouteOptions,
  searching = false,
}: {
  state: SuccessState;
  onOpenStation: (result: StationResult) => void;
  /** Default delle Impostazioni per le opzioni percorso («Reimposta» nel foglio). */
  routeDefaults: RouteExclusions;
  /** «Applica» nel foglio Opzioni percorso: rilancia la ricerca con lo stesso A/B e le nuove esclusioni. */
  onApplyRouteOptions: (exclusions: RouteExclusions) => void;
  /** Una ricerca è in corso (rilanciata da qui): si resta sui risultati precedenti finché arrivano i nuovi. */
  searching?: boolean;
}) {
  const { response, results, refinement, request, labels } = state;

  const [sort, setSort] = useState<SortMode>(DEFAULT_SORT);
  // Se la ricerca era già limitata ai soli Self non c'è nulla da aggiungere lato client: la pill resta attiva e bloccata.
  const [onlySelf, setOnlySelf] = useState(request.onlySelf);
  const [motorwayOnly, setMotorwayOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [navigating, setNavigating] = useState<StationResult | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [shown, setShown] = useState(INITIAL_CARDS);
  const selectionFromMap = useRef(false);

  // Una nuova ricerca riparte da filtri puliti.
  useEffect(() => {
    setSort(DEFAULT_SORT);
    setOnlySelf(request.onlySelf);
    setMotorwayOnly(false);
    setSelectedId(null);
    setShown(INITIAL_CARDS);
  }, [response.searchId, request.onlySelf]);

  // Con «Evita autostrada» la pill «Autostrada» non ha senso (nessun percorso usa l'autostrada): resta spenta. Nessun
  // auto-disable per «Evita pedaggi»: il filtro «Tipo impianto» non dipende dal tracciato.
  const motorwayFilter = motorwayOnly && !request.avoidMotorway;
  useEffect(() => {
    if (request.avoidMotorway) setMotorwayOnly(false);
  }, [request.avoidMotorway]);

  const visible = useMemo(() => applyFilters(results, { sort, onlySelf, motorwayOnly: motorwayFilter }), [results, sort, onlySelf, motorwayFilter]);
  const bestId = useMemo(() => bestStationId(visible), [visible]);
  // Percorso A→stazione→B della stazione selezionata; resta null se il routing non è disponibile.
  const stopRoute = useStopRoute(response.searchId, selectedId);

  // Se un filtro nasconde la stazione selezionata, la selezione (e il suo percorso) decade.
  useEffect(() => {
    if (selectedId !== null && !visible.some((r) => r.station.id === selectedId)) setSelectedId(null);
  }, [visible, selectedId]);

  const mapStations = useMemo<MapStation[]>(
    () =>
      visible.map((result) => ({
        id: result.station.id,
        lon: result.station.lon,
        lat: result.station.lat,
        priceLabel: `€${formatPrice(result.price)}`,
        ariaLabel: `${result.station.nomeImpianto}, ${fuelModeLabel(request.fuelType, result.isSelf)}, ${formatPrice(result.price)} euro al litro`,
        best: result.station.id === bestId,
      })),
    [visible, bestId, request.fuelType],
  );

  // Toccare una scheda la seleziona (pin evidenziato e percorso con sosta); toccarla di nuovo la deseleziona.
  // Il dettaglio della stazione (Screen 3) si apre solo da «Info».
  const selectFromCard = useCallback((id: number) => {
    selectionFromMap.current = false;
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const deselect = useCallback(() => setSelectedId(null), []);

  const selectFromMap = useCallback(
    (id: number) => {
      selectionFromMap.current = true;
      setSelectedId((current) => (current === id ? null : id));
      // Il pin può riguardare una stazione oltre le schede mostrate: le si mostra fino a quella.
      const index = visible.findIndex((r) => r.station.id === id);
      if (index >= 0) setShown((count) => Math.max(count, index + 1));
    },
    [visible],
  );

  // Un tap su un pin porta la scheda in vista nell'elenco.
  useEffect(() => {
    if (selectedId === null || !selectionFromMap.current) return;
    document.getElementById(`station-${selectedId}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const closeNavigation = useCallback(() => setNavigating(null), []);

  const navigate = useCallback((result: StationResult) => {
    const target = { name: result.station.nomeImpianto, lat: result.station.lat, lon: result.station.lon };
    if (!launchNavigation(target)) setNavigating(result); // desktop o piattaforma sconosciuta: menu con Google Maps, Apple Maps e Waze
  }, []);

  const resetFilters = () => {
    setSort(DEFAULT_SORT);
    setOnlySelf(request.onlySelf);
    setMotorwayOnly(false);
    setShown(INITIAL_CARDS);
  };

  const hasFilters = motorwayFilter || (onlySelf && !request.onlySelf);
  const exclusions: RouteExclusions = { avoidMotorway: request.avoidMotorway, avoidTolls: request.avoidTolls, avoidFerries: request.avoidFerries };
  const exclusionsText = describeExclusions(exclusions);

  return (
    <div className="fixed inset-x-0 top-[calc(72px+env(safe-area-inset-top,0px))] bottom-0 pb-28 flex flex-col md:block">
      {/* Mappa: 40% dell'altezza su mobile (18% se il foglio è espanso), a tutta pagina su schermi larghi. */}
      <div
        data-testid="map-region"
        className={`relative shrink-0 w-full bg-surface-container-high overflow-hidden shadow-md transition-[height] duration-300 ${
          expanded ? "h-[18vh]" : "h-[40vh]"
        } min-h-[140px] md:absolute md:inset-0 md:h-auto`}
      >
        <MapView
          geometry={response.route.geometry}
          stations={mapStations}
          selectedId={selectedId}
          stopRoute={stopRoute}
          onSelectStation={selectFromMap}
          onDeselect={deselect}
        />
        <TelemetryCapsule
          origin={labels.origin}
          destination={labels.destination}
          distanceKm={response.route.distanceKm}
          durationMinutes={response.route.durationMinutes}
          stationCount={visible.length}
        />
      </div>

      <section
        aria-label="Stazioni lungo il percorso"
        data-testid="bottom-sheet"
        className="relative -mt-3 z-20 flex-1 min-h-0 flex flex-col bg-surface-container-lowest rounded-t-3xl shadow-lg backdrop-blur-md max-h-[85vh] md:absolute md:left-space-lg md:top-space-lg md:bottom-28 md:mt-0 md:w-[440px] md:flex-none md:rounded-3xl md:max-h-none"
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Riduci l'elenco e mostra la mappa" : "Espandi l'elenco"}
          aria-expanded={expanded}
          className="shrink-0 pt-space-sm pb-space-xs flex justify-center md:hidden"
        >
          <span className="block w-10 h-1.5 rounded-full bg-outline-variant/60" />
        </button>

        {/* Solo questa area scorre: la mappa resta ferma. */}
        <div data-testid="sheet-scroll" className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-gutter pb-space-lg flex flex-col gap-space-md">
          <div className="flex flex-col gap-space-sm pt-space-xs md:pt-space-lg">
            <div role="group" aria-label="Ordina per" className="flex items-center gap-space-sm overflow-x-auto no-scrollbar py-0.5">
              {SORTS.map(({ mode, label, title, Icon }) => (
                <Chip key={mode} active={sort === mode} title={title} onClick={() => setSort(mode)}>
                  <Icon className="w-4 h-4" />
                  {label}
                </Chip>
              ))}
            </div>
            <div role="group" aria-label="Filtri" className="flex items-center gap-space-sm overflow-x-auto no-scrollbar py-0.5">
              <Chip
                small
                active={onlySelf}
                disabled={request.onlySelf}
                title={request.onlySelf ? "La ricerca include già solo le stazioni con il Self" : undefined}
                onClick={() => setOnlySelf((value) => !value)}
              >
                {onlySelf && <CheckIcon className="w-3.5 h-3.5" />}
                Solo Self
              </Chip>
              <Chip
                small
                active={motorwayFilter}
                disabled={request.avoidMotorway}
                title={request.avoidMotorway ? "Non disponibile con Evita autostrada" : undefined}
                onClick={() => setMotorwayOnly((value) => !value)}
              >
                {motorwayFilter && <CheckIcon className="w-3.5 h-3.5" />}
                Autostrada
              </Chip>
            </div>
            <RefinementNotice refinement={refinement} />
            {searching && (
              <p role="status" className="flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
                <SpinnerIcon className="w-4 h-4 text-secondary" />
                Ricalcolo con le nuove opzioni…
              </p>
            )}
            <button
              type="button"
              data-testid="route-options-chip"
              aria-haspopup="dialog"
              disabled={searching}
              onClick={() => setOptionsOpen(true)}
              title={
                exclusionsText
                  ? "Le deviazioni sono misurate contro il percorso diretto con le stesse opzioni (il pedaggio non rientra nel calcolo)"
                  : "Evita autostrade, pedaggi o traghetti"
              }
              className={`self-start flex items-center gap-1.5 h-8 px-space-md rounded-full text-label-md font-label-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                exclusionsText ? "bg-secondary/10 text-on-secondary-fixed-variant" : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <SlidersIcon className="w-4 h-4" />
              Opzioni percorso{exclusionsText ? ` · ${exclusionsText}` : ""}
            </button>
            <p data-testid="reference-price" className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
              Prezzo di riferimento €{formatPrice(response.referencePrice.value)}/L ({referenceLevelText(response.referencePrice.level, response.referencePrice.sampleSize)})
            </p>
          </div>

          {visible.length === 0 ? (
            <div role="status" className="rounded-lg bg-surface-container-low p-space-xl text-center flex flex-col items-center gap-space-md">
              <p className="text-headline-sm font-headline-sm text-on-surface">
                {results.length === 0 ? "Nessuna stazione conveniente sul percorso" : "Nessuna stazione con questi filtri"}
              </p>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                {results.length === 0
                  ? "Prova ad aumentare la deviazione massima, a cambiare carburante o a disattivare «Solo Self» nella ricerca."
                  : "Cambia i filtri per vedere le altre stazioni."}
              </p>
              {results.length > 0 && hasFilters && (
                <button type="button" onClick={resetFilters} className="h-9 px-space-xl rounded-full bg-primary text-on-primary text-label-lg font-label-lg">
                  Azzera i filtri
                </button>
              )}
            </div>
          ) : (
            <ol aria-label="Elenco stazioni" className="flex flex-col gap-space-md">
              {visible.slice(0, shown).map((result) => (
                <ResultCard
                  key={result.station.id}
                  result={result}
                  fuelType={request.fuelType}
                  best={result.station.id === bestId}
                  selected={result.station.id === selectedId}
                  onSelect={selectFromCard}
                  onInfo={onOpenStation}
                  onNavigate={navigate}
                />
              ))}
            </ol>
          )}

          {visible.length > shown && (
            <button
              type="button"
              onClick={() => setShown((count) => count + INITIAL_CARDS)}
              className="self-center h-10 px-space-xl rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg hover:text-on-primary-fixed-variant transition-colors shrink-0"
            >
              Mostra altre {Math.min(INITIAL_CARDS, visible.length - shown)} stazioni ({visible.length - shown} rimaste)
            </button>
          )}
        </div>

        <PricesBanner livePrices={response.livePrices} dailyFileAt={response.pricesUpdatedAt} />
      </section>

      {optionsOpen && (
        <RouteOptionsSheet
          current={exclusions}
          defaults={routeDefaults}
          onApply={(next) => {
            setOptionsOpen(false);
            onApplyRouteOptions(next);
          }}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {navigating && (
        <NavigateSheet
          station={navigating.station}
          summary={{ price: navigating.price, modeLabel: fuelModeLabel(request.fuelType, navigating.isSelf), netSavings: navigating.netSavings }}
          onClose={closeNavigation}
        />
      )}
    </div>
  );
}
