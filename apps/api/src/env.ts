import "dotenv/config";
import { z } from "zod";

/** Una variabile lasciata vuota in .env (es. `MAPBOX_SERVER_TOKEN=`) vale come non impostata. */
const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(blankToUndefined, z.enum(values).optional());
const booleanString = z
  .preprocess(blankToUndefined, z.enum(["true", "false"]).default("false"))
  .transform((value) => value === "true");

/**
 * Validazione centralizzata delle variabili d'ambiente: l'API rifiuta di
 * avviarsi se manca un valore obbligatorio, invece di fallire più avanti
 * con un errore criptico. Nessun segreto ha un default hardcoded.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL è obbligatoria"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /** true dietro un reverse proxy (Railway, ecc.), altrimenti il rate limit vedrebbe sempre l'IP del proxy. */
  TRUST_PROXY: booleanString,

  MIMIT_ANAGRAFICA_URL: z
    .string()
    .url()
    .default("https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv"),
  MIMIT_PREZZI_URL: z.string().url().default("https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv"),

  /** Token Mapbox usato SOLO lato server (Directions + Geocoding). Mai esposto al browser. */
  MAPBOX_SERVER_TOKEN: optionalString,
  /** Se omessi: 'mapbox' quando il token è presente, altrimenti 'fixture' / 'mock' (sviluppo senza chiavi). */
  GEOCODING_PROVIDER: optionalEnum(["mapbox", "fixture"]),
  ROUTING_PROVIDER: optionalEnum(["mapbox", "mock"]),

  /** Kill switch: oltre la soglia soft si disabilita il ricalcolo con routing reale (resta il proxy). */
  DIRECTIONS_SOFT_LIMIT: z.coerce.number().int().positive().default(80_000),
  /** Oltre la soglia hard si smette di chiamare Directions (free tier Mapbox: 100.000/mese). */
  DIRECTIONS_HARD_LIMIT: z.coerce.number().int().positive().default(98_000),

  SEARCH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  GEOCODE_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
