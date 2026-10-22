import type { RouteConfig } from './routes.config.js';

interface BreakerState {
  failureCount: number;
  openUntil: number;
}

class CircuitBreaker {
  private stateMap: Map<string, BreakerState> = new Map();
  private readonly threshold = 2; // Open circuit after 2 consecutive retryable errors
  private readonly cooldownMs = 20_000; // 20-second cooldown window

  private getKey(route: RouteConfig): string {
    return `${route.provider}:${route.model}`;
  }

  public isOpen(route: RouteConfig): boolean {
    const key = this.getKey(route);
    const state = this.stateMap.get(key);
    if (!state) return false;

    if (Date.now() < state.openUntil) {
      console.warn(`[CircuitBreaker] Skipping ${key} (circuit open until ${new Date(state.openUntil).toLocaleTimeString()})`);
      return true;
    }

    // Cooldown elapsed, half-open
    if (state.openUntil > 0 && Date.now() >= state.openUntil) {
      this.stateMap.set(key, { failureCount: 1, openUntil: 0 });
    }
    return false;
  }

  public recordSuccess(route: RouteConfig): void {
    const key = this.getKey(route);
    this.stateMap.delete(key);
  }

  public recordFailure(route: RouteConfig, statusCode?: number): void {
    const key = this.getKey(route);
    const current = this.stateMap.get(key) || { failureCount: 0, openUntil: 0 };
    const failureCount = current.failureCount + 1;

    // Rate limits (429) trip immediately for 90s
    if (statusCode === 429 || failureCount >= this.threshold) {
      const openUntil = Date.now() + this.cooldownMs;
      console.warn(`[CircuitBreaker] Tripped for ${key} due to ${statusCode || 'repeated errors'}. Pausing until ${new Date(openUntil).toLocaleTimeString()}`);
      this.stateMap.set(key, { failureCount, openUntil });
    } else {
      this.stateMap.set(key, { failureCount, openUntil: 0 });
    }
  }
}

export const circuitBreaker = new CircuitBreaker();
