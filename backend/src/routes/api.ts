import { Router } from 'express';
import type { Request, Response } from 'express';
import { createJob, getJob, getAllJobs, subscribe, startJob } from '../session/jobManager.js';
import type { ScenePitch, SceneJob, EvidenceItem, NpcProfile } from '../types.js';
import { callRoleJson } from '../llm/router.js';
import { getPreset } from '../presets.js';
import { hasRecording } from '../session/presetCache.js';
import { hit, LIMITS } from '../session/rateLimit.js';

const router = Router();

const PITCH_TEXT_FIELDS = ['city', 'era_or_mood', 'genre', 'contrast_city', 'home_market', 'target_market', 'target_region', 'seasonal_event', 'preset_id'] as const;

/** Single line, no control characters, bounded length. User text reaches model prompts and generated engine code. */
function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || undefined;
}

/** Keeps only known pitch fields with the expected types; anything else in the body is dropped. */
function sanitizePitch(body: unknown): ScenePitch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PITCH_TEXT_FIELDS) {
    const v = cleanText(src[k], 160);
    if (v) out[k] = v;
  }
  const world = cleanText(src.source_world_pitch, 2000);
  if (world) out.source_world_pitch = world;
  if (Array.isArray(src.reference_favorites)) {
    out.reference_favorites = src.reference_favorites.map(v => cleanText(v, 120)).filter(Boolean).slice(0, 10);
  }
  if (['localize', 'build', 'refresh'].includes(src.director_mode as string)) out.director_mode = src.director_mode;
  if (['agent', 'pipeline'].includes(src.mode as string)) out.mode = src.mode;
  if (src.fresh === true) out.fresh = true;
  return out as unknown as ScenePitch;
}

/** Text safe inside a one-line code comment. */
const commentText = (s: string) => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ');
/** A double-quoted string literal that is valid in both C# and GDScript. */
const strLit = (s: string) => JSON.stringify(commentText(s));
/** Letters, digits, dash and underscore only, for generated file paths. */
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '') || 'World';

// ── POST /api/scene ── Create and start a scene job ─────────────────────────
router.post('/scene', (req: Request, res: Response) => {
  const parsed = sanitizePitch(req.body);
  if (!parsed) {
    res.status(400).json({ error: 'Expected a JSON object' });
    return;
  }
  let pitch = parsed;
  // Demo presets use the server's hand-researched inputs (no parsing or guessing needed)
  const preset = getPreset(pitch?.preset_id);
  if (preset) {
    pitch = { ...preset.pitch, preset_id: preset.id, fresh: !!pitch.fresh, mode: pitch.mode };
  } else if (pitch) {
    delete pitch.preset_id;
  }

  pitch.director_mode = pitch.director_mode || 'localize';

  if (pitch.director_mode === 'localize') {
    if (!pitch.target_market && !pitch.city) {
      res.status(400).json({ error: 'target_market is required for Localize mode' });
      return;
    }
    if (!pitch.city) {
      pitch.city = pitch.target_market;
    }
  } else if (pitch.director_mode === 'refresh') {
    if (!pitch.target_region && !pitch.city) {
      res.status(400).json({ error: 'target_region is required for Refresh mode' });
      return;
    }
    if (!pitch.city) {
      pitch.city = pitch.target_region;
    }
  } else {
    // build mode
    if (!pitch.city) {
      res.status(400).json({ error: 'city is required for Build mode' });
      return;
    }
  }

  if (!pitch.genre || !pitch.genre.trim()) {
    pitch.genre = 'game';
  }

  // Validate real PII (emails, phone numbers, SSNs, credit cards) without blocking capitalized public names
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const phonePattern = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const ssnOrCardPattern = /\b\d{3}-\d{2}-\d{4}\b|\b(?:\d{4}[-\s]?){4}\b/;

  const rawPayload = JSON.stringify(pitch);
  if (emailPattern.test(rawPayload) || phonePattern.test(rawPayload) || ssnOrCardPattern.test(rawPayload)) {
    res.status(400).json({ error: 'Input contains potential personal data (email, phone, or ID). Please use public entity names only.' });
    return;
  }

  // Replays of recorded presets are free; live runs spend Qloo quota and model credits
  const isReplay = !!preset && !pitch.fresh && hasRecording(preset.id);
  if (!isReplay) {
    const ip = req.ip || 'unknown';
    const wait = hit(`live:${ip}`, LIMITS.liveRunsPerIpPerHour, 60 * 60 * 1000)
      ?? hit('live:global', LIMITS.liveRunsPerDay, 24 * 60 * 60 * 1000);
    if (wait !== null) {
      res.status(429).json({ error: `Live run limit reached for this demo. Try an example (they replay instantly) or come back in ${Math.ceil(wait / 60)} min.` });
      return;
    }
  }

  const job = createJob(pitch);
  startJob(job);
  res.json({ sceneId: job.id, status: job.status });
});

