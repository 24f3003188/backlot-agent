import { postScene, streamScene, getExportUrl, fetchGameImages, parseBrief, checkHealth, type ScenePitchPayload } from '../api/client.js';
import { mountThoughtLine, type ThoughtController } from '../components/ThoughtLineWrapper.js';

interface StreamEvent {
  type: string;
  act?: number;
  seq?: number;
  payload: Record<string, any>;
}

type DirectorMode = 'localize' | 'build' | 'refresh';

interface ModePreset {
  /** Matches backend/src/presets.ts, which holds the researched inputs */
  id: string;
  title: string;
  subtitle: string;
  image: string;
  prompt: string;
  pitch: ScenePitchPayload;
}

const steamHeader = (appId: number) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

const MODE_PRESETS: Record<DirectorMode, ModePreset[]> = {
  localize: [
    {
      id: 'localize-tokyo-cyberpunk', title: 'Seattle → Tokyo', subtitle: 'Cyberpunk action RPG', image: steamHeader(1091500),
      prompt: 'Adapt our Seattle bounty-hunter cyberpunk RPG for players in Tokyo',
      pitch: { director_mode: 'localize', home_market: 'United States (Seattle)', target_market: 'Tokyo', genre: 'cyberpunk action RPG' },
    },
    {
      id: 'localize-delhi-crime', title: 'Chicago → Delhi', subtitle: 'Open-world crime drama', image: steamHeader(307690),
      prompt: 'Adapt our Chicago courier-syndicate crime drama for Delhi',
      pitch: { director_mode: 'localize', home_market: 'United States (Chicago)', target_market: 'Delhi', genre: 'open-world crime drama' },
    },
    {
      id: 'localize-saopaulo-heist', title: 'London → São Paulo', subtitle: 'Street racing & heist', image: steamHeader(1551360),
      prompt: 'Adapt our London getaway-crew heist game for São Paulo',
      pitch: { director_mode: 'localize', home_market: 'United Kingdom (London)', target_market: 'São Paulo', genre: 'street racing and heist' },
    },
  ],
  build: [
    {
      id: 'build-hangzhou-tang', title: 'Hangzhou, Tang Dynasty', subtitle: 'Mythology action RPG', image: steamHeader(2358720),
      prompt: 'A Tang dynasty mythology action RPG set in Hangzhou',
      pitch: { director_mode: 'build', city: 'Hangzhou', era_or_mood: 'Tang dynasty, Chinese mythology', genre: 'action RPG', contrast_city: 'Beijing' },
    },
    {
      id: 'build-delhi-2000s-vn', title: 'Delhi, early 2000s', subtitle: 'Campus visual novel', image: '',
      prompt: 'A visual novel set in early-2000s Delhi: university campus, colony life and the monsoon',
      pitch: { director_mode: 'build', city: 'Delhi', era_or_mood: 'early 2000s, monsoon, university and colony life', genre: 'visual novel', contrast_city: 'Mumbai' },
    },
    {
      id: 'build-lagos-1990s', title: 'Lagos, 1990s', subtitle: 'Military-era detective noir', image: '',
      prompt: 'A 1990s Lagos detective adventure with military-era noir',
      pitch: { director_mode: 'build', city: 'Lagos', era_or_mood: '1990s, military-era noir', genre: 'detective adventure', contrast_city: 'Abuja' },
    },
    {
      id: 'build-neworleans-1970s', title: 'New Orleans, 1970s', subtitle: 'Bayou horror adventure', image: steamHeader(418370),
      prompt: 'A 1970s New Orleans bayou horror adventure',
      pitch: { director_mode: 'build', city: 'New Orleans', era_or_mood: '1970s bayou summer', genre: 'horror adventure', contrast_city: 'Atlanta' },
    },
  ],
  refresh: [
    {
      id: 'refresh-mexicocity-muertos', title: 'Mexico City · Día de Muertos', subtitle: 'Open-world racing drop', image: steamHeader(1551360),
      prompt: 'A Día de Muertos live-service drop for our racing game in Mexico City',
      pitch: { director_mode: 'refresh', target_region: 'Mexico City', seasonal_event: 'Día de Muertos (1–2 November)', genre: 'open-world racing' },
    },
    {
      id: 'refresh-delhi-diwali', title: 'Delhi · Diwali', subtitle: 'Action adventure season', image: steamHeader(1659420),
      prompt: 'A Diwali winter-bazaar seasonal event in Delhi for an action adventure',
      pitch: { director_mode: 'refresh', target_region: 'Delhi', seasonal_event: 'Diwali and the winter bazaar season', genre: 'action adventure' },
    },
    {
      id: 'refresh-taipei-lunarnewyear', title: 'Taipei · Lunar New Year', subtitle: 'Urban fantasy RPG event', image: '',
      prompt: 'A Lunar New Year and Lantern Festival event in Taipei for an urban fantasy RPG',
      pitch: { director_mode: 'refresh', target_region: 'Taipei', seasonal_event: 'Lunar New Year and the Lantern Festival', genre: 'urban fantasy RPG' },
    },
  ],
};

interface MessageRecord {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  promptText: string;
  pitch: ScenePitchPayload;
  sceneId?: string;
  finalPayload?: Record<string, any>;
}

interface ChatSession {
  id: string;
  title: string;
  mode: DirectorMode;
  target: string;
  createdAt: number;
  messages: MessageRecord[];
}

const STORAGE_KEY = 'backlot_director_sessions_v2';

function getStoredSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const MAX_SESSIONS = 15;

