import type { QlooEntity, QlooTag } from '../types.js';

function getApiKey(): string {
  return process.env.QLOO_API_KEY || '';
}

function getBaseUrl(): string {
  return process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';
}

// ─── Call counter / quota guard ────────────────────────────────────────────
const callCounts = new Map<string, number>();
const QUOTA_PER_SCENE = 25;

export function resetCallCount(sceneId: string) {
  callCounts.set(sceneId, 0);
}
function incrementAndCheck(sceneId: string) {
  const n = (callCounts.get(sceneId) || 0) + 1;
  callCounts.set(sceneId, n);
  if (n > QUOTA_PER_SCENE) throw new Error(`Qloo quota exceeded for scene ${sceneId} (${n} calls)`);
}

// ─── Cache ──────────────────────────────────────────────────────────────────
const cache = new Map<string, unknown>();
function cacheKey(endpoint: string, params: Record<string, string | string[]>) {
  return `${endpoint}:${JSON.stringify(Object.entries(params).sort())}`;
}

// ─── Rate limiting & retry helper ───────────────────────────────────────────
let lastReqTimestamp = 0;
const MIN_GAP_MS = 200;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Raw fetch ──────────────────────────────────────────────────────────────
async function qlooGet(path: string, params: Record<string, string | string[]>, sceneId?: string, retryCount = 0): Promise<unknown> {
  const key = cacheKey(path, params);
  if (cache.has(key)) return cache.get(key);

  if (sceneId && retryCount === 0) incrementAndCheck(sceneId);

  // Throttle to respect hackathon rate limits
  const now = Date.now();
  const elapsed = now - lastReqTimestamp;
  if (elapsed < MIN_GAP_MS) {
    await sleep(MIN_GAP_MS - elapsed);
  }
  lastReqTimestamp = Date.now();

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      qs.set(k, v.filter(Boolean).join(','));
    } else if (v) {
      qs.set(k, v);
    }
  }

  const url = `${getBaseUrl()}${path}?${qs.toString()}`;
  console.log(`[Qloo] GET ${url.substring(0, 120)}...`);

  const res = await fetch(url, {
    headers: { 'X-Api-Key': getApiKey() },
    signal: AbortSignal.timeout(25000),
  });

  if (res.status === 429 && retryCount < 2) {
    console.warn(`[Qloo] 429 rate limit hit, retrying in 1200ms (attempt ${retryCount + 1})...`);
    await sleep(1200 * (retryCount + 1));
    return qlooGet(path, params, sceneId, retryCount + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qloo API error ${res.status}: ${body.substring(0, 200)}`);
  }

  const data = await res.json();
  cache.set(key, data);
  return data;
}

function pickScore(e: Record<string, unknown>): number | undefined {
  const q = e.query as Record<string, unknown> | undefined;
  const v = q?.affinity ?? e.affinity ?? e.score;
  return typeof v === 'number' && v > 0 ? v : undefined;
}

// ─── Helper: extract entities from insights response ────────────────────────
function extractEntities(data: unknown): QlooEntity[] {
  if (!data) return [];
  const d = data as Record<string, unknown>;
  const results = d?.results as Record<string, unknown>;
  const entities = (results?.entities || d?.entities || (Array.isArray(d?.results) ? d.results : [])) as Array<Record<string, unknown>>;
  return entities.slice(0, 12).map(e => ({
    id: (e.id || e.entity_id || '') as string,
    name: (e.name || '') as string,
    type: (e.type || (Array.isArray(e.types) ? e.types[0] : '') || e.entity_type || '') as string,
    // Qloo insights returns affinity under query.affinity; fall back to older shapes.
    // Leave undefined when Qloo gave no score so the UI never shows a made-up number.
    affinity: pickScore(e),
    popularity: typeof e.popularity === 'number' ? (e.popularity as number) : undefined,
    tags: ((e.tags || []) as string[]),
  }));
}

// ─── Public API functions ────────────────────────────────────────────────────

/** Search entities by name → get Qloo IDs */
export async function searchEntities(query: string, types?: string[], sceneId?: string): Promise<QlooEntity[]> {
  if (!query || !query.trim()) return [];
  try {
    const params: Record<string, string | string[]> = { query: query.trim() };
    if (types?.length) params['types'] = types;
    const data = await qlooGet('/search', params, sceneId);
    const d = data as Record<string, unknown>;
    const items = (d?.results || d?.entities || d?.items || []) as Array<Record<string, unknown>>;
    return items.slice(0, 8).map(e => ({
      id: (e.id || e.entity_id || '') as string,
      name: (e.name || '') as string,
      type: (e.type || (Array.isArray(e.types) ? e.types[0] : '') || e.entity_type || '') as string,
    }));
  } catch (err) {
    console.warn(`[Qloo] searchEntities failed for "${query}":`, (err as Error).message);
    return [];
  }
}

/** Find Qloo tags by keyword (era, mood, genre) */
export async function findTags(query: string, sceneId?: string): Promise<QlooTag[]> {
  if (!query || !query.trim()) return [];
  try {
    const data = await qlooGet('/v2/tags', { 'filter.query': query.trim() }, sceneId);
    const d = data as Record<string, unknown>;
    const results = d?.results as Record<string, unknown>;
    const items = (results?.tags || d?.tags || (Array.isArray(d?.results) ? d.results : [])) as Array<Record<string, unknown>>;
    return items.slice(0, 6).map(t => ({
      id: (t.id || t.tag_id || '') as string,
      name: (t.name || '') as string,
      type: (t.type || t.category || '') as string,
    }));
  } catch (err) {
    console.warn(`[Qloo] findTags failed for "${query}":`, (err as Error).message);
    return [];
  }
}

/** Discover recommendations by entity type + seeds + location */
export async function discover(opts: {
  filterType: string;
  seedEntityIds?: string[];
  seedTagIds?: string[];
  location?: string;
  take?: number;
  sceneId?: string;
}): Promise<QlooEntity[]> {
  try {
    const params: Record<string, string | string[]> = {
      'filter.type': opts.filterType,
      'take': String(opts.take || 8),
    };
    // Slicing seeds to top 2 keeps Qloo graph queries fast under 4s
    if (opts.seedEntityIds?.length) params['signal.interests.entities'] = opts.seedEntityIds.slice(0, 2);
    if (opts.seedTagIds?.length) params['signal.interests.tags'] = opts.seedTagIds.slice(0, 2);
    if (opts.location) params['signal.location.query'] = opts.location;

    const data = await qlooGet('/v2/insights', params, opts.sceneId);
    return extractEntities(data);
  } catch (err) {
    console.warn(`[Qloo] discover failed for type "${opts.filterType}" location "${opts.location}":`, (err as Error).message);
    // Fast fallback: if multi-signal timed out, query by location only
    if (opts.location) {
      try {
        console.log(`[Qloo] Retrying discover with location-only for "${opts.location}"...`);
        const fallbackParams: Record<string, string> = {
          'filter.type': opts.filterType,
          'signal.location.query': opts.location,
          'take': String(opts.take || 8),
        };
        const data = await qlooGet('/v2/insights', fallbackParams, opts.sceneId);
        return extractEntities(data);
      } catch {}
    }
    return [];
  }
}

/** Get trending entities in a location */
export async function trends(opts: {
  filterType: string;
  location: string;
  sceneId?: string;
}): Promise<QlooEntity[]> {
  try {
    const params: Record<string, string | string[]> = {
      'filter.type': opts.filterType,
      'signal.location.query': opts.location,
      'take': '10',
    };
    const data = await qlooGet('/v2/insights', params, opts.sceneId);
    return extractEntities(data);
  } catch (err) {
    console.warn(`[Qloo] trends failed for "${opts.location}":`, (err as Error).message);
    return [];
  }
}

/** Get geographically popular entities in a location using seeds */
export async function geoPopularity(opts: {
  filterType: string;
  location: string;
  seedEntityIds?: string[];
  sceneId?: string;
}): Promise<QlooEntity[]> {
  try {
    const params: Record<string, string | string[]> = {
      'filter.type': opts.filterType,
      'signal.location.query': opts.location,
      'take': '10',
    };
    if (opts.seedEntityIds?.length) params['signal.interests.entities'] = opts.seedEntityIds;
    const data = await qlooGet('/v2/insights', params, opts.sceneId);
    return extractEntities(data);
  } catch (err) {
    console.warn(`[Qloo] geoPopularity failed for "${opts.location}":`, (err as Error).message);
    return [];
  }
}

/** Compare: get what's distinctive in cityA vs cityB by type */
export async function compareLocations(opts: {
  filterType: string;
  cityA: string;
  cityB: string;
  seedEntityIds?: string[];
  sceneId?: string;
}): Promise<{ cityA: QlooEntity[]; cityB: QlooEntity[] }> {
  try {
    const [aData, bData] = await Promise.all([
      geoPopularity({ filterType: opts.filterType, location: opts.cityA, seedEntityIds: opts.seedEntityIds, sceneId: opts.sceneId }),
      geoPopularity({ filterType: opts.filterType, location: opts.cityB, seedEntityIds: opts.seedEntityIds, sceneId: opts.sceneId }),
    ]);
    return { cityA: aData, cityB: bData };
  } catch (err) {
    console.warn(`[Qloo] compareLocations failed:`, (err as Error).message);
    return { cityA: [], cityB: [] };
  }
}

/** Rank a shortlist of entities by affinity to seeds */
export async function rankShortlist(opts: {
  filterType: string;
  candidateIds: string[];
  seedEntityIds?: string[];
  seedTagIds?: string[];
  sceneId?: string;
}): Promise<QlooEntity[]> {
  try {
    const params: Record<string, string | string[]> = {
      'filter.type': opts.filterType,
      'filter.entities': opts.candidateIds,
      'take': String(opts.candidateIds.length),
    };
    if (opts.seedEntityIds?.length) params['signal.interests.entities'] = opts.seedEntityIds;
    if (opts.seedTagIds?.length) params['signal.interests.tags'] = opts.seedTagIds;
    const data = await qlooGet('/v2/insights', params, opts.sceneId);
    return extractEntities(data);
  } catch (err) {
    console.warn(`[Qloo] rankShortlist failed:`, (err as Error).message);
    return [];
  }
}

// ─── Supporting & Analysis APIs (from official Qloo Overview) ───────────────

/** Search or retrieve entities by ID */
export async function getEntityById(entityId: string, sceneId?: string): Promise<QlooEntity | null> {
  try {
    const data = await qlooGet('/entities', { id: entityId }, sceneId);
    const d = data as Record<string, unknown>;
    const entities = (d?.results || d?.entities || [d]) as Array<Record<string, unknown>>;
    const e = entities[0];
    if (!e) return null;
    return {
      id: (e.id || e.entity_id || entityId) as string,
      name: (e.name || '') as string,
      type: (e.type || e.entity_type || '') as string,
      affinity: 0,
      tags: (e.tags || []) as string[],
    };
  } catch {
    return null;
  }
}

/** Get time-series trending data for an entity */
export async function getTrending(entityId: string, sceneId?: string): Promise<unknown> {
  return qlooGet('/trending', { entity_id: entityId }, sceneId);
}

/** Compare two groups of entities using Qloo Analysis Compare */
export async function analysisCompare(groupA: string[], groupB: string[], sceneId?: string): Promise<unknown> {
  return qlooGet('/v2/analysis/compare', {
    'entities.a': groupA,
    'entities.b': groupB,
  }, sceneId);
}

/** Search or list audiences */
export async function getAudiences(query?: string, sceneId?: string): Promise<unknown[]> {
  const params: Record<string, string | string[]> = {};
  if (query) params['q'] = query;
  const data = await qlooGet('/audiences', params, sceneId);
  const d = data as Record<string, unknown>;
  return (d?.results || d?.audiences || []) as unknown[];
}

export { cache };

