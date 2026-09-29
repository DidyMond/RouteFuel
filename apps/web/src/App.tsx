import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { ResultsScreen } from "./components/results/ResultsScreen";
import { SearchError } from "./components/SearchError";
import { SearchForm } from "./components/SearchForm";
import { useSearch } from "./hooks/useSearch";

export default function App() {
  const { state, search } = useSearch();
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

  // Mentre il server cerca si scarica già il codice della mappa (chunk separato): compare prima sui Risultati.
  const searching = state.status === "loading";
  useEffect(() => {
    if (searching) void import("./components/results/MapCanvas");
  }, [searching]);

  const onResults = pathname === "/results";

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen relative overflow-x-hidden">
      <Header />

      {/* La Home resta montata (solo nascosta) sulla schermata Risultati, così il form conserva i valori inseriti. */}
      <main className={`flex-1 w-full bg-surface pt-24 pb-28 px-margin gap-space-xl max-w-md mx-auto ${onResults ? "hidden" : "flex flex-col"}`}>
        <SearchForm onSubmit={search} busy={state.status === "loading"} />
        {state.status === "error" && <SearchError error={state.error} />}
      </main>

      <Routes>
        <Route path="/" element={null} />
        <Route path="/results" element={state.status === "success" ? <ResultsScreen state={state} /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <BottomNav hasResults={state.status === "success"} />
    </div>
  );
}
