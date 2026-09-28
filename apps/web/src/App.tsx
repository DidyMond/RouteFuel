import { Header } from "./components/Header";
import { SearchBar } from "./components/SearchBar";

export default function App() {
  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen relative overflow-x-hidden">
      <Header />
      <main className="flex-1 w-full bg-surface pt-24 pb-12 flex flex-col px-margin gap-3 max-w-md mx-auto">
        <SearchBar />
      </main>
    </div>
  );
}
