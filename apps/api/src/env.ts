import "dotenv/config";
import { z } from "zod";

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
  MIMIT_ANAGRAFICA_URL: z
    .string()
    .url()
    .default("https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv"),
  MIMIT_PREZZI_URL: z.string().url().default("https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv"),
});

export const env = envSchema.parse(process.env);
