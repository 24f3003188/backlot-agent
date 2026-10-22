export type DirectorMode = 'localize' | 'build' | 'refresh';

export interface ScenePitch {
  director_mode?: DirectorMode;
  // Localize mode inputs
  source_world_pitch?: string;
  home_market?: string;
  target_market?: string;
  // Build mode inputs
  city?: string;
  era_or_mood?: string;
  contrast_city?: string;
  // Refresh mode inputs
  target_region?: string;
  seasonal_event?: string;
  // Shared inputs
  genre: string;
  reference_favorites?: string[];
  mode?: 'agent' | 'pipeline';
  /** Demo preset id: uses hand-researched inputs and replays a recorded run if one exists */
  preset_id?: string;
  /** Force a live run even when a recording exists (re-records it) */
  fresh?: boolean;
}

export interface EvidenceEntityDetail {
  id: string;
  name: string;
  category?: string;
  affinity?: number;
  rank?: number;
}

export interface EvidenceItem {
  id: string;
  source: 'qloo' | 'llm';
  workflow: string;
  call_id: string;
  entity_ids: string[];
  tags: string[];
  signal: { type: 'affinity' | 'rank' | 'trend'; value: number };
  note: string;
  entity_names?: string[];
  entity_details?: EvidenceEntityDetail[];
}

export interface WorldPackItem {
  kind: 'radio_station' | 'shop' | 'menu_item' | 'npc' | 'chatter' | 'poster' | 'quest_hook' | 'brand_sponsor' | 'cultural_debate';
  name: string;
  content: Record<string, unknown>;
  evidence: string[];
  origin: 'qloo_grounded' | 'llm_interpretation' | 'llm_only';
}

export interface NpcProfile {
  archetype: string;
  description: string;
  listens_to: string[];
  eats_at: string[];
  talks_about: string[];
  quote?: string;
  dialogue?: string[];
  evidence: string[];
}

export interface CultureFitKeepItem {
  name: string;
  category: string;
  rationale: string;
  confidence: number;
}

export interface CultureFitSwapItem {
  original_element: string;
  replacement_element: string;
  category: string;
  rationale: string;
  qloo_entity_id?: string;
  qloo_affinity?: number;
}

export interface CultureFitAddItem {
  name: string;
  category: string;
  rationale: string;
  regional_habit: string;
  qloo_entity_id?: string;
}

export interface CultureFitReport {
  target_market: string;
  home_market: string;
  summary: string;
  keep_elements: CultureFitKeepItem[];
  swap_elements: CultureFitSwapItem[];
  add_elements: CultureFitAddItem[];
}

export interface QuestHook {
  title: string;
  activity_type: 'ritual' | 'gathering' | 'investigation' | 'procurement' | 'competition';
  objective: string;
  local_tension: string;
  contact_npc: string;
  cultural_context: string;
  evidence: string[];
}

export interface RadioTrackItem {
  title: string;
  artist: string;
  qloo_entity_id?: string;
  affinity_score?: number;
}

export interface RadioStation {
  station_name: string;
  frequency: string;
  genre: string;
  dj_name: string;
  dj_persona: string;
  banter_sample: string;
  tracklist: RadioTrackItem[];
  evidence?: string[];
}

export interface RegionalSponsor {
  brand_name: string;
  industry: string;
  tagline: string;
  in_world_presence: string;
  player_appeal: string;
  inspired_by?: string;
  evidence: string[];
}

export interface LocalSlangItem {
  term: string;
  meaning: string;
  usage: string;
}

export interface CulturalDebate {
  topic: string;
  competing_viewpoints: string[];
  local_slang: LocalSlangItem[];
  ambient_dialogue: string[];
}

export interface BackgroundLocation {
  name: string;
  surroundings: string;
  atmospheric_details: string;
  cultural_anchor: string;
  evidence: string[];
}

export interface CastMember {
  name: string;
  role: string;
  speech_register: string;
  slang_terms: string[];
  taste_profile: {
    music: string[];
    hangouts: string[];
  };
  sample_dialogue: string;
  evidence: string[];
}

export interface SceneBeat {
  title: string;
  timing_or_event: string;
  dramatic_hook: string;
  cultural_significance: string;
  evidence: string[];
}

