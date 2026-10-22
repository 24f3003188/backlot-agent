export type ProviderName = 'bedrock' | 'groq' | 'openrouter' | 'gemini';
export type RoleName = 'loop' | 'writer' | 'critic' | 'scout_planner';

export interface RouteConfig {
  provider: ProviderName;
  model: string;
  maxTpm?: number;
  maxRpm?: number;
  temperature?: number;
  maxTokens?: number;
}

// ── Region-aware Bedrock model IDs ──────────────────────────────────────────
// `us.` profiles only work from US regions. We try the in-region model first,
// then the geo cross-region profile for the configured region, then the global
// Nova 2 Lite profile (callable from every commercial region).
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

function geoPrefix(region: string): string | null {
  if (region.startsWith('us-gov')) return null;
  if (region.startsWith('us-')) return 'us';
  if (region.startsWith('eu-') || region.startsWith('il-')) return 'eu';
  if (region.startsWith('ap-') || region.startsWith('me-')) return 'apac';
  return null;
}
const GEO = geoPrefix(REGION);

const MODELS = {
  // OpenAI open-weight 120B: in-region in most regions incl. Sydney, ~$0.15 in / $0.62 out per 1M tokens
  gptOss120b: 'openai.gpt-oss-120b-1:0',
  gptOss20b: 'openai.gpt-oss-20b-1:0',
  // Amazon Nova 2 Lite: global profile, strong tool calling, 1M context
  nova2Lite: 'global.amazon.nova-2-lite-v1:0',
  novaPro: 'amazon.nova-pro-v1:0',
  novaLite: 'amazon.nova-lite-v1:0',
  novaMicro: 'amazon.nova-micro-v1:0',
};
const geo = (id: string) => (GEO ? `${GEO}.${id}` : id);

const bedrock = (model: string, temperature: number, maxTokens: number): RouteConfig => ({
  provider: 'bedrock', model, maxTpm: 200000, maxRpm: 100, temperature, maxTokens,
});
const openrouter = (model: string, temperature: number, maxTokens: number): RouteConfig => ({
  provider: 'openrouter', model, maxTpm: 50000, maxRpm: 20, temperature, maxTokens,
});

export const ROUTES: Record<RoleName, RouteConfig[]> = {
  // Plans which taste categories to scout. Short JSON output.
  // Nova 2 Lite answers directly (no hidden reasoning), so it's the fastest for short JSON.
  scout_planner: [
    bedrock(MODELS.nova2Lite, 0.3, 2000),
    bedrock(MODELS.gptOss120b, 0.3, 3000),
    bedrock(MODELS.novaPro, 0.3, 1500),
    bedrock(geo(MODELS.novaPro), 0.3, 1500),
    openrouter('openrouter/free', 0.3, 1500),
  ],

  // Tool-calling scout loop. Nova models have documented Converse tool use.
  loop: [
    bedrock(MODELS.nova2Lite, 0.2, 1024),
    bedrock(MODELS.novaPro, 0.2, 1024),
    bedrock(geo(MODELS.novaPro), 0.2, 1024),
    bedrock(MODELS.gptOss120b, 0.2, 1024),
    bedrock(geo(MODELS.novaLite), 0.2, 1024),
    openrouter('openrouter/free', 0.2, 1024),
  ],

  // World content writer. JSON-heavy, runs several calls in parallel.
  writer: [
    bedrock(MODELS.nova2Lite, 0.75, 4000),
    bedrock(MODELS.gptOss120b, 0.75, 4000),
    bedrock(MODELS.novaPro, 0.75, 4000),
    bedrock(geo(MODELS.novaPro), 0.75, 4000),
    bedrock(geo(MODELS.novaLite), 0.75, 4000),
    openrouter('openrouter/free', 0.85, 2500),
  ],

  // Cheap verification pass.
  critic: [
    bedrock(MODELS.novaMicro, 0.1, 512),
    bedrock(geo(MODELS.novaMicro), 0.1, 512),
    bedrock(MODELS.gptOss20b, 0.1, 512),
    bedrock(geo(MODELS.novaLite), 0.1, 512),
    openrouter('openrouter/free', 0.1, 512),
  ],
};

export const BEDROCK_REGION = REGION;