// ── POST /api/brief/parse ── Free-text brief → structured fields ─────────────
router.post('/brief/parse', async (req: Request, res: Response) => {
  if (hit(`brief:${req.ip || 'unknown'}`, LIMITS.briefParsesPerIpPerHour, 60 * 60 * 1000) !== null) {
    res.json({});
    return;
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 2000) : '';
  const mode = ['localize', 'build', 'refresh'].includes(req.body?.mode) ? req.body.mode : 'build';
  if (!text.trim()) { res.json({}); return; }

  const prompt = `Extract structured fields from a game studio's brief. Mode: ${mode}.
Brief:
---
${text}
---

Rules:
- "location": the city or region the game world is set in (${mode === 'localize' ? 'the TARGET market the world is being adapted for' : 'the setting'}). Use the common English name.
- "genre": the game genre/format as written (e.g. "zombie romance visual novel", "open-world racing").
- "era_or_mood": time period and mood, if any.
- "contrast_city": only if the brief explicitly names a city to compare against.
- "home_market": only for localize mode, the market the world currently comes from.
- "seasonal_event": only for festivals, holidays or seasons named in the brief.
- "reference_favorites": game titles named in the brief.
Omit any field the brief does not state. Do not guess.

Return ONLY JSON: {"location":"","genre":"","era_or_mood":"","contrast_city":"","home_market":"","seasonal_event":"","reference_favorites":[]}`;

  try {
    const out = await callRoleJson<Record<string, unknown>>('scout_planner', prompt, { maxTokens: 400, temperature: 0 });
    const d = out.data || {};
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined);
    res.json({
      location: str(d.location),
      genre: str(d.genre),
      era_or_mood: str(d.era_or_mood),
      contrast_city: str(d.contrast_city),
      home_market: mode === 'localize' ? str(d.home_market) : undefined,
      seasonal_event: str(d.seasonal_event),
      reference_favorites: Array.isArray(d.reference_favorites)
        ? (d.reference_favorites as unknown[]).map(str).filter((v): v is string => !!v).slice(0, 4)
        : undefined,
    });
  } catch (err: any) {
    console.warn('[Brief] parse failed:', err.message);
    res.json({});
  }
});

