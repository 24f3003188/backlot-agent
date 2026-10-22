import { z } from 'zod';
import type { ScenePitch, SseEvent, EvidenceItem, ScoutReport, DistinctivenessMap, QlooEntity } from '../types.js';
import {
  searchEntities,
  findTags,
  discover,
  trends,
  geoPopularity,
  compareLocations,
  rankShortlist,
} from '../qloo/client.js';
import { callRole, type ToolDefinition, type ConversationMessage } from '../llm/router.js';

// ─── Zod Tool Validation Schemas ────────────────────────────────────────────
const DiscoverArgsSchema = z.object({
  type: z.enum([
    'urn:entity:artist',
    'urn:entity:place',
    'urn:entity:brand',
    'urn:entity:tv_show',
    'urn:entity:videogame',
  ]),
  seed_entity_ids: z.array(z.string()).optional(),
  tag_ids: z.array(z.string()).optional(),
  location: z.string().optional(),
  reason: z.string().min(1, 'Reason is required for tool call audit'),
});

const CompareLocationsArgsSchema = z.object({
  city_a: z.string(),
  city_b: z.string(),
  type: z.enum(['urn:entity:artist', 'urn:entity:brand', 'urn:entity:place']),
  reason: z.string().min(1),
});

const SearchEntitiesArgsSchema = z.object({
  query: z.string(),
  types: z.array(z.string()).optional(),
  reason: z.string().min(1),
});

const FindTagsArgsSchema = z.object({
  query: z.string(),
  reason: z.string().min(1),
});

const FinalizeArgsSchema = z.object({
  summary: z.string(),
  contrast_city: z.string().optional(),
});

// ─── Blocked meta-queries that confuse find_tags ────────────────────────────
const BLOCKED_TAG_QUERIES = [
  'contrast', 'distinctive', 'cultural distinctiveness', 'comparison',
  'unique', 'difference', 'versus', 'compare', 'contrast city',
];

function isBlockedTagQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return BLOCKED_TAG_QUERIES.some(blocked => q.includes(blocked));
}

// ─── Tool Definitions for LLM ───────────────────────────────────────────────
export const SCOUT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'discover',
      description: 'Discover culturally grounded recommendations in a city for a category (artist, place, brand, tv_show, videogame). This is your PRIMARY tool — call it for each missing category.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['urn:entity:artist', 'urn:entity:place', 'urn:entity:brand', 'urn:entity:tv_show', 'urn:entity:videogame'],
            description: 'Entity URN type to query',
          },
          seed_entity_ids: { type: 'array', items: { type: 'string' }, description: 'Qloo entity IDs as interest seeds' },
          tag_ids: { type: 'array', items: { type: 'string' }, description: 'Qloo tag IDs for genre or mood' },
          location: { type: 'string', description: 'City or destination name' },
          reason: { type: 'string', description: 'Why you are querying this category and how it serves the world pitch' },
        },
        required: ['type', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_locations',
      description: 'Compare city_a against city_b to find what makes city_a culturally distinctive. You MUST call this BEFORE finalize. Pick a city_b that creates sharp cultural contrast.',
      parameters: {
        type: 'object',
        properties: {
          city_a: { type: 'string', description: 'The primary setting city' },
          city_b: { type: 'string', description: 'The comparison city chosen for sharp cultural contrast' },
          type: { type: 'string', enum: ['urn:entity:artist', 'urn:entity:brand', 'urn:entity:place'], description: 'Category to compare' },
          reason: { type: 'string', description: 'Why this contrast city was chosen' },
        },
        required: ['city_a', 'city_b', 'type', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_entities',
      description: 'Search Qloo for specific entities by text query to obtain their Qloo IDs. Use when you need to find a specific artist, venue, or game by name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Entity or venue name' },
          types: { type: 'array', items: { type: 'string' }, description: 'URN types' },
          reason: { type: 'string', description: 'Why searching for this specific entity' },
        },
        required: ['query', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_tags',
      description: 'Search for Qloo tags matching a subcultural term, era, genre, or mood. DO NOT use for location comparison — use compare_locations instead.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'A specific genre, mood, era, or subcultural keyword (e.g. "indie rock", "90s nostalgia", "street food")' },
          reason: { type: 'string', description: 'Why searching for this tag' },
        },
        required: ['query', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize',
      description: 'Call ONLY when you have: (1) at least 3 categories with data, AND (2) run compare_locations at least once. Summarize your findings.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of the discovered cultural landscape' },
          contrast_city: { type: 'string', description: 'The final chosen contrast city' },
        },
        required: ['summary'],
      },
    },
  },
];

