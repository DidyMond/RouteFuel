import { Header } from "./components/Header";
import { ResultsPanel } from "./components/ResultsPanel";
import { SearchForm } from "./components/SearchForm";
import { useSearch } from "./hooks/useSearch";

export default function App() {
  const { state, search } = useSearch();

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen relative overflow-x-hidden">
      <Header />
      <main className="flex-1 w-full bg-surface pt-24 pb-12 flex flex-col px-margin gap-space-xl max-w-md mx-auto">
        <SearchForm onSubmit={search} busy={state.status === "loading"} />
        <ResultsPanel state={state} />
      </main>
    </div>
  );
}
