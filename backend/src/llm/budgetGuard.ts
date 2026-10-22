import type { RouteConfig } from './routes.config.js';

interface UsageRecord {
  timestamp: number;
  tokens: number;
}

class BudgetGuard {
  // Key: provider:model -> array of recent calls within 60s
  private usageMap: Map<string, UsageRecord[]> = new Map();

  private getKey(route: RouteConfig): string {
    return `${route.provider}:${route.model}`;
  }

  /**
   * Fast rule-of-thumb token estimator: ~4 characters per token
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
  }

  /**
   * Clean records older than 60 seconds
   */
  private prune(records: UsageRecord[], now: number): UsageRecord[] {
    const cutoff = now - 60_000;
    return records.filter(r => r.timestamp > cutoff);
  }

  /**
   * Check if a route can spend estimated tokens without exceeding TPM or RPM
   */
  public canSpend(route: RouteConfig, estimatedTokens: number): boolean {
    const key = this.getKey(route);
    const now = Date.now();
    const records = this.prune(this.usageMap.get(key) || [], now);
    this.usageMap.set(key, records);

    // RPM check
    if (route.maxRpm && records.length >= route.maxRpm) {
      console.warn(`[BudgetGuard] RPM limit reached for ${key} (${records.length}/${route.maxRpm} reqs in last 60s)`);
      return false;
    }

    // TPM check
    if (route.maxTpm) {
      const currentTokens = records.reduce((sum, r) => sum + r.tokens, 0);
      if (currentTokens + estimatedTokens > route.maxTpm) {
        console.warn(`[BudgetGuard] TPM budget almost full for ${key} (${currentTokens + estimatedTokens}/${route.maxTpm} tokens in last 60s)`);
        return false;
      }
    }

    return true;
  }

  /**
   * Record actual or estimated token consumption
   */
  public record(route: RouteConfig, tokens: number): void {
    const key = this.getKey(route);
    const now = Date.now();
    const records = this.prune(this.usageMap.get(key) || [], now);
    records.push({ timestamp: now, tokens: Math.max(tokens, 1) });
    this.usageMap.set(key, records);
  }

  /**
   * Current stats for debugging/monitoring
   */
  public getStats(route: RouteConfig): { currentRpm: number; currentTpm: number } {
    const key = this.getKey(route);
    const now = Date.now();
    const records = this.prune(this.usageMap.get(key) || [], now);
    return {
      currentRpm: records.length,
      currentTpm: records.reduce((sum, r) => sum + r.tokens, 0)
    };
  }
}

export const budgetGuard = new BudgetGuard();
