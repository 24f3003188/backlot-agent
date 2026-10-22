import { setupShuffleButtons } from '../components/shuffle-button.js';

export function renderCredits(container: HTMLElement) {
  document.title = 'Backlot — Credits & Demonstration Disclaimer';
  window.scrollTo(0, 0);

  container.innerHTML = `
    <!-- ── Nav ───────────────────────────────────────────── -->
    <nav class="nav scrolled" id="main-nav">
      <a href="/" data-spa class="nav-logo">BACKLOT.</a>
      <div class="nav-links">
        <a href="/" data-spa class="shuffle-btn" data-shuffle-text="HOME →">HOME →</a>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="AGENT STUDIO →">AGENT STUDIO →</a>
      </div>
    </nav>

    <main class="page-container" style="padding-top: calc(80px + var(--spacing-76)); padding-bottom: var(--spacing-119); max-width: 1000px;">
      <!-- Title & Header -->
      <span class="section-label">Legal & Attribution</span>
      <h1 class="heading" style="margin-bottom: var(--spacing-30);">
        Credits & Demonstration Disclaimer
      </h1>

      <!-- Prominent Fair Use Disclaimer Banner -->
      <div style="
        background: #181818;
        border: 1px solid var(--color-stone);
        border-left: 3px solid #fbc531;
        padding: 28px 32px;
        margin-bottom: var(--spacing-46);
      ">
        <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #fbc531; margin-bottom: 12px; font-weight: 600;">
          NON-COMMERCIAL HACKATHON DEMONSTRATION NOTICE
        </div>
        <p class="body" style="line-height: 1.7; color: var(--color-ink); margin-bottom: 14px;">
          All game titles, trademarks, logos, audio-visual trailers, character likenesses, and brand names featured on this platform are used <strong>strictly for demonstration, educational, and evaluation purposes</strong> as part of the <strong>Qloo Agentic AI Hackathon 2026</strong>.
        </p>
        <p class="body-sm" style="line-height: 1.6; color: var(--color-muted);">
          Backlot is a proof-of-concept AI agent that explores how real-world cultural taste data can enrich virtual set dressing. Backlot is <strong>not affiliated with, endorsed by, or sponsored by</strong> any of the studios, publishers, or engine manufacturers listed below. All copyrights and trademarks remain the sole property of their respective owners.
        </p>
      </div>

      <!-- Credits Table -->
      <h2 class="heading-sm" style="font-size: 24px; margin-bottom: var(--spacing-19);">
        Game Titles & Media Attributions
      </h2>
      <p class="body-sm" style="margin-bottom: var(--spacing-30);">
        The following games and materials are showcased as cultural benchmark demonstrations:
      </p>

      <div style="display: grid; gap: 1px; background: var(--color-stone); border: 1px solid var(--color-stone); margin-bottom: var(--spacing-76);">
        ${[
          { game: 'Black Myth: Wukong', holder: 'Game Science', note: 'Gameplay trailer & Tang Dynasty cultural references' },
          { game: 'Elden Ring', holder: 'FromSoftware / Bandai Namco Entertainment', note: 'Atmospheric fantasy landscape trailer' },
          { game: 'Crimson Desert', holder: 'Pearl Abyss', note: 'Continent of Pywel mercenary open world preview' },
          { game: 'Silent Hill', holder: 'Konami Digital Entertainment', note: 'Psychological rust-belt horror setting' },
          { game: 'Ready or Not', holder: 'VOID Interactive', note: 'Los Sueños tactical SWAT environment' },
          { game: 'Resident Evil Series', holder: 'Capcom Co., Ltd.', note: 'Gothic survival horror environmental benchmarks' },
          { game: 'Project 007', holder: 'IO Interactive', note: 'International espionage setting benchmark' },
          { game: 'Pragmata', holder: 'Capcom Co., Ltd.', note: 'Dystopian lunar sci-fi reference' },
          { game: 'Tides of Annihilation', holder: 'Eclipse Glow Games', note: 'Hero reel footage' },
          { game: 'Ace Combat series', holder: 'Bandai Namco Entertainment / Bandai Namco Aces', note: 'Hero reel footage (aerial combat)' },
          { game: 'Ghost Recon Breakpoint', holder: 'Ubisoft Entertainment', note: 'Auroa tactical terrain reference' },
          { game: 'Call of Duty: Modern Warfare', holder: 'Activision Publishing / Infinity Ward', note: 'Urban combat set dressing reference' },
        ].map(item => `
          <div class="credits-row" style="background: var(--color-paper); padding: 20px 24px; display: grid; grid-template-columns: 240px 240px 1fr; gap: 16px; align-items: baseline;">
            <div style="font-family: var(--font-display); font-weight: 500; font-size: 16px; color: var(--color-ink);">${item.game}</div>
            <div style="font-size: 13px; color: #a0a09a; letter-spacing: 0.02em;">${item.holder}</div>
            <div style="font-size: 12px; color: var(--color-muted);">${item.note}</div>
          </div>
        `).join('')}
      </div>

      <!-- Engine & Tech Stack Attributions -->
      <h2 class="heading-sm" style="font-size: 24px; margin-bottom: var(--spacing-19);">
        Engine & Ecosystem Trademarks
      </h2>
      <div style="display: grid; gap: 1px; background: var(--color-stone); border: 1px solid var(--color-stone); margin-bottom: var(--spacing-76);">
        ${[
          { name: 'Qloo Taste Intelligence', org: 'Qloo Inc.', role: 'AI Taste Graph API providing empirical cross-domain affinity data' },
          { name: 'Unity Engine', org: 'Unity Technologies', role: 'Registered trademark of Unity Technologies' },
          { name: 'Unreal Engine', org: 'Epic Games, Inc.', role: 'Registered trademark of Epic Games, Inc.' },
          { name: 'Godot Engine', org: 'Software Freedom Conservancy / Godot Community', role: 'Open-source game engine under the MIT License' },
          { name: 'Steam', org: 'Valve Corporation', role: 'Registered trademark of Valve Corporation; store data used for reference game lookup' },
        ].map(item => `
          <div class="credits-row" style="background: var(--color-paper); padding: 20px 24px; display: grid; grid-template-columns: 240px 240px 1fr; gap: 16px; align-items: baseline;">
            <div style="font-weight: 500; font-size: 15px; color: var(--color-ink);">${item.name}</div>
            <div style="font-size: 13px; color: #a0a09a;">${item.org}</div>
            <div style="font-size: 12px; color: var(--color-muted);">${item.role}</div>
          </div>
        `).join('')}
      </div>

      <!-- Back Actions -->
      <div style="display: flex; gap: 24px; align-items: center; padding-top: var(--spacing-30); border-top: 1px solid var(--color-stone);">
        <a href="/" data-spa class="shuffle-btn" data-shuffle-text="← RETURN HOME">
          ← RETURN HOME
        </a>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="LAUNCH AGENT STUDIO →">
          LAUNCH AGENT STUDIO →
        </a>
      </div>
    </main>

    <!-- ── Proper Footer ────────────────────────────────── -->
    <footer style="background: #101010; border-top: 1px solid var(--color-stone); padding-top: 60px; padding-bottom: 40px;" class="page-container">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px;">
        <span class="nav-logo" style="font-size: 18px;">BACKLOT.</span>
        <span class="caption">DEMONSTRATION & EDUCATIONAL PURPOSE ONLY · QLOO AGENTIC HACKATHON 2026</span>
        <a href="/" data-spa class="shuffle-btn" data-shuffle-text="TOP ↑" style="padding: 6px 16px; font-size: 11px;">
          TOP ↑
        </a>
      </div>
    </footer>
  `;

  setupShuffleButtons(container);
}
