import type { StationDetailResponse } from "@routefuel/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStationDetail } from "../../hooks/useStationDetail";
import { isStationSaved, toggleSavedStation } from "../../lib/bookmarks";
import { formatKm, formatPrice } from "../../lib/format";
import { navigationLink } from "../../lib/navigation";
import { shareStation } from "../../lib/share";
import { fuelModeLabel } from "../../lib/stationView";
import { SpinnerIcon } from "../icons";
import { NavigateSheet } from "../results/NavigateSheet";
import { ImpactBento } from "./ImpactBento";
import { NavigateBar } from "./NavigateBar";
import { PriceMatrix } from "./PriceMatrix";
import { StationHeader } from "./StationHeader";
import { fullAddress, StationMeta } from "./StationMeta";

/** Avviso passeggero («Stazione salvata», «Link copiato»…): sparisce da solo e viene letto dai lettori di schermo. */
function useNotice(): [string | null, (message: string) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 2500);
  }, []);
  return [notice, show];
}

function LoadingBody() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-space-lg">
      <div className="flex items-center gap-space-sm text-body-md font-body-md text-on-surface-variant">
        <SpinnerIcon className="w-4 h-4 text-on-secondary-fixed-variant" />
        Verifico la deviazione sul percorso reale…
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="rounded-lg bg-surface-container-high animate-pulse h-36" />
      ))}
    </div>
  );
}

function ErrorBody({ code, message, onRetry, onBack }: { code: string; message: string; onRetry: () => void; onBack: () => void }) {
  const expired = code === "SEARCH_NOT_FOUND" || code === "NOT_FOUND";
  return (
    <div role="alert" className="rounded-lg bg-surface-container-lowest shadow-sm border border-outline-variant/30 p-space-xl flex flex-col items-center gap-space-md text-center">
      <p className="text-headline-sm font-headline-sm text-on-surface">
        {expired ? "Questa ricerca non è più disponibile" : "Non riesco a caricare la stazione"}
      </p>
      <p className="text-body-md font-body-md text-on-surface-variant">
        {expired ? "I risultati restano in memoria per pochi minuti: torna alla ricerca e rifalla." : message}
      </p>
      <div className="flex flex-wrap justify-center gap-space-sm">
        {!expired && (
          <button type="button" onClick={onRetry} className="h-10 px-space-xl rounded-full bg-primary text-on-primary text-label-lg font-label-lg">
            Riprova
          </button>
        )}
        <button type="button" onClick={onBack} className="h-10 px-space-xl rounded-full bg-surface-container-low text-on-surface text-label-lg font-label-lg">
          Torna ai risultati
        </button>
      </div>
    </div>
  );
}

/**
 * Screen 3 — Dettaglio stazione (rotta `/station/:searchId/:stationId`). Il server verifica la deviazione col routing
 * reale (o la dichiara stima); qui si mostra: intestazione, impatto sul viaggio, listino prezzi e la CTA per navigare.
 * Indietro riporta a `/results`, dove la ricerca (e i filtri) sono ancora quelli di prima.
 */
export function StationDetailScreen() {
  const { searchId = "", stationId = "" } = useParams();
  const id = Number(stationId);
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const state = useStationDetail(searchId, Number.isInteger(id) && id > 0 ? id : 0, attempt);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, showNotice] = useNotice();
  const [saved, setSaved] = useState(() => isStationSaved(id));

  useEffect(() => {
    setSaved(isStationSaved(id));
  }, [id]);
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [searchId, stationId]);

  const goBack = useCallback(() => navigate("/results"), [navigate]);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const detail: StationDetailResponse | null = state.status === "success" ? state.detail : null;

  const toggleSaved = () => {
    if (!detail) return;
    const { station } = detail;
    const nowSaved = toggleSavedStation({ id: station.id, nomeImpianto: station.nomeImpianto, comune: station.comune, lat: station.lat, lon: station.lon });
    setSaved(nowSaved);
    showNotice(nowSaved ? "Stazione salvata" : "Rimossa dai salvati");
  };

  const share = async () => {
    if (!detail) return;
    const { station, selected } = detail;
    const target = { name: station.nomeImpianto, lat: station.lat, lon: station.lon };
    const outcome = await shareStation({
      title: station.nomeImpianto,
      text: `${station.nomeImpianto} · ${fuelModeLabel(selected.fuelType, selected.isSelf)} €${formatPrice(selected.price)}/L · ${fullAddress(station)}`,
      url: navigationLink("google", target).url,
    });
    if (outcome === "copied") showNotice("Link copiato negli appunti");
    if (outcome === "failed") showNotice("Condivisione non riuscita");
  };

  return (
    <div className="flex-1 bg-surface">
      <StationHeader onBack={goBack} saved={saved} onToggleSaved={toggleSaved} onShare={share} actionsDisabled={detail === null} />

      <main className="max-w-md mx-auto px-margin pt-[calc(88px+env(safe-area-inset-top,0px))] pb-[calc(9rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-space-lg">
        {notice && (
          <p role="status" className="self-center rounded-full bg-inverse-surface text-inverse-on-surface text-label-lg font-label-lg px-space-xl py-space-sm shadow-lg">
            {notice}
          </p>
        )}

        {state.status === "loading" && <LoadingBody />}
        {state.status === "error" && (
          <ErrorBody code={state.error.code} message={state.error.message} onRetry={() => setAttempt((n) => n + 1)} onBack={goBack} />
        )}
        {detail && (
          <>
            <StationMeta station={detail.station} />
            <ImpactBento detail={detail} />
            <PriceMatrix detail={detail} />
            <p className="text-body-sm font-body-sm text-on-surface-variant text-center px-gutter tabular-nums">
              A {formatKm(detail.alongRouteKm)} dalla partenza, a {formatKm(detail.lateralDistanceKm)} dal percorso diretto.
            </p>
          </>
        )}
      </main>

      <NavigateBar stationName={detail?.station.nomeImpianto ?? "stazione"} onNavigate={() => setMenuOpen(true)} disabled={detail === null} />

      {menuOpen && detail && (
        <NavigateSheet
          station={detail.station}
          summary={{ price: detail.selected.price, modeLabel: fuelModeLabel(detail.selected.fuelType, detail.selected.isSelf), netSavings: detail.impact.netSavings }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