/** Saves sessions, dropping the oldest ones if browser storage is full. */
function saveStoredSessions(sessions: ChatSession[]) {
  let list = sessions.slice(0, MAX_SESSIONS);
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return;
    } catch {
      if (list.length <= 1) return;
      list = list.slice(0, Math.ceil(list.length / 2));
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

/** Escapes every string in a payload so model output can't break or inject markup. */
function escapeDeep<T>(value: T): T {
  if (typeof value === 'string') return escapeHtml(value) as unknown as T;
  if (Array.isArray(value)) return value.map(v => escapeDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = escapeDeep(v);
    return out as T;
  }
  return value;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(value: string): string {
  return (value || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world';
}

const MODE_LABEL: Record<DirectorMode, string> = { localize: 'Localize', build: 'Build', refresh: 'Refresh' };

export function renderChat(container: HTMLElement) {
  document.title = 'Backlot — Cultural Director Studio';
  window.scrollTo(0, 0);

  let currentMode: DirectorMode = 'localize';
  let sessions: ChatSession[] = getStoredSessions();
  let currentSessionId: string | null = sessions[0]?.id || null;
  let activeThoughtCtrl: ThoughtController | null = null;
  let fineTuneOpen = false;
  let isRunning = false;

  container.innerHTML = `
    <style>
      :root {
        --studio-bg: #111111;
        --studio-sidebar: #161616;
        --studio-surface: #1a1a1a;
        --studio-surface-elevated: #222222;
        --studio-text: #ededed;
        --studio-text-secondary: #a0a0a0;
        --studio-text-tertiary: #6a6a6a;
        --studio-hairline: rgba(255, 255, 255, 0.08);
        --studio-hairline-strong: rgba(255, 255, 255, 0.16);
        --studio-hover-veil: rgba(255, 255, 255, 0.04);
        --studio-active-veil: rgba(255, 255, 255, 0.08);
        --studio-radius: 10px;
        --studio-radius-pill: 9999px;
      }

      .chat-studio-root {
        height: 100vh;
        width: 100vw;
        background: var(--studio-bg);
        color: var(--studio-text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        display: flex;
        font-size: 14.5px;
        line-height: 1.5;
        overflow: hidden;
        -webkit-font-smoothing: antialiased;
      }

      /* ─── Left Sidebar Rail ─────────────────────────────────────────── */
      .sidebar-rail {
        width: 280px;
        background: var(--studio-sidebar);
        border-right: 1px solid var(--studio-hairline);
        display: flex;
        flex-direction: column;
        height: 100vh;
        flex-shrink: 0;
        z-index: 40;
      }

      .sidebar-header {
        padding: 16px 18px;
        border-bottom: 1px solid var(--studio-hairline);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .brand-title {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--studio-text);
        text-decoration: none;
      }

      .status-pill {
        font-size: 11px;
        color: var(--studio-text-secondary);
        border: 1px solid var(--studio-hairline);
        padding: 3px 8px;
        border-radius: var(--studio-radius-pill);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .status-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #ffffff;
      }

      .sidebar-actions-strip {
        padding: 12px 14px 6px 14px;
      }

      .new-chat-btn {
        width: 100%;
        background: var(--studio-surface);
        border: 1px solid var(--studio-hairline);
        color: var(--studio-text);
        font-size: 13px;
        font-weight: 500;
        padding: 9px 12px;
        border-radius: var(--studio-radius);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s ease;
      }

      .new-chat-btn:hover {
        background: var(--studio-surface-elevated);
        border-color: var(--studio-hairline-strong);
      }

      .sidebar-scroll-area {
        flex: 1;
        overflow-y: auto;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .sidebar-section-label {
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--studio-text-tertiary);
        padding: 0 8px;
        margin-bottom: 6px;
      }

      .sidebar-item-btn {
        width: 100%;
        background: transparent;
        border: 1px solid transparent;
        color: var(--studio-text-secondary);
        font-size: 13px;
        padding: 8px 10px;
        border-radius: var(--studio-radius);
        cursor: pointer;
        text-align: left;
        transition: all 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-family: inherit;
      }

      .sidebar-item-btn:hover {
        background: var(--studio-hover-veil);
        color: var(--studio-text);
      }

      .sidebar-item-btn.is-active {
        background: var(--studio-active-veil);
        border-color: var(--studio-hairline);
        color: var(--studio-text);
        font-weight: 500;
      }

      /* Session History Item */
      .history-item {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-radius: var(--studio-radius);
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .history-item:hover {
        background: var(--studio-hover-veil);
      }

      .history-item.is-active {
        background: var(--studio-active-veil);
        border-color: var(--studio-hairline);
      }

      .history-item-content {
        min-width: 0;
        flex: 1;
      }

      .history-item-title {
        font-size: 13px;
        color: var(--studio-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .history-item-sub {
        font-size: 11px;
        color: var(--studio-text-tertiary);
        margin-top: 2px;
      }

      .history-delete-btn {
        opacity: 0;
        background: transparent;
        border: none;
        color: var(--studio-text-tertiary);
        font-size: 14px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: all 0.12s ease;
      }

      .history-item:hover .history-delete-btn {
        opacity: 1;
      }

      .history-delete-btn:hover {
        color: var(--studio-text);
        background: rgba(255, 255, 255, 0.08);
      }

      /* Profile Footer */
      .sidebar-profile-card {
        padding: 12px 14px;
        border-top: 1px solid var(--studio-hairline);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #131313;
      }

      .profile-info-group {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .profile-avatar-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #222222;
        border: 1px solid var(--studio-hairline-strong);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        color: #ffffff;
        letter-spacing: 0.05em;
        flex-shrink: 0;
      }

      .profile-meta-wrap {
        min-width: 0;
      }

      .profile-user-name {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--studio-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .profile-role-sub {
        font-size: 10.5px;
        color: var(--studio-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ─── Main Stage & Chat Thread ──────────────────────────────────── */
      .main-stage {
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
        position: relative;
      }

      .stage-topbar {
        height: 52px;
        border-bottom: 1px solid var(--studio-hairline);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        background: #141414;
        flex-shrink: 0;
        z-index: 30;
      }

      .stage-topbar-title {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--studio-text);
        display: flex;
        align-items: center;
        gap: 10px;
      }

      /* Feed scroll: sits cleanly between topbar and prompt dock without overlap */
      .chat-feed-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 24px 32px;
        display: flex;
        flex-direction: column;
        scroll-behavior: smooth;
      }

      .chat-thread-inner {
        max-width: 1000px;
        width: 100%;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 28px;
        padding-bottom: 24px;
      }

      /* ─── Welcome Canvas (Empty State) ──────────────────────────────── */
      .welcome-hero-panel {
        background: #161616;
        border: 1px solid var(--studio-hairline);
        border-radius: 12px;
        padding: 28px;
        position: relative;
        overflow: hidden;
      }

      .welcome-hero-backdrop {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 48%;
        opacity: 0.12;
        mask-image: linear-gradient(to right, transparent, black);
        -webkit-mask-image: linear-gradient(to right, transparent, black);
        pointer-events: none;
      }

      .welcome-hero-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .welcome-headline {
        font-size: 22px;
        font-weight: 600;
        color: var(--studio-text);
        letter-spacing: -0.02em;
        margin: 0 0 18px 0;
      }

      .welcome-sub {
        font-size: 14px;
        color: var(--studio-text-secondary);
        max-width: 600px;
        line-height: 1.6;
        margin: 0 0 22px 0;
      }

      .hero-presets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 14px;
        position: relative;
        z-index: 2;
      }

      .hero-preset-card {
        background: #1a1a1a;
        border: 1px solid var(--studio-hairline);
        border-radius: var(--studio-radius);
        overflow: hidden;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        transition: all 0.15s ease;
        text-align: left;
        padding: 0;
        font-family: inherit;
        color: inherit;
      }

      .hero-preset-card:hover {
        background: #222222;
        border-color: var(--studio-hairline-strong);
        transform: translateY(-2px);
      }

      .hero-card-img-wrap {
        width: 100%;
        aspect-ratio: 460 / 215;
        background: #000000;
        overflow: hidden;
      }

      .hero-card-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .hero-card-body {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      /* ─── Conversational Message Bubbles ────────────────────────────── */
      .message-wrapper {
        display: flex;
        flex-direction: column;
        gap: 10px;
        animation: fadeIn 0.2s ease both;
      }

      .bk-card {
        background: #141414;
        border: 1px solid var(--studio-hairline);
        border-radius: var(--studio-radius);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
        line-height: 1.5;
      }
      .bk-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      /* Skip layout/paint for panels scrolled out of view (long sessions stay smooth) */
      .agent-output-stream > .surface-panel {
        content-visibility: auto;
        contain-intrinsic-size: auto 420px;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .message-user {
        align-self: flex-end;
        max-width: 82%;
      }

      .user-bubble {
        background: #202020;
        border: 1px solid var(--studio-hairline-strong);
        border-radius: 12px;
        padding: 14px 18px;
        color: var(--studio-text);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .user-meta-strip {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }

      .user-prompt-text {
        font-size: 14.5px;
        color: #ffffff;
        line-height: 1.55;
      }

      .message-assistant {
        align-self: flex-start;
        width: 100%;
      }

      .assistant-card {
        background: transparent;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .assistant-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-bottom: 2px;
      }

      .assistant-avatar {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: #ededed;
        color: #111111;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        letter-spacing: -0.02em;
      }

      .assistant-name {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--studio-text);
      }

      /* Conversational Briefing */
      .agent-briefing-text {
        font-size: 14.5px;
        color: var(--studio-text);
        line-height: 1.65;
        background: #161616;
        border: 1px solid var(--studio-hairline);
        border-radius: var(--studio-radius);
        padding: 16px 20px;
      }

      /* ─── Structured Output Panels ──────────────────────────────────── */
      .surface-panel {
        background: #171717;
        border: 1px solid var(--studio-hairline);
        border-radius: var(--studio-radius);
        padding: 20px 22px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--studio-hairline);
        gap: 12px;
      }

      .panel-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--studio-text);
        margin: 0;
      }

      .panel-meta {
        font-size: 12px;
        color: var(--studio-text-tertiary);
      }

      .tag-chip {
        font-size: 11px;
        color: var(--studio-text-secondary);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--studio-hairline);
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
      }

      .ghost-action-btn {
        background: transparent;
        border: 1px solid var(--studio-hairline);
        color: var(--studio-text-secondary);
        font-size: 12px;
        padding: 6px 13px;
        border-radius: var(--studio-radius);
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .ghost-action-btn:hover {
        background: var(--studio-hover-veil);
        color: var(--studio-text);
        border-color: var(--studio-hairline-strong);
      }

      .ghost-action-btn.is-active {
        background: var(--studio-active-veil);
        color: var(--studio-text);
        border-color: var(--studio-hairline-strong);
      }

      .pill-primary-btn {
        background: #ededed;
        color: #111111;
        border: none;
        font-size: 13px;
        font-weight: 600;
        padding: 8px 18px;
        border-radius: var(--studio-radius-pill);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: all 0.15s ease;
        text-decoration: none;
        font-family: inherit;
      }

      .pill-primary-btn:hover {
        background: #ffffff;
      }

      .pill-primary-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      /* Steam Cards */
      .steam-cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 14px;
      }

      .steam-game-card {
        background: #141414;
        border: 1px solid var(--studio-hairline);
        border-radius: var(--studio-radius);
        overflow: hidden;
        text-decoration: none;
        display: flex;
        flex-direction: column;
        transition: all 0.15s ease;
      }

      .steam-game-card:hover {
        background: #1a1a1a;
        border-color: var(--studio-hairline-strong);
        transform: translateY(-2px);
      }

      .steam-card-img-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 460 / 215;
        background: #000000;
      }

      .steam-card-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .steam-appid-tag {
        position: absolute;
        top: 6px;
        right: 6px;
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, monospace;
        background: rgba(0, 0, 0, 0.85);
        color: #ededed;
        border: 1px solid rgba(255, 255, 255, 0.18);
        padding: 2px 6px;
        border-radius: 4px;
      }

      .steam-card-details {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .steam-card-name {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--studio-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .steam-card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 4px;
      }

      .steam-view-link {
        font-size: 11px;
        color: var(--studio-text-tertiary);
      }

      .steam-game-card:hover .steam-view-link {
        color: var(--studio-text);
      }

      /* ─── Bottom Docked Prompt Bar (Non-Overlapping Flex Dock) ─────── */
      .prompt-dock-container {
        flex-shrink: 0;
        padding: 12px 28px 16px 28px;
        background: #141414;
        border-top: 1px solid var(--studio-hairline);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        z-index: 35;
      }

      .prompt-chips-bar {
        max-width: 1000px;
        width: 100%;
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 2px;
        scrollbar-width: none;
      }

      .prompt-chips-bar::-webkit-scrollbar {
        display: none;
      }

      .prompt-chip-btn {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--studio-hairline);
        color: var(--studio-text-secondary);
        font-size: 12px;
        padding: 5px 12px;
        border-radius: var(--studio-radius-pill);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s ease;
        font-family: inherit;
      }

      .prompt-chip-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--studio-text);
        border-color: var(--studio-hairline-strong);
      }

      .prompt-input-card {
        max-width: 1000px;
        width: 100%;
        background: #181818;
        border: 1px solid var(--studio-hairline-strong);
        border-radius: 12px;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: border-color 0.15s ease;
      }

      .prompt-input-card:focus-within {
        border-color: rgba(255, 255, 255, 0.28);
      }

      .prompt-card-top-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .mode-select-pill {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--studio-hairline);
        color: var(--studio-text);
        font-size: 11.5px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: var(--studio-radius-pill);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .prompt-main-textarea {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        color: #ffffff;
        font-family: inherit;
        font-size: 14.5px;
        line-height: 1.5;
        resize: none;
        min-height: 42px;
        max-height: 120px;
      }

      .prompt-main-textarea::placeholder {
        color: #666666;
      }

      .prompt-card-bottom-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 4px;
      }

      .prompt-fine-tune-drawer {
        display: none;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--studio-hairline);
        margin-top: 4px;
      }

      .prompt-fine-tune-drawer.is-open {
        display: grid;
      }

      .mini-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mini-label {
        font-size: 10.5px;
        text-transform: uppercase;
        color: var(--studio-text-tertiary);
        letter-spacing: 0.04em;
      }

      .mini-input {
        background: #111111;
        border: 1px solid var(--studio-hairline);
        color: var(--studio-text);
        font-size: 12.5px;
        padding: 6px 10px;
        border-radius: 6px;
        outline: none;
        font-family: inherit;
      }

      .mini-input:focus {
        border-color: var(--studio-hairline-strong);
      }
      /* Mobile browsers: use the visible viewport so the composer isn't hidden by browser bars */
      @supports (height: 100dvh) {
        .chat-studio-root, .sidebar-rail, .main-stage { height: 100dvh; }
      }
      .sidebar-toggle { display: none; padding: 6px 8px; }
      .sidebar-scrim { display: none; }

      @media (max-width: 860px) {
        .sidebar-toggle { display: inline-flex; align-items: center; }
        .sidebar-rail {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: min(300px, 86vw);
          transform: translateX(-100%);
          transition: transform 0.22s ease;
          z-index: 60;
          box-shadow: none;
        }
        .chat-studio-root.sidebar-open .sidebar-rail {
          transform: none;
          box-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
        }
        .chat-studio-root.sidebar-open .sidebar-scrim {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          z-index: 55;
        }
        .stage-topbar { padding: 0 12px; gap: 8px; }
        .stage-topbar-title { min-width: 0; gap: 8px; }
        #active-session-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46vw; }
        #topbar-mode-chip { display: none; }
        #topbar-export-btn { padding: 4px 8px; font-size: 11px; }
        .chat-feed-scroll { padding: 16px 12px; }
        .chat-thread-inner { gap: 20px; }
        .prompt-dock-container { padding: 8px 10px 10px; }
        .prompt-input-card { padding: 8px 10px; }
        #prompt-shortcut-hint, #engine-status-text { display: none; }
        .prompt-card-bottom-bar { justify-content: flex-end; }
        .prompt-fine-tune-drawer.is-open { grid-template-columns: 1fr; }
        .welcome-hero-panel { padding: 18px; }
        .welcome-hero-backdrop { display: none; }
        .hero-presets-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
        .surface-panel { padding: 14px !important; }
        .panel-header { flex-wrap: wrap; }
        .agent-briefing-text { padding: 14px !important; }
        /* Result grids use inline minmax() widths; collapse them to one column on phones */
        .agent-output-stream [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
        .agent-output-stream table { min-width: 520px; }
      }
      @media (max-width: 480px) {
        .hero-presets-grid { grid-template-columns: 1fr; }
        .user-bubble { padding: 12px 14px; }
        #topbar-export-btn { display: none !important; }
      }

    </style>

    <div class="chat-studio-root">
      <!-- ── Left Sidebar Rail ──────────────────────────────────────── -->
      <aside class="sidebar-rail">
        <div class="sidebar-header">
          <a href="/" data-spa class="brand-title">BACKLOT</a>
          <span class="status-pill" id="backend-status-pill" title="Backend connection">
            <span class="status-dot" id="backend-status-dot" style="background: var(--studio-text-tertiary);"></span>
            <span id="backend-status-text">Connecting…</span>
          </span>
        </div>

        <div class="sidebar-actions-strip">
          <button type="button" class="new-chat-btn" id="new-pitch-btn">
            <span>+ New Pitch Session</span>
            <span style="font-size: 10px; color: var(--studio-text-tertiary); border: 1px solid var(--studio-hairline); padding: 1px 5px; border-radius: 4px;">Esc</span>
          </button>
        </div>

        <div class="sidebar-scroll-area">
          <!-- Modes Switcher -->
          <div>
            <div class="sidebar-section-label">Director Modes</div>
            <div style="display: flex; flex-direction: column; gap: 4px;" id="mode-buttons-group">
              <button type="button" class="sidebar-item-btn is-active" data-mode="localize">
                <span style="font-weight: 500;">Localize</span>
                <span style="font-size: 11px; color: var(--studio-text-tertiary);">Cross-Market Culture Fit</span>
              </button>
              <button type="button" class="sidebar-item-btn" data-mode="build">
                <span style="font-weight: 500;">Build</span>
                <span style="font-size: 11px; color: var(--studio-text-tertiary);">Authentic World Generator</span>
              </button>
              <button type="button" class="sidebar-item-btn" data-mode="refresh">
                <span style="font-weight: 500;">Refresh</span>
                <span style="font-size: 11px; color: var(--studio-text-tertiary);">Live-Service Seasonal Drops</span>
              </button>
            </div>
          </div>

          <!-- Chat Sessions History -->
          <div>
            <div class="sidebar-section-label" style="display: flex; justify-content: space-between; align-items: center;">
              <span>Session History</span>
              <span id="session-count-badge" style="font-size: 10px; color: var(--studio-text-tertiary);">0</span>
            </div>
            <div id="session-history-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
          </div>
        </div>

        <!-- User Profile Card -->
        <div class="sidebar-profile-card">
          <div class="profile-info-group">
            <div class="profile-avatar-circle">BK</div>
            <div class="profile-meta-wrap">
              <div class="profile-user-name">Local workspace</div>
              <div class="profile-role-sub">Sessions saved in this browser</div>
            </div>
          </div>
          <button type="button" class="ghost-action-btn" style="padding: 4px 8px; font-size: 11px;" id="clear-sessions-btn" title="Delete all saved sessions">
            Clear
          </button>
        </div>
      </aside>

      <div class="sidebar-scrim" id="sidebar-scrim"></div>

      <!-- ── Main Stage ────────────────────────────────────────────── -->
      <main class="main-stage">
        <!-- Minimal Topbar -->
        <header class="stage-topbar">
          <div class="stage-topbar-title">
            <button type="button" class="ghost-action-btn sidebar-toggle" id="sidebar-toggle" aria-label="Open menu" aria-expanded="false">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
            </button>
            <span id="active-session-title">New Cultural Brief</span>
            <span class="tag-chip" id="topbar-mode-chip">Localize</span>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button type="button" class="ghost-action-btn" id="topbar-export-btn" style="display: none;">Export World Pack</button>
            <a href="/" data-spa class="ghost-action-btn">Home</a>
          </div>
        </header>

        <!-- Conversational Feed Area -->
        <div class="chat-feed-scroll" id="chat-feed-scroll">
          <div class="chat-thread-inner" id="chat-messages-container">
            <!-- Welcome Canvas (Empty State) -->
            <div class="welcome-hero-panel" id="welcome-hero">
              <div class="welcome-hero-backdrop">
                <img src="/videoassets/eldenring.jpg" class="welcome-hero-img" alt="" decoding="async" />
              </div>
              <h1 class="welcome-headline">Backlot Cultural Director</h1>

              <div class="hero-presets-grid" id="hero-presets-container"></div>
            </div>
          </div>
        </div>

        <!-- ── Docked Conversational Prompt Bar (Flex Bottom) ────────── -->
        <div class="prompt-dock-container">
          <!-- Suggestion Chips -->
          <div class="prompt-chips-bar" id="suggestion-chips-bar"></div>

          <!-- Prompt Card -->
          <div class="prompt-input-card">
            <div class="prompt-card-top-controls">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="mode-select-pill" id="prompt-mode-indicator">
                  Mode: <strong id="prompt-mode-name">Localize</strong>
                </span>
                <button type="button" class="ghost-action-btn" id="toggle-fine-tune-btn" style="padding: 2px 8px; font-size: 11px;">
                  Parameters
                </button>
              </div>
              <span style="font-size: 11px; color: var(--studio-text-tertiary);" id="prompt-shortcut-hint">
                Enter to send · Shift+Enter for newline
              </span>
            </div>

            <textarea id="prompt-textarea" class="prompt-main-textarea" rows="2" placeholder="Ask the Cultural Director or describe your setting..."></textarea>

            <!-- Expandable Fine-Tune Parameter Drawer -->
            <div class="prompt-fine-tune-drawer" id="fine-tune-drawer">
              <div class="mini-field" id="field-home-market">
                <label class="mini-label">Home Market (Origin)</label>
                <input type="text" class="mini-input" id="input-home-market" placeholder="Auto from brief" />
              </div>
              <div class="mini-field" id="field-target-market">
                <label class="mini-label" id="label-target-market">Target Market (Destination)</label>
                <input type="text" class="mini-input" id="input-target-market" placeholder="Auto from brief" />
              </div>
              <div class="mini-field">
                <label class="mini-label">Game Genre</label>
                <input type="text" class="mini-input" id="input-genre" placeholder="Auto from brief" />
              </div>
              <div class="mini-field" id="field-extra-context">
                <label class="mini-label" id="label-extra-context">Reference Favorites / Franchise</label>
                <input type="text" class="mini-input" id="input-extra-context" placeholder="Optional" />
              </div>
              <div style="grid-column: 1 / -1; font-size: 11px; color: var(--studio-text-tertiary);">
                Leave fields blank and Backlot reads them from your brief. Anything you type here takes priority.
              </div>
            </div>
            <div id="prompt-validation" role="alert" style="display: none; font-size: 12px; color: #f2b8b5; padding: 2px 2px 0;"></div>

            <div class="prompt-card-bottom-bar">
              <span style="font-size: 11px; color: var(--studio-text-tertiary);" id="engine-status-text">
                Powered by Qloo's Taste AI
              </span>
              <button type="button" id="send-prompt-btn" class="pill-primary-btn">
                Send Directive
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

  // Element Selectors
  const messagesContainer = container.querySelector('#chat-messages-container') as HTMLElement;
  const feedScroll = container.querySelector('#chat-feed-scroll') as HTMLElement;
  const promptTextarea = container.querySelector('#prompt-textarea') as HTMLTextAreaElement;
  const sendPromptBtn = container.querySelector('#send-prompt-btn') as HTMLButtonElement;
  const promptModeName = container.querySelector('#prompt-mode-name') as HTMLElement;
  const topbarModeChip = container.querySelector('#topbar-mode-chip') as HTMLElement;
  const activeSessionTitle = container.querySelector('#active-session-title') as HTMLElement;
  const topbarExportBtn = container.querySelector('#topbar-export-btn') as HTMLButtonElement;
  const sessionHistoryList = container.querySelector('#session-history-list') as HTMLElement;
  const sessionCountBadge = container.querySelector('#session-count-badge') as HTMLElement;
  const newPitchBtn = container.querySelector('#new-pitch-btn') as HTMLButtonElement;
  const heroPresetsContainer = container.querySelector('#hero-presets-container') as HTMLElement;
  const suggestionChipsBar = container.querySelector('#suggestion-chips-bar') as HTMLElement;
  const fineTuneDrawer = container.querySelector('#fine-tune-drawer') as HTMLElement;
  const toggleFineTuneBtn = container.querySelector('#toggle-fine-tune-btn') as HTMLButtonElement;

  const inputHomeMarket = container.querySelector('#input-home-market') as HTMLInputElement;
  const inputTargetMarket = container.querySelector('#input-target-market') as HTMLInputElement;
  const inputGenre = container.querySelector('#input-genre') as HTMLInputElement;
  const inputExtraContext = container.querySelector('#input-extra-context') as HTMLInputElement;
  const labelTargetMarket = container.querySelector('#label-target-market') as HTMLElement;
  const labelExtraContext = container.querySelector('#label-extra-context') as HTMLElement;
  const fieldHomeMarket = container.querySelector('#field-home-market') as HTMLElement;

  const promptValidation = container.querySelector('#prompt-validation') as HTMLElement;
  const backendStatusDot = container.querySelector('#backend-status-dot') as HTMLElement;
  const backendStatusText = container.querySelector('#backend-status-text') as HTMLElement;
  const clearSessionsBtn = container.querySelector('#clear-sessions-btn') as HTMLButtonElement;
  const studioRoot = container.querySelector('.chat-studio-root') as HTMLElement;
  const sidebarToggle = container.querySelector('#sidebar-toggle') as HTMLButtonElement;
  const sidebarScrim = container.querySelector('#sidebar-scrim') as HTMLElement;

  // Mobile: the sidebar is a slide-out drawer
  function setSidebarOpen(open: boolean) {
    studioRoot.classList.toggle('sidebar-open', open);
    sidebarToggle.setAttribute('aria-expanded', String(open));
  }
  sidebarToggle.addEventListener('click', () => setSidebarOpen(!studioRoot.classList.contains('sidebar-open')));
  sidebarScrim.addEventListener('click', () => setSidebarOpen(false));
  // Close after choosing anything inside it
  container.querySelector('.sidebar-rail')?.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.sidebar-item-btn, .history-item, #new-pitch-btn')) setSidebarOpen(false);
  });

  // Toggle Fine Tune Drawer
  function setDrawerOpen(open: boolean) {
    fineTuneOpen = open;
    fineTuneDrawer.classList.toggle('is-open', fineTuneOpen);
    toggleFineTuneBtn.classList.toggle('is-active', fineTuneOpen);
  }
  toggleFineTuneBtn.addEventListener('click', () => setDrawerOpen(!fineTuneOpen));

  function showValidation(message: string) {
    promptValidation.textContent = message;
    promptValidation.style.display = 'block';
  }
  function hideValidation() {
    promptValidation.style.display = 'none';
    promptValidation.textContent = '';
  }

  function setBusy(label: string) {
    isRunning = true;
    sendPromptBtn.disabled = true;
    sendPromptBtn.textContent = label;
  }
  function setIdle(label = 'Send Directive') {
    isRunning = false;
    sendPromptBtn.disabled = false;
    sendPromptBtn.textContent = label;
  }

  // Backend status (real health check instead of a static badge)
  async function refreshBackendStatus() {
    const ok = await checkHealth();
    backendStatusDot.style.background = ok ? '#ffffff' : '#f2b8b5';
    backendStatusText.textContent = ok ? 'Backend online' : 'Backend offline';
  }
  refreshBackendStatus();

  // Render Mode & Form Adapters
  // Only labels/placeholders change here; values the user typed are never overwritten.
  function setDirectorMode(mode: DirectorMode, fromUser = false) {
    const changed = mode !== currentMode;
    currentMode = mode;
    promptModeName.textContent = mode.toUpperCase();
    topbarModeChip.textContent = mode.toUpperCase();

    container.querySelectorAll('#mode-buttons-group .sidebar-item-btn').forEach(btn => {
      btn.classList.toggle('is-active', (btn as HTMLElement).dataset.mode === mode);
    });

    // The extra field means something different per mode, so clear it on a real switch
    if (changed && fromUser) inputExtraContext.value = '';

    if (mode === 'localize') {
      fieldHomeMarket.style.display = 'flex';
      labelTargetMarket.textContent = 'Target Market (Destination)';
      labelExtraContext.textContent = 'Reference Games (optional, comma-separated)';
      inputTargetMarket.placeholder = 'Auto from brief, e.g. Lagos';
      promptTextarea.placeholder = 'Describe your existing world and where it needs to land, e.g. "Our Seattle courier crew game, adapted for Seoul"';
    } else if (mode === 'build') {
      fieldHomeMarket.style.display = 'none';
      labelTargetMarket.textContent = 'City / Region';
      labelExtraContext.textContent = 'Reference Games (optional, comma-separated)';
      inputTargetMarket.placeholder = 'Auto from brief, e.g. Prague';
      promptTextarea.placeholder = 'Describe the city, era and genre, e.g. "A 1990s Lagos detective visual novel"';
    } else {
      fieldHomeMarket.style.display = 'none';
      labelTargetMarket.textContent = 'Target Region';
      labelExtraContext.textContent = 'Seasonal Event or Holiday';
      inputTargetMarket.placeholder = 'Auto from brief, e.g. Mexico City';
      promptTextarea.placeholder = 'Describe the live-service drop, e.g. "Día de Muertos event for our racing game in Mexico City"';
    }

    renderHeroPresets();
    renderSuggestionChips();

    // Switching mode mid-conversation starts a fresh session instead of mixing modes
    if (changed && fromUser) {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session && session.messages.length) resetToEmptyCanvas();
    }
  }

  // Suggestion chips are the presets: clicking fills the brief, sending runs the preset as-is
  let pendingPreset: ModePreset | null = null;
  function renderSuggestionChips() {
    const currentChips = MODE_PRESETS[currentMode] || [];
    suggestionChipsBar.innerHTML = currentChips.map((c, i) => `
      <button type="button" class="prompt-chip-btn" data-idx="${i}">
        ${escapeHtml(c.title)}
      </button>
    `).join('');

    suggestionChipsBar.querySelectorAll('.prompt-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx || '0', 10);
        const item = currentChips[idx];
        if (item) {
          promptTextarea.value = item.prompt;
          pendingPreset = item;
          hideValidation();
          promptTextarea.focus();
        }
      });
    });
  }

  // Render Hero Example Presets
  function renderHeroPresets() {
    const target = messagesContainer.querySelector('#hero-presets-container') as HTMLElement | null || heroPresetsContainer;
    const presets = MODE_PRESETS[currentMode] || [];
    target.innerHTML = presets.map((p, idx) => `
      <button type="button" class="hero-preset-card" data-idx="${idx}">
        ${p.image ? `<div class="hero-card-img-wrap">
          <img src="${p.image}" alt="" class="hero-card-img" loading="lazy" decoding="async" onerror="this.style.display='none'" />
        </div>` : `<div class="hero-card-img-wrap" style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1b1b1b, #262626);">
          <span style="font-size: 18px; font-weight: 600; letter-spacing: 0.12em; color: #5a5a5a; text-transform: uppercase;">${escapeHtml(p.title.split(/[,·]/)[0].trim())}</span>
        </div>`}
        <div class="hero-card-body">
          <div style="font-size: 13.5px; font-weight: 600; color: #ededed;">${escapeHtml(p.title)}</div>
          <div style="font-size: 11px; color: #999999;">${escapeHtml(p.subtitle)}</div>
          <div style="font-size: 10px; color: #ffffff; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.04em;">
            Run this example →
          </div>
        </div>
      </button>
    `).join('');

    target.querySelectorAll('.hero-preset-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx || '0', 10);
        const p = presets[idx];
        if (p) loadAndExecutePreset(p);
      });
    });
  }

  // Render Sidebar Session History
  function renderSessionHistory() {
    sessionCountBadge.textContent = String(sessions.length);
    if (sessions.length === 0) {
      sessionHistoryList.innerHTML = `
        <div style="padding: 10px 8px; font-size: 12px; color: var(--studio-text-tertiary);">
          No saved sessions yet. Start a brief below.
        </div>
      `;
      return;
    }

    sessionHistoryList.innerHTML = sessions.map(s => `
      <div class="history-item ${s.id === currentSessionId ? 'is-active' : ''}" data-id="${escapeHtml(s.id)}">
        <div class="history-item-content">
          <div class="history-item-title">${escapeHtml(s.title)}</div>
          <div class="history-item-sub">${s.mode.toUpperCase()} · ${escapeHtml(s.target)}</div>
        </div>
        <button type="button" class="history-delete-btn" data-del-id="${escapeHtml(s.id)}" title="Delete session" aria-label="Delete session">×</button>
      </div>
    `).join('');

    sessionHistoryList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('history-delete-btn')) return;
        if (isRunning) return;
        const id = (item as HTMLElement).dataset.id;
        if (id) loadSession(id);
      });
    });

    sessionHistoryList.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.delId;
        if (id) deleteSession(id);
      });
    });
  }

  function deleteSession(id: string) {
    if (isRunning && id === currentSessionId) return;
    sessions = sessions.filter(s => s.id !== id);
    saveStoredSessions(sessions);
    if (currentSessionId === id) {
      currentSessionId = sessions[0]?.id || null;
      if (currentSessionId) loadSession(currentSessionId);
      else resetToEmptyCanvas();
    } else {
      renderSessionHistory();
    }
  }

  clearSessionsBtn.addEventListener('click', () => {
    if (isRunning || sessions.length === 0) return;
    if (!window.confirm('Delete all saved sessions in this browser?')) return;
    sessions = [];
    saveStoredSessions(sessions);
    resetToEmptyCanvas();
  });

  function resetToEmptyCanvas() {
    currentSessionId = null;
    activeSessionTitle.textContent = 'New Cultural Brief';
    topbarExportBtn.style.display = 'none';
    messagesContainer.innerHTML = '';
    messagesContainer.appendChild(createWelcomeHeroElement());
    renderHeroPresets();
    renderSessionHistory();
    hideValidation();
  }

  function createWelcomeHeroElement(): HTMLElement {
    const hero = document.createElement('div');
    hero.className = 'welcome-hero-panel';
    hero.id = 'welcome-hero';
    hero.innerHTML = `
      <div class="welcome-hero-backdrop">
        <img src="/videoassets/eldenring.jpg" class="welcome-hero-img" alt="" decoding="async" />
      </div>
      <h1 class="welcome-headline">Backlot Cultural Director</h1>
      <div class="hero-presets-grid" id="hero-presets-container"></div>
    `;
    return hero;
  }

  function setTopbarExport(session: ChatSession | undefined) {
    const last = session ? [...session.messages].reverse().find(m => m.role === 'assistant' && m.finalPayload) : undefined;
    if (!last?.finalPayload) {
      topbarExportBtn.style.display = 'none';
      return;
    }
    topbarExportBtn.style.display = 'inline-flex';
    topbarExportBtn.onclick = () => {
      const label = last.pitch.target_market || last.pitch.city || last.pitch.target_region || 'world';
      downloadJson(`worldpack-${slug(label)}.json`, { scene: last.pitch, ...last.finalPayload });
    };
  }

  function loadSession(id: string) {
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    currentSessionId = id;
    setDirectorMode(session.mode);
    activeSessionTitle.textContent = session.title;
    renderSessionHistory();
    hideValidation();

    messagesContainer.innerHTML = '';
    session.messages.forEach(msg => {
      if (msg.role === 'user') {
        renderUserMessageBubble(messagesContainer, msg.promptText, msg.pitch);
      } else {
        renderAssistantMessageBubble(messagesContainer, msg.pitch, msg.finalPayload, msg.sceneId);
      }
    });

    setTopbarExport(session);
    feedScroll.scrollTop = feedScroll.scrollHeight;
  }

  // Preset Execution
  function loadAndExecutePreset(preset: ModePreset, fresh = false) {
    if (isRunning) return;
    pendingPreset = null;
    triggerExecuteBrief({ ...preset.pitch, preset_id: preset.id, fresh: fresh || undefined }, preset.prompt, preset.title);
  }

  // Primary Execution Workflow
  async function triggerExecuteBrief(pitch: ScenePitchPayload, promptText: string, customTitle?: string) {
    if (isRunning) return;
    const runMode = (pitch.director_mode || currentMode) as DirectorMode;
    const locationLabel = pitch.target_market || pitch.city || pitch.target_region || 'World';
    const sessionTitle = customTitle || `${locationLabel} ${runMode === 'localize' ? 'Culture-Fit' : (runMode === 'build' ? 'World Pack' : 'Seasonal Drop')}`;

    // Create session if needed
    let session = sessions.find(s => s.id === currentSessionId);
    if (!session || session.mode !== runMode) {
      session = {
        id: 'sess_' + Date.now(),
        title: sessionTitle,
        mode: runMode,
        target: locationLabel,
        createdAt: Date.now(),
        messages: [],
      };
      sessions.unshift(session);
      currentSessionId = session.id;
      messagesContainer.innerHTML = '';
    } else {
      session.title = sessionTitle;
      session.target = locationLabel;
    }
    saveStoredSessions(sessions);
    renderSessionHistory();
    activeSessionTitle.textContent = sessionTitle;
    hideValidation();

    const hero = messagesContainer.querySelector('#welcome-hero');
    if (hero) hero.remove();

    // 1. User message
    renderUserMessageBubble(messagesContainer, promptText, pitch);
    session.messages.push({
      id: 'msg_u_' + Date.now(),
      role: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      promptText,
      pitch,
    });
    saveStoredSessions(sessions);

    // 2. Assistant stage with ThoughtLine
    const assistantWrapper = document.createElement('div');
    assistantWrapper.className = 'message-wrapper message-assistant';
    assistantWrapper.innerHTML = `
      <div class="assistant-card">
        <div class="assistant-header">
          <div class="assistant-avatar">BK</div>
          <div>
            <div class="assistant-name">Backlot Cultural Director</div>
          </div>
        </div>
        <div class="thought-container-box" style="background: #151515; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 18px;">
          <div class="thought-mount-point"></div>
        </div>
        <div class="agent-output-stream" style="display: flex; flex-direction: column; gap: 20px;"></div>
      </div>
    `;
    messagesContainer.appendChild(assistantWrapper);
    assistantWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const thoughtMount = assistantWrapper.querySelector('.thought-mount-point') as HTMLElement;
    const outputStream = assistantWrapper.querySelector('.agent-output-stream') as HTMLElement;

    setBusy('Working…');
    promptTextarea.value = '';

    activeThoughtCtrl?.destroy();
    const thoughtCtrl = mountThoughtLine(thoughtMount, {
      label: `Scouting taste data for ${locationLabel}…`,
      doneLabel: `Built ${MODE_LABEL[runMode].toLowerCase()} pack for ${locationLabel} in`,
      glyph: 'sparkle',
      color: '#ffffff',
      fontSize: 14,
      steps: [`${MODE_LABEL[runMode]} · ${locationLabel}${pitch.genre ? ` · ${pitch.genre}` : ''}`],
      working: true,
      collapsible: true,
      collapseOnSettle: false,
    });
    activeThoughtCtrl = thoughtCtrl;

    const fail = (title: string, message: string) => {
      thoughtCtrl.setWorking(false);
      const errBox = document.createElement('div');
      errBox.className = 'surface-panel';
      errBox.style.borderColor = 'rgba(255,255,255,0.2)';
      errBox.innerHTML = `
        <div class="panel-header">
          <h3 class="panel-title">${escapeHtml(title)}</h3>
          <button type="button" class="ghost-action-btn retry-run-btn">Try again</button>
        </div>
        <p style="font-size: 13px; color: var(--studio-text-secondary); margin: 0;">${escapeHtml(message)}</p>
      `;
      outputStream.prepend(errBox);
      (errBox.querySelector('.retry-run-btn') as HTMLButtonElement).addEventListener('click', () => {
        if (isRunning) return;
        errBox.remove();
        triggerExecuteBrief(pitch, promptText, customTitle);
      });
      setIdle();
    };

    try {
      const { sceneId } = await postScene(pitch);
      let finished = false;

      streamScene(
        sceneId,
        (rawEvt) => {
          const evt = rawEvt as StreamEvent;
          if (evt.type === 'scene.final' || evt.type === 'scene.error') finished = true;
          handleLiveEvent(evt, outputStream, thoughtCtrl, locationLabel, sceneId, pitch, session!, fail);
        },
        () => {
          if (!finished) {
            fail('Connection lost', 'The live stream from the backend closed before the world pack was finished. Check that the backend is running, then try again.');
            refreshBackendStatus();
            return;
          }
          setIdle();
          promptTextarea.focus();
        }
      );
    } catch (err: any) {
      refreshBackendStatus();
      fail('Could not start', err?.message || 'The backend did not accept the brief.');
    }
  }

  function describeArgs(args: Record<string, any> | undefined): string {
    if (!args) return '';
    const parts: string[] = [];
    if (args.type) parts.push(String(args.type).replace('urn:entity:', ''));
    if (args.city_a || args.city_b) parts.push(`${args.city_a || '?'} vs ${args.city_b || '?'}`);
    if (args.query) parts.push(`"${args.query}"`);
    if (args.location && !args.city_a) parts.push(String(args.location));
    return parts.join(', ');
  }

  // Handle SSE Live Event
  function handleLiveEvent(
    evt: StreamEvent,
    container: HTMLElement,
    thoughtCtrl: ThoughtController | null,
    locationLabel: string,
    sceneId: string,
    pitch: ScenePitchPayload,
    session: ChatSession,
    fail: (title: string, message: string) => void
  ) {
    const p = evt.payload || {};
    switch (evt.type) {
      case 'act.enter': {
        const label = p.label || `Act ${evt.act}`;
        thoughtCtrl?.update({ label: `${label}…` });
        if (p.description) thoughtCtrl?.addStep(`${label}: ${p.description}`);
        break;
      }

      // The agent's own tool decisions, shown live so the run is inspectable
      case 'tool.call': {
        if (p.tool === 'strategy_plan') {
          thoughtCtrl?.addStep(`Planning: ${p.reason || 'choosing which taste categories to scout'}`);
        } else {
          const args = describeArgs(p.args);
          thoughtCtrl?.addStep(`Step ${p.step ?? ''} · ${p.tool}${args ? `(${args})` : ''}${p.reason ? ` — ${p.reason}` : ''}`);
        }
        break;
      }

      case 'tool.result': {
        if (p.tool === 'strategy_plan' && p.plan) {
          thoughtCtrl?.addStep(`Plan: ${String(p.plan).slice(0, 220)}`);
        } else if (p.tool === 'cultural_synthesis' && p.summary) {
          thoughtCtrl?.addStep(`Synthesis: ${String(p.summary).slice(0, 260)}`);
        } else if (p.tool === 'compare_locations') {
          thoughtCtrl?.addStep(`↳ ${p.distinctiveCount ?? 0} distinctive vs ${p.contrastCity}${p.sample?.length ? `: ${p.sample.join(', ')}` : ''}`);
        } else if (typeof p.count === 'number') {
          const cat = p.category ? String(p.category).replace('urn:entity:', '') + ' ' : '';
          thoughtCtrl?.addStep(`↳ ${p.count} ${cat}results${p.sample?.length ? `: ${p.sample.join(', ')}` : ''}`);
        }
        break;
      }

      case 'tool.error': {
        thoughtCtrl?.addStep(`⚠ ${p.tool || 'tool'}: ${String(p.error || 'failed').slice(0, 160)} — agent will adjust`);
        break;
      }

      case 'npc.cast': {
        if (p.npc?.archetype) thoughtCtrl?.addStep(`Cast: ${p.npc.archetype}`);
        break;
      }

      case 'evidence.add': {
        const ev = p.evidence;
        if (ev?.note) thoughtCtrl?.addStep(`Evidence ${ev.id}: ${ev.note}`);
        break;
      }

      case 'scene.final': {
        thoughtCtrl?.update({ label: 'Done' });
        thoughtCtrl?.setWorking(false);

        const first = renderFinalPayload(container, pitch, p, sceneId, locationLabel);

        session.messages.push({
          id: 'msg_a_' + Date.now(),
          role: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          promptText: '',
          pitch,
          sceneId,
          finalPayload: p,
        });
        saveStoredSessions(sessions);
        setTopbarExport(session);

        first?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }

      case 'scene.error': {
        fail('Directive error', p.message || 'The run stopped with an error.');
        break;
      }
    }
  }

  // ─── Renderers for Message Bubbles ───────────────────────────────

  function renderUserMessageBubble(container: HTMLElement, prompt: string, pitch: ScenePitchPayload) {
    const bubble = document.createElement('div');
    bubble.className = 'message-wrapper message-user';
    const chips = [
      pitch.target_market || pitch.city || pitch.target_region || 'World',
      pitch.genre,
      pitch.era_or_mood && pitch.director_mode === 'build' && pitch.era_or_mood.length < 60 ? pitch.era_or_mood : '',
      pitch.seasonal_event || '',
      pitch.home_market ? `From: ${pitch.home_market}` : '',
      pitch.contrast_city ? `vs ${pitch.contrast_city}` : '',
    ].filter(Boolean) as string[];
    bubble.innerHTML = `
      <div class="user-bubble">
        <div class="user-meta-strip">
          <span class="tag-chip" style="background: rgba(255,255,255,0.12); color: #ffffff;">${escapeHtml(pitch.director_mode?.toUpperCase() || 'DIRECTIVE')}</span>
          ${chips.map(c => `<span class="tag-chip">${escapeHtml(c)}</span>`).join('')}
        </div>
        <div class="user-prompt-text">${escapeHtml(prompt)}</div>
      </div>
    `;
    container.appendChild(bubble);
  }

  function renderAssistantMessageBubble(
    container: HTMLElement,
    pitch: ScenePitchPayload,
    payload?: Record<string, any>,
    sceneId?: string
  ) {
    const locationLabel = pitch.target_market || pitch.city || pitch.target_region || 'World';
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper message-assistant';
    wrapper.innerHTML = `
      <div class="assistant-card">
        <div class="assistant-header">
          <div class="assistant-avatar">BK</div>
          <div>
            <div class="assistant-name">Backlot Cultural Director</div>
          </div>
        </div>
        <div class="agent-output-stream" style="display: flex; flex-direction: column; gap: 20px;"></div>
      </div>
    `;
    container.appendChild(wrapper);

    const streamBox = wrapper.querySelector('.agent-output-stream') as HTMLElement;
    if (payload) renderFinalPayload(streamBox, pitch, payload, sceneId, locationLabel);
  }

  /** Single renderer for live and saved results. Returns the first panel for scrolling. */
  function renderFinalPayload(
    target: HTMLElement,
    pitch: ScenePitchPayload,
    rawPayload: Record<string, any>,
    sceneId: string | undefined,
    locationLabel: string
  ): HTMLElement | null {
    const safe = escapeDeep(rawPayload);
    const safeLabel = escapeHtml(locationLabel);
    const before = target.children.length;

    renderDirectorIntroBrief(target, safeLabel, escapeDeep(pitch), safe);
    if (rawPayload.replay && pitch.preset_id) {
      const brief = target.children[before] as HTMLElement;
      const when = new Date(rawPayload.replay.recordedAt);
      const note = document.createElement('div');
      note.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--studio-hairline); font-size: 12px; color: var(--studio-text-tertiary);';
      note.innerHTML = `<span>Replayed from a recorded live run${isNaN(when.getTime()) ? '' : ` (${when.toLocaleDateString()})`}. Same Qloo results and agent steps, no new API calls.</span>`;
      const liveBtn = document.createElement('button');
      liveBtn.type = 'button';
      liveBtn.className = 'ghost-action-btn';
      liveBtn.textContent = 'Run live';
      liveBtn.addEventListener('click', () => {
        if (isRunning) return;
        triggerExecuteBrief({ ...pitch, fresh: true }, 'Run this preset live', undefined);
      });
      note.appendChild(liveBtn);
      brief.appendChild(note);
    }
    if (safe.distinctivenessMap) renderCulturalContrastPanel(target, safe.distinctivenessMap, safeLabel, escapeDeep(pitch));
    renderSteamGallery(target, extractGameCandidates(pitch, rawPayload), safeLabel);
    if (safe.visualNovelPack) renderVisualNovelPack(target, safe.visualNovelPack, safeLabel, safe.evidenceStore);
    if (safe.cultureFitReport) renderCultureFitReport(target, safe.cultureFitReport);
    if (safe.npcProfiles?.length) renderNpcProfiles(target, safe.npcProfiles);
    if (safe.questHooks?.length) renderQuests(target, safe.questHooks, safe.evidenceStore);
    if (safe.radioStations?.length) renderRadio(target, safe.radioStations, safe.evidenceStore);
    if (safe.regionalSponsors?.length) renderSponsors(target, safe.regionalSponsors, safe.evidenceStore);
    if (safe.culturalDebates?.length) renderDebates(target, safe.culturalDebates);
    if (safe.districts?.length) renderDistrictHierarchy(target, safe.districts, safeLabel);
    if (safe.spawnTables?.length) renderSpawnTables(target, safe.spawnTables, safeLabel);
    if (safe.llmOnlyWorldPack?.length && safe.comparisonSummary) renderBaselineComparison(target, safe);
    renderExportPanel(target, sceneId, safeLabel, { scene: pitch, ...rawPayload }, slug(locationLabel));

    return (target.children[before] as HTMLElement) || null;
  }

  function renderDirectorIntroBrief(
    container: HTMLElement,
    location: string,
    pitch: ScenePitchPayload,
    payload?: any
  ) {
    const briefBox = document.createElement('div');
    briefBox.className = 'agent-briefing-text';

    const report = payload?.scoutReport;
    const scoutedCount = report
      ? (report.music?.length || 0) + (report.food?.length || 0) + (report.brands?.length || 0) + (report.shows?.length || 0) +
        (report.games || []).filter((g: any) => g?.source !== 'curated').length
      : 0;
    const evidenceCount = payload?.evidenceStore ? Object.keys(payload.evidenceStore).length : 0;
    const contrastCity = payload?.distinctivenessMap?.contrastCity || pitch.contrast_city || '';

    let prose = '';
    if (pitch.director_mode === 'localize') {
      prose = `Adaptation blueprint moving your world from <strong>${pitch.home_market || 'its original market'}</strong> to <strong>${location}</strong>, built from what Qloo's Taste AI returns for music, places and brands there.`;
    } else if (pitch.director_mode === 'refresh') {
      prose = `Seasonal drop blueprint for <strong>${location}</strong> (${pitch.seasonal_event || 'seasonal event'}), built from Qloo taste signals for the region.`;
    } else {
      prose = `World pack for <strong>${location}</strong> (${pitch.genre}${pitch.era_or_mood && pitch.era_or_mood.length < 80 ? `, ${pitch.era_or_mood}` : ''}), built from what Qloo's Taste AI returns for this place.`;
    }

    const chips = [
      scoutedCount ? `${scoutedCount} Qloo entities` : '',
      evidenceCount ? `${evidenceCount} evidence records` : '',
      contrastCity ? `Compared with ${contrastCity}` : '',
      payload?.agentUsed === true ? 'Agent-led scouting' : payload?.agentUsed === false ? 'Fixed pipeline (agent unavailable)' : '',
    ].filter(Boolean);

    briefBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
        <div style="font-weight: 600; color: #ffffff; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.04em;">
          Cultural Director's Briefing
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${chips.map(c => `<span class="tag-chip" style="background: rgba(255,255,255,0.08); border: 1px solid var(--studio-hairline);">${c}</span>`).join('')}
        </div>
      </div>
      <div style="font-size: 13px; color: var(--studio-text-secondary); line-height: 1.6;">${prose}</div>
      ${scoutedCount === 0 && pitch.director_mode !== 'localize' ? `<div style="font-size: 12px; color: #f2b8b5; margin-top: 8px;">Qloo returned no entities for this location, so most sections below are empty. Try a larger nearby city or a different spelling.</div>` : ''}
    `;
    container.appendChild(briefBox);
  }

  // ─── Event Handlers for Inputs ───────────────────────────────────

  container.querySelectorAll('#mode-buttons-group .sidebar-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRunning) return;
      const mode = (btn as HTMLElement).dataset.mode as DirectorMode;
      if (mode) setDirectorMode(mode, true);
    });
  });

  newPitchBtn.addEventListener('click', () => {
    if (isRunning) return;
    resetToEmptyCanvas();
    promptTextarea.focus();
  });

  // Esc starts a new session (matches the hint on the button), unless typing in a field
  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(studioRoot)) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (e.key === 'Escape' && studioRoot.classList.contains('sidebar-open')) {
      setSidebarOpen(false);
      return;
    }
    if (e.key !== 'Escape' || isRunning) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      (document.activeElement as HTMLElement).blur();
      return;
    }
    resetToEmptyCanvas();
  };
  document.addEventListener('keydown', onKey);

  sendPromptBtn.addEventListener('click', () => dispatchPrompt());

  promptTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      dispatchPrompt();
    }
  });
  promptTextarea.addEventListener('input', hideValidation);
  inputTargetMarket.addEventListener('input', hideValidation);

  const splitList = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);

  async function dispatchPrompt() {
    if (isRunning) return;
    const text = promptTextarea.value.trim();
    hideValidation();

    const paramsTyped = [inputTargetMarket, inputGenre, inputHomeMarket, inputExtraContext].some(el => el.value.trim());
    if (pendingPreset && text === pendingPreset.prompt && !paramsTyped) {
      loadAndExecutePreset(pendingPreset);
      return;
    }
    pendingPreset = null;

    if (!text && !inputTargetMarket.value.trim()) {
      showValidation('Describe your setting, or open Parameters and enter a location.');
      promptTextarea.focus();
      return;
    }

    // Read structured fields out of the free-text brief; anything typed in Parameters wins
    let parsed: Awaited<ReturnType<typeof parseBrief>> = {};
    if (text) {
      setBusy('Reading brief…');
      parsed = await parseBrief(text, currentMode);
      setIdle();
    }

    const location = inputTargetMarket.value.trim() || parsed.location || '';
    const genre = inputGenre.value.trim() || parsed.genre || '';
    const extra = inputExtraContext.value.trim();

    if (!location) {
      setDrawerOpen(true);
      showValidation(
        currentMode === 'localize'
          ? 'Which market should the world be adapted for? Add it to your brief or the Target Market field.'
          : 'Which city or region is this set in? Add it to your brief or the location field.'
      );
      inputTargetMarket.focus();
      return;
    }

    // Show what was understood so the user can correct it next time
    if (!inputTargetMarket.value.trim()) inputTargetMarket.value = location;
    if (!inputGenre.value.trim() && genre) inputGenre.value = genre;

    const favorites = extra ? splitList(extra) : parsed.reference_favorites;
    let pitch: ScenePitchPayload;
    if (currentMode === 'localize') {
      const home = inputHomeMarket.value.trim() || parsed.home_market || '';
      if (!inputHomeMarket.value.trim() && home) inputHomeMarket.value = home;
      pitch = {
        director_mode: 'localize',
        target_market: location,
        home_market: home || undefined,
        genre,
        contrast_city: parsed.contrast_city,
        reference_favorites: favorites?.length ? favorites : undefined,
        source_world_pitch: text || undefined,
      };
    } else if (currentMode === 'build') {
      pitch = {
        director_mode: 'build',
        city: location,
        genre,
        contrast_city: parsed.contrast_city,
        era_or_mood: parsed.era_or_mood || text || undefined,
        reference_favorites: favorites?.length ? favorites : undefined,
      };
    } else {
      const event = extra || parsed.seasonal_event || '';
      if (!inputExtraContext.value.trim() && event) inputExtraContext.value = event;
      pitch = {
        director_mode: 'refresh',
        target_region: location,
        seasonal_event: event || undefined,
        genre,
        contrast_city: parsed.contrast_city,
        source_world_pitch: text || undefined,
      };
    }

    triggerExecuteBrief(pitch, text || `${MODE_LABEL[currentMode]} ${location}${genre ? ` (${genre})` : ''}`);
  }

  // Initialize
  const initialSession = sessions.find(s => s.id === currentSessionId);
  setDirectorMode(initialSession?.mode || 'localize');
  renderSessionHistory();

  // Deep link from the landing page: /chat?preset=<id> starts a fresh session with that preset
  const presetParam = new URLSearchParams(window.location.search).get('preset');
  const linkedPreset = presetParam
    ? (Object.entries(MODE_PRESETS) as Array<[DirectorMode, ModePreset[]]>)
        .map(([mode, list]) => ({ mode, preset: list.find(p => p.id === presetParam) }))
        .find(x => x.preset)
    : undefined;

  if (linkedPreset?.preset) {
    history.replaceState({}, '', '/chat');
    setDirectorMode(linkedPreset.mode);
    resetToEmptyCanvas();
    loadAndExecutePreset(linkedPreset.preset);
  } else if (initialSession) {
    loadSession(initialSession.id);
  } else {
    resetToEmptyCanvas();
  }
}

// ─── Candidate Game Extraction Helper ─────────────────────────────

function extractGameCandidates(pitch: ScenePitchPayload, payload: any): string[] {
  const games: string[] = [];
  const push = (raw: any) => {
    const name = typeof raw === 'string' ? raw : (raw?.name || raw?.title || '');
    const clean = typeof name === 'string' ? name.trim() : '';
    if (clean.length > 2 && !clean.includes('[object')) games.push(clean);
  };
  // Games Qloo returned first, then ones suggested for this setting, then the user's own references
  const scouted: any[] = Array.isArray(payload?.scoutReport?.games) ? payload.scoutReport.games : [];
  scouted.filter(g => g?.source !== 'curated').forEach(push);
  scouted.filter(g => g?.source === 'curated').forEach(push);
  if (pitch.director_mode !== 'refresh' && Array.isArray(pitch?.reference_favorites)) pitch.reference_favorites.forEach(push);
  return Array.from(new Set(games)).slice(0, 8);
}

// ─── Visual Output Component Renderers ─────────────────────────────

async function renderSteamGallery(container: HTMLElement, gameNames: string[], contextLabel: string) {
  if (!gameNames || gameNames.length === 0) return;

  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Reference Games</h3>
        <span class="panel-meta">Games that share taste or setting DNA with ${contextLabel}</span>
      </div>
      <span class="tag-chip">Steam Store</span>
    </div>
    <div class="steam-cards-grid">
      <div style="font-size: 13px; color: var(--studio-text-tertiary); padding: 8px 0;">Looking up store pages…</div>
    </div>
  `;
  container.appendChild(panel);

  const grid = panel.querySelector('.steam-cards-grid') as HTMLElement;
  try {
    const results = await fetchGameImages(gameNames);
    const validItems = Object.values(results).filter(r => r && r.found && r.headerImage);
    if (!validItems.length) {
      grid.innerHTML = `<div style="font-size: 13px; color: var(--studio-text-tertiary); grid-column: 1 / -1; padding: 6px 0;">${gameNames.map(escapeHtml).join(' · ')}</div>`;
      return;
    }
    grid.innerHTML = validItems.map(item => `
      <a href="${escapeHtml(item.url || `https://store.steampowered.com/app/${item.steamAppId}`)}" target="_blank" rel="noopener noreferrer" class="steam-game-card">
        <div class="steam-card-img-wrapper">
          <img src="${escapeHtml(item.headerImage || '')}" alt="" loading="lazy" class="steam-card-img" onerror="this.style.visibility='hidden'" />
        </div>
        <div class="steam-card-details">
          <div class="steam-card-name">${escapeHtml(item.name)}</div>
          <div class="steam-card-footer">
            <span class="steam-view-link">View on Steam</span>
          </div>
        </div>
      </a>
    `).join('');
  } catch {
    grid.innerHTML = `<div style="font-size: 13px; color: var(--studio-text-tertiary);">Couldn't reach the Steam Store. ${gameNames.map(escapeHtml).join(' · ')}</div>`;
  }
}

function renderCultureFitReport(container: HTMLElement, report: any) {
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.id = 'culture-fit-panel';

  const keepCount = report.keep_elements?.length || 0;
  const swapCount = report.swap_elements?.length || 0;
  const addCount = report.add_elements?.length || 0;

  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Culture-Fit Report</h3>
        <span class="panel-meta">${report.home_market || 'Origin'} -> ${report.target_market || 'Destination'}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <span class="tag-chip">${keepCount} Keep</span>
        <span class="tag-chip">${swapCount} Swap</span>
        <span class="tag-chip">${addCount} Add</span>
      </div>
    </div>

    <p style="font-size: 14px; color: var(--studio-text-secondary); line-height: 1.6; margin: 0;">
      ${report.summary || 'Strategic overview of cultural substitutions and local additions.'}
    </p>

    <!-- Filter Buttons -->
    <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="report-filters">
      <button type="button" class="ghost-action-btn is-active" data-filter="all">All Elements (${keepCount + swapCount + addCount})</button>
      <button type="button" class="ghost-action-btn" data-filter="keep">Keep (${keepCount})</button>
      <button type="button" class="ghost-action-btn" data-filter="swap">Swap (${swapCount})</button>
      <button type="button" class="ghost-action-btn" data-filter="add">Add (${addCount})</button>
    </div>

    <!-- Items Grid -->
    <div id="report-items-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px;"></div>
  `;
  container.appendChild(panel);

  const filterContainer = panel.querySelector('#report-filters') as HTMLElement;
  const itemsContainer = panel.querySelector('#report-items-container') as HTMLElement;

  function renderFiltered(filter: 'all' | 'keep' | 'swap' | 'add') {
    let html = '';

    if (filter === 'all' || filter === 'keep') {
      (report.keep_elements || []).forEach((item: any) => {
        html += `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span class="tag-chip" style="color: #ffffff; border-color: rgba(255,255,255,0.25);">KEEP</span>
              <span style="font-size: 11px; color: var(--studio-text-tertiary);">${item.category || 'Element'}</span>
            </div>
            <div style="font-size: 14px; font-weight: 600; color: var(--studio-text);">${item.name || item.element || 'Universal Element'}</div>
            <div style="font-size: 12.5px; color: var(--studio-text-secondary); line-height: 1.5;">${item.rationale || ''}</div>
          </div>
        `;
      });
    }

    if (filter === 'all' || filter === 'swap') {
      (report.swap_elements || []).forEach((item: any) => {
        html += `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span class="tag-chip">SWAP</span>
              <span style="font-size: 11px; color: var(--studio-text-tertiary);">${item.category || 'Element'}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="font-size: 12px; color: var(--studio-text-tertiary); text-decoration: line-through;">${item.original_element || item.source_element || ''}</div>
              <div style="font-size: 14px; font-weight: 600; color: #ffffff;">-> ${item.replacement_element || ''}</div>
            </div>
            <div style="font-size: 12.5px; color: var(--studio-text-secondary); line-height: 1.5;">${item.rationale || ''}</div>
          </div>
        `;
      });
    }

    if (filter === 'all' || filter === 'add') {
      (report.add_elements || []).forEach((item: any) => {
        html += `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span class="tag-chip">ADD</span>
              <span style="font-size: 11px; color: var(--studio-text-tertiary);">${item.category || 'Element'}</span>
            </div>
            <div style="font-size: 14px; font-weight: 600; color: #ffffff;">+ ${item.element || item.name || 'Local Feature'}</div>
            <div style="font-size: 12.5px; color: var(--studio-text-secondary); line-height: 1.5;">${item.rationale || ''}</div>
            ${item.regional_habit ? `<div style="font-size: 11px; color: var(--studio-text-tertiary); font-style: italic;">Habit: ${item.regional_habit}</div>` : ''}
          </div>
        `;
      });
    }

    itemsContainer.innerHTML = html;
  }

  filterContainer.querySelectorAll('.ghost-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterContainer.querySelectorAll('.ghost-action-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderFiltered((btn as HTMLElement).dataset.filter as any);
    });
  });

  renderFiltered('all');
}

// ─── Cultural Contrast & Distinctiveness Vector ─────────────────────

function renderCulturalContrastPanel(
  container: HTMLElement,
  distinctivenessMap: any,
  locationLabel: string,
  pitch: ScenePitchPayload
) {
  const contrastCity = distinctivenessMap?.contrastCity || pitch.contrast_city || '';
  const entities: any[] = distinctivenessMap?.distinctiveEntities || [];
  if (!contrastCity || entities.length === 0) return;

  const kind = (t: string) => (t || '').replace('urn:entity:', '').replace('_', ' ');
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">What Makes ${locationLabel} Distinct</h3>
        <span class="panel-meta">Returned by Qloo for ${locationLabel} but absent from ${contrastCity}'s top results for the same query</span>
      </div>
      <span class="tag-chip">vs ${contrastCity}</span>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;">
      ${entities.slice(0, 12).map(e => `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; background: #141414; border: 1px solid var(--studio-hairline); border-radius: 6px; font-size: 12.5px;">
          <span style="color: var(--studio-text); font-weight: 500;">${e.name}</span>
          <span style="color: var(--studio-text-tertiary); font-size: 11px; white-space: nowrap;">${kind(e.type)}${typeof e.affinity === 'number' ? ` · ${e.affinity.toFixed(2)}` : ''}</span>
        </div>
      `).join('')}
    </div>
  `;
  container.appendChild(panel);
}

// ─── Visual Novel Pack Renderer ─────────────────────────────────────

function renderVisualNovelPack(
  container: HTMLElement,
  vnPack: any,
  locationLabel: string,
  evidenceStore?: Record<string, any>
) {
  if (!vnPack) return;

  // 1. Background Locations
  if (Array.isArray(vnPack.backgroundLocations) && vnPack.backgroundLocations.length) {
    const locPanel = document.createElement('div');
    locPanel.className = 'surface-panel';
    locPanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Visual Novel Background Locations (${locationLabel})</h3>
          <span class="panel-meta">Key background backdrops with environmental surroundings and cultural grounding</span>
        </div>
        <span class="tag-chip">${vnPack.backgroundLocations.length} Backdrops</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px;">
        ${vnPack.backgroundLocations.map((loc: any) => {
          const evKey = Array.isArray(loc.evidence) && loc.evidence.length ? loc.evidence[0] : null;
          const evItem = evKey && evidenceStore ? evidenceStore[evKey] : null;
          const qlooAnchor = evItem?.entity_names?.[0];
          const anchor = qlooAnchor || loc.cultural_anchor || '';
          return `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14px; font-weight: 600; color: #ffffff;">${loc.name}</span>
              <span class="tag-chip">Background</span>
            </div>
            <div style="font-size: 12px; color: var(--studio-text-secondary); line-height: 1.5;">${loc.surroundings}</div>
            <div style="font-size: 11.5px; color: var(--studio-text-tertiary); font-style: italic;">Atmosphere: ${loc.atmospheric_details}</div>
            ${anchor ? `<div style="padding-top: 6px; border-top: 1px solid var(--studio-hairline); font-size: 11px; color: var(--studio-text-tertiary); display: flex; justify-content: space-between; align-items: center;">
              <span>Anchor: <strong style="color: #ffffff;">${anchor}</strong></span>
              ${qlooAnchor ? '<span class="tag-chip">Qloo</span>' : ''}
            </div>` : ''}
          </div>
        `;}).join('')}
      </div>
    `;
    container.appendChild(locPanel);
  }

  // 2. Cast & Speech Registers
  if (Array.isArray(vnPack.cast) && vnPack.cast.length) {
    const castPanel = document.createElement('div');
    castPanel.className = 'surface-panel';
    castPanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Visual Novel Cast & Speech Registers</h3>
          <span class="panel-meta">Cast archetypes with local speech registers and taste profiles</span>
        </div>
        <span class="tag-chip">${vnPack.cast.length} Characters</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px;">
        ${vnPack.cast.map((c: any) => `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14.5px; font-weight: 600; color: #ffffff;">${c.name}</span>
              <span class="tag-chip">${c.role}</span>
            </div>
            <div style="font-size: 12px; color: var(--studio-text-secondary); line-height: 1.5;">
              <strong>Speech Register:</strong> ${c.speech_register}
            </div>
            ${c.sample_dialogue ? `
              <div style="font-size: 12px; color: #e0e0e0; font-style: italic; padding: 6px 10px; background: rgba(255,255,255,0.03); border-left: 2px solid var(--studio-hairline-strong);">
                "${c.sample_dialogue}"
              </div>
            ` : ''}
            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--studio-text-tertiary);">
              ${c.taste_profile?.music?.length ? `<div>Music Taste: ${c.taste_profile.music.join(', ')}</div>` : ''}
              ${c.taste_profile?.hangouts?.length ? `<div>Hangouts: ${c.taste_profile.hangouts.join(', ')}</div>` : ''}
              ${c.slang_terms?.length ? `<div>Slang: ${c.slang_terms.join(', ')}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(castPanel);
  }

  // 3. Scene Beats & Narrative Events
  if (Array.isArray(vnPack.sceneBeats) && vnPack.sceneBeats.length) {
    const beatsPanel = document.createElement('div');
    beatsPanel.className = 'surface-panel';
    beatsPanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Narrative Scene Beats & Cultural Moments</h3>
          <span class="panel-meta">Story milestones anchored in local seasons, rituals and community friction</span>
        </div>
        <span class="tag-chip">${vnPack.sceneBeats.length} Story Beats</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px;">
        ${vnPack.sceneBeats.map((b: any) => `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14px; font-weight: 600; color: #ffffff;">${b.title}</span>
              <span class="tag-chip">${b.timing_or_event}</span>
            </div>
            <div style="font-size: 12.5px; color: var(--studio-text-secondary); line-height: 1.5;">${b.dramatic_hook}</div>
            <div style="font-size: 11.5px; color: var(--studio-text-tertiary);">Cultural Context: ${b.cultural_significance}</div>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(beatsPanel);
  }

  // 4. Music Cues by Mood (Real artists ONLY!)
  if (Array.isArray(vnPack.musicCues) && vnPack.musicCues.length) {
    const musicPanel = document.createElement('div');
    musicPanel.className = 'surface-panel';
    musicPanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h3 class="panel-title">OST & Mood Cues</h3>
          <span class="panel-meta">Scene score references matching real Qloo regional artist sound signatures (no invented song titles)</span>
        </div>
        <span class="tag-chip">${vnPack.musicCues.length} Cues</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px;">
        ${vnPack.musicCues.map((mc: any) => `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; font-weight: 600; color: #ffffff; text-transform: uppercase;">${mc.mood}</span>
              ${typeof mc.affinity_score === 'number' ? `<span class="tag-chip">Affinity ${mc.affinity_score}</span>` : ''}
            </div>
            <div style="font-size: 13.5px; font-weight: 500; color: #ffffff;">Artist: ${mc.artist}</div>
            <div style="font-size: 11.5px; color: var(--studio-text-secondary);">${mc.tempo_and_feel}</div>
            <div style="font-size: 10.5px; color: var(--studio-text-tertiary); margin-top: 4px;">Artist returned by Qloo</div>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(musicPanel);
  }

  // 5. Narrative Routes
  if (Array.isArray(vnPack.narrativeRoutes) && vnPack.narrativeRoutes.length) {
    const routePanel = document.createElement('div');
    routePanel.className = 'surface-panel';
    routePanel.innerHTML = `
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Branching Narrative Routes</h3>
          <span class="panel-meta">Character-driven story pathways rooted in regional worldviews</span>
        </div>
        <span class="tag-chip">${vnPack.narrativeRoutes.length} Routes</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px;">
        ${vnPack.narrativeRoutes.map((r: any) => `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 14px; font-weight: 600; color: #ffffff;">Route: ${r.character_or_faction}</div>
            <div style="font-size: 12.5px; color: var(--studio-text-secondary); line-height: 1.5;">${r.premise}</div>
            <div style="font-size: 11.5px; color: var(--studio-text-tertiary); font-style: italic;">Core Dilemma: ${r.conflict_rooted_in_culture}</div>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(routePanel);
  }
}

// ─── Standard Deliverable Renderers ─────────────────────────────────

function renderQuests(container: HTMLElement, quests: any[], evidenceStore?: Record<string, any>) {
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Quest & Side-Activity Hooks</h3>
        <span class="panel-meta">Regional objectives grounded in local customs and tensions</span>
      </div>
      <span class="tag-chip">${quests.length} Missions</span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px;">
      ${quests.map((q) => {
        const activity = (q.activity_type || 'Side Quest').toUpperCase();
        const contact = q.contact_npc ? `Contact: ${q.contact_npc}` : (q.location || 'Local District');
        const title = q.title || q.name || 'Regional Objective';
        const objective = q.objective || q.hook || q.description || 'Explore regional cultural objective.';
        const tension = q.local_tension || '';
        const context = q.cultural_context || '';

        // Extract evidence entity details
        const evKey = Array.isArray(q.evidence) && q.evidence.length ? q.evidence[0] : null;
        const evItem = evKey && evidenceStore ? evidenceStore[evKey] : null;
        const entityName = evItem?.entity_names?.[0] || evItem?.entity_details?.[0]?.name || null;
        const affinity = evItem?.signal?.type === 'affinity' && evItem.signal.value > 0 ? evItem.signal.value.toFixed(2) : null;

        return `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span class="tag-chip">${activity}</span>
              <span style="font-size: 11px; color: var(--studio-text-tertiary);">${contact}</span>
            </div>
            <div style="font-size: 14px; font-weight: 600; color: var(--studio-text);">${title}</div>
            <div style="font-size: 12.5px; color: var(--studio-text-secondary); line-height: 1.5;">${objective}</div>
            ${tension ? `<div style="font-size: 11.5px; color: var(--studio-text-tertiary); font-style: italic;">Local Tension: ${tension}</div>` : ''}
            ${context ? `<div style="font-size: 11.5px; color: var(--studio-text-tertiary);">Context: ${context}</div>` : ''}
            ${entityName ? `<div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px solid var(--studio-hairline); font-size: 11px; color: var(--studio-text-tertiary); flex-wrap: wrap; gap: 4px;">
              <span>Inspired by: <strong style="color: #ffffff;">${entityName}</strong>${affinity ? ` · affinity ${affinity}` : ''}</span>
              <span class="tag-chip">Qloo</span>
            </div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
  container.appendChild(panel);
}

function renderRadio(container: HTMLElement, radioStations: any[], evidenceStore?: Record<string, any>) {
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Regional Radio Stations</h3>
        <span class="panel-meta">In-game broadcast dials featuring verified Qloo artists (no invented song titles)</span>
      </div>
      <span class="tag-chip">${radioStations.length} Dials</span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px;">
      ${radioStations.map(st => {
        const name = st.station_name || st.name || 'Regional Radio';
        const dj = st.dj_name ? `DJ: ${st.dj_name}${st.dj_persona ? ` (${st.dj_persona})` : ''}` : (st.host ? `DJ: ${st.host}` : '');
        const tracks = Array.isArray(st.tracklist) ? st.tracklist : (Array.isArray(st.sample_tracklist) ? st.sample_tracklist : []);

        const evKey = Array.isArray(st.evidence) && st.evidence.length ? st.evidence[0] : null;
        const evItem = evKey && evidenceStore ? evidenceStore[evKey] : null;

        return `
          <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span style="font-family: ui-monospace, monospace; font-size: 13px; font-weight: 600; color: #ffffff;">${st.frequency || st.format || ''}</span>
              ${st.genre ? `<span class="tag-chip">${st.genre}</span>` : ''}
            </div>
            <div>
              <div style="font-size: 14px; font-weight: 600; color: var(--studio-text);">${name}</div>
              ${dj ? `<div style="font-size: 11.5px; color: var(--studio-text-tertiary);">${dj}</div>` : ''}
            </div>
            <!-- Equalizer Bar Graphic -->
            <div style="display: flex; gap: 3px; height: 16px; align-items: flex-end; padding: 4px 0;">
              <span style="flex: 1; height: 40%; background: rgba(255,255,255,0.2); border-radius: 2px;"></span>
              <span style="flex: 1; height: 85%; background: rgba(255,255,255,0.4); border-radius: 2px;"></span>
              <span style="flex: 1; height: 60%; background: rgba(255,255,255,0.3); border-radius: 2px;"></span>
              <span style="flex: 1; height: 100%; background: rgba(255,255,255,0.5); border-radius: 2px;"></span>
              <span style="flex: 1; height: 45%; background: rgba(255,255,255,0.25); border-radius: 2px;"></span>
              <span style="flex: 1; height: 75%; background: rgba(255,255,255,0.35); border-radius: 2px;"></span>
            </div>
            ${st.banter_sample ? `<div style="font-size: 11.5px; color: var(--studio-text-tertiary); font-style: italic;">"${st.banter_sample}"</div>` : ''}
            ${tracks.length ? `
              <div>
                <div style="font-size: 10.5px; text-transform: uppercase; color: var(--studio-text-tertiary); font-weight: 500; margin-bottom: 6px;">Artist rotation (returned by Qloo):</div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  ${tracks.map((t: any) => {
                    const artName = typeof t === 'string' ? t : (t.artist || t.title || 'Regional Artist');
                    const affScore = typeof t === 'object' && typeof t.affinity_score === 'number' ? `affinity ${t.affinity_score}` : null;
                    return `
                      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--studio-text-secondary); background: rgba(255,255,255,0.02); padding: 4px 8px; border-radius: 4px;">
                        <span style="color: #ffffff; font-weight: 500;">${artName}</span>
                        ${affScore ? `<span style="font-size: 10.5px; color: var(--studio-text-tertiary);">${affScore}</span>` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
            <div style="font-size: 11px; color: var(--studio-text-tertiary); padding-top: 6px; border-top: 1px solid var(--studio-hairline);">${evItem?.entity_names?.length ? `${evItem.entity_names.length} Qloo artists in rotation` : ''}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  container.appendChild(panel);
}

function renderSponsors(container: HTMLElement, sponsors: any[], evidenceStore?: Record<string, any>) {
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Storefronts & Sponsors</h3>
        <span class="panel-meta">In-world shops and signage inspired by brands and venues Qloo returned</span>
      </div>
      <span class="tag-chip">${sponsors.length} Storefronts</span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px;">
      ${sponsors.map(sp => {
        const brand = sp.brand_name || sp.name || 'Storefront';
        const industry = sp.industry || sp.category || '';
        const presence = sp.in_world_presence || sp.district || '';
        const appeal = sp.player_appeal || '';
        const evKey = Array.isArray(sp.evidence) && sp.evidence.length ? sp.evidence[0] : null;
        const evItem = evKey && evidenceStore ? evidenceStore[evKey] : null;
        const grounded = evItem?.entity_names?.[0] || sp.inspired_by || '';

        return `
          <div class="bk-card">
            <div style="min-width: 0;">
              ${industry ? `<div style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--studio-text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;" title="${industry}">${industry}</div>` : ''}
              <div style="font-size: 14px; font-weight: 600; color: var(--studio-text); overflow-wrap: anywhere;">${brand}</div>
              ${sp.tagline ? `<div class="bk-clamp-2" style="font-size: 12px; color: var(--studio-text-tertiary); font-style: italic; margin-top: 2px;" title="${sp.tagline}">“${sp.tagline}”</div>` : ''}
            </div>
            ${presence ? `<div class="bk-clamp-2" style="font-size: 12px; color: var(--studio-text-secondary);" title="${presence}"><span style="color: var(--studio-text-tertiary);">Where: </span>${presence}</div>` : ''}
            ${appeal ? `<div class="bk-clamp-2" style="font-size: 12px; color: var(--studio-text-secondary);" title="${appeal}"><span style="color: var(--studio-text-tertiary);">Why locals go: </span>${appeal}</div>` : ''}
            ${grounded ? `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-top: 6px; margin-top: auto; border-top: 1px solid var(--studio-hairline); font-size: 11px; color: var(--studio-text-tertiary);">
              <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Inspired by <strong style="color: #ffffff;">${grounded}</strong></span>
              ${evItem?.entity_names?.length ? '<span class="tag-chip" style="flex-shrink: 0;">Qloo</span>' : ''}
            </div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
  container.appendChild(panel);
}

function renderDebates(container: HTMLElement, debates: any[]) {
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Cultural Debates & Local Slang</h3>
        <span class="panel-meta">Genuine regional arguments and everyday colloquial vernacular</span>
      </div>
      <span class="tag-chip">Ambient Texture</span>
    </div>

    <div style="display: flex; flex-direction: column; gap: 16px;">
      ${debates.map(d => `
        <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="font-size: 13.5px; font-weight: 600; color: #ffffff;">
            Topic: ${d.topic}
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${(d.competing_viewpoints || []).map((vp: string) => `
              <div style="font-size: 12.5px; color: var(--studio-text-secondary); padding: 6px 10px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--studio-hairline-strong);">
                ${vp}
              </div>
            `).join('')}
          </div>
          ${d.local_slang?.length ? `
            <div style="margin-top: 6px;">
              <div style="font-size: 10.5px; text-transform: uppercase; color: var(--studio-text-tertiary); font-weight: 500; margin-bottom: 6px;">
                Colloquial Glossary:
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px;">
                ${d.local_slang.map((sl: any) => `
                  <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--studio-hairline); padding: 6px 8px; border-radius: 6px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--studio-text);">${sl.term}</div>
                    <div style="font-size: 11px; color: var(--studio-text-secondary);">${sl.meaning}</div>
                    ${sl.usage ? `<div style="font-size: 10.5px; color: var(--studio-text-tertiary); font-style: italic; margin-top: 2px;">"${sl.usage}"</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          ${d.ambient_dialogue?.length ? `
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
              <div style="font-size: 10.5px; text-transform: uppercase; color: var(--studio-text-tertiary); font-weight: 500;">Overheard:</div>
              ${d.ambient_dialogue.map((line: string) => `<div style="font-size: 12px; color: var(--studio-text-secondary); font-style: italic;">“${line}”</div>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
  container.appendChild(panel);
}

function renderDistrictHierarchy(container: HTMLElement, districts: any[], _locationLabel?: string) {
  if (!Array.isArray(districts) || districts.length === 0) return;
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">World District Hierarchy</h3>
        <span class="panel-meta">Qloo-returned venues grouped into districts, with local factions</span>
      </div>
      <span class="tag-chip">${districts.length} Sectors</span>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px;">
      ${districts.map((d: any) => `
        <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <div style="font-size: 14px; font-weight: 600; color: #ffffff;">${d.district_name}</div>
            ${d.soundtrack_dial ? `<span class="tag-chip" style="font-size: 10px;">${d.soundtrack_dial}</span>` : ''}
          </div>
          ${d.vibe_summary ? `<div style="font-size: 12px; color: var(--studio-text-secondary); line-height: 1.5;">${d.vibe_summary}</div>` : ''}
          
          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--studio-hairline); border-radius: 6px; padding: 10px;">
            <div style="font-size: 10.5px; text-transform: uppercase; color: var(--studio-text-tertiary); font-weight: 600; margin-bottom: 6px;">Anchored Venues & Hubs:</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${(d.venues || []).map((v: any) => `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                  <span style="color: #ffffff;">${v.name}</span>
                  <span style="font-size: 11px; color: var(--studio-text-tertiary);">${[v.type, typeof v.affinity_score === 'number' ? `affinity ${v.affinity_score}` : ''].filter(Boolean).join(' · ')}</span>
                </div>
              `).join('')}
            </div>
          </div>

          ${(d.factions_or_npcs || []).length ? `<div style="background: rgba(255,255,255,0.02); border: 1px solid var(--studio-hairline); border-radius: 6px; padding: 10px;">
            <div style="font-size: 10.5px; text-transform: uppercase; color: var(--studio-text-tertiary); font-weight: 600; margin-bottom: 6px;">Attached Local Factions & Archetypes:</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${(d.factions_or_npcs || []).map((f: any) => `
                <div style="font-size: 12px;">
                  <span style="color: #ffffff; font-weight: 500;">${f.archetype}</span>
                  <div style="font-size: 11px; color: var(--studio-text-secondary);">${f.speech_register || ''}</div>
                </div>
              `).join('')}
            </div>
          </div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  container.appendChild(panel);
}

function renderSpawnTables(container: HTMLElement, spawnTables: any[], _locationLabel?: string) {
  if (!Array.isArray(spawnTables) || spawnTables.length === 0) return;
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Engine Spawn & Rotation Tables</h3>
        <span class="panel-meta">Weights come from Qloo affinity scores, or Qloo rank order when no score is returned</span>
      </div>
      <span class="tag-chip">Engine Ready</span>
    </div>

    <div style="display: flex; flex-direction: column; gap: 14px;">
      ${spawnTables.map((table: any) => `
        <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <div style="font-size: 13.5px; font-weight: 600; color: #ffffff;">${table.table_name}</div>
            <span class="tag-chip">${table.selection_mode || 'weighted_random'}</span>
          </div>
          <div style="font-size: 12px; color: var(--studio-text-secondary); margin-bottom: 12px; line-height: 1.5;">${table.description}</div>
          
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid var(--studio-hairline); color: var(--studio-text-tertiary); font-size: 11px; text-transform: uppercase;">
                  <th style="padding: 6px 8px;">Entry Name</th>
                  <th style="padding: 6px 8px;">Category</th>
                  <th style="padding: 6px 8px;">Weight</th>
                  <th style="padding: 6px 8px;">Rarity</th>
                  <th style="padding: 6px 8px;">Signal Notes</th>
                </tr>
              </thead>
              <tbody>
                ${(table.entries || []).map((entry: any) => {
                  const rarityColor = entry.rarity === 'signature' ? '#f59e0b' : entry.rarity === 'rare' ? '#3b82f6' : entry.rarity === 'uncommon' ? '#10b981' : '#9ca3af';
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                      <td style="padding: 8px 8px; font-weight: 500; color: #ffffff;">${entry.name}</td>
                      <td style="padding: 8px 8px; color: var(--studio-text-secondary);">${entry.category}</td>
                      <td style="padding: 8px 8px;">
                        <span style="font-family: ui-monospace, monospace; font-weight: 600; color: #ffffff;">${entry.weight}</span>
                      </td>
                      <td style="padding: 8px 8px;">
                        <span style="font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.05); color: ${rarityColor}; border: 1px solid ${rarityColor}33; text-transform: uppercase;">
                          ${entry.rarity}
                        </span>
                      </td>
                      <td style="padding: 8px 8px; color: var(--studio-text-tertiary); font-size: 11.5px;">${entry.notes || ''}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  container.appendChild(panel);
}

function renderNpcProfiles(container: HTMLElement, npcs: any[]) {
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">NPC Taste Profiles</h3>
        <span class="panel-meta">Characters whose listening, eating and talking habits come from Qloo results</span>
      </div>
      <span class="tag-chip">${npcs.length} NPCs</span>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px;">
      ${npcs.map((n: any) => `
        <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 14px; font-weight: 600; color: #ffffff;">${n.archetype}</div>
          ${n.description ? `<div style="font-size: 12.5px; color: var(--studio-text-secondary); line-height: 1.5;">${n.description}</div>` : ''}
          ${n.quote ? `<div style="font-size: 12px; color: #e0e0e0; font-style: italic; padding: 6px 10px; background: rgba(255,255,255,0.03); border-left: 2px solid var(--studio-hairline-strong);">${n.quote}</div>` : ''}
          ${(n.dialogue || []).length ? `<div style="display: flex; flex-direction: column; gap: 3px;">${n.dialogue.map((d: string) => `<div style="font-size: 11.5px; color: var(--studio-text-secondary);">“${d}”</div>`).join('')}</div>` : ''}
          <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--studio-text-tertiary); padding-top: 6px; border-top: 1px solid var(--studio-hairline);">
            ${n.listens_to?.length ? `<div>Listens to: <span style="color: var(--studio-text);">${n.listens_to.join(', ')}</span></div>` : ''}
            ${n.eats_at?.length ? `<div>Goes to: <span style="color: var(--studio-text);">${n.eats_at.join(', ')}</span></div>` : ''}
            ${n.talks_about?.length ? `<div>Talks about: <span style="color: var(--studio-text);">${n.talks_about.join(', ')}</span></div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  container.appendChild(panel);
}

/** Same brief with and without Qloo data, so the difference Qloo makes is visible. */
function renderBaselineComparison(container: HTMLElement, payload: any) {
  const grounded: any[] = (payload.worldPack || []).filter((i: any) => ['radio_station', 'shop', 'chatter'].includes(i.kind));
  const baseline: any[] = payload.llmOnlyWorldPack || [];
  const summary = payload.comparisonSummary || {};
  const line = (i: any) => i.kind === 'chatter' ? (i.content?.line || i.name) : i.name;
  const kindLabel: Record<string, string> = { radio_station: 'Radio', shop: 'Shop', chatter: 'Chatter' };
  const column = (title: string, items: any[]) => `
    <div style="background: #141414; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;">
      <div style="font-size: 12px; font-weight: 600; color: #ffffff; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">${title}</div>
      ${items.slice(0, 10).map(i => `
        <div style="display: flex; gap: 8px; font-size: 12px; color: var(--studio-text-secondary);">
          <span style="color: var(--studio-text-tertiary); min-width: 52px;">${kindLabel[i.kind] || i.kind}</span>
          <span>${line(i)}</span>
        </div>
      `).join('')}
    </div>
  `;
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">With vs Without Taste Data</h3>
        <span class="panel-meta">The same brief generated once with Qloo results and once without any</span>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="tag-chip">${summary.evidenceBackedCount ?? 0} evidence-backed items</span>
        <span class="tag-chip">${summary.overlapWithBaseline ?? 0} Qloo entities the baseline also named</span>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
      ${column('With Qloo', grounded)}
      ${column('Without taste data', baseline)}
    </div>
  `;
  container.appendChild(panel);
}

function renderExportPanel(
  container: HTMLElement,
  sceneId: string | undefined,
  locationLabel: string,
  rawPack: Record<string, any>,
  fileSlug: string
) {
  const panel = document.createElement('div');
  panel.className = 'surface-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">Integration & Export</h3>
        <span class="panel-meta">Export the world pack for game engines and production docs</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button type="button" class="pill-primary-btn" data-export="json" style="font-size: 12px; padding: 6px 14px;">Download JSON</button>
        <button type="button" class="ghost-action-btn" data-export="markdown" data-file="style-bible-${fileSlug}.md" style="font-size: 12px; padding: 6px 14px;">Style Bible (MD)</button>
        <button type="button" class="ghost-action-btn" data-export="unity" data-file="BacklotWorldPack.cs" style="font-size: 12px; padding: 6px 14px;">Unity (C#)</button>
        <button type="button" class="ghost-action-btn" data-export="godot" data-file="BacklotWorldData.gd" style="font-size: 12px; padding: 6px 14px;">Godot (GDScript)</button>
      </div>
    </div>
    <div class="export-status" style="display: none; font-size: 12px; color: #f2b8b5;"></div>

    <!-- Engine Code Tabs -->
    <div style="margin-top: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; gap: 6px;" id="engine-tabs">
          <button type="button" class="ghost-action-btn is-active" data-engine="unity">Unity (C#)</button>
          <button type="button" class="ghost-action-btn" data-engine="godot">Godot (GDScript)</button>
          <button type="button" class="ghost-action-btn" data-engine="unreal">Unreal (C++)</button>
        </div>
        <button type="button" id="copy-snippet-btn" class="ghost-action-btn">Copy Snippet</button>
      </div>
      <pre style="background: #111111; border: 1px solid var(--studio-hairline); border-radius: var(--studio-radius); padding: 14px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #b5b5b5; line-height: 1.6; overflow-x: auto; white-space: pre; margin: 0;" id="code-snippet-box"></pre>
    </div>
  `;
  container.appendChild(panel);

  const exportStatus = panel.querySelector('.export-status') as HTMLElement;
  panel.querySelectorAll('[data-export]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const format = (btn as HTMLElement).dataset.export as 'json' | 'markdown' | 'unity' | 'godot';
      exportStatus.style.display = 'none';
      // JSON comes straight from the saved result, so it works even after the backend restarts
      if (format === 'json') {
        downloadJson(`worldpack-${fileSlug}.json`, rawPack);
        return;
      }
      if (!sceneId) return;
      try {
        const res = await fetch(getExportUrl(sceneId, format));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (btn as HTMLElement).dataset.file || 'export';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        exportStatus.textContent = 'This run is no longer held by the backend (it restarts clear it). Download JSON still works; run the brief again to regenerate engine files.';
        exportStatus.style.display = 'block';
      }
    });
  });

  const snippetBox = panel.querySelector('#code-snippet-box') as HTMLElement;
  const tabs = panel.querySelectorAll('#engine-tabs .ghost-action-btn');
  const copyBtn = panel.querySelector('#copy-snippet-btn') as HTMLElement;

  const snippets: Record<string, string> = {
    unity: `// Backlot World Data for ${locationLabel} (Unity C#)
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Backlot.Engine
{
    [System.Serializable]
    public class QuestData
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
    public class RadioTrackData
    {
        public string artist;
        public int affinity_score;
    }

    [System.Serializable]
    public class RadioStationData
    {
        public string station_name;
        public string frequency;
        public string genre;
        public string dj_name;
        public string dj_persona;
        public string banter_sample;
        public List<RadioTrackData> tracklist = new List<RadioTrackData>();
    }

    [System.Serializable]
    public class StorefrontData
    {
        public string brand_name;
        public string industry;
        public string tagline;
        public string in_world_presence;
        public string player_appeal;
        public string inspired_by;
    }

    [System.Serializable]
    public class NpcProfileData
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
    }

    [System.Serializable]
    public class WeightedSpawnTable
    {
        public string table_name;
        public string selection_mode;
        public List<WeightedSpawnEntry> entries = new List<WeightedSpawnEntry>();

        // Pick entry using Qloo taste weights
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
    public class BacklotWorldPackData
    {
        public string sceneId = "${sceneId || ''}";
        public string location = "${locationLabel}";
        public List<QuestData> quests = new List<QuestData>();
        public List<RadioStationData> radioStations = new List<RadioStationData>();
        public List<StorefrontData> storefronts = new List<StorefrontData>();
        public List<NpcProfileData> npcs = new List<NpcProfileData>();
        public List<WeightedSpawnTable> spawnTables = new List<WeightedSpawnTable>();
    }

    public class BacklotWorldAsset : ScriptableObject
    {
        public BacklotWorldPackData worldData;

        public static BacklotWorldAsset CreateFromJson(string json)
        {
            var asset = ScriptableObject.CreateInstance<BacklotWorldAsset>();
            asset.worldData = JsonUtility.FromJson<BacklotWorldPackData>(json);
            return asset;
        }
    }
}`,
    godot: `# Backlot World Data for ${locationLabel} (Godot GDScript Resource)
class_name BacklotWorldData
extends Resource

@export var scene_id: String = "${sceneId || ''}"
@export var location_name: String = "${locationLabel}"
@export var quests: Array[Dictionary] = []
@export var radio_stations: Array[Dictionary] = []
@export var storefronts: Array[Dictionary] = []
@export var npcs: Array[Dictionary] = []
@export var spawn_tables: Array[Dictionary] = []
@export var districts: Array[Dictionary] = []

static func load_from_json(json_string: String) -> BacklotWorldData:
    var parsed = JSON.parse_string(json_string)
    if parsed == null:
        push_error("Failed to parse Backlot worldpack JSON")
        return null
    var data = BacklotWorldData.new()
    data.scene_id = parsed.get("scene", {}).get("id", "${sceneId || ''}")
    data.location_name = "${locationLabel}"
    if parsed.has("questHooks"): data.quests.assign(parsed["questHooks"])
    if parsed.has("radioStations"): data.radio_stations.assign(parsed["radioStations"])
    if parsed.has("regionalSponsors"): data.storefronts.assign(parsed["regionalSponsors"])
    if parsed.has("npcProfiles"): data.npcs.assign(parsed["npcProfiles"])
    if parsed.has("spawnTables"): data.spawn_tables.assign(parsed["spawnTables"])
    if parsed.has("districts"): data.districts.assign(parsed["districts"])
    return data

# Weighted random selection using Qloo taste scores
func pick_weighted_entry(table_name: String) -> Dictionary:
    for table in spawn_tables:
        if table.get("table_name", "") == table_name or table_name in table.get("table_name", ""):
            var entries: Array = table.get("entries", [])
            if entries.size() == 0: return {}
            var total: int = 0
            for e in entries: total += max(1, int(e.get("weight", 50)))
            var roll: int = randi() % total
            var current: int = 0
            for e in entries:
                current += max(1, int(e.get("weight", 50)))
                if roll < current: return e
            return entries[0]
    return {}`,
    unreal: `// Backlot World Data for ${locationLabel} (Unreal Engine C++ DataTables)
#pragma once
#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "BacklotWorldPack.generated.h"

USTRUCT(BlueprintType)
struct FBacklotWeightedSpawnEntry : public FTableRowBase
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Id;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Name;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Category;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) int32 Weight; // 1-100: Qloo affinity or rank-derived
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Rarity;
};

USTRUCT(BlueprintType)
struct FBacklotQuestItem : public FTableRowBase
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Title;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString ActivityType;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Objective;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString LocalTension;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString ContactNpc;
};

USTRUCT(BlueprintType)
struct FBacklotWorldPack
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString SceneId = TEXT("${sceneId || ''}");
    UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Location = TEXT("${locationLabel}");
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TArray<FBacklotQuestItem> Quests;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TArray<FBacklotWeightedSpawnEntry> SpawnTable;
};`,
  };

  let activeEngine = 'unity';
  snippetBox.textContent = snippets[activeEngine];

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      activeEngine = (tab as HTMLElement).dataset.engine || 'unity';
      snippetBox.textContent = snippets[activeEngine];
    });
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(snippets[activeEngine]);
    copyBtn.textContent = 'Copied';
    setTimeout(() => {
      copyBtn.textContent = 'Copy Snippet';
    }, 1500);
  });
}