// Helper to record evidence
function makeEvidence(
  store: Record<string, EvidenceItem>,
  workflow: string,
  entityIds: string[],
  tags: string[],
  note: string,
  affinityValue = 0
): string {
  const id = `ev_${Object.keys(store).length.toString().padStart(3, '0')}`;
  store[id] = {
    id,
    source: 'qloo',
    workflow,
    call_id: `call_${Object.keys(store).length}`,
    entity_ids: entityIds,
    tags,
    signal: { type: 'affinity', value: affinityValue },
    note,
  };
  return id;
}

// ─── Category Quality Assessment ────────────────────────────────────────────
function categoryQuality(items: QlooEntity[]): string {
  if (items.length === 0) return '❌ EMPTY';
  if (items.length < 3) return '⚠️ THIN';
  if (items.length >= 5) return '✅ STRONG';
  return '🔸 OK';
}

function topNames(items: QlooEntity[], n = 3): string {
  if (items.length === 0) return 'NONE';
  return items.slice(0, n).map(e => {
    const score = e.affinity ? ` (${(e.affinity * 100).toFixed(0)}%)` : '';
    return `${e.name}${score}`;
  }).join(', ');
}

export interface ScoutAgentInput {
  primaryCity: string;
  pitch: ScenePitch;
  seedEntityIds: string[];
  locationEntityIds?: string[];
  seedTagIds: string[];
  sceneId: string;
  evidenceStore: Record<string, EvidenceItem>;
  emit: (event: SseEvent) => void;
}

export interface ScoutAgentResult {
  scoutReport: ScoutReport;
  distinctivenessMap: DistinctivenessMap;
  evidenceIds: string[];
  stepsTaken: number;
}

