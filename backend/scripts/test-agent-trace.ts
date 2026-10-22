import dotenv from 'dotenv';
dotenv.config();

import { runScene } from '../src/orchestrator/agent.js';
import type { SceneJob, SseEvent } from '../src/types.js';

async function runTest(city: string, genre: string, era: string) {
  console.log(`\n======================================================`);
  console.log(`TESTING INPUT: "${city}" (${genre} · ${era})`);
  console.log(`======================================================`);

  const job: SceneJob = {
    id: `test-${Date.now()}`,
    pitch: {
      city,
      genre,
      era_or_mood: era,
      mode: 'agent'
    },
    status: 'pending',
    createdAt: Date.now()
  };

  const toolTrace: Array<{ tool: string; args: any; reason?: string }> = [];

  const emit = (event: SseEvent) => {
    if (event.type === 'tool.call') {
      const p = event.payload as any;
      console.log(`  [AGENT TOOL CALL] Step ${p.step}: ${p.tool}`);
      console.log(`    Args:`, JSON.stringify(p.args));
      console.log(`    Reason: "${p.reason}"`);
      toolTrace.push({ tool: p.tool, args: p.args, reason: p.reason });
    } else if (event.type === 'tool.result') {
      const p = event.payload as any;
      console.log(`  [TOOL RESULT] ${p.tool} -> ${p.count ?? p.distinctiveCount} items (sample: ${p.sample?.join(', ') || 'none'})`);
    } else if (event.type === 'act.enter') {
      console.log(`\n>> Enter ${event.payload.label}`);
    } else if (event.type === 'scene.final') {
      console.log(`\n>> Scene finalized!`);
      const payload = event.payload as any;
      console.log(`  World Pack items: ${payload.worldPack?.length}`);
      console.log(`  NPC Profiles: ${payload.npcProfiles?.length}`);
      console.log(`  Contrast City Chosen by Model: "${payload.distinctivenessMap?.contrastCity}"`);
      console.log(`  Critic Violations Fixed: ${payload.comparisonSummary?.criticViolationsFixed}`);
    } else if (event.type === 'scene.error') {
      console.log(`\n>> Scene graceful stop/error:`, event.payload.message);
    }
  };

  await runScene(job, emit);
  return { city, trace: toolTrace, status: job.status, error: job.error };
}

async function main() {
  // Test 1: Major City
  const res1 = await runTest('Tokyo', 'Cyberpunk Action RPG', 'Rainy Neon 2080s');

  // Test 2: Small Town
  const res2 = await runTest('Springfield', 'Americana Mystery', 'Eerie Autumn Dusk');

  // Test 3: Invalid / Fictional Place
  const res3 = await runTest('', 'Deep Void', 'Fictional');

  console.log('\n======================================================');
  console.log('TRACE DIVERSITY & ADAPTATION SCORECARD');
  console.log('======================================================');
  console.log(`Tokyo Tools Sequence (${res1.trace.length} steps):`);
  console.log(res1.trace.map(t => `${t.tool}(${t.args.type || t.args.city_b || ''})`).join(' -> ') || 'none');

  console.log(`\nSpringfield Tools Sequence (${res2.trace.length} steps):`);
  console.log(res2.trace.map(t => `${t.tool}(${t.args.type || t.args.city_b || ''})`).join(' -> ') || 'none');

  console.log(`\nInvalid Place Status: ${res3.status} (${res3.error})`);

  const isDiverse = JSON.stringify(res1.trace) !== JSON.stringify(res2.trace);
  console.log(`\nAre call sequences & parameters different? ${isDiverse ? 'YES (Variable Path Verified!)' : 'NO'}`);
}

main().catch(console.error);
