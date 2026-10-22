import type {
  SceneJob,
  SseEvent,
  EvidenceItem,
  CultureFitReport,
  WorldPackItem,
  QlooEntity,
} from '../types.js';
import {
  searchEntities,
  findTags,
  discover,
  resetCallCount,
} from '../qloo/client.js';
import { callRoleJson } from '../llm/router.js';
import { generateExpandedOutputs } from './expandedOutputs.js';
import { getPreset } from '../presets.js';

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

export async function runLocalizeMode(
  job: SceneJob,
  emit: (event: SseEvent) => void
): Promise<void> {
  const { id: sceneId, pitch } = job;
  const evidenceStore: Record<string, EvidenceItem> = {};
  resetCallCount(sceneId);

  const targetMarket = (pitch.target_market || pitch.city || '').trim();
  const homeMarket = pitch.home_market?.trim() || 'the original home market';
  const genre = pitch.genre;
  const sourceWorld = pitch.source_world_pitch?.trim() || `A ${genre} whose current setting and content were designed for ${homeMarket}.`;

  try {
    if (!targetMarket) throw new Error('A target market is required for Localize mode.');
    emit({ type: 'scene.start', act: 0, seq: 0, payload: { pitch, mode: 'localize' } });

    // Act 1: Resolving Target and Home Markets
    emit({
      type: 'act.enter',
      act: 1,
      seq: 1,
      payload: {
        label: 'Market Baseline Resolution',
        description: `Resolving cultural profiles for ${targetMarket} and ${homeMarket}...`,
        mode: 'localize',
      },
    });

    const [targetEntities, genreTags] = await Promise.all([
      searchEntities(targetMarket, ['urn:entity:locality', 'urn:entity:destination', 'urn:entity:place'], sceneId)
        .catch(() => [] as QlooEntity[]),
      genre ? findTags(genre, sceneId).catch(() => []) : Promise.resolve([]),
    ]);

    const targetLocalityId = targetEntities[0]?.id;
    const tagIds = genreTags.map(t => t.id).slice(0, 3);

    const evTarget = makeEvidence(
      evidenceStore,
      'market_resolution',
      targetLocalityId ? [targetLocalityId] : [],
      tagIds,
      `Resolved target market baseline for ${targetMarket}`
    );
    emit({ type: 'evidence.add', act: 1, seq: 2, payload: { evidence: evidenceStore[evTarget] } });

    // Act 2: Scouting Target Market Taste Vectors
    emit({
      type: 'act.enter',
      act: 2,
      seq: 3,
      payload: {
        label: 'Taste Scouting in Target Market',
        description: `Querying Qloo taste signals across music, venues, dining, and brands in ${targetMarket}...`,
      },
    });

    const [musicRes, venueRes, brandRes] = await Promise.allSettled([
      discover({ filterType: 'urn:entity:artist', location: targetMarket, seedTagIds: tagIds, sceneId, take: 8 }),
      discover({ filterType: 'urn:entity:place', location: targetMarket, seedTagIds: tagIds, sceneId, take: 8 }),
      discover({ filterType: 'urn:entity:brand', location: targetMarket, seedTagIds: tagIds, sceneId, take: 8 }),
    ]);

    const targetMusic = musicRes.status === 'fulfilled' ? musicRes.value : [];
    const targetVenues = venueRes.status === 'fulfilled' ? venueRes.value : [];
    const targetBrands = brandRes.status === 'fulfilled' ? brandRes.value : [];

    const evScout = makeEvidence(
      evidenceStore,
      'target_taste_scouting',
      [...targetMusic, ...targetVenues, ...targetBrands].map(e => e.id).slice(0, 10),
      tagIds,
      `Discovered ${targetMusic.length + targetVenues.length + targetBrands.length} verified cultural entities in ${targetMarket}`
    );
    emit({ type: 'evidence.add', act: 2, seq: 4, payload: { evidence: evidenceStore[evScout] } });
    emit({ type: 'act.complete', act: 2, seq: 5, payload: { targetMarket, discoveredEntitiesCount: targetMusic.length + targetVenues.length + targetBrands.length } });

    // Act 3: Generating Culture-Fit Report (Keep, Swap, Add)
    emit({
      type: 'act.enter',
      act: 3,
      seq: 6,
      payload: {
        label: 'Culture-Fit Gap Analysis',
        description: `Comparing source world elements against ${targetMarket} aggregate taste signals...`,
      },
    });

    const musicSummary = targetMusic.slice(0, 5).map(m => m.name).join(', ') || 'regional music artists';
    const venueSummary = targetVenues.slice(0, 5).map(v => v.name).join(', ') || 'local commercial venues';
    const brandSummary = targetBrands.slice(0, 5).map(b => b.name).join(', ') || 'regional consumer brands';

    const reportPrompt = `You are a Cultural Director advising a video game studio on adapting an existing game world for players in ${targetMarket}.
Home Market of Game: ${homeMarket}
Target Market to Enter: ${targetMarket}
Game Genre: ${genre}
Source Game World: ${sourceWorld}

Qloo Taste AI verified these cultural anchors with high affinity in ${targetMarket}:
- Popular Music: ${musicSummary}
- Venues and Social Spaces: ${venueSummary}
- Consumer Brands and Retail: ${brandSummary}

Generate a comprehensive Culture-Fit Report with three clear sections:
1. keep_elements (3 items): Tropes, narrative pillars, and game elements from the source world that are globally legible and will land well in ${targetMarket} without changes.
2. swap_elements (3 items): Specific elements from the home market that feel generic, foreign, or out of place, along with concrete regional replacements grounded in the Qloo data above.
3. add_elements (3 items): Hyper-local habits, sensory details, rituals, or social conventions specific to ${targetMarket} that should be added to immediately establish authentic world immersion.

Return ONLY a JSON object matching this schema:
{
  "target_market": "${targetMarket}",
  "home_market": "${homeMarket}",
  "summary": "Executive overview of the cultural adaptation strategy",
  "keep_elements": [
    { "name": "Element Name", "category": "Theme / Mechanic / Setting", "rationale": "Why this translates effectively", "confidence": 92 }
  ],
  "swap_elements": [
    {
      "original_element": "Original Home Market Element",
      "replacement_element": "Regional Replacement Element",
      "category": "Food / Music / Brand / Social Space",
      "rationale": "Why this substitution resonates with local players",
      "inspired_by": "Exact name from the Qloo lists above, if the replacement is based on one"
    }
  ],
  "add_elements": [
    {
      "name": "Local Cultural Element",
      "category": "Ritual / Social Habit / Environmental Detail",
      "rationale": "Why adding this creates immediate authenticity",
      "regional_habit": "Description of everyday practice in ${targetMarket}"
    }
  ]
}`;

    const reportRes = await callRoleJson<CultureFitReport>('writer', reportPrompt, { maxTokens: 2500 });
    const cultureFitReport = reportRes.data;
    cultureFitReport.keep_elements = cultureFitReport.keep_elements || [];
    cultureFitReport.add_elements = cultureFitReport.add_elements || [];
    // Attach real Qloo IDs/affinity to swaps that are based on a returned entity; never trust model-written scores
    const pool = [...targetMusic, ...targetVenues, ...targetBrands];
    cultureFitReport.swap_elements = (cultureFitReport.swap_elements || []).map((sw: any) => {
      const hint = String(sw.inspired_by || sw.replacement_element || '').toLowerCase();
      const match = pool.find(e => e.name.length > 2 && hint.includes(e.name.toLowerCase()));
      const { qloo_affinity: _drop, inspired_by: _hint, ...rest } = sw;
      return {
        ...rest,
        qloo_entity_id: match?.id,
        qloo_affinity: typeof match?.affinity === 'number' ? Math.round(match.affinity * 100) : undefined,
      };
    });
    job.cultureFitReport = cultureFitReport;

    emit({ type: 'report.ready', act: 3, seq: 7, payload: { cultureFitReport } });
    emit({ type: 'act.complete', act: 3, seq: 8, payload: { keepCount: cultureFitReport.keep_elements.length, swapCount: cultureFitReport.swap_elements.length, addCount: cultureFitReport.add_elements.length } });

    // Act 4: Generating Expanded Game Outputs
    emit({
      type: 'act.enter',
      act: 4,
      seq: 9,
      payload: {
        label: 'Game Asset Generation',
        description: `Generating localized quests, radio stations, sponsors, and cultural debates for ${targetMarket}...`,
      },
    });

    const expandedOutputs = await generateExpandedOutputs({
      eraBrief: getPreset(pitch.preset_id)?.eraBrief,
      targetLocation: targetMarket,
      genre,
      contextDescription: `Adaptation for ${targetMarket} based on ${sourceWorld}`,
      scoutedArtists: targetMusic,
      scoutedVenues: targetVenues,
      scoutedBrands: targetBrands,
      evidenceStore,
      distinctiveEntities: [],
      contrastCity: homeMarket,
    });

    job.questHooks = expandedOutputs.questHooks;
    job.radioStations = expandedOutputs.radioStations;
    job.regionalSponsors = expandedOutputs.regionalSponsors;
    job.culturalDebates = expandedOutputs.culturalDebates;
    job.visualNovelPack = expandedOutputs.visualNovelPack;
    job.spawnTables = expandedOutputs.spawnTables;
    job.districts = expandedOutputs.districts;

    // Build unified worldPack for export
    const worldPack: WorldPackItem[] = [];
    expandedOutputs.radioStations.forEach(s => {
      worldPack.push({ kind: 'radio_station', name: s.station_name, content: s as unknown as Record<string, unknown>, evidence: s.evidence?.length ? s.evidence : [evScout], origin: 'qloo_grounded' });
    });
    expandedOutputs.regionalSponsors.forEach(sp => {
      worldPack.push({ kind: 'brand_sponsor', name: sp.brand_name, content: sp as unknown as Record<string, unknown>, evidence: sp.evidence?.length ? sp.evidence : [evScout], origin: 'llm_interpretation' });
    });
    expandedOutputs.questHooks.forEach(q => {
      worldPack.push({ kind: 'quest_hook', name: q.title, content: q as unknown as Record<string, unknown>, evidence: q.evidence?.length ? q.evidence : [evScout], origin: 'llm_interpretation' });
    });
    expandedOutputs.culturalDebates.forEach(d => {
      worldPack.push({ kind: 'cultural_debate', name: d.topic, content: d as unknown as Record<string, unknown>, evidence: [evScout], origin: 'llm_interpretation' });
    });

    job.worldPack = worldPack;
    job.evidenceStore = evidenceStore;
    job.status = 'done';

    emit({
      type: 'scene.final',
      act: 5,
      seq: 10,
      payload: {
        director_mode: 'localize',
        cultureFitReport,
        questHooks: job.questHooks,
        radioStations: job.radioStations,
        regionalSponsors: job.regionalSponsors,
        culturalDebates: job.culturalDebates,
        visualNovelPack: job.visualNovelPack,
        spawnTables: job.spawnTables,
        districts: job.districts,
        worldPack,
        evidenceStore,
      },
    });
  } catch (err: any) {
    job.status = 'error';
    job.error = err.message || String(err);
    emit({ type: 'scene.error', payload: { message: job.error } });
  }
}
