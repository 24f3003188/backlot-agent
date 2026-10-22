import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SseEvent } from '../types.js';

/** Recorded real runs of demo presets, replayed so repeat demos cost no tokens or Qloo calls. */
export interface PresetRecording {
  presetId: string;
  recordedAt: string;
  durationMs: number;
  events: Array<{ t: number; event: SseEvent }>;
}

const CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../preset-cache');
const safeId = (id: string) => id.replace(/[^a-z0-9-]/gi, '');

export function readRecording(presetId: string): PresetRecording | null {
  try {
    const file = path.join(CACHE_DIR, `${safeId(presetId)}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PresetRecording;
  } catch {
    return null;
  }
}

export function hasRecording(presetId: string): boolean {
  return fs.existsSync(path.join(CACHE_DIR, `${safeId(presetId)}.json`));
}

export function writeRecording(rec: PresetRecording) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${safeId(rec.presetId)}.json`), JSON.stringify(rec));
    console.log(`[PresetCache] Recorded ${rec.presetId} (${rec.events.length} events)`);
  } catch (err: any) {
    console.warn('[PresetCache] Could not save recording:', err.message);
  }
}