export interface MusicCue {
  mood: string;
  artist: string;
  tempo_and_feel: string;
  affinity_score?: number;
  evidence: string[];
}

export interface NarrativeRoute {
  character_or_faction: string;
  premise: string;
  conflict_rooted_in_culture: string;
  evidence?: string[];
}

export interface VisualNovelPack {
  backgroundLocations: BackgroundLocation[];
  cast: CastMember[];
  sceneBeats: SceneBeat[];
  musicCues: MusicCue[];
  narrativeRoutes: NarrativeRoute[];
}

export interface WeightedSpawnEntry {
  id: string;
  name: string;
  category: 'music' | 'venue' | 'brand' | 'npc' | 'encounter';
  weight: number; // 1-100: Qloo affinity when returned, otherwise derived from Qloo rank order
  weight_source?: 'qloo_affinity' | 'qloo_rank';
  rarity: 'common' | 'uncommon' | 'rare' | 'signature';
  tags: string[];
  evidence_id?: string;
  notes?: string;
}

export interface WeightedSpawnTable {
  table_name: string;
  description: string;
  selection_mode: 'weighted_random' | 'priority_cascade';
  entries: WeightedSpawnEntry[];
}

export interface DistrictHierarchy {
  district_name: string;
  vibe_summary: string;
  venues: Array<{ name: string; type: string; affinity_score?: number; qloo_entity_id?: string }>;
  factions_or_npcs: Array<{ archetype: string; speech_register?: string }>;
  soundtrack_dial?: string;
}

export interface SceneJob {
  id: string;
  pitch: ScenePitch;
  status: 'pending' | 'running' | 'done' | 'error';
  createdAt: number;
  resolvedContext?: ResolvedContext;
  scoutReport?: ScoutReport;
  distinctivenessMap?: DistinctivenessMap;
  npcProfiles?: NpcProfile[];
  worldPack?: WorldPackItem[];
  evidenceStore?: Record<string, EvidenceItem>;
  llmOnlyWorldPack?: WorldPackItem[];
  comparisonSummary?: ComparisonSummary;
  // Expanded Cultural Director outputs
  cultureFitReport?: CultureFitReport;
  questHooks?: QuestHook[];
  radioStations?: RadioStation[];
  regionalSponsors?: RegionalSponsor[];
  culturalDebates?: CulturalDebate[];
  visualNovelPack?: VisualNovelPack;
  spawnTables?: WeightedSpawnTable[];
  districts?: DistrictHierarchy[];
  error?: string;
  pendingQuestion?: string;
}

export interface ResolvedContext {
  locationId: string;
  cityDisplay: string;
  seedEntities: QlooEntity[];
  seedTags: QlooTag[];
}

export interface ScoutReport {
  music: QlooEntity[];
  food: QlooEntity[];
  brands: QlooEntity[];
  shows: QlooEntity[];
  games: QlooEntity[];
}

export interface DistinctivenessMap {
  distinctiveEntities: QlooEntity[];
  distinctiveTags: string[];
  contrastCity: string;
}

export interface ComparisonSummary {
  evidenceBackedCount: number;
  distinctiveCount: number;
  llmOnlyCount: number;
  overlapWithBaseline: number;
}

export interface QlooEntity {
  id: string;
  name: string;
  type: string;
  affinity?: number;
  popularity?: number;
  tags?: string[];
  /** 'qloo' when returned by the Taste AI, 'curated' when suggested by the writer model */
  source?: 'qloo' | 'curated';
}

export interface QlooTag {
  id: string;
  name: string;
  type: string;
}

// SSE Event types
export type SseEventType =
  | 'scene.start'
  | 'act.enter'
  | 'tool.call'
  | 'tool.result'
  | 'tool.error'
  | 'evidence.add'
  | 'question.ask'
  | 'npc.cast'
  | 'item.dressed'
  | 'report.ready'
  | 'compare.ready'
  | 'act.complete'
  | 'scene.final'
  | 'scene.error';

export interface SseEvent {
  type: SseEventType;
  act?: number;
  seq?: number;
  payload: Record<string, unknown>;
}
