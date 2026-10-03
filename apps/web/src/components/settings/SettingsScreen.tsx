import { useState } from "react";
import { useNotice } from "../../hooks/useNotice";
import { formatPrice } from "../../lib/format";
import { useSettings } from "../../hooks/useSettings";
import { DETOUR_RANGE, FUEL_OPTIONS } from "../../lib/defaults";
import {
  BODY_TYPES,
  CONSUMPTION_SLIDER,
  FRESHNESS_RANGE,
  perHourFromMinute,
  perMinuteFromHour,
  prefillManualReference,
  REFERENCE_PRICE_RANGE,
  samePreferences,
  TANK_RANGE,
  V_TIME_CUSTOM_RANGE,
  V_TIME_PRESETS,
  vTimePresetFor,
  type BodyType,
  type ReferenceMode,
  type Settings,
} from "../../lib/settings";
import { FuelChips } from "../FuelChips";
import { CarIcon, DatabaseIcon, GasStationIcon, RestoreIcon, SlidersIcon } from "../icons";
import { Stepper } from "../Stepper";
import { ToggleRow } from "../ToggleRow";
import { Accordion } from "./Accordion";
import { NumberField } from "./NumberField";

type SectionId = "vehicle" | "fuel" | "algorithm" | "system";

const REFERENCE_MODES: ReadonlyArray<{ value: ReferenceMode; label: string; hint: string }> = [
  { value: "auto", label: "Automatico", hint: "consigliato" },
  { value: "manual", label: "Manuale", hint: "lo imposti tu" },
];

