import type { StationResult } from "@routefuel/shared";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { InstallBanner } from "./components/InstallBanner";
import { OfflineNotice } from "./components/OfflineNotice";
import { ResultsScreen } from "./components/results/ResultsScreen";
import { SearchError } from "./components/SearchError";
import { SearchForm } from "./components/SearchForm";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { StationDetailScreen } from "./components/station/StationDetailScreen";
import { useSearch } from "./hooks/useSearch";
import { SettingsProvider, useSettings } from "./hooks/useSettings";
import type { RouteExclusions } from "./lib/routeOptions";

export default function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}

function AppShell() {
  const { state, search } = useSearch();
  const { settings, rememberAutomaticReference } = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Ogni nuova ricerca riuscita porta alla schermata Risultati. Gli aggiornamenti successivi (verifica del routing)
  // non cambiano searchId, quindi non ri-navigano.
  const lastNavigatedSearch = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== "success" || state.response.searchId === lastNavigatedSearch.current) return;
    lastNavigatedSearch.current = state.response.searchId;
    navigate("/results");
  }, [state, navigate]);

  // L'ultimo prezzo di riferimento AUTOMATICO di ogni carburante serve a pre-compilare «Manuale» nelle Impostazioni.
  const successId = state.status === "success" ? state.response.searchId : null;
  useEffect(() => {
    if (state.status !== "success" || state.response.referencePrice.level === "manual") return;
    rememberAutomaticReference(state.request.fuelType, state.response.referencePrice.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una volta per ricerca.
  }, [successId]);

  // Mentre il server cerca si scarica già il codice della mappa (chunk separato): compare prima sui Risultati.
  const searching = state.status === "loading";
  useEffect(() => {
    if (searching) void import("./components/results/MapCanvas");
  }, [searching]);

  // Rilanciando la ricerca dai Risultati («Opzioni percorso» → Applica) si resta sui risultati precedenti finché
  // arrivano i nuovi: lo stato passa da «loading» ma la schermata non sparisce.
  const lastSuccess = useRef<Extract<typeof state, { status: "success" }> | null>(null);
  if (state.status === "success") lastSuccess.current = state;
  const resultsState = state.status === "success" ? state : state.status === "loading" ? lastSuccess.current : null;

  const routeDefaults = useMemo<RouteExclusions>(
    () => ({ avoidMotorway: settings.avoidMotorway, avoidTolls: settings.avoidTolls, avoidFerries: settings.avoidFerries }),
    [settings.avoidMotorway, settings.avoidTolls, settings.avoidFerries],
  );
  const applyRouteOptions = useCallback(
    (exclusions: RouteExclusions) => {
      if (state.status !== "success") return;
      void search({ ...state.request, ...exclusions }, state.labels);
    },
    [state, search],
  );

  const onHome = pathname === "/";
  const onStation = pathname.startsWith("/station/");
  const searchId = state.status === "success" ? state.response.searchId : null;
  const openStation = useCallback((result: StationResult) => navigate(`/station/${searchId}/${result.station.id}`), [navigate, searchId]);

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen relative overflow-x-hidden">
      {/* Le schermate a pila (dettaglio stazione) hanno il proprio header e niente barra inferiore. */}
      {!onStation && <Header />}

      {/* La Home resta montata (solo nascosta) sulle altre schermate, così il form conserva i valori inseriti. */}
      <main className={`flex-1 w-full bg-surface pt-24 pb-28 px-margin gap-space-xl max-w-md mx-auto ${onHome ? "flex flex-col" : "hidden"}`}>
        <InstallBanner />
        <OfflineNotice />
        <SearchForm onSubmit={search} busy={state.status === "loading"} />
        {state.status === "error" && <SearchError error={state.error} />}
      </main>

      {/* Anche i Risultati restano montati (nascosti) sul dettaglio stazione: tornando indietro ordinamento, filtri,
          selezione e posizione della mappa sono quelli di prima. */}
      {resultsState && (pathname === "/results" || onStation) && (
        <div className={onStation ? "hidden" : ""}>
          <ResultsScreen
            state={resultsState}
            onOpenStation={openStation}
            routeDefaults={routeDefaults}
            onApplyRouteOptions={applyRouteOptions}
            searching={state.status === "loading"}
          />
        </div>
      )}

      <Routes>
        <Route path="/" element={null} />
        <Route path="/results" element={resultsState ? null : <Navigate to="/" replace />} />
        <Route path="/station/:searchId/:stationId" element={<StationDetailScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!onStation && <BottomNav hasResults={resultsState !== null} />}
    </div>
  );
}
