export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NO_ROUTE"
  | "NO_PRICE_DATA"
  | "NOT_FOUND"
  | "SEARCH_NOT_FOUND"
  | "BUDGET_EXHAUSTED"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** Errore atteso, con codice stabile per il client e status HTTP associato. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Errore di un provider esterno (Mapbox). Il messaggio non deve mai contenere
 * l'URL della richiesta: include il token di accesso come query param.
 */
export class ProviderError extends AppError {
  constructor(message: string) {
    super("PROVIDER_ERROR", 502, message);
    this.name = "ProviderError";
  }
}

export class BudgetExhaustedError extends AppError {
  constructor() {
    super(
      "BUDGET_EXHAUSTED",
      503,
      "Limite mensile del servizio di routing raggiunto: la ricerca è temporaneamente non disponibile.",
    );
    this.name = "BudgetExhaustedError";
  }
}
