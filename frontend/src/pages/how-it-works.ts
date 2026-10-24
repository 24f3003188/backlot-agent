import { setupShuffleButtons } from '../components/shuffle-button.js';

const ACCENT = '#fbc531';

const STEPS = [
  {
    n: '01', title: 'Brief',
    desc: 'Describe a world in one line, or pick an example. Backlot pulls out the city, era, genre and any reference games, and resolves them to Qloo entities and taste tags so every later query is anchored to real IDs.',
    qloo: '/search · /v2/tags',
  },
  {
    n: '02', title: 'Scout',
    desc: 'An agent plans which taste categories matter for this genre, then calls Qloo tools itself: artists, places, brands, TV and games for the location. Every tool call carries a stated reason and is validated before it runs.',
    qloo: '/v2/insights',
  },
  {
    n: '03', title: 'Contrast',
    desc: 'The same questions are asked of a similar city. Whatever your city has and the contrast city does not becomes the distinctive set that NPCs talk about and radio stations are built around.',
    qloo: '/v2/insights × 2 cities',
  },
  {
    n: '04', title: 'Write',
    desc: 'Quests, radio stations, storefronts, NPC profiles, districts, slang and spawn tables are written only from the scouted entities. Each item records which Qloo entities inspired it.',
    qloo: 'Scouted results only',
  },
  {
    n: '05', title: 'Verify',
    desc: 'A critic pass checks that every item cites evidence that traces back to a real Qloo entity and that nothing is duplicated. Code runs these checks first; a model is only asked to repair items when one fails. The style bible also lists anachronisms writers should avoid for the era.',
    qloo: 'Evidence store',
  },
  {
    n: '06', title: 'Export',
    desc: 'Download the world pack as JSON, a Markdown style bible, a Unity C# importer or a Godot resource, ready to drop into a project.',
    qloo: 'IDs kept in every export',
  },
];

const MODES = [
  { name: 'Build', tag: 'New world', desc: 'Create a world grounded in a real city and era.', example: 'A 1990s Lagos detective adventure' },
  { name: 'Localize', tag: 'New market', desc: 'Adapt an existing world for another market, keeping its structure and swapping in local taste.', example: 'Our Seattle courier crew game, adapted for Seoul' },
  { name: 'Refresh', tag: 'Live service', desc: 'Plan a seasonal drop for a region around a festival or holiday.', example: 'Día de Muertos event for our racing game in Mexico City' },
];

const TOOLS = [
  { tool: 'discover', what: 'Ranked taste results for one category in one location.', endpoint: '/v2/insights' },
  { tool: 'compare_locations', what: 'The same query for two cities, to see what is distinctive.', endpoint: '/v2/insights' },
  { tool: 'search_entities', what: 'Resolves names such as a city or a game to Qloo entities.', endpoint: '/search' },
  { tool: 'find_tags', what: 'Finds taste tags such as genres, moods and venue types.', endpoint: '/v2/tags' },
  { tool: 'finalize', what: 'Ends scouting once every category the world needs is covered.', endpoint: 'none' },
];

const EXPORTS = [
  { name: 'JSON', desc: 'The full world pack with every evidence record, for any pipeline.' },
  { name: 'Style bible', desc: 'A Markdown document for writers and art direction.' },
  { name: 'Unity (C#)', desc: 'Data classes plus an editor menu that builds a ScriptableObject asset.' },
  { name: 'Godot', desc: 'A GDScript Resource with the world data embedded.' },
];

// A real record from the recorded "Lagos, 1990s" example run
const EVIDENCE_SAMPLE = `{
  "id": "ev_016",
  "source": "qloo",
  "workflow": "quest_hook",
  "entity_ids": ["8BF8F93C-89B4-4651-AA4F-F687B7EBC484"],
  "entity_names": ["Vogüé"],
  "signal": { "type": "affinity", "value": 0.973 },
  "note": "Quest \\"The Vanishing Suya Vendor\\" inspired by Vogüé"
}`;

const label = (text: string, color = 'var(--color-muted)') =>
  `<div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${color}; font-weight: 600;">${text}</div>`;

const sectionHead = (eyebrow: string, title: string, intro = '') => `
  <span class="section-label">${eyebrow}</span>
  <h2 class="heading-sm" style="font-size: 28px; font-weight: 500; margin-bottom: ${intro ? '12px' : '28px'};">${title}</h2>
  ${intro ? `<p class="body-sm" style="line-height: 1.7; max-width: 720px; margin-bottom: 28px;">${intro}</p>` : ''}`;

