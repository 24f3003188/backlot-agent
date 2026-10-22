import type {
  QuestHook,
  RadioStation,
  RegionalSponsor,
  CulturalDebate,
  QlooEntity,
  EvidenceItem,
  VisualNovelPack,
  WeightedSpawnTable,
  DistrictHierarchy,
  WeightedSpawnEntry,
} from '../types.js';
import { callRoleJson } from '../llm/router.js';

export interface GenerateExpandedOutputsInput {
  targetLocation: string;
  genre: string;
  eraOrMood?: string;
  contextDescription: string;
  scoutedArtists: QlooEntity[];
  scoutedVenues: QlooEntity[];
  scoutedBrands: QlooEntity[];
  evidenceStore: Record<string, EvidenceItem>;
  distinctiveEntities: QlooEntity[];
  contrastCity?: string;
  /** Pre-researched period notes (demo presets); skips the era-brief model call */
  eraBrief?: EraBrief;
}

export interface ExpandedOutputsResult {
  questHooks: QuestHook[];
  radioStations: RadioStation[];
  regionalSponsors: RegionalSponsor[];
  culturalDebates: CulturalDebate[];
  visualNovelPack?: VisualNovelPack;
  spawnTables: WeightedSpawnTable[];
  districts: DistrictHierarchy[];
}

import type { EraBrief } from '../presets.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9À-￿]+/g, ' ').trim();

/** Find a scouted entity whose name matches (exact first, then containment). */
function findByName(pool: QlooEntity[], name?: string): QlooEntity | undefined {
  if (!name) return undefined;
  const n = norm(name);
  if (!n) return undefined;
  return (
    pool.find(e => norm(e.name) === n) ||
    pool.find(e => norm(e.name).length > 3 && (n.includes(norm(e.name)) || norm(e.name).includes(n)))
  );
}

function makeUniqueEvidence(
  store: Record<string, EvidenceItem>,
  workflow: string,
  entities: Array<QlooEntity | undefined>,
  note: string
): string {
  const real = entities.filter((e): e is QlooEntity => !!e && !!e.id);
  const id = `ev_${Object.keys(store).length.toString().padStart(3, '0')}`;
  const scored = real.find(e => typeof e.affinity === 'number');
  store[id] = {
    id,
    source: real.length ? 'qloo' : 'llm',
    workflow,
    call_id: `call_${Object.keys(store).length}`,
    entity_ids: real.map(e => e.id),
    tags: [],
    signal: scored
      ? { type: 'affinity', value: scored.affinity as number }
      : { type: 'rank', value: real.length },
    note,
    entity_names: real.map(e => e.name),
    entity_details: real.map((e, idx) => ({
      id: e.id,
      name: e.name,
      category: e.type,
      affinity: e.affinity,
      rank: idx + 1,
    })),
  };
  return id;
}

function numbered(list: QlooEntity[], max: number): string {
  return list.slice(0, max).map((e, i) => `${i + 1}. ${e.name}`).join('\n');
}

/** Turns a ranked Qloo list into engine spawn weights without inventing scores. */
function toSpawnEntries(
  list: QlooEntity[],
  category: WeightedSpawnEntry['category'],
  defaultTags: string[],
  evidenceId: string
): WeightedSpawnEntry[] {
  const n = list.length;
  // Use one scale per table: affinity only if Qloo scored every entry, otherwise rank order
  const allScored = list.every(e => typeof e.affinity === 'number');
  return list.map((e, idx) => {
    const hasAffinity = allScored;
    const weight = hasAffinity
      ? Math.max(1, Math.round((e.affinity as number) * 100))
      : Math.max(5, Math.round((100 * (n - idx)) / n));
    const rarity: WeightedSpawnEntry['rarity'] =
      weight >= 90 ? 'signature' : weight >= 75 ? 'rare' : weight >= 50 ? 'uncommon' : 'common';
    return {
      id: e.id,
      name: e.name,
      category,
      weight,
      weight_source: hasAffinity ? 'qloo_affinity' : 'qloo_rank',
      rarity,
      tags: e.tags?.length ? e.tags : defaultTags,
      evidence_id: evidenceId,
      notes: hasAffinity
        ? `Qloo affinity ${(e.affinity as number).toFixed(2)}`
        : `Qloo rank #${idx + 1} of ${n} (no affinity score returned)`,
    };
  });
}

