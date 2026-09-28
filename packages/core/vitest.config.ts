import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Necessario perché @routefuel/shared è un pacchetto workspace risolto
    // come sorgente TypeScript (non compilato): Vitest deve trasformarlo
    // invece di trattarlo come un pacchetto node_modules già pronto all'uso.
    server: {
      deps: {
        inline: [/@routefuel\//],
      },
    },
  },
});