const number = (digits: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const decimals = { 0: number(0), 1: number(1), 2: number(2) };
/** €/ora senza decimali inutili: "9", "7,5". */
const hourly = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Es. "9 €/h · ≈ €0,15/min". */
const vTimeText = (perMinute: number) => `${hourly.format(perHourFromMinute(perMinute))} €/h · ≈ €${decimals[2].format(perMinute)}/min`;

/**
 * Screen 5 — Impostazioni. Le sezioni sono tutte chiuse al caricamento. Le modifiche stanno in una bozza finché non si
 * preme «Salva Preferenze»; «Ripristina Predefiniti» riporta subito tutto ai valori di fabbrica (compreso «Automatico»
 * sul prezzo di riferimento e «Bilanciato» sul valore del tempo). Le preferenze precompilano la ricerca successiva.
 */
export function SettingsScreen() {
  const { settings, save, reset } = useSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [open, setOpen] = useState<Record<SectionId, boolean>>({ vehicle: false, fuel: false, algorithm: false, system: false });
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [resetCount, setResetCount] = useState(0);
  // «Personalizzato» è uno stato dell'interfaccia (non salvato): all'apertura vale solo se il valore non è un preset.
  const [customTime, setCustomTime] = useState(() => vTimePresetFor(settings.valueOfTimePerMinute) === undefined);
  const [notice, showNotice] = useNotice();

  const dirty = !samePreferences(draft, settings);
  const blocked = Object.values(invalid).some(Boolean);
  const markValid = (field: string) => (valid: boolean) => setInvalid((current) => (current[field] === !valid ? current : { ...current, [field]: !valid }));
  const toggle = (id: SectionId) => setOpen((current) => ({ ...current, [id]: !current[id] }));

  const setVehicle = (patch: Partial<Settings["vehicle"]>) => setDraft((d) => ({ ...d, vehicle: { ...d.vehicle, ...patch } }));
  const patch = (changes: Partial<Settings>) => setDraft((d) => ({ ...d, ...changes }));

  const chooseReferenceMode = (mode: ReferenceMode) =>
    setDraft((d) => ({
      ...d,
      referenceMode: mode,
      // Passando a «Manuale» i campi vuoti si pre-compilano con l'ultimo prezzo automatico noto; i valori già scritti restano.
      manualReference: mode === "manual" ? prefillManualReference({ ...d, lastAutomaticReference: settings.lastAutomaticReference }) : d.manualReference,
    }));

  const save_ = () => {
    save(draft);
    showNotice("Preferenze salvate");
  };

  const restore = () => {
    const next = reset();
    setDraft(next);
    setInvalid({});
    setCustomTime(false); // «Bilanciato»
    setResetCount((count) => count + 1);
    showNotice("Valori di fabbrica ripristinati");
  };

  // Valore del tempo: preset nominati; «Personalizzato» rivela lo slider (3–60 €/h).
  const perHour = perHourFromMinute(draft.valueOfTimePerMinute);
  const isCustomTime = customTime || vTimePresetFor(draft.valueOfTimePerMinute) === undefined;
  const activePreset = isCustomTime ? undefined : vTimePresetFor(draft.valueOfTimePerMinute);
  const chooseCustomTime = () => {
    setCustomTime(true);
    // Lo slider parte dal valore corrente, portato dentro il suo intervallo (da «Solo denaro» parte a 3 €/h).
    patch({ valueOfTimePerMinute: perMinuteFromHour(clamp(perHour, V_TIME_CUSTOM_RANGE.min, V_TIME_CUSTOM_RANGE.max)) });
  };

  // Costo al km del carburante predefinito: prezzo di riferimento (manuale se attivo, altrimenti l'ultimo automatico noto) ÷ consumo.
  const referenceFuel = draft.vehicle.defaultFuel;
  const manualPrice = draft.referenceMode === "manual" ? draft.manualReference[referenceFuel] : undefined;
  const referencePrice = manualPrice ?? settings.lastAutomaticReference[referenceFuel];
  const fuelLabel = FUEL_OPTIONS.find((o) => o.value === referenceFuel)?.label ?? "";
  const costPerKm = referencePrice !== undefined ? referencePrice / draft.consumptionKmPerLiter : null;
  const costTooltip =
    costPerKm !== null && referencePrice !== undefined
      ? `calcolato da €${formatPrice(referencePrice)}/L (${manualPrice !== undefined ? "riferimento manuale" : "ultimo riferimento automatico"} ${fuelLabel}) ÷ ${decimals[1].format(draft.consumptionKmPerLiter)} km/L`
      : undefined;
  const consumptionChanged =draft.consumptionKmPerLiter !== CONSUMPTION_SLIDER.default;

  return (
    <main className="flex-1 w-full bg-surface pt-24 pb-28 px-margin max-w-md mx-auto flex flex-col gap-space-lg">
      <header className="flex flex-col gap-space-sm">
        <span className="self-start inline-flex items-center gap-1.5 h-[26px] px-space-md rounded-full bg-surface-container-high text-on-surface-variant text-label-sm font-label-sm uppercase">
          <SlidersIcon className="w-3.5 h-3.5" />
          Calibrazione algoritmo
        </span>
        <h1 className="text-headline-md font-headline-md text-on-surface">Impostazioni Veicolo &amp; Risparmio</h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant">
          Ottimizza il calcolo dei rifornimenti lungo il percorso in base alle specifiche reali della tua auto.
        </p>
      </header>

      <div key={resetCount} className="flex flex-col gap-space-lg">
        <Accordion id="vehicle" title="Profilo Veicolo" icon={<CarIcon />} open={open.vehicle} onToggle={() => toggle("vehicle")}>
          <div className="flex flex-col gap-space-sm">
            <span id="body-type-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Tipologia carrozzeria
            </span>
            <div role="radiogroup" aria-labelledby="body-type-label" className="flex gap-space-sm overflow-x-auto no-scrollbar">
              {BODY_TYPES.map((option) => {
                const active = draft.vehicle.bodyType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVehicle({ bodyType: option.value as BodyType })}
                    className={`h-9 px-space-lg rounded-full shrink-0 whitespace-nowrap text-label-lg font-label-lg transition-colors ${
                      active ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-space-xs">
            <label htmlFor="model-name" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Modello
            </label>
            <input
              id="model-name"
              type="text"
              maxLength={60}
              value={draft.vehicle.modelName}
              placeholder="es. Volkswagen Golf 1.5 eTSI"
              onChange={(event) => setVehicle({ modelName: event.target.value })}
              className="h-11 rounded bg-surface-container-low px-space-lg text-body-md font-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex flex-col gap-space-xs">
            <Stepper label="Capacità serbatoio" value={draft.vehicle.tankLiters} unit="L" {...TANK_RANGE} onChange={(tankLiters) => setVehicle({ tankLiters })} />
            <p className="text-body-sm font-body-sm text-on-surface-variant">Precompila «Litri» nella ricerca.</p>
          </div>

          <div className="flex flex-col gap-space-sm">
            <span className="text-label-sm font-label-sm font-semibold text-on-surface">Carburante predefinito</span>
            <FuelChips value={draft.vehicle.defaultFuel} onChange={(defaultFuel) => setVehicle({ defaultFuel })} />
          </div>
        </Accordion>

        <Accordion id="fuel" title="Consumi e Carburante" icon={<GasStationIcon />} open={open.fuel} onToggle={() => toggle("fuel")}>
          <div className="flex flex-col gap-space-sm rounded-DEFAULT bg-surface-container-lowest border border-outline-variant/30 p-space-md">
            <div className="flex items-start justify-between gap-space-md">
              <div className="flex flex-col gap-space-xs">
                <label htmlFor="consumption-slider" className="text-label-sm font-label-sm font-semibold text-on-surface">
                  Consumo medio misto
                </label>
                <div className="flex items-center gap-space-sm">
                  <output
                    htmlFor="consumption-slider"
                    data-testid="consumption-pill"
                    className="inline-flex items-baseline gap-1 rounded-full bg-primary-fixed/30 text-on-primary-fixed-variant px-space-md py-space-xs tabular-nums"
                  >
                    <span className="text-label-lg font-label-lg font-bold">{decimals[1].format(draft.consumptionKmPerLiter)}</span>
                    {" "}
                    <span className="text-label-sm font-label-sm">km/L</span>
                  </output>
                  {consumptionChanged && (
                    <button
                      type="button"
                      onClick={() => patch({ consumptionKmPerLiter: CONSUMPTION_SLIDER.default })}
                      className="flex items-center gap-1 text-label-md font-label-md text-on-primary-fixed-variant hover:underline"
                    >
                      <RestoreIcon className="w-4 h-4" />
                      Ripristina
                    </button>
                  )}
                </div>
              </div>
              <div className="text-right flex flex-col">
                <span className="text-label-sm font-label-sm text-on-surface-variant">Costo / km</span>
                <span
                  data-testid="cost-per-km"
                  title={costTooltip}
                  className={`text-label-lg font-label-lg font-bold text-on-primary-fixed-variant tabular-nums ${costTooltip ? "cursor-help" : ""}`}
                >
                  {costPerKm !== null ? `~€${decimals[2].format(costPerKm)}/km` : "—"}
                </span>
                {costPerKm === null && <span className="text-label-sm font-label-sm text-on-surface-variant">nessun prezzo di riferimento noto</span>}
              </div>
            </div>
            <input
              id="consumption-slider"
              type="range"
              min={CONSUMPTION_SLIDER.min}
              max={CONSUMPTION_SLIDER.max}
              step={CONSUMPTION_SLIDER.step}
              value={draft.consumptionKmPerLiter}
              onChange={(event) => patch({ consumptionKmPerLiter: Number(event.target.value) })}
              className="w-full accent-primary"
            />
            {/* Tre tacche distribuite sotto lo slider (come nel mockup 5). */}
            <div className="flex justify-between text-label-sm font-label-sm text-on-surface-variant">
              <span>8 Sport</span>
              <span>15 Medio</span>
              <span>30 Eco</span>
            </div>
          </div>
        </Accordion>

        <Accordion id="algorithm" title="Algoritmo & Filtri" icon={<SlidersIcon />} open={open.algorithm} onToggle={() => toggle("algorithm")}>
          <div className="flex flex-col gap-space-sm">
            <span id="vtime-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Valore del tuo tempo
            </span>
            <div role="radiogroup" aria-labelledby="vtime-label" className="flex flex-wrap gap-space-sm">
              {V_TIME_PRESETS.map((preset) => {
                const active = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={`${hourly.format(preset.perHour)} €/h · ≈ €${decimals[2].format(perMinuteFromHour(preset.perHour))}/min`}
                    onClick={() => {
                      setCustomTime(false);
                      patch({ valueOfTimePerMinute: perMinuteFromHour(preset.perHour) });
                    }}
                    className={`h-9 px-space-lg rounded-full whitespace-nowrap text-label-lg font-label-lg transition-colors ${
                      active ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={isCustomTime}
                onClick={chooseCustomTime}
                className={`h-9 px-space-lg rounded-full whitespace-nowrap text-label-lg font-label-lg transition-colors ${
                  isCustomTime ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                Personalizzato
              </button>
            </div>

            <p data-testid="vtime-summary" className="text-label-md font-label-md text-on-surface tabular-nums">
              {draft.valueOfTimePerMinute === 0 ? "0 €/h · il tempo non entra nel risparmio netto" : vTimeText(draft.valueOfTimePerMinute)}
            </p>

            {isCustomTime && (
              <div className="flex flex-col gap-space-xs rounded-DEFAULT bg-surface-container-low p-space-md">
                <input
                  type="range"
                  aria-label="Valore del tuo tempo in euro all'ora"
                  min={V_TIME_CUSTOM_RANGE.min}
                  max={V_TIME_CUSTOM_RANGE.max}
                  step={V_TIME_CUSTOM_RANGE.step}
                  value={clamp(perHour, V_TIME_CUSTOM_RANGE.min, V_TIME_CUSTOM_RANGE.max)}
                  onChange={(event) => patch({ valueOfTimePerMinute: perMinuteFromHour(Number(event.target.value)) })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-label-sm font-label-sm text-on-surface-variant">
                  <span>{V_TIME_CUSTOM_RANGE.min} €/h</span>
                  <span>{V_TIME_CUSTOM_RANGE.max} €/h</span>
                </div>
              </div>
            )}

            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Quanto vale un&apos;ora del tuo tempo? RouteFuel sottrae al risparmio il tempo perso in deviazione, a questo valore.
            </p>
          </div>

          <div className="flex flex-col gap-space-sm">
            <span id="reference-mode-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
              Prezzo di riferimento
            </span>
            <div role="radiogroup" aria-labelledby="reference-mode-label" className="grid grid-cols-2 gap-space-sm">
              {REFERENCE_MODES.map((option) => {
                const active = draft.referenceMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseReferenceMode(option.value)}
                    className={`rounded-DEFAULT px-space-md py-space-sm flex flex-col items-center transition-colors ${
                      active ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    <span className="text-label-lg font-label-lg">{option.label}</span>
                    <span className="text-label-sm font-label-sm opacity-90">{option.hint}</span>
                  </button>
                );
              })}
            </div>
            {draft.referenceMode === "auto" ? (
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                Si calcola a ogni ricerca: mediana delle stazioni sul percorso, poi nel corridoio, poi nazionale.
              </p>
            ) : (
              <div className="flex flex-col gap-space-md rounded-DEFAULT bg-surface-container-low p-space-md">
                <p className="text-body-sm font-body-sm text-on-surface-variant">
                  Sostituisce completamente il calcolo automatico in tutte le ricerche, finché non torni su Automatico. Un carburante senza valore usa
                  il calcolo automatico.
                </p>
                {FUEL_OPTIONS.map((fuel) => (
                  <NumberField
                    key={fuel.value}
                    label={fuel.label}
                    value={draft.manualReference[fuel.value] ?? null}
                    min={REFERENCE_PRICE_RANGE.min}
                    max={REFERENCE_PRICE_RANGE.max}
                    unit="€/L"
                    optional
                    placeholder="auto"
                    onChange={(value) =>
                      setDraft((d) => {
                        const manualReference = { ...d.manualReference };
                        if (value === null) delete manualReference[fuel.value];
                        else manualReference[fuel.value] = value;
                        return { ...d, manualReference };
                      })
                    }
                    onValidityChange={markValid(`manual-${fuel.value}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <label htmlFor="default-detour" className="text-label-sm font-label-sm font-semibold text-on-surface">
                Deviazione massima predefinita
              </label>
              <output
                htmlFor="default-detour"
                data-testid="default-detour-pill"
                className="rounded-full bg-secondary/10 text-on-secondary-fixed-variant px-space-md py-space-xs text-label-lg font-label-lg tabular-nums"
              >
                {draft.defaultMaxDetourKm} km
              </output>
            </div>
            <input
              id="default-detour"
              type="range"
              {...DETOUR_RANGE}
              value={draft.defaultMaxDetourKm}
              onChange={(event) => patch({ defaultMaxDetourKm: Number(event.target.value) })}
              className="w-full accent-primary"
            />
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Km extra totali (andata e ritorno) rispetto al percorso diretto. Precompila lo slider della ricerca; lo puoi cambiare per ogni ricerca.
            </p>
          </div>

          <div className="flex flex-col gap-space-md">
            <ToggleRow
              label="Evita autostrada"
              description="Percorso diretto e verifiche senza autostrada: la deviazione si misura contro il percorso senza autostrada. Precompila lo switch della ricerca."
              checked={draft.avoidMotorway}
              onChange={(avoidMotorway) => patch({ avoidMotorway })}
            />
            <ToggleRow
              label="Evita pedaggi"
              description="Default delle Opzioni percorso nei Risultati. Il costo del pedaggio non rientra nel calcolo del risparmio."
              checked={draft.avoidTolls}
              onChange={(avoidTolls) => patch({ avoidTolls })}
            />
            <ToggleRow
              label="Evita traghetti"
              description="Default delle Opzioni percorso nei Risultati."
              checked={draft.avoidFerries}
              onChange={(avoidFerries) => patch({ avoidFerries })}
            />
            <ToggleRow
              label="Cerca solo stazioni Self per impostazione predefinita"
              description="Precompila lo switch «Solo Self» della ricerca; lo puoi cambiare per ogni ricerca."
              checked={draft.onlySelf}
              onChange={(onlySelf) => patch({ onlySelf })}
            />
          </div>
        </Accordion>

        <Accordion id="system" title="Notifiche & Dati di Sistema" icon={<DatabaseIcon />} open={open.system} onToggle={() => toggle("system")}>
          <NumberField
            label="Soglia di freschezza prezzi"
            value={draft.maxPriceAgeHours}
            min={FRESHNESS_RANGE.min}
            max={FRESHNESS_RANGE.max}
            unit="ore"
            integer
            hint="I prezzi comunicati da più di questo tempo non compaiono nei risultati (default 72 ore)."
            onChange={(value) => value !== null && patch({ maxPriceAgeHours: value })}
            onValidityChange={markValid("freshness")}
          />
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Fonte dei prezzi: MIMIT Osservaprezzi (file giornaliero e prezzi in tempo reale dal sito ufficiale). Le notifiche non sono disponibili in questa versione.
          </p>
        </Accordion>
      </div>

      <div className="rounded-lg bg-surface/85 backdrop-blur-xl shadow-lg border border-outline-variant/30 p-space-md flex flex-col gap-space-sm">
        {notice && (
          <p role="status" className="text-center text-label-lg font-label-lg text-on-primary-fixed-variant">
            {notice}
          </p>
        )}
        {!notice && dirty && (
          <p role="status" className="text-center text-label-md font-label-md text-on-surface-variant">
            {blocked ? "Correggi i campi evidenziati per salvare." : "Modifiche non salvate."}
          </p>
        )}
        <button
          type="button"
          onClick={save_}
          disabled={!dirty || blocked}
          className="h-12 rounded-full bg-primary text-on-primary text-headline-sm font-headline-sm flex items-center justify-center gap-space-sm shadow-sm hover:brightness-95 active:scale-[0.99] transition disabled:opacity-50 disabled:hover:brightness-100"
        >
          Salva Preferenze
        </button>
        <button
          type="button"
          onClick={restore}
          className="h-10 rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg flex items-center justify-center gap-space-sm"
        >
          <RestoreIcon className="w-4 h-4" />
          Ripristina Predefiniti
        </button>
      </div>
    </main>
  );
}
