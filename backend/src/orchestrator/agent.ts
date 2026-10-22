import type {
  ScenePitch,
  SceneJob,
  SseEvent,
  EvidenceItem,
  WorldPackItem,
  NpcProfile,
  ResolvedContext,
  ScoutReport,
  DistinctivenessMap,
  QlooEntity,
} from '../types.js';
import {
  searchEntities,
  findTags,
  discover,
  trends,
  geoPopularity,
  compareLocations,
  resetCallCount,
} from '../qloo/client.js';
import { callRole, callRoleJson } from '../llm/router.js';
import { runScoutAgent } from './scoutAgent.js';
import { runCritic } from './critic.js';
import { runLocalizeMode } from './localizeEngine.js';
import { runRefreshMode } from './refreshEngine.js';
import { generateExpandedOutputs } from './expandedOutputs.js';
import { getPreset } from '../presets.js';
import { v4 as uuid } from '../utils/uuid.js';

// ─── Evidence store helpers ─────────────────────────────────────────────────
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

// ─── Main orchestrator ──────────────────────────────────────────────────────
export async function runScene(
  job: SceneJob,
  emit: (event: SseEvent) => void
): Promise<void> {
  const { id: sceneId, pitch } = job;

  // Dispatch to dedicated Cultural Director modes
  if (pitch.director_mode === 'localize') {
    return runLocalizeMode(job, emit);
  }
  if (pitch.director_mode === 'refresh') {
    return runRefreshMode(job, emit);
  }

  const evidenceStore: Record<string, EvidenceItem> = {};
  resetCallCount(sceneId);

  const mode = pitch.mode || 'agent';

  try {
    // ── Act 0: Start ──────────────────────────────────────────────────────
    emit({ type: 'scene.start', act: 0, seq: 0, payload: { pitch, mode } });

    // ── Act 1: Establish – resolve city + seeds + tags ────────────────────
    emit({
      type: 'act.enter',
      act: 1,
      seq: 1,
      payload: {
        label: 'Establishing Shot',
        description: 'Resolving location and cultural seeds...',
        mode,
      },
    });

    const targetCity = (pitch.city || '').trim();
    if (!targetCity) throw new Error('A city or region is required to build a world.');
    // "Delhi, India" → "Delhi". If the first token doesn't resolve, the full string is tried below.
    const cityTokens = targetCity.split(',').map(s => s.trim()).filter(Boolean);
    const primaryCity = cityTokens[0] || targetCity;

    const [cityEntities, genreTags, moodTags] = await Promise.all([
      searchEntities(primaryCity, ['urn:entity:locality', 'urn:entity:destination', 'urn:entity:place'], sceneId)
        .then(res => res.length ? res : searchEntities(targetCity, ['urn:entity:locality', 'urn:entity:destination', 'urn:entity:place'], sceneId)),
      pitch.genre ? findTags(pitch.genre, sceneId) : Promise.resolve([]),
      pitch.era_or_mood ? findTags(pitch.era_or_mood, sceneId) : Promise.resolve([]),
    ]);

    // Check for invalid or unresolvable place
    if (cityEntities.length === 0 && !targetCity.trim()) {
      throw new Error(`Invalid place: Unable to resolve location "${targetCity}"`);
    }

    // Resolve reference favorites if provided
    let refEntities: QlooEntity[] = [];
    if (pitch.reference_favorites?.length) {
      refEntities = (await Promise.all(
        pitch.reference_favorites.slice(0, 2).map(f => searchEntities(f, undefined, sceneId))
      )).flat();
    }

    const seedTagIds = [...genreTags, ...moodTags].map(t => t.id).filter(Boolean).slice(0, 6);
    const locationEntityIds = cityEntities.map(e => e.id).filter(Boolean);
    const refEntityIds = refEntities.map(e => e.id).filter(Boolean);
    const seedEntityIds = locationEntityIds.length ? [...locationEntityIds, ...refEntityIds] : refEntityIds;

    const evId1 = makeEvidence(
      evidenceStore,
      'search+tags',
      seedEntityIds,
      seedTagIds,
      `Resolved "${targetCity}" to Qloo entities and mapped genre/mood tags`
    );

    const resolvedContext: ResolvedContext = {
      locationId: cityEntities[0]?.id || targetCity,
      cityDisplay: targetCity,
      seedEntities: cityEntities.slice(0, 3),
      seedTags: [...genreTags, ...moodTags].slice(0, 6),
    };
    job.resolvedContext = resolvedContext;

    emit({ type: 'evidence.add', act: 1, seq: 2, payload: { evidence: evidenceStore[evId1] } });
    emit({ type: 'act.complete', act: 1, seq: 3, payload: { resolvedContext } });

    // ── Acts 2 & 3: Scout & Reverse Angle (Agentic vs Pipeline) ────────────
    let scoutReport: ScoutReport = { music: [], food: [], brands: [], shows: [], games: [] };
    const contrastCity = pitch.contrast_city?.trim() || await suggestContrastCity(primaryCity, pitch.genre, pitch.era_or_mood);
    let distinctivenessMap: DistinctivenessMap = {
      distinctiveEntities: [],
      distinctiveTags: seedTagIds,
      contrastCity,
    };

    let agentUsed = false;
    if (mode === 'agent') {
      emit({
        type: 'act.enter',
        act: 2,
        seq: 4,
        payload: {
          label: 'Agentic Cultural Scout',
          description: `Autonomous agent choosing Qloo tools to explore ${primaryCity}...`,
          agentic: true,
        },
      });

      try {
        const scoutResult = await runScoutAgent({
          primaryCity,
          pitch: { ...pitch, contrast_city: pitch.contrast_city || contrastCity || undefined },
          seedEntityIds,
          locationEntityIds,
          seedTagIds,
          sceneId,
          evidenceStore,
          emit,
        });

        const found = Object.values(scoutResult.scoutReport).reduce((n, list) => n + list.length, 0);
        if (found === 0) {
          // Loop ran but gathered nothing (e.g. model unavailable) — use the fixed pipeline instead
          console.warn('[Orchestrator] Scout agent returned no entities. Falling back to pipeline.');
        } else {
          scoutReport = scoutResult.scoutReport;
          distinctivenessMap = scoutResult.distinctivenessMap;
          agentUsed = true;
          console.log(`[Orchestrator] Scout agent completed in ${scoutResult.stepsTaken} tool steps.`);
        }
      } catch (agentErr: any) {
        console.warn(`[Orchestrator] Scout agent failed (${agentErr.message}). Falling back to deterministic pipeline.`);
        agentUsed = false;
      }
    }

    // Deterministic Pipeline Fallback if agent disabled or failed
    if (!agentUsed) {
      emit({
        type: 'act.enter',
        act: 2,
        seq: 4,
        payload: {
          label: 'Location Scout (Pipeline)',
          description: 'Executing deterministic discovery per category...',
          agentic: false,
        },
      });

      const [music, food, brands, shows, gamesRaw] = await Promise.all([
        discover({ filterType: 'urn:entity:artist', seedEntityIds: locationEntityIds.length ? locationEntityIds : seedEntityIds, seedTagIds, location: primaryCity, sceneId }),
        discover({ filterType: 'urn:entity:place', seedEntityIds: locationEntityIds.length ? locationEntityIds : seedEntityIds, seedTagIds, location: primaryCity, sceneId }),
        discover({ filterType: 'urn:entity:brand', seedEntityIds, seedTagIds, location: primaryCity, sceneId }),
        discover({ filterType: 'urn:entity:tv_show', seedEntityIds, seedTagIds, location: primaryCity, sceneId }),
        discover({ filterType: 'urn:entity:videogame', seedEntityIds: refEntityIds.length ? refEntityIds : seedEntityIds, seedTagIds, location: primaryCity, sceneId }),
      ]);

      scoutReport = { music, food, brands, shows, games: gamesRaw };

      const empty = { cityA: [] as QlooEntity[], cityB: [] as QlooEntity[] };
      const [musicContrast, brandsContrast] = contrastCity
        ? await Promise.all([
            compareLocations({ filterType: 'urn:entity:artist', cityA: primaryCity, cityB: contrastCity, seedEntityIds, sceneId }),
            compareLocations({ filterType: 'urn:entity:brand', cityA: primaryCity, cityB: contrastCity, seedEntityIds, sceneId }),
          ])
        : [empty, empty];

      const cityBMusicIds = new Set(musicContrast.cityB.map(e => e.id));
      const distinctiveMusic = musicContrast.cityA.filter(e => !cityBMusicIds.has(e.id));
      const cityBBrandIds = new Set(brandsContrast.cityB.map(e => e.id));
      const distinctiveBrands = brandsContrast.cityA.filter(e => !cityBBrandIds.has(e.id));

      distinctivenessMap = {
        distinctiveEntities: [...distinctiveMusic, ...distinctiveBrands].slice(0, 8),
        distinctiveTags: seedTagIds,
        contrastCity,
      };

      const scoutEvId = makeEvidence(
        evidenceStore,
        'pipeline_scout',
        [...music, ...food, ...brands].slice(0, 8).map(e => e.id),
        seedTagIds,
        `Discovered cultural categories for ${primaryCity}`
      );
      emit({ type: 'evidence.add', act: 2, seq: 5, payload: { evidence: evidenceStore[scoutEvId] } });
    }

    // Curate complementary PC/Steam titles via Writer role if needed
    try {
      const geminiGamePrompt = `You are a video game narrative and cultural curator.
World Setting: ${pitch.city}
Era / Cultural Mood: ${pitch.era_or_mood || 'contemporary'}
Game Genre: ${pitch.genre}

List 4 well-known video games available on Steam or PC that share aesthetic, narrative, mechanical, or cultural DNA with this setting.
Return ONLY a valid JSON array of exact game title strings:
["Game Title 1", "Game Title 2", "Game Title 3", "Game Title 4"]`;

      const gameRes = await callRoleJson<string[]>('writer', geminiGamePrompt);
      if (Array.isArray(gameRes.data)) {
        const seen = new Set(scoutReport.games.map(g => g.name.toLowerCase().trim()));
        for (const rawItem of gameRes.data) {
          const title = typeof rawItem === 'string' ? rawItem : ((rawItem as any)?.title || (rawItem as any)?.name || (rawItem as any)?.game || '');
          if (!title || typeof title !== 'string' || title.includes('[object')) continue;
          const cleanTitle = title.trim();
          const key = cleanTitle.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            // Suggested by the writer model, not returned by Qloo: no affinity score
            scoutReport.games.push({
              id: `curated-${scoutReport.games.length}`,
              name: cleanTitle,
              type: 'urn:entity:videogame',
              source: 'curated',
            });
          }
        }
      }
    } catch {}

    job.scoutReport = scoutReport;
    job.distinctivenessMap = distinctivenessMap;

    emit({ type: 'act.complete', act: 2, seq: 10, payload: { scoutReport } });
    emit({ type: 'act.complete', act: 3, seq: 13, payload: { distinctivenessMap } });

    // ── Act 4: Casting – Model-driven NPC profiles ────────────────────────
    emit({ type: 'act.enter', act: 4, seq: 14, payload: { label: 'Casting', description: 'Building distinctive NPC taste profiles...' } });

    const archetypesPrompt = `You are the lead narrative designer for a ${pitch.genre} set in ${pitch.city}.
Aim for dialogue with depth, a strong sense of place and real cultural specificity. Only reference things that existed in ${pitch.city} during ${pitch.era_or_mood || 'the present day'}.

WORLD BRIEF:
- Location: ${pitch.city}
- Cultural Era / Mood: ${pitch.era_or_mood || 'contemporary'}
- Game Genre: ${pitch.genre}

QLOO CULTURAL DATA (actual data from the Taste AI, use these specifically):
- Local Artists people here listen to: ${scoutReport.music.slice(0, 5).map(e => e.name).join(', ') || 'local underground scene'}
- Local Venues & Dining spots: ${scoutReport.food.slice(0, 5).map(e => e.name).join(', ') || 'local eateries'}
- Local Brands: ${scoutReport.brands.slice(0, 3).map(e => e.name).join(', ') || 'local brands'}
- TV Shows / Media: ${scoutReport.shows.slice(0, 3).map(e => e.name).join(', ') || 'local media'}
- What makes ${pitch.city} DISTINCT from other cities: ${distinctivenessMap.distinctiveEntities.slice(0, 4).map(e => e.name).join(', ') || 'unique local culture'}

REQUIREMENTS — create 3 NPCs, each COMPLETELY DIFFERENT:
1. Do NOT make all NPCs in the same social class or profession
2. Each NPC must reference at least one SPECIFIC entity from the Qloo data above in their description or dialogue
3. Make each NPC sound like they truly grew up in THIS city — vocabulary, references, attitudes must be location-specific
4. The "quote" must be memorable and character-defining (like a great movie line)
5. The "dialogue" must be 3 varied conversational lines — not all in the same tone
6. Avoid clichés: no "mysterious stranger", no "wise elder", no generic "street criminal"
7. Think about: what actual subcultures, local scenes, or hyper-local references would THIS NPC have?

Return ONLY a valid JSON array. No markdown, no explanation:
[
  {
    "archetype": "Specific role/title in ${pitch.city}'s ${pitch.genre} world",
    "description": "2 vivid specific sentences. Must mention a specific cultural detail from ${pitch.city}. Include their look.",
    "quote": "One definitive character-defining line that reveals their worldview.",
    "dialogue": [
      "Dialogue line that references a local place or cultural element",
      "Dialogue line revealing their relationship to power or the system",
      "Dialogue line showing their personality under pressure or curiosity"
    ],
    "seeds": ["specific local subculture", "specific local venue or cultural scene"]
  }
]`;

    let archetypes: Array<{ archetype: string; description: string; quote?: string; dialogue?: string[]; seeds: string[] }> = [];
    try {
      const res = await callRoleJson<Array<{ archetype: string; description: string; quote?: string; dialogue?: string[]; seeds: string[] }>>('writer', archetypesPrompt, { maxTokens: 1800 });
      if (Array.isArray(res.data) && res.data.length > 0) archetypes = res.data;
    } catch {
      // Writer unavailable: build plain taste profiles straight from Qloo results (no invented dialogue)
      const venues = scoutReport.food.slice(0, 3);
      archetypes = venues.map((v, i) => ({
        archetype: `Regular at ${v.name}`,
        description: `A local whose week revolves around ${v.name}${scoutReport.music[i] ? ` and who has ${scoutReport.music[i].name} on repeat` : ''}.`,
        dialogue: [],
        seeds: [v.name],
      }));
    }

    const npcProfiles: NpcProfile[] = [];
    for (let i = 0; i < archetypes.length; i++) {
      const arch = archetypes[i];

      // Ground directly in the rich cultural data already discovered by Scout Agent
      const archMusic = scoutReport.music.slice(i * 2, i * 2 + 3);
      const archFood = scoutReport.food.slice(i * 2, i * 2 + 3);

      const npcEv = makeEvidence(
        evidenceStore,
        'agent_archetype',
        [...archMusic, ...archFood].map(e => e.id),
        seedTagIds,
        `Taste profile for archetype: ${arch.archetype}`
      );

      const npc: NpcProfile = {
        archetype: arch.archetype,
        description: arch.description,
        quote: arch.quote,
        dialogue: arch.dialogue || [],
        listens_to: archMusic.length ? archMusic.map(e => e.name) : scoutReport.music.slice(i, i + 3).map(e => e.name),
        eats_at: archFood.length ? archFood.map(e => e.name) : scoutReport.food.slice(i, i + 3).map(e => e.name),
        talks_about: distinctivenessMap.distinctiveEntities.slice(i * 2, i * 2 + 2).map(e => e.name),
        evidence: [npcEv],
      };
      npcProfiles.push(npc);
      emit({ type: 'npc.cast', act: 4, seq: 15 + i, payload: { npc } });
    }
    job.npcProfiles = npcProfiles;
    emit({ type: 'act.complete', act: 4, seq: 18, payload: { npcCount: npcProfiles.length } });

    // ── Act 5: Set Dressing – World Pack with Evidence Citations ──────────
    emit({ type: 'act.enter', act: 5, seq: 19, payload: { label: 'Set Dressing', description: 'Building grounded world content...' } });

    const worldPack: WorldPackItem[] = [];

    // Radio stations
    const topArtists = scoutReport.music.slice(0, 8).map((e, i) => `${i + 1}. ${e.name}`).join('\n') || 'local artists';
    const radioPrompt = `You are building in-game radio stations for a ${pitch.genre} set in ${pitch.city} during ${pitch.era_or_mood || 'the present day'}.

Qloo returned these artists for ${pitch.city}:
${topArtists}

CREATE 2 fictional radio stations that feel like they exist in ${pitch.city}:
- Use local language flavour in station names where it fits
- "artists" must ONLY contain names copied exactly from the list above (3-5 per station)
- Never invent song titles
- Each station needs a distinct format (underground, mainstream, talk-and-music, etc.)

Return ONLY valid JSON array:
[{"name":"Station Name","format":"format description","artists":["Artist Name","Artist Name","Artist Name"]}]`;

    // Shops and Establishments
    const topVenues = [...scoutReport.food, ...scoutReport.brands].slice(0, 6).map((e, idx) => `${idx + 1}. ${e.name}`).join('\n') || 'local venues';
    const shopPrompt = `You are a game world designer creating fictional establishments for a ${pitch.genre} game in ${pitch.city} (${pitch.era_or_mood || 'contemporary'}).

Qloo discovered these REAL VENUES AND BRANDS in ${pitch.city}:
${topVenues}

Create 3 fictional shops or restaurants INSPIRED BY the real places above. Rules:
- Each must feel culturally specific to ${pitch.city} — mix types (food, tech, entertainment, contraband, etc.)
- The "items" should be specific menus/products fitting the city and era
- The "inspired_by" should name a specific real Qloo venue/brand from the list above

Return ONLY valid JSON array:
[{"name":"Fictional Place Name","tagline":"atmospheric tagline","items":["Specific item 1","Specific item 2","Specific item 3"],"inspired_by":"Real Qloo Venue Name"}]`;

    // Ambient chatter
    const chatterAnchors = [...scoutReport.food, ...scoutReport.music, ...scoutReport.shows].slice(0, 8).map(e => e.name).join(', ') || 'local culture';
    const chatterPrompt = `You are writing ambient NPC dialogue for a ${pitch.genre} game set in ${pitch.city} (${pitch.era_or_mood || 'contemporary'}).

These are REAL cultural anchors Qloo found in ${pitch.city}: ${chatterAnchors}

Write 6 ambient overheard dialogue snippets. Rules:
- Each line must sound like it comes from a REAL person in THIS specific city in THIS specific era
- Reference specific places, artists, foods, or local events from the Qloo data above when possible
- Mix tones: anxious, gossiping, arguing, confused, nostalgic, sarcastic
- No line should be longer than 15 words
- At least 2 lines should reference specific cultural items from the Qloo list

Return ONLY valid JSON array of strings:
["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6"]`;

    const [radioResult, shopResult, chatterResult] = await Promise.allSettled([
      callRoleJson<Array<{ name: string; format: string; artists?: string[]; tracklist?: string[] }>>('writer', radioPrompt, { maxTokens: 1400 }),
      callRoleJson<Array<{ name: string; tagline: string; items: string[]; inspired_by: string }>>('writer', shopPrompt, { maxTokens: 1400 }),
      callRoleJson<string[]>('writer', chatterPrompt, { maxTokens: 800 }),
    ]);

    if (radioResult.status === 'fulfilled' && Array.isArray(radioResult.value.data)) {
      radioResult.value.data.forEach(st => {
        // Keep only artists Qloo actually returned
        const artists = (st.artists || st.tracklist || [])
          .map(a => matchEntity(scoutReport.music, String(a).split(' -- ').pop()))
          .filter((e): e is QlooEntity => !!e);
        if (!artists.length) return;
        const ev = makeEvidence(evidenceStore, 'radio_station', artists.map(e => e.id), seedTagIds,
          `Station "${st.name}" rotates ${artists.map(e => e.name).join(', ')}`, artists[0].affinity || 0);
        worldPack.push({
          kind: 'radio_station',
          name: st.name,
          content: { name: st.name, format: st.format, tracklist: artists.map(e => e.name) },
          evidence: [ev],
          origin: 'qloo_grounded',
        });
      });
    }

    if (shopResult.status === 'fulfilled' && Array.isArray(shopResult.value.data)) {
      const pool = [...scoutReport.food, ...scoutReport.brands];
      shopResult.value.data.forEach(sh => {
        const source = matchEntity(pool, sh.inspired_by);
        const ev = makeEvidence(evidenceStore, 'shop', source ? [source.id] : [], seedTagIds,
          `Shop "${sh.name}" inspired by ${source?.name || sh.inspired_by || 'writer interpretation'}`, source?.affinity || 0);
        worldPack.push({ kind: 'shop', name: sh.name, content: sh, evidence: [ev], origin: source ? 'llm_interpretation' : 'llm_only' });
      });
    }

    if (chatterResult.status === 'fulfilled' && Array.isArray(chatterResult.value.data)) {
      const chatterEv = makeEvidence(
        evidenceStore,
        'ambient_chatter',
        scoutReport.music.slice(0, 4).map(e => e.id),
        seedTagIds,
        'Ambient chatter inspired by discovered cultural anchors'
      );
      chatterResult.value.data.forEach((line, i) => {
        worldPack.push({
          kind: 'chatter',
          name: `Chatter ${i + 1}`,
          content: { line },
          evidence: [chatterEv],
          origin: 'llm_interpretation',
        });
      });
    }

    // No template filler: if nothing grounded came back, the pack stays empty and the UI says so

    worldPack.forEach(item => {
      emit({ type: 'item.dressed', act: 5, seq: 21, payload: { item } });
    });

    // ── Act 6: The Cut (Ungrounded Baseline) ──────────────────────────────
    emit({ type: 'act.enter', act: 6, seq: 24, payload: { label: 'The Cut', description: 'Generating LLM-only baseline for comparative analysis...' } });

    const llmOnlyPrompt = `You are building a game world in ${pitch.city}, ${pitch.era_or_mood || 'contemporary'}, genre: ${pitch.genre}.
WITHOUT any external cultural data, generate:
- 2 radio stations (name, format, 4 track titles)
- 3 shops (name, tagline, 3 items)
- 4 ambient chatter lines
Return ONLY JSON: {"radio":[{"name":"","format":"","tracklist":[]}],"shops":[{"name":"","tagline":"","items":[]}],"chatter":[""]}`;

    let llmOnlyPack: WorldPackItem[] = [];
    try {
      const res = await callRoleJson<{
        radio?: Array<{ name: string; format: string; tracklist: string[] }>;
        shops?: Array<{ name: string; tagline: string; items: string[] }>;
        chatter?: string[];
      }>('writer', llmOnlyPrompt);
      const parsed = res.data;
      if (parsed) {
        llmOnlyPack = [
          ...(parsed.radio || []).map(r => ({ kind: 'radio_station' as const, name: r.name, content: r, evidence: [], origin: 'llm_only' as const })),
          ...(parsed.shops || []).map(s => ({ kind: 'shop' as const, name: s.name, content: s, evidence: [], origin: 'llm_only' as const })),
          ...(parsed.chatter || []).map((c, i) => ({ kind: 'chatter' as const, name: `LLM Chatter ${i + 1}`, content: { line: c }, evidence: [], origin: 'llm_only' as const })),
        ];
      }
    } catch {}

    job.llmOnlyWorldPack = llmOnlyPack;

    // ── Validation & Critic Pass ──────────────────────────────────────────
    const criticReport = await runCritic(worldPack, npcProfiles, evidenceStore);
    job.worldPack = criticReport.cleanWorldPack;
    job.npcProfiles = criticReport.cleanNpcProfiles;
    job.evidenceStore = evidenceStore;

    const evidenceBacked = criticReport.cleanWorldPack.filter(i => i.evidence.length > 0 && i.origin !== 'llm_only').length;
    const distinctive = criticReport.cleanWorldPack.filter(i => {
      return i.evidence.some(evId => {
        const ev = evidenceStore[evId];
        return ev?.entity_ids?.some(eid => distinctivenessMap.distinctiveEntities.find(e => e.id === eid));
      });
    }).length;

    const comparisonSummary = {
      evidenceBackedCount: evidenceBacked,
      distinctiveCount: distinctive,
      llmOnlyCount: llmOnlyPack.length,
      // How many Qloo-returned entities the ungrounded baseline happened to mention
      overlapWithBaseline: countMentions(JSON.stringify(llmOnlyPack), [
        ...scoutReport.music, ...scoutReport.food, ...scoutReport.brands, ...scoutReport.shows,
      ]),
      criticViolationsFixed: criticReport.codeViolations.length,
    };
    job.comparisonSummary = comparisonSummary;

    emit({ type: 'compare.ready', act: 6, seq: 25, payload: { qlooGrounded: criticReport.cleanWorldPack, llmOnly: llmOnlyPack, summary: comparisonSummary } });
    emit({ type: 'act.complete', act: 6, seq: 26, payload: {} });

    // Generate expanded game asset modules
    const expandedOutputs = await generateExpandedOutputs({
      eraBrief: getPreset(pitch.preset_id)?.eraBrief,
      targetLocation: targetCity,
      genre: pitch.genre,
      eraOrMood: pitch.era_or_mood,
      contextDescription: `World setting for ${targetCity} (${pitch.era_or_mood || 'contemporary'})`,
      scoutedArtists: scoutReport.music,
      scoutedVenues: scoutReport.food,
      scoutedBrands: scoutReport.brands,
      evidenceStore,
      distinctiveEntities: distinctivenessMap.distinctiveEntities,
      contrastCity: distinctivenessMap.contrastCity,
    });
    job.questHooks = expandedOutputs.questHooks;
    job.radioStations = expandedOutputs.radioStations;
    job.regionalSponsors = expandedOutputs.regionalSponsors;
    job.culturalDebates = expandedOutputs.culturalDebates;
    job.visualNovelPack = expandedOutputs.visualNovelPack;
    job.spawnTables = expandedOutputs.spawnTables;
    job.districts = expandedOutputs.districts;

    expandedOutputs.questHooks.forEach(q => {
      criticReport.cleanWorldPack.push({ kind: 'quest_hook', name: q.title, content: q as unknown as Record<string, unknown>, evidence: q.evidence, origin: 'llm_interpretation' });
    });
    expandedOutputs.regionalSponsors.forEach(s => {
      criticReport.cleanWorldPack.push({ kind: 'brand_sponsor', name: s.brand_name, content: s as unknown as Record<string, unknown>, evidence: s.evidence, origin: 'llm_interpretation' });
    });

    // ── Act 7: Credits ────────────────────────────────────────────────────
    emit({ type: 'act.enter', act: 7, seq: 27, payload: { label: 'Credits', description: 'Packaging your World Pack...' } });

    const redactedTrace = Object.values(evidenceStore).map(ev => ({
      id: ev.id,
      workflow: ev.workflow,
      entityCount: ev.entity_ids.length,
      tagCount: ev.tags.length,
      note: ev.note,
    }));

    emit({
      type: 'scene.final',
      act: 7,
      seq: 28,
      payload: {
        worldPack: criticReport.cleanWorldPack,
        evidenceStore,
        llmOnlyWorldPack: llmOnlyPack,
        comparisonSummary,
        redactedTrace,
        scoutReport,
        npcProfiles: criticReport.cleanNpcProfiles,
        resolvedContext,
        distinctivenessMap,
        agentUsed,
        questHooks: job.questHooks,
        radioStations: job.radioStations,
        regionalSponsors: job.regionalSponsors,
        culturalDebates: job.culturalDebates,
        visualNovelPack: job.visualNovelPack,
        spawnTables: job.spawnTables,
        districts: job.districts,
      },
    });

    job.status = 'done';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Orchestrator Error]', msg);
    job.status = 'error';
    job.error = msg;
    emit({ type: 'scene.error', payload: { message: msg } });
  }
}

