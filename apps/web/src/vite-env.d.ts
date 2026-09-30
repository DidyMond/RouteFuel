/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Token pubblico Mapbox (Map GL JS) con restrizione per URL. Solo in apps/web/.env, mai committato. */
  readonly VITE_MAPBOX_PUBLIC_TOKEN?: string;
  /** Stile della mappa (mapbox://styles/...). Opzionale: se assente si usa il basemap Standard di default. */
  readonly VITE_MAPBOX_STYLE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
