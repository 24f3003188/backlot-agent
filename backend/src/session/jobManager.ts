import type { SceneJob, SseEvent } from '../types.js';
import { runScene } from '../orchestrator/agent.js';
import { v4 } from '../utils/uuid.js';
import { readRecording, writeRecording, type PresetRecording } from './presetCache.js';

const jobs = new Map<string, SceneJob>();
const listeners = new Map<string, Array<(event: SseEvent) => void>>();
// Every event a job emitted, so a client that connects late still sees the whole run
const history = new Map<string, SseEvent[]>();

const MAX_JOBS = 200;
const REPLAY_MAX_MS = 9000;

export function createJob(pitch: SceneJob['pitch']): SceneJob {
  const id = v4();
  const job: SceneJob = { id, pitch, status: 'pending', createdAt: Date.now() };
  jobs.set(id, job);
  listeners.set(id, []);
  history.set(id, []);
  // Keep memory bounded on a long-running demo server
  if (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value as string;
    jobs.delete(oldest);
    listeners.delete(oldest);
    history.delete(oldest);
  }
  return job;
}

export function getJob(id: string): SceneJob | undefined {
  return jobs.get(id);
}

export function getAllJobs(): SceneJob[] {
  return Array.from(jobs.values());
}

/** Subscribes and immediately replays any events already emitted. */
export function subscribe(id: string, cb: (event: SseEvent) => void): () => void {
  (history.get(id) || []).forEach(cb);
  const cbs = listeners.get(id) || [];
  cbs.push(cb);
  listeners.set(id, cbs);
  return () => {
    const arr = listeners.get(id) || [];
    listeners.set(id, arr.filter(fn => fn !== cb));
  };
}

const FINAL_KEYS = [
  'worldPack', 'evidenceStore', 'llmOnlyWorldPack', 'comparisonSummary', 'scoutReport', 'npcProfiles',
  'resolvedContext', 'distinctivenessMap', 'cultureFitReport', 'questHooks', 'radioStations',
  'regionalSponsors', 'culturalDebates', 'visualNovelPack', 'spawnTables', 'districts',
] as const;

function replay(job: SceneJob, rec: PresetRecording, emit: (e: SseEvent) => void) {
  // Compress the original timing so the cinematic steps still play, just faster
  const scale = rec.durationMs > REPLAY_MAX_MS ? REPLAY_MAX_MS / rec.durationMs : 1;
  rec.events.forEach(({ t, event }) => {
    setTimeout(() => {
      if (event.type === 'scene.final') {
        const payload: Record<string, unknown> = { ...event.payload, replay: { recordedAt: rec.recordedAt } };
        for (const key of FINAL_KEYS) {
          if (payload[key] !== undefined) (job as any)[key] = payload[key];
        }
        job.status = 'done';
        emit({ ...event, payload });
      } else {
        emit(event);
      }
    }, Math.round(t * scale));
  });
}

export function startJob(job: SceneJob) {
  job.status = 'running';
  const presetId = job.pitch.preset_id;
  const startedAt = Date.now();
  const recorded: Array<{ t: number; event: SseEvent }> = [];

  const emit = (event: SseEvent) => {
    history.get(job.id)?.push(event);
    if (presetId) recorded.push({ t: Date.now() - startedAt, event });
    (listeners.get(job.id) || []).forEach(cb => cb(event));
  };

  if (presetId && !job.pitch.fresh) {
    const rec = readRecording(presetId);
    if (rec) {
      console.log(`[JobManager] Replaying recorded run for preset ${presetId}`);
      const replayEmit = (event: SseEvent) => {
        history.get(job.id)?.push(event);
        (listeners.get(job.id) || []).forEach(cb => cb(event));
      };
      replay(job, rec, replayEmit);
      return;
    }
  }

  runScene(job, emit)
    .then(() => {
      // Save only clean, complete preset runs
      const grounded = Object.values(job.evidenceStore || {}).some(e => e.source === 'qloo' && e.entity_ids?.length > 0);
      if (presetId && job.status === 'done' && grounded) {
        writeRecording({ presetId, recordedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, events: recorded });
      }
    })
    .catch(err => {
      console.error('[JobManager] Unhandled error:', err);
      job.status = 'error';
      job.error = String(err);
      emit({ type: 'scene.error', payload: { message: String(err) } });
    });
}