// ─── Era brief (generalised replacement for per-city hardcoded period notes) ─

async function buildEraBrief(location: string, era: string | undefined, genre: string): Promise<EraBrief | null> {
  const eraText = era?.trim() || 'present day';
  const prompt = `You are a period and place researcher for a game studio.
Setting: ${location}
Era / mood: ${eraText}
Game genre: ${genre}

List what a writer must get right for this exact place and time:
- period_anchors: 6 concrete things that genuinely existed in ${location} during this era (transport, technology, media, food spots, public events, everyday objects).
- avoid: 6 specific anachronisms or clichés a writer is likely to get wrong for this place and era (things that appeared later, closed earlier, or belong to a different region).
- local_texture: 6 everyday sensory or social details of life there in that era.
Only include items you are confident about. Prefer specific names over generic ones.

Return ONLY JSON:
{"era_label":"short label","period_anchors":["..."],"avoid":["..."],"local_texture":["..."]}`;
  try {
    const res = await callRoleJson<EraBrief>('scout_planner', prompt, { maxTokens: 900, temperature: 0.3 });
    const d = res.data;
    if (!d || !Array.isArray(d.period_anchors)) return null;
    return {
      era_label: d.era_label || eraText,
      period_anchors: d.period_anchors.slice(0, 8),
      avoid: (d.avoid || []).slice(0, 8),
      local_texture: (d.local_texture || []).slice(0, 8),
    };
  } catch (err: any) {
    console.warn(`[ExpandedOutputs] Era brief failed: ${err.message}`);
    return null;
  }
}

