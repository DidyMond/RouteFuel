import { useState } from "react";
import { useNotice } from "../../hooks/useNotice";
import { useSettings } from "../../hooks/useSettings";
import { CONSUMPTION_RANGE, FUEL_OPTIONS } from "../../lib/defaults";
import { formatPrice } from "../../lib/format";
import {
  BODY_TYPES,
  FACTORY_SETTINGS,
  FRESHNESS_RANGE,
  prefillManualReference,
  REFERENCE_PRICE_RANGE,
  samePreferences,
  TANK_RANGE,
  V_TIME_RANGE,
  type BodyType,
  type ReferenceMode,
  type Settings,
} from "../../lib/settings";
import { FuelChips } from "../FuelChips";
import { CarIcon, DatabaseIcon, GasStationIcon, RestoreIcon, SlidersIcon } from "../icons";
import { Stepper } from "../Stepper";
import { Accordion } from "./Accordion";
import { NumberField } from "./NumberField";

type SectionId = "vehicle" | "fuel" | "algorithm" | "system";

const REFERENCE_MODES: ReadonlyArray<{ value: ReferenceMode; label: string; hint: string }> = [
  { value: "auto", label: "Automatico", hint: "consigliato" },
  { value: "manual", label: "Manuale", hint: "lo imposti tu" },
];

/**
 * Screen 5 — Impostazioni. Le modifiche stanno in una bozza finché non si preme «Salva Preferenze»; «Ripristina
 * Predefiniti» riporta subito tutto ai valori di fabbrica (compreso «Automatico» sul prezzo di riferimento). Le
 * preferenze precompilano la ricerca successiva e ne fissano i parametri dell'algoritmo.
 */
export function SettingsScreen() {
  const { settings, save, reset } = useSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [open, setOpen] = useState<Record<SectionId, boolean>>({ vehicle: true, fuel: true, algorithm: false, system: false });
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [resetCount, setResetCount] = useState(0);
  const [consumptionKey, setConsumptionKey] = useState(0);
  const [notice, showNotice] = useNotice();

  const dirty = !samePreferences(draft, settings);
  const blocked = Object.values(invalid).some(Boolean);
  const markValid = (field: string) => (valid: boolean) => setInvalid((current) => (current[field] === !valid ? current : { ...current, [field]: !valid }));
  const toggle = (id: SectionId) => setOpen((current) => ({ ...current, [id]: !current[id] }));

  const setVehicle = (patch: Partial<Settings["vehicle"]>) => setDraft((d) => ({ ...d, vehicle: { ...d.vehicle, ...patch } }));

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
    setResetCount((count) => count + 1);
    showNotice("Valori di fabbrica ripristinati");
  };

  const lastReference = settings.lastAutomaticReference[draft.vehicle.defaultFuel];
  const fuelLabel = FUEL_OPTIONS.find((o) => o.value === draft.vehicle.defaultFuel)?.label ?? "";

  return (
    <div className="flex-1 w-full bg-surface pt-24 pb-28 px-margin max-w-md mx-auto flex flex-col gap-space-lg">
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
          <div className="flex flex-col gap-space-sm">
            <NumberField
              key={consumptionKey}
              label="Consumo medio misto"
              value={draft.consumptionKmPerLiter}
              min={CONSUMPTION_RANGE.min}
              max={CONSUMPTION_RANGE.max}
              unit="km/L"
              onChange={(value) => value !== null && setDraft((d) => ({ ...d, consumptionKmPerLiter: value }))}
              onValidityChange={markValid("consumption")}
            />
            {(draft.consumptionKmPerLiter !== FACTORY_SETTINGS.consumptionKmPerLiter || invalid.consumption) && (
              <button
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...d, consumptionKmPerLiter: FACTORY_SETTINGS.consumptionKmPerLiter }));
                  setConsumptionKey((key) => key + 1);
                }}
                className="self-end flex items-center gap-1 text-label-md font-label-md text-on-primary-fixed-variant hover:underline"
              >
                <RestoreIcon className="w-4 h-4" />
                Ripristina ({String(FACTORY_SETTINGS.consumptionKmPerLiter).replace(".", ",")} km/L)
              </button>
            )}
            <p data-testid="cost-per-km" className="text-body-sm font-body-sm text-on-surface-variant tabular-nums">
              {lastReference !== undefined
                ? `Costo stimato ~${formatPrice(lastReference / draft.consumptionKmPerLiter)} €/km (ultimo riferimento ${fuelLabel} €${formatPrice(lastReference)}/L ÷ consumo).`
                : "Il costo al km si calcola dal prezzo di riferimento della tratta, a ogni ricerca."}
            </p>
          </div>
        </Accordion>

        <Accordion id="algorithm" title="Algoritmo & Filtri" icon={<SlidersIcon />} open={open.algorithm} onToggle={() => toggle("algorithm")}>
          <NumberField
            label="Valore del tuo tempo"
            value={draft.valueOfTimePerMinute}
            min={V_TIME_RANGE.min}
            max={V_TIME_RANGE.max}
            unit="€/min"
            hint="Quanto vale un minuto in più di deviazione (default 0,15 €/min)."
            onChange={(value) => value !== null && setDraft((d) => ({ ...d, valueOfTimePerMinute: value }))}
            onValidityChange={markValid("vtime")}
          />

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

          <div className="flex items-center justify-between gap-space-md">
            <div>
              <span id="avoid-motorway-label" className="text-label-sm font-label-sm font-semibold text-on-surface">
                Evita autostrada
              </span>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                Percorso diretto e verifiche senza autostrada: la deviazione si misura contro il percorso senza autostrada. Il pedaggio non rientra nel calcolo.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.avoidMotorway}
              aria-labelledby="avoid-motorway-label"
              onClick={() => setDraft((d) => ({ ...d, avoidMotorway: !d.avoidMotorway }))}
              className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${draft.avoidMotorway ? "bg-primary" : "bg-surface-container-high"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm transition-transform ${draft.avoidMotorway ? "translate-x-5" : ""}`}
              />
            </button>
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
            onChange={(value) => value !== null && setDraft((d) => ({ ...d, maxPriceAgeHours: value }))}
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
    </div>
  );
}
