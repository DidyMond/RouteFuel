import type { LonLat, SearchFuelType, SearchRequest } from "@routefuel/shared";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "../hooks/useSettings";
import type { SearchLabels } from "../hooks/useSearch";
import { reverseGeocode } from "../lib/api";
import { CONSUMPTION_RANGE, DETOUR_RANGE, LITERS_RANGE, SEARCH_DEFAULTS } from "../lib/defaults";
import { referenceOverrideFor } from "../lib/settings";
import { AddressInput, type Place } from "./AddressInput";
import { FuelChips } from "./FuelChips";
import { LocateIcon, SpinnerIcon, SwapIcon } from "./icons";
import { Stepper } from "./Stepper";
import { ToggleRow } from "./ToggleRow";

interface SearchFormProps {
  onSubmit: (request: SearchRequest, labels: SearchLabels) => void;
  busy: boolean;
}

interface Endpoint {
  text: string;
  place: Place | null;
}

const EMPTY_ENDPOINT: Endpoint = { text: "", place: null };

export function SearchForm({ onSubmit, busy }: SearchFormProps) {
  // I default vengono dalle Impostazioni salvate (profilo veicolo e consumi); l'algoritmo ne prende i parametri.
  const { settings } = useSettings();
  const [origin, setOrigin] = useState<Endpoint>(EMPTY_ENDPOINT);
  const [destination, setDestination] = useState<Endpoint>(EMPTY_ENDPOINT);
  const [userLocation, setUserLocation] = useState<LonLat | undefined>();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [fuelType, setFuelType] = useState<SearchFuelType>(settings.vehicle.defaultFuel);
  const [liters, setLiters] = useState<number>(settings.vehicle.tankLiters);
  const [maxDetourKm, setMaxDetourKm] = useState<number>(settings.defaultMaxDetourKm);
  const [consumptionText, setConsumptionText] = useState(String(settings.consumptionKmPerLiter));
  // «Solo Self» e «Evita autostrada» partono dai default delle Impostazioni e restano modificabili per ricerca.
  const [onlySelf, setOnlySelf] = useState<boolean>(settings.onlySelf);
  const [avoidMotorway, setAvoidMotorway] = useState<boolean>(settings.avoidMotorway);

  const consumption = Number(consumptionText.replace(",", "."));
  const consumptionValid =
    Number.isFinite(consumption) && consumption >= CONSUMPTION_RANGE.min && consumption <= CONSUMPTION_RANGE.max;
  const consumptionModified = consumptionText !== String(settings.consumptionKmPerLiter);

  // Quando le Impostazioni cambiano (salvataggio o ripristino) la ricerca successiva riparte dai nuovi default.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setFuelType(settings.vehicle.defaultFuel);
    setLiters(settings.vehicle.tankLiters);
    setConsumptionText(String(settings.consumptionKmPerLiter));
    setOnlySelf(settings.onlySelf);
    setAvoidMotorway(settings.avoidMotorway);
    setMaxDetourKm(settings.defaultMaxDetourKm);
  }, [settings.vehicle.defaultFuel, settings.vehicle.tankLiters, settings.consumptionKmPerLiter, settings.onlySelf, settings.avoidMotorway, settings.defaultMaxDetourKm]);
  const ready = origin.place !== null && destination.place !== null && consumptionValid;

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const useCurrentPosition = () => {
    if (!navigator.geolocation) {
      setLocationError("Il tuo browser non supporta la geolocalizzazione.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = { lon: position.coords.longitude, lat: position.coords.latitude };
        setUserLocation(point);
        setOrigin({ text: "Posizione attuale", place: { ...point, label: "Posizione attuale" } });
        setLocating(false);

        // L'etichetta con l'indirizzo è un'aggiunta: se il server non risponde resta "Posizione attuale".
        const label = await reverseGeocode(point);
        if (label) {
          setOrigin((current) => (current.place?.lon === point.lon ? { text: label, place: { ...point, label } } : current));
        }
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Permesso di posizione negato: digita l'indirizzo di partenza."
            : "Impossibile determinare la posizione: digita l'indirizzo di partenza.",
        );
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!origin.place || !destination.place || !consumptionValid) return;
    const referenceOverride = referenceOverrideFor(settings, fuelType);
    onSubmit(
      {
        origin: { lon: origin.place.lon, lat: origin.place.lat },
        destination: { lon: destination.place.lon, lat: destination.place.lat },
        fuelType,
        liters,
        maxDetourKm,
        consumptionKmPerLiter: consumption,
        valueOfTimePerMinute: settings.valueOfTimePerMinute,
        onlySelf,
        maxPriceAgeHours: settings.maxPriceAgeHours,
        avoidMotorway,
        // Pedaggi e traghetti non sono nel form: si cambiano dalle Opzioni percorso nei Risultati o dai default nelle Impostazioni.
        avoidTolls: settings.avoidTolls,
        avoidFerries: settings.avoidFerries,
        // Prezzo di riferimento manuale (se impostato per questo carburante): sostituisce il calcolo automatico.
        ...(referenceOverride !== undefined ? { referencePriceOverride: referenceOverride } : {}),
      },
      { origin: origin.place.label, destination: destination.place.label },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-space-xl rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-sm p-space-xl">
      <div>
        <h1 className="text-headline-md font-headline-md text-on-surface">Pianifica viaggio &amp; risparmio</h1>
        <p className="mt-space-xs text-body-sm font-body-sm text-on-surface-variant">
          Trova il carburante al minor costo sul tuo tragitto.
        </p>
      </div>

      {/* Card A → B collegata da una linea tratteggiata verticale (DESIGN.md — Input Fields) */}
      <div className="relative flex flex-col gap-space-sm">
        <div aria-hidden="true" className="absolute left-2 top-[26px] bottom-[26px] border-l-2 border-dashed border-outline-variant/70" />
        <AddressInput
          label="Partenza"
          placeholder="Da dove parti?"
          text={origin.text}
          onTextChange={(text) => setOrigin({ text, place: null })}
          place={origin.place}
          onPlaceSelect={(place) => setOrigin({ text: place.label, place })}
          proximity={userLocation}
          leading={<span className="block w-3 h-3 rounded-full bg-secondary" />}
          trailing={
            <button
              type="button"
              onClick={useCurrentPosition}
              disabled={locating}
              aria-label="Usa la posizione attuale"
              className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-secondary/10 transition-colors disabled:opacity-50"
            >
              {locating ? <SpinnerIcon className="w-4 h-4" /> : <LocateIcon />}
            </button>
          }
        />
        <AddressInput
          label="Destinazione"
          placeholder="Dove vuoi andare?"
          text={destination.text}
          onTextChange={(text) => setDestination({ text, place: null })}
          place={destination.place}
          onPlaceSelect={(place) => setDestination({ text: place.label, place })}
          proximity={userLocation}
          leading={<span className="block w-3 h-3 rounded-full bg-primary" />}
          trailing={
            <button
              type="button"
              onClick={swap}
              aria-label="Scambia partenza e destinazione"
              className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-secondary/10 transition-colors"
            >
              <SwapIcon />
            </button>
          }
        />
        {locationError && (
          <p role="alert" className="text-body-sm font-body-sm text-error pl-space-xl">
            {locationError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-space-sm">
        <span className="text-label-sm font-label-sm font-semibold text-on-surface">Carburante</span>
        <FuelChips value={fuelType} onChange={setFuelType} />
      </div>

      <Stepper label="Litri" value={liters} unit="L" {...LITERS_RANGE} onChange={setLiters} />

      <div className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
          <label htmlFor="max-detour" className="text-label-sm font-label-sm font-semibold text-on-surface">
            Deviazione massima
          </label>
          <output htmlFor="max-detour" className="rounded-full bg-secondary/10 text-on-secondary-fixed-variant px-space-md py-space-xs text-label-lg font-label-lg tabular-nums">
            {maxDetourKm} km
          </output>
        </div>
        <input
          id="max-detour"
          type="range"
          {...DETOUR_RANGE}
          value={maxDetourKm}
          onChange={(event) => setMaxDetourKm(Number(event.target.value))}
          className="w-full accent-primary"
        />
        <p className="text-body-sm font-body-sm text-on-surface-variant">Km extra totali (andata e ritorno) rispetto al percorso diretto.</p>
      </div>

      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between gap-space-md">
          <label htmlFor="consumption" className="text-label-sm font-label-sm font-semibold text-on-surface">
            Consumo del veicolo
          </label>
          <div className="flex items-center gap-space-sm">
            {consumptionModified && (
              <button
                type="button"
                onClick={() => setConsumptionText(String(settings.consumptionKmPerLiter))}
                className="text-label-md font-label-md text-on-primary-fixed-variant hover:underline"
              >
                Ripristina
              </button>
            )}
            <input
              id="consumption"
              type="text"
              inputMode="decimal"
              value={consumptionText}
              onChange={(event) => setConsumptionText(event.target.value)}
              aria-invalid={!consumptionValid}
              className={`w-16 h-9 rounded bg-surface-container-low text-center text-label-lg font-label-lg tabular-nums text-on-surface outline-none focus:ring-2 focus:ring-primary/40 ${
                consumptionValid ? "" : "ring-2 ring-error/60"
              }`}
            />
            <span className="text-body-sm font-body-sm text-on-surface-variant">km/L</span>
          </div>
        </div>
        {!consumptionValid && (
          <p role="alert" className="text-body-sm font-body-sm text-error">
            Inserisci un consumo tra {CONSUMPTION_RANGE.min} e {CONSUMPTION_RANGE.max} km/L.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-space-lg">
        <ToggleRow label="Solo Self" description="Se disattivato include anche le stazioni solo servito." checked={onlySelf} onChange={setOnlySelf} />
        <ToggleRow
          label="Evita autostrada"
          description="Percorso e deviazioni senza autostrada. Il pedaggio non rientra nel calcolo."
          checked={avoidMotorway}
          onChange={setAvoidMotorway}
        />
      </div>

      <div className="flex flex-col gap-space-sm">
        <button
          type="submit"
          disabled={!ready || busy}
          className="h-12 rounded-full bg-primary text-on-primary text-label-lg font-label-lg flex items-center justify-center gap-space-sm hover:brightness-95 active:scale-[0.99] transition disabled:opacity-50 disabled:hover:brightness-100"
        >
          {busy && <SpinnerIcon />}
          {busy ? "Cerco le stazioni…" : "Trova il carburante più conveniente"}
        </button>
        {!ready && !busy && (
          <p className="text-center text-body-sm font-body-sm text-on-surface-variant">
            Scegli partenza e destinazione dai suggerimenti per iniziare.
          </p>
        )}
      </div>
    </form>
  );
}