function eraNoticeFrom(brief: EraBrief | null, location: string, era?: string): string {
  const eraText = era?.trim() || 'present day';
  const base = `ERA RULES (${location}, ${eraText}): only reference technology, venues, brands, media, slang and events that existed in ${location} during this era. If a listed entity clearly postdates the era, leave it out.`;
  if (!brief) return base;
  return `${base}
Period anchors to draw on: ${brief.period_anchors.join('; ')}
Everyday texture: ${brief.local_texture.join('; ')}
Do NOT include: ${brief.avoid.join('; ')}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function generateExpandedOutputs(
  opts: GenerateExpandedOutputsInput
): Promise<ExpandedOutputsResult> {
  const {
    targetLocation,
    genre,
    eraOrMood,
    scoutedArtists,
    scoutedVenues,
    scoutedBrands,
    evidenceStore,
    distinctiveEntities,
  } = opts;

  const era = eraOrMood || 'present day';
  const gLower = genre.toLowerCase();
  const isVisualNovel = ['visual novel', 'dating', 'narrative', 'interactive fiction', 'otome', 'romance']
    .some(k => gLower.includes(k));

  const eraBrief = opts.eraBrief || await buildEraBrief(targetLocation, eraOrMood, genre);
  const eraNotice = eraNoticeFrom(eraBrief, targetLocation, eraOrMood);

  const artistList = numbered(scoutedArtists, 10) || '(no artists returned by Qloo)';
  const venueList = numbered(scoutedVenues, 10) || '(no venues returned by Qloo)';
  const brandList = numbered(scoutedBrands, 8) || '(no brands returned by Qloo)';
  const distinctiveList = distinctiveEntities.slice(0, 6).map(e => e.name).join(', ') || '(none)';
  const commercePool = [...scoutedBrands, ...scoutedVenues];

  // ── Prompts ─────────────────────────────────────────────────────────────
  const vnPrompt = `You are a narrative director designing a ${genre} set in ${targetLocation} (${era}).
${eraNotice}

Real cultural anchors Qloo returned for ${targetLocation}:
Artists:
${artistList}
Venues:
${venueList}
Brands:
${brandList}
Distinctive vs other cities: ${distinctiveList}

Generate:
1. 4 background locations rooted in real places or everyday spaces of ${targetLocation}. "cultural_anchor" should name a venue from the list when one fits.
2. 4 cast members with distinct speech registers in the local language mix, archetypes, and taste profiles that use names from the lists.
3. 4 scene beats tied to real seasonal, civic or social rhythms of ${targetLocation} in this era.
4. 4 music cues by mood. "artist" MUST be copied exactly from the artist list. Never invent song titles.
5. 3 narrative routes whose conflicts come from local cultural expectations.
Keep every text field under 30 words.

Return ONLY JSON:
{"backgroundLocations":[{"name":"","surroundings":"","atmospheric_details":"","cultural_anchor":""}],
"cast":[{"name":"","role":"","speech_register":"","slang_terms":[""],"taste_profile":{"music":[""],"hangouts":[""]},"sample_dialogue":""}],
"sceneBeats":[{"title":"","timing_or_event":"","dramatic_hook":"","cultural_significance":""}],
"musicCues":[{"mood":"","artist":"","tempo_and_feel":""}],
"narrativeRoutes":[{"character_or_faction":"","premise":"","conflict_rooted_in_culture":""}]}`;

  const questPrompt = `You are a quest designer for a ${genre} set in ${targetLocation} (${era}).
${eraNotice}

Real venues Qloo returned for ${targetLocation}:
${venueList}

Create 4 side-activity quest hooks grounded in real local habits, tensions or rituals of ${targetLocation} in this era.
- activity_type must be one of: "ritual", "gathering", "investigation", "procurement", "competition"
- Fit the genre: the quest structure should feel natural for a ${genre}.
- Avoid generic tourist clichés; ground each in daily life.
- "inspired_entity" must be copied exactly from the venue list.
- Keep it tight: objective max 25 words, local_tension and cultural_context max 20 words each, contact_npc max 8 words.

Return ONLY a JSON array:
[{"title":"","activity_type":"investigation","objective":"","local_tension":"","contact_npc":"","cultural_context":"","inspired_entity":""}]`;

  const radioPrompt = `You are an audio director creating in-game radio stations for a ${genre} set in ${targetLocation} (${era}).
${eraNotice}

Artists Qloo returned for ${targetLocation}:
${artistList}

Create 2 fictional radio stations with clearly different formats.
- "artists" MUST only contain names copied exactly from the list above (3-5 per station). Never invent song titles.
- Give each a frequency, format, DJ name, DJ persona (max 12 words) and a one-sentence on-air banter line (max 20 words) that references local life.

Return ONLY a JSON array:
[{"station_name":"","frequency":"","genre":"","dj_name":"","dj_persona":"","banter_sample":"","artists":[{"artist":"","genre":""}]}]`;

  const sponsorPrompt = `You are an environment set dresser designing in-world storefronts for a ${genre} set in ${targetLocation} (${era}).
${eraNotice}

Brands and venues Qloo returned for ${targetLocation}:
${brandList}
${venueList}

Create 3 fictional storefronts or sponsors that would plausibly line the streets of ${targetLocation} in this era.
- Each is inspired by a real entry above; "inspired_by" must be copied exactly from the lists.
- Names must feel local, not generic ("City Mart", "<City> Delight" are not acceptable).
- Keep it tight: industry 1-3 words, tagline max 8 words, in_world_presence max 15 words, player_appeal max 15 words.

Return ONLY a JSON array:
[{"brand_name":"","industry":"","tagline":"","in_world_presence":"","player_appeal":"","inspired_by":""}]`;

  const debatePrompt = `You are a dialogue writer creating ambient street conversation for ${targetLocation} (${era}) in a ${genre}.
${eraNotice}

Generate 1 cultural debate reflecting a real public tension in ${targetLocation} during this era, with two competing viewpoints.
Add 4 regional slang terms that were actually in use then, with meanings and example sentences.
Add 4 short overheard street lines (under 18 words each). Each viewpoint max 30 words; slang usage max 15 words.

Return ONLY JSON:
{"topic":"","competing_viewpoints":["",""],"local_slang":[{"term":"","meaning":"","usage":""}],"ambient_dialogue":["","","",""]}`;

  const districtPrompt = `You are a level designer laying out a ${genre} set in ${targetLocation} (${era}).

Real venues Qloo returned for ${targetLocation}:
${venueList}

Group these venues into 2-4 districts that reflect how ${targetLocation} is actually organised (neighbourhoods, commercial belts, transit hubs, old vs new quarters).
- Every venue name must be copied exactly from the list; each venue appears in at most one district.
- Give each district a vibe summary (max 25 words) and 2 NPC factions or archetypes with a speech register (max 12 words).

Return ONLY a JSON array:
[{"district_name":"","vibe_summary":"","venues":[{"name":"","type":""}],"factions_or_npcs":[{"archetype":"","speech_register":""}]}]`;

  const [vnRes, questRes, radioRes, sponsorRes, debateRes, districtRes] = await Promise.allSettled([
    isVisualNovel ? callRoleJson<VisualNovelPack>('writer', vnPrompt, { maxTokens: 3500 }) : Promise.reject(new Error('skip')),
    scoutedVenues.length ? callRoleJson<any[]>('writer', questPrompt, { maxTokens: 2000 }) : Promise.reject(new Error('no venues')),
    scoutedArtists.length ? callRoleJson<any[]>('writer', radioPrompt, { maxTokens: 1600 }) : Promise.reject(new Error('no artists')),
    commercePool.length ? callRoleJson<any[]>('writer', sponsorPrompt, { maxTokens: 1400 }) : Promise.reject(new Error('no brands')),
    callRoleJson<CulturalDebate>('writer', debatePrompt, { maxTokens: 1400 }),
    scoutedVenues.length >= 2 ? callRoleJson<any[]>('writer', districtPrompt, { maxTokens: 1800 }) : Promise.reject(new Error('few venues')),
  ]);
  const ok = <T,>(r: PromiseSettledResult<{ data: T }>): T | undefined =>
    r.status === 'fulfilled' ? r.value.data : undefined;

  // ── 1. Visual novel pack ────────────────────────────────────────────────
  let visualNovelPack: VisualNovelPack | undefined;
  const vn = ok(vnRes);
  if (vn && Array.isArray(vn.backgroundLocations)) {
    vn.backgroundLocations = vn.backgroundLocations.map((loc, idx) => {
      const anchor = findByName(scoutedVenues, loc.cultural_anchor) || findByName(scoutedVenues, loc.name) || scoutedVenues[idx];
      return { ...loc, evidence: [makeUniqueEvidence(evidenceStore, 'vn_background_location', [anchor], `Background "${loc.name}" anchored to ${anchor?.name || 'writer interpretation'}`)] };
    });
    vn.cast = (vn.cast || []).map((c, idx) => {
      const music = (c.taste_profile?.music || []).map(n => findByName(scoutedArtists, n)).filter(Boolean) as QlooEntity[];
      const hangouts = (c.taste_profile?.hangouts || []).map(n => findByName(scoutedVenues, n)).filter(Boolean) as QlooEntity[];
      const seeds = music.length || hangouts.length ? [...music, ...hangouts] : [scoutedArtists[idx], scoutedVenues[idx]];
      return { ...c, evidence: [makeUniqueEvidence(evidenceStore, 'vn_cast_taste', seeds, `Taste profile for ${c.name}`)] };
    });
    vn.sceneBeats = (vn.sceneBeats || []).map((b, idx) => ({
      ...b,
      evidence: [makeUniqueEvidence(evidenceStore, 'vn_scene_beat', [distinctiveEntities[idx]], `Scene beat "${b.title}"`)],
    }));
    vn.musicCues = (vn.musicCues || [])
      .map(mc => ({ mc, artist: findByName(scoutedArtists, mc.artist) }))
      .filter(x => x.artist)
      .map(({ mc, artist }) => ({
        ...mc,
        artist: artist!.name,
        affinity_score: typeof artist!.affinity === 'number' ? Math.round(artist!.affinity * 100) : undefined,
        evidence: [makeUniqueEvidence(evidenceStore, 'vn_music_cue', [artist], `Music cue "${mc.mood}" uses ${artist!.name}`)],
      }));
    vn.narrativeRoutes = vn.narrativeRoutes || [];
    visualNovelPack = vn;
  }

  // ── 2. Quests ───────────────────────────────────────────────────────────
  const validTypes = new Set(['ritual', 'gathering', 'investigation', 'procurement', 'competition']);
  const rawQuests = Array.isArray(ok(questRes)) ? (ok(questRes) as any[]) : [];
  const questHooks: QuestHook[] = rawQuests.filter(q => q?.title).map((q, idx) => {
    const venue = findByName(scoutedVenues, q.inspired_entity) || scoutedVenues[idx % Math.max(1, scoutedVenues.length)];
    return {
      title: q.title,
      activity_type: validTypes.has(q.activity_type) ? q.activity_type : 'investigation',
      objective: q.objective || '',
      local_tension: q.local_tension || '',
      contact_npc: q.contact_npc || '',
      cultural_context: q.cultural_context || '',
      evidence: [makeUniqueEvidence(evidenceStore, 'quest_hook', [venue], `Quest "${q.title}" inspired by ${venue?.name || 'writer interpretation'}`)],
    };
  });

  // ── 3. Radio (only artists Qloo actually returned) ──────────────────────
  const rawRadio = Array.isArray(ok(radioRes)) ? (ok(radioRes) as any[]) : [];
  let radioStations: RadioStation[] = rawRadio.map((st: any) => {
    const named: QlooEntity[] = (st.artists || st.tracklist || [])
      .map((item: any) => findByName(scoutedArtists, typeof item === 'string' ? item : item?.artist || item?.name))
      .filter(Boolean);
    const unique = [...new Map(named.map(a => [a.id, a])).values()];
    return { st, artists: unique };
  }).filter(x => x.artists.length > 0).map(({ st, artists }) => ({
    station_name: st.station_name || `${targetLocation} FM`,
    frequency: st.frequency || '',
    genre: st.genre || '',
    dj_name: st.dj_name || '',
    dj_persona: st.dj_persona || '',
    banter_sample: st.banter_sample || '',
    tracklist: artists.map(a => ({
      title: a.name,
      artist: a.name,
      qloo_entity_id: a.id,
      affinity_score: typeof a.affinity === 'number' ? Math.round(a.affinity * 100) : undefined,
    })),
    evidence: [makeUniqueEvidence(evidenceStore, 'radio_station', artists, `Station "${st.station_name}" rotates ${artists.length} Qloo-returned artists`)],
  }));
  if (!radioStations.length && scoutedArtists.length) {
    const artists = scoutedArtists.slice(0, 6);
    radioStations = [{
      station_name: `${targetLocation} Local Rotation`,
      frequency: '',
      genre: 'Local favourites',
      dj_name: '',
      dj_persona: '',
      banter_sample: '',
      tracklist: artists.map(a => ({ title: a.name, artist: a.name, qloo_entity_id: a.id, affinity_score: typeof a.affinity === 'number' ? Math.round(a.affinity * 100) : undefined })),
      evidence: [makeUniqueEvidence(evidenceStore, 'radio_station', artists, `Rotation built directly from Qloo's top artists for ${targetLocation}`)],
    }];
  }

  // ── 4. Storefronts ──────────────────────────────────────────────────────
  const rawSponsors = Array.isArray(ok(sponsorRes)) ? (ok(sponsorRes) as any[]) : [];
  const regionalSponsors: RegionalSponsor[] = rawSponsors.filter(sp => sp?.brand_name).map((sp, idx) => {
    const source = findByName(commercePool, sp.inspired_by) || commercePool[idx % Math.max(1, commercePool.length)];
    return {
      brand_name: sp.brand_name,
      industry: sp.industry || '',
      tagline: sp.tagline || '',
      in_world_presence: sp.in_world_presence || '',
      player_appeal: sp.player_appeal || '',
      inspired_by: source?.name || sp.inspired_by,
      evidence: [makeUniqueEvidence(evidenceStore, 'storefront_sponsor', [source], `Storefront "${sp.brand_name}" inspired by ${source?.name || sp.inspired_by || 'writer interpretation'}`)],
    };
  });

  // ── 5. Debate & slang ───────────────────────────────────────────────────
  const debate = ok(debateRes);
  const culturalDebates: CulturalDebate[] = debate?.topic
    ? [{
        topic: debate.topic,
        competing_viewpoints: debate.competing_viewpoints || [],
        local_slang: debate.local_slang || [],
        ambient_dialogue: debate.ambient_dialogue || [],
      }]
    : [];

  // ── 6. Weighted spawn tables (Qloo scores or Qloo rank, never invented) ─
  const spawnTables: WeightedSpawnTable[] = [];
  const addTable = (list: QlooEntity[], category: WeightedSpawnEntry['category'], name: string, description: string, tags: string[]) => {
    if (!list.length) return;
    const ev = makeUniqueEvidence(evidenceStore, `spawn_table_${category}`, list, `${name} weights from Qloo results`);
    spawnTables.push({ table_name: name, description, selection_mode: 'weighted_random', entries: toSpawnEntries(list, category, tags, ev) });
  };
  addTable(scoutedArtists, 'music', `${targetLocation} Radio Rotation`, 'Weighted rotation for in-world radio and ambient music.', ['audio', 'radio_rotation']);
  addTable(scoutedVenues, 'venue', `${targetLocation} Venues & Encounters`, 'Spawn weights for hangouts, encounter hubs and ambient quest leads.', ['hangout', 'encounter']);
  addTable(scoutedBrands, 'brand', `${targetLocation} Storefronts & Signage`, 'Distribution for shop textures, signage and brand props.', ['signage', 'storefront']);

  // ── 7. Districts (grouped from real venues) ─────────────────────────────
  const rawDistricts = Array.isArray(ok(districtRes)) ? (ok(districtRes) as any[]) : [];
  const usedVenueIds = new Set<string>();
  let districts: DistrictHierarchy[] = rawDistricts.map((d: any, idx: number) => {
    const venues = (d.venues || [])
      .map((v: any) => ({ v, e: findByName(scoutedVenues, typeof v === 'string' ? v : v?.name) }))
      .filter((x: any) => x.e && !usedVenueIds.has(x.e.id))
      .map((x: any) => {
        usedVenueIds.add(x.e.id);
        return {
          name: x.e.name,
          type: (typeof x.v === 'object' && x.v?.type) || '',
          qloo_entity_id: x.e.id,
          affinity_score: typeof x.e.affinity === 'number' ? Math.round(x.e.affinity * 100) : undefined,
        };
      });
    return {
      district_name: d.district_name || `${targetLocation} District ${idx + 1}`,
      vibe_summary: d.vibe_summary || '',
      venues,
      factions_or_npcs: Array.isArray(d.factions_or_npcs) ? d.factions_or_npcs.filter((f: any) => f?.archetype) : [],
      soundtrack_dial: radioStations.length ? radioStations[idx % radioStations.length].station_name : undefined,
    };
  }).filter(d => d.venues.length > 0);

  if (!districts.length && scoutedVenues.length) {
    districts = [{
      district_name: targetLocation,
      vibe_summary: '',
      venues: scoutedVenues.slice(0, 8).map(e => ({
        name: e.name,
        type: '',
        qloo_entity_id: e.id,
        affinity_score: typeof e.affinity === 'number' ? Math.round(e.affinity * 100) : undefined,
      })),
      factions_or_npcs: [],
      soundtrack_dial: radioStations[0]?.station_name,
    }];
  }

  return {
    questHooks,
    radioStations,
    regionalSponsors,
    culturalDebates,
    visualNovelPack,
    spawnTables,
    districts,
  };
}
