import type { LonLat } from "@routefuel/shared";
import { BudgetExhaustedError } from "../../errors";
import type { DirectionsBudget } from "./DirectionsBudget";
import type { RouteResult, RoutingProvider } from "./RoutingProvider";

/**
 * Decoratore che conta ogni chiamata reale al provider e blocca oltre il
 * limite hard. Va posto SOTTO la cache, così le risposte servite dalla cache
 * non consumano quota.
 */
export class BudgetedRoutingProvider implements RoutingProvider {
  constructor(
    private readonly inner: RoutingProvider,
    private readonly budget: DirectionsBudget,
  ) {}

  async getRoute(waypoints: readonly LonLat[]): Promise<RouteResult | null> {
    if ((await this.budget.status()) === "hard_limit") {
      throw new BudgetExhaustedError();
    }
    // Si conta prima della chiamata (conservativo): una richiesta fallita può comunque essere fatturata.
    await this.budget.record();
    return this.inner.getRoute(waypoints);
  }
}