/** Case-insensitive name match against scouted Qloo entities. */
function matchEntity(pool: QlooEntity[], name?: string): QlooEntity | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase().trim();
  return pool.find(e => e.name.toLowerCase() === n) ||
    pool.find(e => e.name.length > 3 && (n.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(n)));
}

function countMentions(text: string, entities: QlooEntity[]): number {
  const lower = text.toLowerCase();
  const names = new Set(entities.map(e => e.name.toLowerCase()).filter(n => n.length > 3));
  let count = 0;
  names.forEach(n => { if (lower.includes(n)) count++; });
  return count;
}

/** Ask the planner for a culturally comparable city; empty string if unavailable (comparison is then skipped). */
async function suggestContrastCity(city: string, genre: string, era?: string): Promise<string> {
  try {
    const res = await callRoleJson<{ contrast_city: string }>('scout_planner',
      `Pick one city that is culturally comparable to ${city} (same country or region, similar size) so that comparing taste data reveals what is distinctive about ${city}. Context: ${genre}, ${era || 'present day'}.
Return ONLY JSON: {"contrast_city":"City Name"}`, { maxTokens: 120, temperature: 0.2 });
    const c = (res.data?.contrast_city || '').trim();
    return c && c.toLowerCase() !== city.toLowerCase() ? c : '';
  } catch {
    return '';
  }
}