// ── GET /api/scene/:id/stream ── SSE stream ──────────────────────────────────
router.get('/scene/:id/stream', (req: Request, res: Response) => {
  const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(sceneId);
  if (!job) {
    res.status(404).json({ error: 'Scene not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  let ended = false;

  // subscribe() replays everything already emitted, so late connections miss nothing
  const unsubscribe = subscribe(job.id, (event) => {
    if (ended) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'scene.final' || event.type === 'scene.error') {
      ended = true;
      clearInterval(heartbeat);
      res.end();
    }
  });

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ── GET /api/scene/:id ── Get scene state ─────────────────────────────────────
router.get('/scene/:id', (req: Request, res: Response) => {
  const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(sceneId);
  if (!job) { res.status(404).json({ error: 'Scene not found' }); return; }
  res.json(job);
});

// ── GET /api/scene/:id/export ── Download worldpack JSON ─────────────────────
router.get('/scene/:id/export', (req: Request, res: Response) => {
  const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(sceneId);
  if (!job || !job.worldPack) { res.status(404).json({ error: 'Scene not ready' }); return; }
  const exportName = (job.pitch.target_market || job.pitch.city || job.pitch.target_region || 'world').toLowerCase().replace(/\s+/g, '-');
  const pack = {
    scene: job.pitch,
    worldPack: job.worldPack,
    npcProfiles: job.npcProfiles,
    evidenceStore: job.evidenceStore,
    scoutReport: job.scoutReport,
    distinctivenessMap: job.distinctivenessMap,
    comparisonSummary: job.comparisonSummary,
    cultureFitReport: job.cultureFitReport,
    questHooks: job.questHooks,
    radioStations: job.radioStations,
    regionalSponsors: job.regionalSponsors,
    culturalDebates: job.culturalDebates,
    visualNovelPack: job.visualNovelPack,
    spawnTables: job.spawnTables || [],
    districts: job.districts || [],
    generatedAt: new Date().toISOString(),
  };
  res.setHeader('Content-Disposition', `attachment; filename="worldpack-${exportName}.json"`);
  res.json(pack);
});

// ── GET /api/scene/:id/export/markdown ── Style bible ────────────────────────
router.get('/scene/:id/export/markdown', (req: Request, res: Response) => {
  const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(sceneId);
  if (!job || !job.worldPack) { res.status(404).json({ error: 'Scene not ready' }); return; }

  const exportName = (job.pitch.target_market || job.pitch.city || job.pitch.target_region || 'world').toLowerCase().replace(/\s+/g, '-');
  const md = buildStyleBible(job);
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="style-bible-${exportName}.md"`);
  res.send(md);
});

// ── GET /api/scene/:id/export/unity ── Unity C# script ────────────────────────
router.get('/scene/:id/export/unity', (req: Request, res: Response) => {
  const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(sceneId);
  if (!job || job.status !== 'done') { res.status(404).json({ error: 'Scene not ready' }); return; }
  const locationLabel = job.pitch.target_market || job.pitch.city || job.pitch.target_region || 'World';

  // Keys must match the C# field names below so JsonUtility can map them
  const worldDataObj = {
    sceneId,
    location: locationLabel,
    genre: job.pitch.genre,
    eraOrMood: job.pitch.era_or_mood || '',
    quests: job.questHooks || [],
    radioStations: (job.radioStations || []).map(r => ({ ...r, tracklist: r.tracklist.map(t => ({ ...t, affinity_score: t.affinity_score ?? 0 })) })),
    storefronts: job.regionalSponsors || [],
    npcs: job.npcProfiles || [],
    spawnTables: job.spawnTables || [],
    districts: (job.districts || []).map(d => ({ district_name: d.district_name, vibe_summary: d.vibe_summary, soundtrack_dial: d.soundtrack_dial || '' })),
  };
  const jsonLiteral = JSON.stringify(worldDataObj).replace(/"/g, '""');

  const cs = `// Backlot Cultural Set Dresser — Unity C# Data Model & Importer
// Generated by Backlot Taste AI Engine for ${commentText(locationLabel)}
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Backlot.Engine
{
    [System.Serializable]
    public class QuestItem
    {
        public string title;
        public string activity_type;
        public string objective;
        public string local_tension;
        public string contact_npc;
        public string cultural_context;
        public string[] evidence;
    }

    [System.Serializable]
    public class RadioTrack
    {
        public string title;
        public string artist;
        public int affinity_score;
    }

    [System.Serializable]
    public class RadioStationItem
    {
        public string station_name;
        public string frequency;
        public string genre;
        public string dj_name;
        public string dj_persona;
        public string banter_sample;
        public List<RadioTrack> tracklist = new List<RadioTrack>();
    }

    [System.Serializable]
    public class StorefrontItem
    {
        public string brand_name;
        public string industry;
        public string tagline;
        public string in_world_presence;
        public string player_appeal;
        public string inspired_by;
        public string[] evidence;
    }

    [System.Serializable]
    public class NpcProfileItem
    {
        public string archetype;
        public string description;
        public string quote;
        public string[] dialogue;
        public string[] listens_to;
        public string[] eats_at;
        public string[] talks_about;
    }

    [System.Serializable]
    public class WeightedSpawnEntry
    {
        public string id;
        public string name;
        public string category;
        public int weight; // 1-100: Qloo affinity, or Qloo rank order when no score was returned
        public string weight_source;
        public string rarity;
        public string[] tags;
        public string notes;
    }

    [System.Serializable]
    public class WeightedSpawnTable
    {
        public string table_name;
        public string description;
        public string selection_mode;
        public List<WeightedSpawnEntry> entries = new List<WeightedSpawnEntry>();

        public WeightedSpawnEntry PickRandom()
        {
            if (entries == null || entries.Count == 0) return null;
            int totalWeight = 0;
            foreach (var e in entries) totalWeight += Math.Max(1, e.weight);
            int roll = UnityEngine.Random.Range(0, totalWeight);
            int current = 0;
            foreach (var e in entries)
            {
                current += Math.Max(1, e.weight);
                if (roll < current) return e;
            }
            return entries[0];
        }
    }

    [System.Serializable]
    public class DistrictHierarchyItem
    {
        public string district_name;
        public string vibe_summary;
        public string soundtrack_dial;
    }

    [System.Serializable]
    public class BacklotWorldPackData
    {
        public string sceneId = "${sceneId}";
        public string location = ${strLit(locationLabel)};
        public string genre = ${strLit(job.pitch.genre)};
        public string eraOrMood = ${strLit(job.pitch.era_or_mood || 'contemporary')};
        public List<QuestItem> quests = new List<QuestItem>();
        public List<RadioStationItem> radioStations = new List<RadioStationItem>();
        public List<StorefrontItem> storefronts = new List<StorefrontItem>();
        public List<NpcProfileItem> npcs = new List<NpcProfileItem>();
        public List<WeightedSpawnTable> spawnTables = new List<WeightedSpawnTable>();
        public List<DistrictHierarchyItem> districts = new List<DistrictHierarchyItem>();
    }

    public class BacklotWorldAsset : ScriptableObject
    {
        public BacklotWorldPackData worldData = new BacklotWorldPackData();
        public const string EmbeddedJson = @"${jsonLiteral}";

        public static BacklotWorldAsset CreateFromJson(string json = null)
        {
            var asset = ScriptableObject.CreateInstance<BacklotWorldAsset>();
            asset.worldData = JsonUtility.FromJson<BacklotWorldPackData>(string.IsNullOrEmpty(json) ? EmbeddedJson : json);
            return asset;
        }
    }

#if UNITY_EDITOR
    public static class BacklotWorldImporter
    {
        [UnityEditor.MenuItem("Backlot/Generate World Asset")]
        public static void GenerateAsset()
        {
            var asset = BacklotWorldAsset.CreateFromJson();
            UnityEditor.AssetDatabase.CreateAsset(asset, "Assets/Backlot_${fileSafe(locationLabel)}_World.asset");
            UnityEditor.AssetDatabase.SaveAssets();
            UnityEditor.EditorUtility.FocusProjectWindow();
            UnityEditor.Selection.activeObject = asset;
            Debug.Log("[Backlot] Generated Unity ScriptableObject asset from embedded world data.");
        }
    }
#endif
}
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="BacklotWorldPack.cs"`);
  res.send(cs);
});

// ── GET /api/scene/:id/export/godot ── Godot GDScript Resource ────────────────
router.get('/scene/:id/export/godot', (req: Request, res: Response) => {
  const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const job = getJob(sceneId);
  if (!job || job.status !== 'done') { res.status(404).json({ error: 'Scene not ready' }); return; }
  const locationLabel = job.pitch.target_market || job.pitch.city || job.pitch.target_region || 'World';

  const worldDataObj = {
    scene: { id: sceneId, city: locationLabel, genre: job.pitch.genre, era_or_mood: job.pitch.era_or_mood },
    questHooks: job.questHooks || [],
    radioStations: job.radioStations || [],
    regionalSponsors: job.regionalSponsors || [],
    npcProfiles: job.npcProfiles || [],
    culturalDebates: job.culturalDebates || [],
    visualNovelPack: job.visualNovelPack || null,
    spawnTables: job.spawnTables || [],
    districts: job.districts || [],
  };
  // Base64 avoids GDScript string-escape rules mangling the JSON
  const jsonB64 = Buffer.from(JSON.stringify(worldDataObj), 'utf8').toString('base64');

  const gd = `# Backlot Cultural Set Dresser — Godot GDScript Resource
# Generated by Backlot Taste AI Engine for ${commentText(locationLabel)}
class_name BacklotWorldData
extends Resource

const EMBEDDED_JSON_B64: String = "${jsonB64}"

@export var scene_id: String = "${sceneId}"
@export var location_name: String = ${strLit(locationLabel)}
@export var genre: String = ${strLit(job.pitch.genre)}
@export var era_or_mood: String = ${strLit(job.pitch.era_or_mood || 'contemporary')}
@export var quests: Array[Dictionary] = []
@export var radio_stations: Array[Dictionary] = []
@export var storefronts: Array[Dictionary] = []
@export var npcs: Array[Dictionary] = []
@export var cultural_debates: Array[Dictionary] = []
@export var spawn_tables: Array[Dictionary] = []
@export var districts: Array[Dictionary] = []

static func create_from_embedded() -> BacklotWorldData:
    return load_from_json(Marshalls.base64_to_utf8(EMBEDDED_JSON_B64))

static func load_from_json(json_content: String) -> BacklotWorldData:
    var parsed = JSON.parse_string(json_content)
    if parsed == null or typeof(parsed) != TYPE_DICTIONARY:
        push_error("Failed to parse Backlot JSON worldpack")
        return null
    
    var data = BacklotWorldData.new()
    data.scene_id = parsed.get("scene", {}).get("id", "${sceneId}")
    data.location_name = parsed.get("scene", {}).get("city", parsed.get("scene", {}).get("target_market", ${strLit(locationLabel)}))
    data.genre = parsed.get("scene", {}).get("genre", ${strLit(job.pitch.genre)})
    data.era_or_mood = parsed.get("scene", {}).get("era_or_mood", "")
    
    if parsed.has("questHooks"):
        data.quests.assign(parsed["questHooks"])
    if parsed.has("radioStations"):
        data.radio_stations.assign(parsed["radioStations"])
    if parsed.has("regionalSponsors"):
        data.storefronts.assign(parsed["regionalSponsors"])
    if parsed.has("npcProfiles"):
        data.npcs.assign(parsed["npcProfiles"])
    if parsed.has("culturalDebates"):
        data.cultural_debates.assign(parsed["culturalDebates"])
    if parsed.has("spawnTables"):
        data.spawn_tables.assign(parsed["spawnTables"])
    if parsed.has("districts"):
        data.districts.assign(parsed["districts"])
        
    return data

func pick_weighted_entry(table_name: String) -> Dictionary:
    for table in spawn_tables:
        if table.get("table_name", "") == table_name or table_name in table.get("table_name", ""):
            var entries: Array = table.get("entries", [])
            if entries.size() == 0:
                return {}
            var total_weight: int = 0
            for e in entries:
                total_weight += max(1, int(e.get("weight", 50)))
            var roll: int = randi() % total_weight
            var current: int = 0
            for e in entries:
                current += max(1, int(e.get("weight", 50)))
                if roll < current:
                    return e
            return entries[0]
    return {}
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="BacklotWorldData.gd"`);
  res.send(gd);
});

// ── Steam Store API Cache & Lookup ──────────────────────────────────────────
interface SteamGameInfo {
  name: string;
  steamAppId?: number;
  headerImage?: string;
  capsuleImage?: string;
  url?: string;
  found: boolean;
}

const steamCache = new Map<string, SteamGameInfo>();

// Pre-seed known common regional comps for instantaneous response
const KNOWN_STEAM_PRESEEDS: Record<string, { appId: number; name: string }> = {
  'black myth: wukong': { appId: 2358720, name: 'Black Myth: Wukong' },
  'cyberpunk 2077': { appId: 1091500, name: 'Cyberpunk 2077' },
  'ghostwire: tokyo': { appId: 1475810, name: 'Ghostwire: Tokyo' },
  'persona 5 royal': { appId: 1687950, name: 'Persona 5 Royal' },
  'yakuza: like a dragon': { appId: 1235140, name: 'Yakuza: Like a Dragon' },
  'wo long: fallen dynasty': { appId: 1448440, name: 'Wo Long: Fallen Dynasty' },
  'naraka: bladepoint': { appId: 1203220, name: 'NARAKA: BLADEPOINT' },
  'sleeping dogs': { appId: 307690, name: 'Sleeping Dogs: Definitive Edition' },
  'dynasty warriors 9': { appId: 760650, name: 'DYNASTY WARRIORS 9' },
  'resident evil 7: biohazard': { appId: 418370, name: 'Resident Evil 7 Biohazard' },
  'mafia iii': { appId: 360430, name: 'Mafia III: Definitive Edition' },
  'left 4 dead 2': { appId: 550, name: 'Left 4 Dead 2' },
  'forza horizon 5': { appId: 1551360, name: 'Forza Horizon 5' },
  'max payne 3': { appId: 204100, name: 'Max Payne 3' },
  'hitman 2': { appId: 863550, name: 'HITMAN 2' },
  'payday 2': { appId: 218620, name: 'PAYDAY 2' },
};

for (const [key, val] of Object.entries(KNOWN_STEAM_PRESEEDS)) {
  steamCache.set(key, {
    name: val.name,
    steamAppId: val.appId,
    headerImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${val.appId}/header.jpg`,
    capsuleImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${val.appId}/capsule_616x353.jpg`,
    url: `https://store.steampowered.com/app/${val.appId}`,
    found: true,
  });
}


async function searchSteamGame(rawName: unknown): Promise<SteamGameInfo> {
  const name = (typeof rawName === 'string' ? rawName : ((rawName as any)?.name || '')).trim();
  if (!name) return { name: '', found: false };

  const cacheKey = name.toLowerCase();
  if (steamCache.has(cacheKey)) {
    return steamCache.get(cacheKey)!;
  }

  // Generate intelligent search variations
  const candidates: string[] = [name];

  // 1. Without punctuation
  const cleanPunctuation = name.replace(/[:'\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanPunctuation && cleanPunctuation !== name) {
    candidates.push(cleanPunctuation);
  }

  // 2. Base franchise title before colon/dash
  const baseTitle = name.split(/[:\-–—]/)[0].trim();
  if (baseTitle && baseTitle !== name && baseTitle.length > 3) {
    candidates.push(baseTitle);
  }

  // 3. Known aliases
  if (/playerunknown/i.test(name)) candidates.push('PUBG');
  if (/grand theft auto/i.test(name)) candidates.push('GTA');

  for (const term of candidates) {
    // Primary: Steam Store Search API
    try {
      const storeUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`;
      const resp = await fetch(storeUrl, { signal: AbortSignal.timeout(3500) });
      if (resp.ok) {
        const data = (await resp.json()) as { items?: Array<{ id: number; name: string }> };
        const item = data?.items?.[0];
        if (item?.id) {
          const info: SteamGameInfo = {
            name: item.name,
            steamAppId: item.id,
            headerImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
            capsuleImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/capsule_616x353.jpg`,
            url: `https://store.steampowered.com/app/${item.id}`,
            found: true,
          };
          steamCache.set(cacheKey, info);
          return info;
        }
      }
    } catch { /* try next */ }

    // Secondary: Steam Community SearchApps API (fuzzy match)
    try {
      const commUrl = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(term)}`;
      const cResp = await fetch(commUrl, { signal: AbortSignal.timeout(3500) });
      if (cResp.ok) {
        const cItems = (await cResp.json()) as Array<{ appid: string | number; name: string }>;
        if (Array.isArray(cItems) && cItems.length > 0 && cItems[0]?.appid) {
          const id = Number(cItems[0].appid);
          const info: SteamGameInfo = {
            name: cItems[0].name,
            steamAppId: id,
            headerImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`,
            capsuleImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_616x353.jpg`,
            url: `https://store.steampowered.com/app/${id}`,
            found: true,
          };
          steamCache.set(cacheKey, info);
          return info;
        }
      }
    } catch { /* try next */ }
  }

  const notFound: SteamGameInfo = { name, found: false };
  steamCache.set(cacheKey, notFound);
  return notFound;
}