export function renderHowItWorks(container: HTMLElement) {
  document.title = 'Backlot — How It Works';

  container.innerHTML = `
    <nav class="nav scrolled" id="main-nav">
      <a href="/" data-spa class="nav-logo">BACKLOT.</a>
      <div class="nav-links">
        <a href="/" data-spa class="shuffle-btn nav-hide-sm" data-shuffle-text="HOME →">HOME →</a>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="AGENT STUDIO →">AGENT STUDIO →</a>
      </div>
    </nav>

    <main class="page-container hiw" style="padding-top: calc(80px + var(--spacing-76)); padding-bottom: var(--spacing-119); max-width: 1100px;">
      <span class="section-label">How It Works</span>
      <h1 class="heading" style="margin-bottom: var(--spacing-30);">From one line to a world you can ship.</h1>
      <p class="body" style="line-height: 1.7; color: var(--color-ink); margin-bottom: 14px; max-width: 760px;">
        Backlot is an agent that builds game-world content from what people in a real place actually love. It asks Qloo's Taste AI, not a model's memory, and keeps a record of where every item came from.
      </p>
      <p class="body-sm" style="line-height: 1.7; margin-bottom: var(--spacing-76); max-width: 760px;">
        A full run takes about a minute. The examples in the studio replay recorded runs, so they finish instantly.
      </p>

      <!-- Pipeline -->
      <section class="hiw-block">
        ${sectionHead('The pipeline', 'Six steps, one evidence trail.')}
        <ol class="hiw-steps">
          ${STEPS.map(s => `
            <li class="hiw-step">
              <div class="hiw-step-n">${s.n}</div>
              <div>
                <div class="heading-sm" style="font-size: 22px; color: var(--color-ink); margin-bottom: 8px;">${s.title}</div>
                <p class="body-sm" style="line-height: 1.65; max-width: 640px;">${s.desc}</p>
              </div>
              <div class="hiw-step-qloo">${label('Qloo', ACCENT)}<code>${s.qloo}</code></div>
            </li>`).join('')}
        </ol>
      </section>

      <!-- Modes -->
      <section class="hiw-block">
        ${sectionHead('Director modes', 'Three ways to start.')}
        <div class="hiw-grid hiw-grid-3">
          ${MODES.map(m => `
            <div class="hiw-cell">
              ${label(m.tag)}
              <div class="heading-sm" style="font-size: 22px; color: var(--color-ink); margin: 10px 0 10px;">${m.name}</div>
              <p class="body-sm" style="line-height: 1.6; margin-bottom: 16px;">${m.desc}</p>
              <div class="hiw-example">“${m.example}”</div>
            </div>`).join('')}
        </div>
      </section>

      <!-- Tools -->
      <section class="hiw-block">
        ${sectionHead('The agent', 'Tools it chooses between.', 'The agent decides which tool to call next and why. It cannot browse, write files or reach anything outside these Qloo lookups.')}
        <div class="hiw-table">
          <div class="hiw-row hiw-row-head"><div>Tool</div><div>What it does</div><div>Qloo endpoint</div></div>
          ${TOOLS.map(t => `
            <div class="hiw-row">
              <div><code>${t.tool}</code></div>
              <div class="body-sm" style="line-height: 1.6;">${t.what}</div>
              <div><code style="color: ${t.endpoint === 'none' ? 'var(--color-muted)' : ACCENT};">${t.endpoint}</code></div>
            </div>`).join('')}
        </div>
      </section>

      <!-- Evidence -->
      <section class="hiw-block">
        ${sectionHead('Evidence', 'Every item can be checked.', 'Each quest, station, storefront and NPC points to an evidence record listing the Qloo entities behind it. This one is from the Lagos, 1990s example, where the quest “The Vanishing Suya Vendor” is built around a venue Qloo returned for Lagos.')}
        <div class="hiw-split">
          <pre class="hiw-code">${EVIDENCE_SAMPLE.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
          <div class="hiw-cell" style="border: 1px solid var(--color-stone);">
            ${label('Numbers come from Qloo too', ACCENT)}
            <p class="body-sm" style="line-height: 1.7; margin: 12px 0;">
              Spawn weights use Qloo's affinity score: 0.97 becomes a weight of 97. If Qloo did not score every entry in a table, weights follow Qloo's rank order instead, and each entry records which source was used.
            </p>
            <p class="body-sm" style="line-height: 1.7;">
              Rarity follows the weight: <span style="color: var(--color-ink);">signature</span> from 90, <span style="color: var(--color-ink);">rare</span> from 75, <span style="color: var(--color-ink);">uncommon</span> from 50, otherwise common.
            </p>
          </div>
        </div>
      </section>

      <!-- Exports -->
      <section class="hiw-block">
        ${sectionHead('Export', 'Into your engine.')}
        <div class="hiw-grid hiw-grid-4">
          ${EXPORTS.map(x => `
            <div class="hiw-cell">
              <div class="heading-sm" style="font-size: 20px; color: var(--color-ink); margin-bottom: 10px;">${x.name}</div>
              <p class="body-sm" style="line-height: 1.6;">${x.desc}</p>
            </div>`).join('')}
        </div>
      </section>

      <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap; padding-top: var(--spacing-30); border-top: 1px solid var(--color-stone);">
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="LAUNCH AGENT STUDIO →">LAUNCH AGENT STUDIO →</a>
        <a href="/#worlds" data-spa class="shuffle-btn" data-shuffle-text="SEE EXAMPLE WORLDS →">SEE EXAMPLE WORLDS →</a>
        <a href="/" data-spa class="shuffle-btn" data-shuffle-text="← RETURN HOME">← RETURN HOME</a>
      </div>
    </main>

    <footer style="background: #101010; border-top: 1px solid var(--color-stone); padding-top: 60px; padding-bottom: 40px;" class="page-container">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px;">
        <span class="nav-logo" style="font-size: 18px;">BACKLOT.</span>
        <span class="caption">POWERED BY QLOO'S TASTE AI</span>
        <a href="/about" data-spa class="shuffle-btn" data-shuffle-text="ABOUT & LICENSE →" style="padding: 6px 16px; font-size: 11px;">ABOUT & LICENSE →</a>
      </div>
    </footer>
  `;

  setupShuffleButtons(container);
}