export async function runScoutAgent(input: ScoutAgentInput): Promise<ScoutAgentResult> {
  const { primaryCity, pitch, seedEntityIds, locationEntityIds, seedTagIds, sceneId, evidenceStore, emit } = input;

  const MAX_STEPS = 8;                  // Expanded from 4 → 8 to allow recovery
  const WALL_CLOCK_MS = 60_000;         // 60s wall clock
  const MAX_NULL_STRIKES = 2;           // Break only after 2 null tool calls
  const startedAt = Date.now();
  let stepsTaken = 0;
  let nullStrikes = 0;
  let hasCompared = false;              // Gate: must run compare_locations before finalize

  const collected: {
    music: QlooEntity[];
    food: QlooEntity[];
    brands: QlooEntity[];
    shows: QlooEntity[];
    games: QlooEntity[];
    distinctive: QlooEntity[];
    contrastCity: string;
  } = {
    music: [],
    food: [],
    brands: [],
    shows: [],
    games: [],
    distinctive: [],
    contrastCity: pitch.contrast_city || '',
  };

  const toolHistory: string[] = [];     // Track what tools were called
  const evidenceIds: string[] = [];
  const conversationHistory: ConversationMessage[] = [];  // Multi-turn memory

  // ── System Prompt (sent once, used for all steps) ─────────────────────────
  const systemPrompt = `You are Backlot's Lead Cultural Scout Agent, powered by Qloo's Taste AI.
Your mission: Ground the game world "${pitch.city}" (${pitch.era_or_mood || 'contemporary'}, ${pitch.genre}) in authentic cultural taste data.

RULES:
1. Your PRIMARY tool is "discover". Call it for each missing category:
   - Music: type="urn:entity:artist"
   - Dining & Places: type="urn:entity:place"
   - Brands: type="urn:entity:brand"
   - Television: type="urn:entity:tv_show"
   - Games: type="urn:entity:videogame"

2. You MUST call "compare_locations" at least once before "finalize".
   - Choose a city_b that creates sharp cultural contrast with ${primaryCity}.
   - This reveals what makes ${primaryCity} DISTINCTIVE.

3. Do NOT call "find_tags" for location comparison or abstract concepts.
   - find_tags is for genre/mood/era keywords only (e.g. "indie rock", "80s nostalgia").

4. Call "finalize" ONLY when:
   - At least 3/5 categories have data
   - compare_locations has been called at least once

5. Every tool call must include a "reason" field explaining your thinking.

6. Focus on EFFICIENCY: discover multiple categories quickly, then compare, then finalize.`;

  // ── Step 0: Planner model drafts an initial scouting strategy ─────────────
  try {
    const planPrompt = `Plan a scouting strategy for ${primaryCity} (${pitch.genre}, ${pitch.era_or_mood || 'contemporary'}).
Available seed entity IDs: ${seedEntityIds.slice(0, 3).join(', ') || 'none'}
Available seed tag IDs: ${seedTagIds.slice(0, 3).join(', ') || 'none'}

Which 3-4 categories should I explore first for this genre? Which contrast city would create the sharpest cultural distinction?
Reply in 2-3 sentences. Be specific.`;

    const planRes = await callRole('scout_planner', planPrompt, {
      systemPrompt: 'You are a cultural research strategist. Be concise and specific.',
      temperature: 0.3,
      maxTokens: 200,
    });

    if (planRes.text) {
      emit({
        type: 'tool.call',
        act: 2,
        seq: 0,
        payload: {
          step: 0,
          tool: 'strategy_plan',
          args: {},
          reason: `Planning which taste categories matter most for a ${pitch.genre} set in ${primaryCity}`,
          provider: planRes.provider,
          model: planRes.model,
        },
      });
      emit({
        type: 'tool.result',
        act: 2,
        payload: {
          tool: 'strategy_plan',
          plan: planRes.text.trim(),
        },
      });
      // Add the plan to conversation history so the loop model has context
      conversationHistory.push({
        role: 'user',
        content: `Strategic plan from senior planner:\n${planRes.text.trim()}`,
      });
      conversationHistory.push({
        role: 'assistant',
        content: 'Understood. I will follow this strategy and begin discovering categories systematically.',
      });
    }
  } catch (planErr: any) {
    console.warn(`[ScoutAgent] Planning step failed (${planErr.message}). Proceeding without strategic plan.`);
  }

  // ── Main Agent Loop ───────────────────────────────────────────────────────
  while (stepsTaken < MAX_STEPS) {
    // Wall-clock guard
    if (Date.now() - startedAt > WALL_CLOCK_MS) {
      console.log(`[ScoutAgent] Wall-clock limit reached (${Date.now() - startedAt}ms). Finalizing.`);
      break;
    }
    stepsTaken++;

    // ── Build Rich State Summary ──────────────────────────────────────────
    const missingCats: string[] = [];
    if (collected.music.length === 0) missingCats.push('Music (urn:entity:artist)');
    if (collected.food.length === 0) missingCats.push('Places/Dining (urn:entity:place)');
    if (collected.brands.length === 0) missingCats.push('Brands (urn:entity:brand)');
    if (collected.shows.length === 0) missingCats.push('TV Shows (urn:entity:tv_show)');
    if (collected.games.length === 0) missingCats.push('Games (urn:entity:videogame)');

    const coveredCount = 5 - missingCats.length;
    const timeLeft = Math.max(0, Math.round((WALL_CLOCK_MS - (Date.now() - startedAt)) / 1000));

    const stateSummary = `═══ SCOUTING STATE for ${primaryCity} ═══
Step ${stepsTaken}/${MAX_STEPS} · ${timeLeft}s remaining

CATEGORY STATUS:
  Music:  ${categoryQuality(collected.music)} · ${collected.music.length} items · Top: ${topNames(collected.music)}
  Places: ${categoryQuality(collected.food)} · ${collected.food.length} items · Top: ${topNames(collected.food)}
  Brands: ${categoryQuality(collected.brands)} · ${collected.brands.length} items · Top: ${topNames(collected.brands)}
  Shows:  ${categoryQuality(collected.shows)} · ${collected.shows.length} items · Top: ${topNames(collected.shows)}
  Games:  ${categoryQuality(collected.games)} · ${collected.games.length} items · Top: ${topNames(collected.games)}

CONTRAST:
  compare_locations called: ${hasCompared ? '✅ YES' : '❌ NO — REQUIRED before finalize'}
  Contrast City: ${collected.contrastCity || 'NOT CHOSEN YET'}
  Distinctive Entities: ${collected.distinctive.length > 0 ? topNames(collected.distinctive) : 'NONE'}

HISTORY: ${toolHistory.length > 0 ? toolHistory.join(' → ') : 'No calls yet'}
TAGS AVAILABLE: ${seedTagIds.length} tag IDs

${missingCats.length > 0
  ? `⚠️ MISSING: ${missingCats.join(' | ')}`
  : '✅ All categories covered!'}
${coveredCount >= 3 && !hasCompared
  ? '\n🔴 URGENT: Call compare_locations NOW. You cannot finalize without it.'
  : ''}
${coveredCount >= 3 && hasCompared
  ? '\n🟢 Ready to finalize! Call finalize with a summary and contrast_city.'
  : ''}

DIRECTIVE: Pick the next tool to advance scouting. Prioritize missing categories.`;

    // ── Call the Loop Model (Nova Pro) ─────────────────────────────────────
    let roleRes;
    try {
      roleRes = await callRole('loop', stateSummary, {
        systemPrompt,
        tools: SCOUT_TOOLS,
        toolChoice: 'auto',
        temperature: 0.2,
        messages: conversationHistory.length > 0 ? conversationHistory : undefined,
      });
    } catch (err: any) {
      console.warn(`[ScoutAgent] Loop model call failed: ${err.message}. Ending loop.`);
      break;
    }

    const toolCall = roleRes.toolCall;

    // ── Strike System: Handle Null Tool Calls ─────────────────────────────
    if (!toolCall) {
      nullStrikes++;
      console.log(`[ScoutAgent] Null tool call (strike ${nullStrikes}/${MAX_NULL_STRIKES}). Model text: "${roleRes.text?.slice(0, 100)}"`);

      if (nullStrikes >= MAX_NULL_STRIKES) {
        console.log(`[ScoutAgent] Max strikes reached. Exiting loop.`);
        break;
      }

      // Nudge the model with explicit instruction
      const nudge = missingCats.length > 0
        ? `You MUST call a tool. Missing categories: ${missingCats.join(', ')}. Call discover for one of them.`
        : hasCompared
          ? `All categories covered and comparison done. Call finalize now.`
          : `Categories are covered but compare_locations has NOT been called. Call it now.`;

      conversationHistory.push({ role: 'assistant', content: roleRes.text || 'I need to think about this.' });
      conversationHistory.push({ role: 'user', content: `ERROR: You did not call a tool. ${nudge}` });

      emit({
        type: 'tool.error',
        act: 2,
        seq: stepsTaken,
        payload: { error: 'No tool called', nudge, strike: nullStrikes },
      });
      continue;
    }

    // Reset strike counter on valid tool call
    nullStrikes = 0;

    const toolName = toolCall.name;
    const args = toolCall.args || {};
    const reason = toolCall.reason || args.reason || `Agent call for ${toolName}`;

    // ── Emit Tool Call to UI ──────────────────────────────────────────────
    emit({
      type: 'tool.call',
      act: 2,
      seq: stepsTaken,
      payload: {
        step: stepsTaken,
        tool: toolName,
        args,
        reason,
        provider: roleRes.provider,
        model: roleRes.model,
      },
    });

    toolHistory.push(`${toolName}(${args.type || args.query || args.city_b || ''})`);

    // ── Gate: Finalize Validation ─────────────────────────────────────────
    if (toolName === 'finalize') {
      const coveredCategories = [
        collected.music.length > 0,
        collected.food.length > 0,
        collected.brands.length > 0,
        collected.shows.length > 0,
        collected.games.length > 0,
      ].filter(Boolean).length;

      // Block finalize if prerequisites not met
      if (coveredCategories < 3) {
        const errMsg = `FINALIZE BLOCKED: Only ${coveredCategories}/3 minimum categories covered. Discover more categories first: ${missingCats.join(', ')}`;
        console.warn(`[ScoutAgent] ${errMsg}`);
        emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: 'finalize' } });
        conversationHistory.push({ role: 'assistant', content: `I want to finalize.` });
        conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
        continue;
      }

      if (!hasCompared) {
        const errMsg = `FINALIZE BLOCKED: compare_locations has NOT been called yet. You must pick a contrast city and call compare_locations before finalize.`;
        console.warn(`[ScoutAgent] ${errMsg}`);
        emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: 'finalize' } });
        conversationHistory.push({ role: 'assistant', content: `I want to finalize.` });
        conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
        continue;
      }

      // Finalize allowed
      const parsed = FinalizeArgsSchema.safeParse(args);
      if (parsed.success && parsed.data.contrast_city) {
        collected.contrastCity = parsed.data.contrast_city;
      }
      console.log(`[ScoutAgent] Finalize approved: ${args.summary || 'done'}`);
      break;
    }

    // ── Execute Tool Calls with Validation ────────────────────────────────
    let toolResultSummary = '';

    try {
      if (toolName === 'discover') {
        const validated = DiscoverArgsSchema.safeParse(args);
        if (!validated.success) {
          const zodErrors = validated.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
          const errMsg = `discover validation failed: ${zodErrors}. Fix arguments and retry.`;
          emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: toolName } });
          conversationHistory.push({ role: 'assistant', content: `I called discover(${JSON.stringify(args)})` });
          conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
          continue;
        }

        const type = validated.data.type;
        const loc = validated.data.location || primaryCity;

        const effectiveEntitySeeds =
          (type === 'urn:entity:artist' || type === 'urn:entity:place') && locationEntityIds && locationEntityIds.length > 0
            ? locationEntityIds
            : (args.seed_entity_ids || seedEntityIds);

        const results = await discover({
          filterType: type,
          seedEntityIds: effectiveEntitySeeds,
          seedTagIds: args.tag_ids || seedTagIds,
          location: loc,
          sceneId,
          take: 8,
        });

        // Map to internal category
        if (type === 'urn:entity:artist') collected.music.push(...results);
        else if (type === 'urn:entity:place') collected.food.push(...results);
        else if (type === 'urn:entity:brand') collected.brands.push(...results);
        else if (type === 'urn:entity:tv_show') collected.shows.push(...results);
        else if (type === 'urn:entity:videogame') collected.games.push(...results);

        const evId = makeEvidence(
          evidenceStore,
          'agent_discover',
          results.map(e => e.id),
          args.tag_ids || seedTagIds,
          `Agent discovered ${results.length} items for ${type}: "${reason}"`,
          results[0]?.affinity || 0
        );
        evidenceIds.push(evId);

        toolResultSummary = `discover(${type}) returned ${results.length} results: ${topNames(results, 4)}. Category now ${categoryQuality(results)}.`;

        emit({
          type: 'tool.result',
          act: 2,
          payload: {
            tool: toolName,
            category: type,
            count: results.length,
            sample: results.slice(0, 3).map(e => e.name),
            evidenceId: evId,
          },
        });

      } else if (toolName === 'compare_locations') {
        const validated = CompareLocationsArgsSchema.safeParse(args);
        if (!validated.success) {
          const zodErrors = validated.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
          const errMsg = `compare_locations validation failed: ${zodErrors}. Provide city_a, city_b, type, and reason.`;
          emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: toolName } });
          conversationHistory.push({ role: 'assistant', content: `I called compare_locations(${JSON.stringify(args)})` });
          conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
          continue;
        }

        const cityA = validated.data.city_a;
        const cityB = validated.data.city_b;
        const type = validated.data.type;
        collected.contrastCity = cityB;

        const cmp = await compareLocations({
          filterType: type,
          cityA,
          cityB,
          seedEntityIds,
          sceneId,
        });

        const cityBIds = new Set(cmp.cityB.map(e => e.id));
        const distinctive = cmp.cityA.filter(e => !cityBIds.has(e.id));
        collected.distinctive.push(...distinctive);
        hasCompared = true;  // ✅ Gate unlocked

        const evId = makeEvidence(
          evidenceStore,
          'agent_compare',
          distinctive.map(e => e.id),
          [],
          `Agent contrasted ${cityA} vs ${cityB}: "${reason}"`
        );
        evidenceIds.push(evId);

        toolResultSummary = `compare_locations(${cityA} vs ${cityB}, ${type}) found ${distinctive.length} distinctive entities: ${topNames(distinctive, 3)}. Contrast city set to "${cityB}".`;

        emit({
          type: 'tool.result',
          act: 2,
          payload: {
            tool: toolName,
            contrastCity: cityB,
            distinctiveCount: distinctive.length,
            sample: distinctive.slice(0, 3).map(e => e.name),
            evidenceId: evId,
          },
        });

      } else if (toolName === 'search_entities') {
        const validated = SearchEntitiesArgsSchema.safeParse(args);
        if (!validated.success) {
          const errMsg = `search_entities validation failed: ${validated.error.issues.map(e => e.message).join('; ')}`;
          emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: toolName } });
          conversationHistory.push({ role: 'assistant', content: `I called search_entities(${JSON.stringify(args)})` });
          conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
          continue;
        }
        const query = validated.data.query;
        const res = await searchEntities(query, args.types, sceneId);

        toolResultSummary = `search_entities("${query}") found ${res.length} entities: ${res.slice(0, 3).map(e => `${e.name} [${e.id}]`).join(', ')}`;

        emit({
          type: 'tool.result',
          act: 2,
          payload: { tool: toolName, count: res.length, sample: res.slice(0, 3).map(e => e.name) },
        });

      } else if (toolName === 'find_tags') {
        const validated = FindTagsArgsSchema.safeParse(args);
        if (!validated.success) {
          const errMsg = `find_tags validation failed: ${validated.error.issues.map(e => e.message).join('; ')}`;
          emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: toolName } });
          conversationHistory.push({ role: 'assistant', content: `I called find_tags(${JSON.stringify(args)})` });
          conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
          continue;
        }

        const query = validated.data.query;

        // Block meta-queries
        if (isBlockedTagQuery(query)) {
          const errMsg = `find_tags REJECTED: "${query}" is not a valid tag search. find_tags searches Qloo's genre/mood/era taxonomy (e.g. "indie rock", "90s nostalgia", "street food"). For city contrast, use compare_locations instead.`;
          console.warn(`[ScoutAgent] ${errMsg}`);
          emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: toolName } });
          conversationHistory.push({ role: 'assistant', content: `I called find_tags("${query}")` });
          conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
          continue;
        }

        const res = await findTags(query, sceneId);
        if (res.length > 0) {
          res.forEach(t => {
            if (!seedTagIds.includes(t.id)) seedTagIds.push(t.id);
          });
        }

        toolResultSummary = `find_tags("${query}") found ${res.length} tags: ${res.slice(0, 3).map(t => `${t.name} [${t.id}]`).join(', ')}. These are now available as seed tags for discover calls.`;

        emit({
          type: 'tool.result',
          act: 2,
          payload: { tool: toolName, count: res.length, sample: res.slice(0, 3).map(t => t.name) },
        });

      } else {
        const errMsg = `Unknown tool "${toolName}". Available tools: discover, compare_locations, search_entities, find_tags, finalize.`;
        emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: toolName } });
        conversationHistory.push({ role: 'assistant', content: `I called ${toolName}(${JSON.stringify(args)})` });
        conversationHistory.push({ role: 'user', content: `ERROR: ${errMsg}` });
        continue;
      }
    } catch (toolErr: any) {
      const errMsg = `Tool execution error for ${toolName}: ${toolErr.message}`;
      console.warn(`[ScoutAgent] ${errMsg}`);
      toolResultSummary = `ERROR executing ${toolName}: ${toolErr.message}. Try a different approach.`;
      emit({ type: 'tool.error', act: 2, seq: stepsTaken, payload: { error: errMsg, tool: toolName } });
    }

    // ── Feed Tool Result Back Into Conversation ───────────────────────────
    if (toolResultSummary) {
      conversationHistory.push({
        role: 'assistant',
        content: `I called ${toolName}(${JSON.stringify(args)}) because: ${reason}`,
      });
      conversationHistory.push({
        role: 'user',
        content: `RESULT: ${toolResultSummary}`,
      });
    }

    // ── Trim Conversation History to Last 8 Turns ─────────────────────────
    // Keep token usage manageable
    while (conversationHistory.length > 16) {
      conversationHistory.splice(0, 2); // Remove oldest turn pair
    }

    // ── Early Exit: All Categories + Comparison Done ──────────────────────
    const coveredCategories = [
      collected.music.length > 0,
      collected.food.length > 0,
      collected.brands.length > 0,
      collected.shows.length > 0,
      collected.games.length > 0,
    ].filter(Boolean).length;

    if (coveredCategories >= 5 && hasCompared) {
      console.log(`[ScoutAgent] All 5 categories covered + comparison done. Auto-finalizing.`);
      break;
    }
  }

  // ── Guardrail: the comparison is required. If the model never ran it, run it in code ──
  const fallbackContrast = (collected.contrastCity || pitch.contrast_city || '').trim();
  if (!hasCompared && fallbackContrast && fallbackContrast.toLowerCase() !== primaryCity.toLowerCase()) {
    for (const type of ['urn:entity:artist', 'urn:entity:place']) {
      emit({
        type: 'tool.call',
        act: 2,
        seq: stepsTaken + 1,
        payload: {
          step: stepsTaken + 1,
          tool: 'compare_locations',
          args: { city_a: primaryCity, city_b: fallbackContrast, type },
          reason: 'Guardrail: the model stopped before comparing cities, so the comparison runs directly',
        },
      });
      try {
        const cmp = await compareLocations({ filterType: type, cityA: primaryCity, cityB: fallbackContrast, seedEntityIds, sceneId });
        const cityBIds = new Set(cmp.cityB.map(e => e.id));
        const distinctive = cmp.cityA.filter(e => !cityBIds.has(e.id));
        collected.distinctive.push(...distinctive);
        collected.contrastCity = fallbackContrast;
        hasCompared = true;
        const evId = makeEvidence(evidenceStore, 'guardrail_compare', distinctive.map(e => e.id), [],
          `Compared ${primaryCity} vs ${fallbackContrast} (${type.replace('urn:entity:', '')})`);
        evidenceIds.push(evId);
        emit({
          type: 'tool.result',
          act: 2,
          payload: { tool: 'compare_locations', contrastCity: fallbackContrast, distinctiveCount: distinctive.length, sample: distinctive.slice(0, 3).map(e => e.name), evidenceId: evId },
        });
      } catch (err: any) {
        emit({ type: 'tool.error', act: 2, payload: { tool: 'compare_locations', error: err.message } });
      }
    }
  }

  // ── Post-Loop: Planner model writes a short cultural synthesis ───────────
  if (collected.contrastCity && collected.distinctive.length > 0) {
    try {
      const synthPrompt = `Summarize the cultural landscape of ${primaryCity} for a ${pitch.genre} game:
- Music scene: ${topNames(collected.music, 4)}
- Dining/Places: ${topNames(collected.food, 4)}
- Brands: ${topNames(collected.brands, 4)}
- TV/Media: ${topNames(collected.shows, 4)}
- Games: ${topNames(collected.games, 4)}
- What makes it distinct from ${collected.contrastCity}: ${topNames(collected.distinctive, 4)}

In 2-3 sentences, describe the cultural texture that makes ${primaryCity} unique for this game setting.`;

      const synthRes = await callRole('scout_planner', synthPrompt, {
        systemPrompt: 'You are a cultural world-building expert. Be vivid and specific.',
        temperature: 0.4,
        maxTokens: 200,
      });

      if (synthRes.text) {
        emit({
          type: 'tool.result',
          act: 2,
          payload: {
            tool: 'cultural_synthesis',
            summary: synthRes.text.trim(),
            provider: synthRes.provider,
            model: synthRes.model,
          },
        });
      }
    } catch {}
  }

  // ── Deduplicate and Build Report ──────────────────────────────────────────
  function dedupe(arr: QlooEntity[]): QlooEntity[] {
    const seen = new Set<string>();
    return arr.filter(e => {
      const k = (e.name || e.id).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const scoutReport: ScoutReport = {
    music: dedupe(collected.music),
    food: dedupe(collected.food),
    brands: dedupe(collected.brands),
    shows: dedupe(collected.shows),
    games: dedupe(collected.games),
  };

  const distinctivenessMap: DistinctivenessMap = {
    distinctiveEntities: dedupe(collected.distinctive).slice(0, 8),
    distinctiveTags: seedTagIds,
    contrastCity: collected.contrastCity || pitch.contrast_city || '',
  };

  return {
    scoutReport,
    distinctivenessMap,
    evidenceIds,
    stepsTaken,
  };
}
