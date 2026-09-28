import { env } from "../../env";
import type { FuelDataProvider } from "./FuelDataProvider";

async function fetchCsv(url: string, label: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download CSV MIMIT (${label}) fallito: HTTP ${response.status} da ${url}`);
  }
  return response.text();
}

export class MimitFuelDataProvider implements FuelDataProvider {
  async fetchAnagraficaCsv(): Promise<string> {
    return fetchCsv(env.MIMIT_ANAGRAFICA_URL, "anagrafica");
  }

  async fetchPrezziCsv(): Promise<string> {
    return fetchCsv(env.MIMIT_PREZZI_URL, "prezzi");
  }
}
