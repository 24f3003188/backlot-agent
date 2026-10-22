import dotenv from 'dotenv';
dotenv.config();

import { callRole, callRoleJson } from '../src/llm/router.js';
import { ROUTES } from '../src/llm/routes.config.js';

interface BenchmarkPitch {
  name: string;
  category: 'major_city' | 'ambiguous' | 'non_english' | 'fictional' | 'conflicting_era';
  city: string;
  genre: string;
  era_or_mood: string;
}

const BENCHMARK_PITCHES: BenchmarkPitch[] = [
  // 4 Major cities in different regions
  { name: 'Tokyo Neon', category: 'major_city', city: 'Tokyo', genre: 'Cyberpunk RPG', era_or_mood: 'Rainy Night Subculture' },
  { name: 'London Underground', category: 'major_city', city: 'London', genre: 'Occult Detective', era_or_mood: 'Grungy 90s' },
  { name: 'São Paulo Rhythm', category: 'major_city', city: 'São Paulo', genre: 'Street Heist Action', era_or_mood: 'Sun-drenched Carnival' },
  { name: 'Cairo Antiquity', category: 'major_city', city: 'Cairo', genre: 'Historical Thriller', era_or_mood: '1930s Noir' },

  // 2 Small or ambiguous places
  { name: 'Springfield Crossroads', category: 'ambiguous', city: 'Springfield', genre: 'Americana Mystery', era_or_mood: 'Eerie Dusk' },
  { name: 'Richmond River', category: 'ambiguous', city: 'Richmond', genre: 'Cozy Town Narrative', era_or_mood: 'Autumn Melancholy' },

  // 2 Non-English names or spellings
  { name: 'Reykjavík Frost', category: 'non_english', city: 'Reykjavík', genre: 'Mythological Survival', era_or_mood: 'Glacial Chill' },
  { name: 'Al-Madinah Oasis', category: 'non_english', city: 'Al Madinah', genre: 'Desert Adventure', era_or_mood: 'Ancient Heritage' },

  // 1 Fictional or invalid place
  { name: 'Atlantis Sunken', category: 'fictional', city: 'Atlantis Prime', genre: 'Deep Sea Fantasy', era_or_mood: 'Bioluminescent Abyss' },

  // 1 Conflicting era / mood
  { name: 'Kyoto Synthwave', category: 'conflicting_era', city: 'Kyoto', genre: 'Feudal Samurai Action', era_or_mood: '1980s Neon Synthwave Synth' }
];

interface ModelScore {
  totalCalls: number;
  successfulCalls: number;
  validJsonCount: number;
  totalLatencyMs: number;
  totalTokens: number;
}

async function runBakeoff() {
  console.log('================================================================');
  console.log('       BACKLOT LLM ROUTING & MODEL BAKE-OFF BENCHMARK           ');
  console.log('================================================================\n');

  console.log(`Evaluating ${BENCHMARK_PITCHES.length} test pitches across available configured providers...\n`);

  const results: Record<string, ModelScore> = {};

  function initScore(key: string) {
    if (!results[key]) {
      results[key] = { totalCalls: 0, successfulCalls: 0, validJsonCount: 0, totalLatencyMs: 0, totalTokens: 0 };
    }
  }

  // Iterate through pitches
  for (let i = 0; i < BENCHMARK_PITCHES.length; i++) {
    const p = BENCHMARK_PITCHES[i];
    console.log(`[${i + 1}/${BENCHMARK_PITCHES.length}] Pitch: "${p.name}" (${p.city} · ${p.genre} · ${p.era_or_mood})`);

    // Test 1: Loop Step (Game Curation)
    const loopPrompt = `World Setting: ${p.city}
Mood: ${p.era_or_mood}
Genre: ${p.genre}
Return a JSON array of 3 recommended video game titles matching this setting: ["Game 1", "Game 2", "Game 3"]`;

    const startLoop = Date.now();
    try {
      const res = await callRoleJson<string[]>('loop', loopPrompt);
      const elapsed = Date.now() - startLoop;
      const key = `${res.provider}:${res.model}`;
      initScore(key);
      results[key].totalCalls++;
      results[key].successfulCalls++;
      results[key].totalLatencyMs += elapsed;
      if (Array.isArray(res.data) && res.data.length > 0) {
        results[key].validJsonCount++;
      }
      console.log(`  -> Loop Role [${key}] finished in ${elapsed}ms: ${JSON.stringify(res.data).slice(0, 60)}...`);
    } catch (err: any) {
      console.warn(`  -> Loop Role Error: ${err.message}`);
    }

    // Test 2: Writer Step (NPC Profile & Dialogue)
    const writerPrompt = `Create 1 authentic NPC profile for a game world set in ${p.city} (${p.era_or_mood}).
Return ONLY valid JSON:
{
  "archetype": "Name of Archetype",
  "quote": "Atmospheric spoken quote",
  "dialogue": ["Dialogue 1", "Dialogue 2"]
}`;

    const startWriter = Date.now();
    try {
      const res = await callRoleJson<{ archetype: string; quote: string; dialogue: string[] }>('writer', writerPrompt);
      const elapsed = Date.now() - startWriter;
      const key = `${res.provider}:${res.model}`;
      initScore(key);
      results[key].totalCalls++;
      results[key].successfulCalls++;
      results[key].totalLatencyMs += elapsed;
      if (res.data?.archetype && res.data?.quote) {
        results[key].validJsonCount++;
      }
      console.log(`  -> Writer Role [${key}] finished in ${elapsed}ms: Archetype "${res.data?.archetype}"`);
    } catch (err: any) {
      console.warn(`  -> Writer Role Error: ${err.message}`);
    }

    console.log('');
  }

  // Print Summary Table
  console.log('================================================================');
  console.log('                     BAKE-OFF SCOREBOARD                        ');
  console.log('================================================================');
  console.log('Model / Provider'.padEnd(35) + 'Success'.padEnd(12) + 'Valid JSON'.padEnd(14) + 'Avg Latency');
  console.log('-'.repeat(70));

  for (const [modelKey, score] of Object.entries(results)) {
    const successRate = score.totalCalls > 0 ? `${Math.round((score.successfulCalls / score.totalCalls) * 100)}%` : '0%';
    const jsonRate = score.totalCalls > 0 ? `${Math.round((score.validJsonCount / score.totalCalls) * 100)}%` : '0%';
    const avgLatency = score.successfulCalls > 0 ? `${Math.round(score.totalLatencyMs / score.successfulCalls)}ms` : 'N/A';

    console.log(
      modelKey.padEnd(35) +
      successRate.padEnd(12) +
      jsonRate.padEnd(14) +
      avgLatency
    );
  }
  console.log('================================================================\n');
}

runBakeoff().catch(console.error);