router.get('/game-image', async (req: Request, res: Response) => {
  const name = ((req.query.name as string) || '').trim();
  if (!name) {
    res.status(400).json({ error: 'Game name required' });
    return;
  }
  const info = await searchSteamGame(name);
  res.json(info);
});

router.post('/game-images', async (req: Request, res: Response) => {
  const rawList: any[] = Array.isArray(req.body?.names) ? req.body.names : [];
  const names = rawList
    .map(item => (typeof item === 'string' ? item : (item?.name || '')).trim())
    .filter(Boolean);
  const results: Record<string, SteamGameInfo> = {};
  await Promise.all(
    names.slice(0, 10).map(async (name) => {
      results[name] = await searchSteamGame(name);
    })
  );
  res.json(results);
});

router.get('/game-images', async (req: Request, res: Response) => {
  const namesParam = ((req.query.names as string) || '').trim();
  if (!namesParam) {
    res.json({});
    return;
  }
  const names = namesParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  const results: Record<string, SteamGameInfo> = {};
  await Promise.all(
    names.map(async (name) => {
      results[name] = await searchSteamGame(name);
    })
  );
  res.json(results);
});

// ── GET /api/health ─────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

function buildStyleBible(job: SceneJob): string {
  const p = job.pitch;
  const location = p.target_market || p.city || p.target_region || 'World';
  const radio = job.radioStations || [];
  const quests = job.questHooks || [];
  const storefronts = job.regionalSponsors || [];
  const spawnTables = job.spawnTables || [];
  const districts = job.districts || [];
  const debates = job.culturalDebates || [];

  const evidenceItems = Object.values(job.evidenceStore || {});
  const qlooGroundedCount = evidenceItems.filter(e => e.source === 'qloo').length;
  const distinctCount = job.comparisonSummary?.distinctiveCount || job.distinctivenessMap?.distinctiveEntities.length || 0;

  return `# Backlot World Production Bible — ${location}
*${p.era_or_mood || 'Contemporary'} · ${p.genre}*

---

## 1. Measured Cultural Footprint
- **Target Setting:** ${location}
- **Genre & Era:** ${p.genre} (${p.era_or_mood || 'contemporary'})
- **Contrast Baseline:** ${job.distinctivenessMap?.contrastCity || 'Not compared'}
- **Qloo Evidence Grounding:** ${qlooGroundedCount} verified entity anchors
- **Distinctive Subcultural Signals:** ${distinctCount} high-contrast items

---

## 2. World District Hierarchy
${districts.length ? districts.map(d => `### District: ${d.district_name}
${d.vibe_summary}
- **Broadcast Dial:** ${d.soundtrack_dial || 'Local Station'}
- **Key Hubs:** ${d.venues.map(v => `${v.name}${v.type ? ` (${v.type})` : ''}${typeof v.affinity_score === 'number' ? `, affinity ${v.affinity_score}` : ''}`).join(' · ')}
- **Attached Factions:** ${d.factions_or_npcs.map(f => `${f.archetype} [${f.speech_register}]`).join('; ')}`).join('\n\n') : '*Standard city layout*'}

---

## 3. Engine Spawn Tables (Qloo Taste Weights)
*Drop tables and rotational probability tables ready for Unity ScriptableObjects, Unreal DataTables, and Godot Resources.*

${spawnTables.map(t => `### ${t.table_name}
*Selection Mode: ${t.selection_mode}*
${t.description}

| Entry Name | Category | Weight | Rarity Tier | Notes |
| :--- | :--- | :--- | :--- | :--- |
${t.entries.map(e => `| **${e.name}** | ${e.category} | ${e.weight} | \`${e.rarity.toUpperCase()}\` | ${e.notes || ''} |`).join('\n')}`).join('\n\n')}

---

## 4. In-Game Radio Dials
${radio.map(r => `### ${r.station_name} (${r.frequency})
*Genre: ${r.genre} · Host: ${r.dj_name}*
> Banter: "${r.banter_sample}"

**Tracklist (Qloo Verified Artists):**
${r.tracklist.map(t => `- **${t.artist}**${typeof t.affinity_score === 'number' ? ` (affinity ${t.affinity_score})` : ''}`).join('\n')}`).join('\n\n')}

---

## 5. Quests & Side-Activity Hooks
${quests.map(q => `### [${q.activity_type.toUpperCase()}] ${q.title}
- **Objective:** ${q.objective}
- **Local Tension:** ${q.local_tension}
- **Contact NPC:** ${q.contact_npc}
- **Cultural Context:** ${q.cultural_context}`).join('\n\n') || '*None generated*'}

---

## 6. Commercial Storefronts & Sponsors
${storefronts.map(s => `### ${s.brand_name}
*${s.industry}*
> "${s.tagline}"
- **Presence:** ${s.in_world_presence}
- **Player Appeal:** ${s.player_appeal}`).join('\n\n')}

---

## 7. NPC Archetypes & Dialect
${(job.npcProfiles || []).map((n: NpcProfile) => `### Archetype: ${n.archetype}
${n.description}
${n.quote ? `> "${n.quote}"\n` : ''}${n.dialogue && n.dialogue.length ? `\n**Sample Dialogue:**\n${n.dialogue.map(d => `- "${d}"`).join('\n')}\n` : ''}
- **Listens to:** ${n.listens_to.slice(0, 4).join(', ')}
- **Eats at:** ${n.eats_at.slice(0, 4).join(', ')}
- **Cultural Talk Topics:** ${n.talks_about.join(', ')}`).join('\n\n')}

---

## 8. Cultural Debates & Regional Slang
${debates.map(d => `### Debate: ${d.topic}
**Perspectives:**
${d.competing_viewpoints.map(v => `- ${v}`).join('\n')}

**Regional Slang Glossary:**
${d.local_slang.map(s => `- **${s.term}**: ${s.meaning} *(e.g. "${s.usage}")*`).join('\n')}

**Ambient Dialogue:**
${d.ambient_dialogue.map(a => `> "${a}"`).join('\n')}`).join('\n\n')}

---

## 9. Cultural Evidence Ledger
*Entities and scores returned by the Qloo Taste AI API*

${evidenceItems.map((ev: EvidenceItem) => `- **[${ev.id}] ${ev.workflow}**: ${ev.note}${ev.signal.type === 'affinity' && ev.signal.value > 0 ? ` *(top affinity ${ev.signal.value.toFixed(2)})*` : ''}${ev.entity_names?.length ? ` — ${ev.entity_names.slice(0, 5).join(', ')}` : ''}`).join('\n')}

---

*Backlot — Cultural Data Layer for Game Worlds. Taste-weighted, evidence-linked, and engine-ready.*
`;
}

export default router;
