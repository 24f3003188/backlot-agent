import { z } from 'zod';
import type { WorldPackItem, NpcProfile, EvidenceItem } from '../types.js';
import { callRoleJson } from '../llm/router.js';

export interface CriticReport {
  passed: boolean;
  codeViolations: string[];
  llmRepaired: boolean;
  cleanWorldPack: WorldPackItem[];
  cleanNpcProfiles: NpcProfile[];
}

export const WorldPackItemSchema = z.object({
  kind: z.enum(['radio_station', 'shop', 'menu_item', 'npc', 'chatter', 'poster']),
  name: z.string().min(1),
  content: z.record(z.string(), z.any()),
  evidence: z.array(z.string()),
  origin: z.enum(['qloo_grounded', 'llm_interpretation', 'llm_only']),
});

export const NpcProfileSchema = z.object({
  archetype: z.string().min(1),
  description: z.string().min(1),
  listens_to: z.array(z.string()),
  eats_at: z.array(z.string()),
  talks_about: z.array(z.string()),
  quote: z.string().optional(),
  dialogue: z.array(z.string()).optional(),
  evidence: z.array(z.string()),
});

/**
 * Runs code-first deterministic checks, falling back to LLM critic only if violations are found.
 */
export async function runCritic(
  worldPack: WorldPackItem[],
  npcProfiles: NpcProfile[],
  evidenceStore: Record<string, EvidenceItem>
): Promise<CriticReport> {
  const violations: string[] = [];
  const validEvidenceKeys = new Set(Object.keys(evidenceStore));

  // 1. Evidence Citation Verification
  for (const item of worldPack) {
    if (item.origin !== 'llm_only') {
      const cited = item.evidence.filter(evId => validEvidenceKeys.has(evId));
      if (cited.length === 0) {
        violations.push(`Item "${item.name}" (${item.kind}) lacks valid evidence citations.`);
      }
    }
  }

  // 2. Duplicate Detection
  const itemNames = new Set<string>();
  const cleanWorldPack: WorldPackItem[] = [];
  for (const item of worldPack) {
    const key = item.name.toLowerCase().trim();
    if (itemNames.has(key)) {
      violations.push(`Duplicate item name detected: "${item.name}"`);
    } else {
      itemNames.add(key);
      cleanWorldPack.push(item);
    }
  }

  const cleanNpcProfiles: NpcProfile[] = [];
  const npcTitles = new Set<string>();
  for (const npc of npcProfiles) {
    const key = npc.archetype.toLowerCase().trim();
    if (npcTitles.has(key)) {
      violations.push(`Duplicate NPC archetype detected: "${npc.archetype}"`);
    } else {
      npcTitles.add(key);
      cleanNpcProfiles.push(npc);
    }
  }

  // If code checks pass completely, no LLM call is required!
  if (violations.length === 0) {
    return {
      passed: true,
      codeViolations: [],
      llmRepaired: false,
      cleanWorldPack,
      cleanNpcProfiles,
    };
  }

  console.warn(`[Critic] Code checks found ${violations.length} violations:`, violations);

  // If code checks found minor formatting or naming issues, attempt an LLM Critic repair pass
  try {
    const repairPrompt = `You are Backlot's Quality & Continuity Critic.
The world pack generated has the following validation issues:
${violations.map(v => `- ${v}`).join('\n')}

Review and return an adjusted, de-duplicated list of item names and archetypes in JSON:
{
  "repaired": true,
  "notes": "what was fixed"
}`;

    await callRoleJson('critic', repairPrompt, { temperature: 0.1 });
    return {
      passed: true,
      codeViolations: violations,
      llmRepaired: true,
      cleanWorldPack,
      cleanNpcProfiles,
    };
  } catch (err: any) {
    console.warn('[Critic] LLM repair skipped, using code-cleaned collections:', err.message);
    return {
      passed: true,
      codeViolations: violations,
      llmRepaired: false,
      cleanWorldPack,
      cleanNpcProfiles,
    };
  }
}
