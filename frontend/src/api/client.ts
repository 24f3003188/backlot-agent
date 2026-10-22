// Same origin in production (the backend serves the built frontend); local backend in dev
export const API_BASE: string = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export interface ScenePitchPayload {
  director_mode?: 'localize' | 'build' | 'refresh';
  city?: string;
  era_or_mood?: string;
  genre: string;
  reference_favorites?: string[];
  contrast_city?: string;
  source_world_pitch?: string;
  home_market?: string;
  target_market?: string;
  target_region?: string;
  seasonal_event?: string;
  mode?: 'agent' | 'pipeline';
  preset_id?: string;
  fresh?: boolean;
}

export async function postScene(pitch: ScenePitchPayload): Promise<{ sceneId: string }> {
  const res = await fetch(`${API_BASE}/api/scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...pitch, mode: pitch.mode || 'agent' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to start scene');
  }
  return res.json();
}

export interface ParsedBrief {
  location?: string;
  genre?: string;
  era_or_mood?: string;
  contrast_city?: string;
  home_market?: string;
  seasonal_event?: string;
  reference_favorites?: string[];
}

/** Extracts structured fields from a free-text brief. Never throws; returns {} on failure. */
export async function parseBrief(text: string, mode: 'localize' | 'build' | 'refresh'): Promise<ParsedBrief> {
  try {
    const res = await fetch(`${API_BASE}/api/brief/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, mode }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return {};
    return (await res.json()) as ParsedBrief;
  } catch {
    return {};
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function streamScene(sceneId: string, onEvent: (event: unknown) => void, onDone: () => void): () => void {
  const es = new EventSource(`${API_BASE}/api/scene/${sceneId}/stream`);
  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      onEvent(event);
      if (event.type === 'scene.final' || event.type === 'scene.error') {
        es.close();
        onDone();
      }
    } catch { /* ignore parse errors */ }
  };
  es.onerror = () => { es.close(); onDone(); };
  return () => es.close();
}

export interface GameImageResult {
  name: string;
  steamAppId?: number;
  headerImage?: string;
  capsuleImage?: string;
  url?: string;
  found: boolean;
}

export async function fetchGameImage(name: string): Promise<GameImageResult> {
  try {
    const res = await fetch(`${API_BASE}/api/game-image?name=${encodeURIComponent(name)}`);
    return await res.json();
  } catch {
    return { name, found: false };
  }
}

export async function fetchGameImages(names: string[]): Promise<Record<string, GameImageResult>> {
  try {
    const res = await fetch(`${API_BASE}/api/game-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback to GET
    try {
      const res = await fetch(`${API_BASE}/api/game-images?names=${encodeURIComponent(names.join(','))}`);
      return await res.json();
    } catch {
      return {};
    }
  }
  return {};
}

export function getExportUrl(sceneId: string, format: 'json' | 'markdown' | 'unity' | 'godot' = 'json'): string {
  if (format === 'json') return `${API_BASE}/api/scene/${sceneId}/export`;
  if (format === 'markdown') return `${API_BASE}/api/scene/${sceneId}/export/markdown`;
  if (format === 'unity') return `${API_BASE}/api/scene/${sceneId}/export/unity`;
  return `${API_BASE}/api/scene/${sceneId}/export/godot`;
}
