import type {
  SceneJob,
  SseEvent,
  EvidenceItem,
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
    signal: { type: 'trend', value: affinityValue },
    note,
  };
  return id;
}

export async function runRefreshMode(
  job: SceneJob,
  emit: (event: SseEvent) => void
): Promise<void> {
  const { id: sceneId, pitch } = job;
  const evidenceStore: Record<string, EvidenceItem> = {};
  resetCallCount(sceneId);

  const targetRegion = (pitch.target_region || pitch.city || '').trim();
  const seasonalEvent = pitch.seasonal_event?.trim() || 'the next major local festival or season';
  const genre = pitch.genre;

  try {
    if (!targetRegion) throw new Error('A target region is required for Refresh mode.');
    emit({ type: 'scene.start', act: 0, seq: 0, payload: { pitch, mode: 'refresh' } });

    // Act 1: Resolving Regional Context and Seasonal Event
    emit({
      type: 'act.enter',
      act: 1,
      seq: 1,
      payload: {
        label: 'Seasonal Event Resolution',
        description: `Resolving regional trends for ${seasonalEvent} in ${targetRegion}...`,
        mode: 'refresh',
      },
    });

    const [regionEntities, eventTags] = await Promise.all([
      searchEntities(targetRegion, ['urn:entity:locality', 'urn:entity:destination', 'urn:entity:place'], sceneId)
        .catch(() => [] as QlooEntity[]),
      seasonalEvent ? findTags(seasonalEvent, sceneId).catch(() => []) : Promise.resolve([]),
    ]);

    const regionLocalityId = regionEntities[0]?.id;
    const tagIds = eventTags.map(t => t.id).slice(0, 3);

    const evSeason = makeEvidence(
      evidenceStore,
      'seasonal_resolution',
      regionLocalityId ? [regionLocalityId] : [],
      tagIds,
      `Resolved seasonal event "${seasonalEvent}" for ${targetRegion}`
    );
    emit({ type: 'evidence.add', act: 1, seq: 2, payload: { evidence: evidenceStore[evSeason] } });

    // Act 2: Scouting Live Trends and Emerging Signals
    emit({
      type: 'act.enter',
      act: 2,
      seq: 3,
      payload: {
        label: 'Live-Service Trend Scouting',
        description: `Querying Qloo trending music, leisure spots, and seasonal touchpoints in ${targetRegion}...`,
      },
    });

    const [musicRes, venueRes, brandRes] = await Promise.allSettled([
      discover({ filterType: 'urn:entity:artist', location: targetRegion, seedTagIds: tagIds, sceneId, take: 8 }),
      discover({ filterType: 'urn:entity:place', location: targetRegion, seedTagIds: tagIds, sceneId, take: 8 }),
      discover({ filterType: 'urn:entity:brand', location: targetRegion, seedTagIds: tagIds, sceneId, take: 8 }),
    ]);

    const regionalMusic = musicRes.status === 'fulfilled' ? musicRes.value : [];
    const regionalVenues = venueRes.status === 'fulfilled' ? venueRes.value : [];
    const regionalBrands = brandRes.status === 'fulfilled' ? brandRes.value : [];

    const evTrends = makeEvidence(
      evidenceStore,
      'seasonal_trends',
      [...regionalMusic, ...regionalVenues, ...regionalBrands].map(e => e.id).slice(0, 10),
      tagIds,
      `Scouted ${regionalMusic.length + regionalVenues.length + regionalBrands.length} seasonal trend anchors for ${seasonalEvent}`
    );
    emit({ type: 'evidence.add', act: 2, seq: 4, payload: { evidence: evidenceStore[evTrends] } });
    emit({ type: 'act.complete', act: 2, seq: 5, payload: { targetRegion, seasonalEvent, trendCount: regionalMusic.length + regionalVenues.length } });

    // Act 3: Generating Seasonal Blueprint
    emit({
      type: 'act.enter',
      act: 3,
      seq: 6,
      payload: {
        label: 'Seasonal Event Blueprint',
        description: `Designing limited-time narrative, festive activities, and battle pass collabs...`,
      },
    });

    const expandedOutputs = await generateExpandedOutputs({
      eraBrief: getPreset(pitch.preset_id)?.eraBrief,
      targetLocation: targetRegion,
      genre,
      eraOrMood: seasonalEvent,
      contextDescription: `Live-service seasonal update: ${seasonalEvent} in ${targetRegion}`,
      scoutedArtists: regionalMusic,
      scoutedVenues: regionalVenues,
      scoutedBrands: regionalBrands,
      evidenceStore,
      distinctiveEntities: [],
    });

    job.questHooks = expandedOutputs.questHooks;
    job.radioStations = expandedOutputs.radioStations;
    job.regionalSponsors = expandedOutputs.regionalSponsors;
    job.culturalDebates = expandedOutputs.culturalDebates;
    job.visualNovelPack = expandedOutputs.visualNovelPack;
    job.spawnTables = expandedOutputs.spawnTables;
    job.districts = expandedOutputs.districts;

    // Assemble world pack
    const worldPack: WorldPackItem[] = [];
    expandedOutputs.radioStations.forEach(s => {
      worldPack.push({ kind: 'radio_station', name: s.station_name, content: s as unknown as Record<string, unknown>, evidence: s.evidence && s.evidence.length ? s.evidence : [evTrends], origin: 'qloo_grounded' });
    });
    expandedOutputs.regionalSponsors.forEach(sp => {
      worldPack.push({ kind: 'brand_sponsor', name: sp.brand_name, content: sp as unknown as Record<string, unknown>, evidence: sp.evidence && sp.evidence.length ? sp.evidence : [evTrends], origin: 'llm_interpretation' });
    });
    expandedOutputs.questHooks.forEach(q => {
      worldPack.push({ kind: 'quest_hook', name: q.title, content: q as unknown as Record<string, unknown>, evidence: q.evidence && q.evidence.length ? q.evidence : [evTrends], origin: 'llm_interpretation' });
    });
    expandedOutputs.culturalDebates.forEach(d => {
      worldPack.push({ kind: 'cultural_debate', name: d.topic, content: d as unknown as Record<string, unknown>, evidence: [evTrends], origin: 'llm_interpretation' });
    });

    job.worldPack = worldPack;
    job.evidenceStore = evidenceStore;
    job.status = 'done';

    emit({
      type: 'scene.final',
      act: 4,
      seq: 7,
      payload: {
        director_mode: 'refresh',
        target_region: targetRegion,
        seasonal_event: seasonalEvent,
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
