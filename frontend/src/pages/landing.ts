import { setupShuffleButtons } from '../components/shuffle-button.js';
import { WORKFLOW_LOGOS } from '../components/brand-logos.js';
import { initNavDrawer, openNavDrawer } from '../components/nav-drawer.js';

// Featured worlds: each card runs a studio preset. Videos are mood reels, credited on each card.
const FEATURED_GAMES = [
  { presetId: 'build-hangzhou-tang', title: 'Hangzhou, Tang Dynasty', meta: 'Build · Mythology action RPG', reel: 'Black Myth: Wukong', video: '/videoassets/blackmyth.webm' },
  { presetId: 'localize-tokyo-cyberpunk', title: 'Seattle → Tokyo', meta: 'Localize · Cyberpunk action RPG', reel: 'Pragmata', video: '/videoassets/pragmate.webm' },
  { presetId: 'build-neworleans-1970s', title: 'New Orleans, 1970s', meta: 'Build · Bayou horror adventure', reel: 'Silent Hill', video: '/videoassets/silenthill.webm' },
  { presetId: 'build-lagos-1990s', title: 'Lagos, 1990s', meta: 'Build · Military-era detective noir', reel: 'Resident Evil 9', video: '/videoassets/re9.webm' },
  { presetId: 'localize-delhi-crime', title: 'Chicago → Delhi', meta: 'Localize · Open-world crime drama', reel: 'Ready or Not', video: '/videoassets/readornot.webm' },
  { presetId: 'refresh-mexicocity-muertos', title: 'Mexico City · Día de Muertos', meta: 'Refresh · Live-service racing drop', reel: 'Crimson Desert', video: '/videoassets/crimsondesert.webm' },
];

const posterFor = (src: string) => src.replace(/\.(webm|gif)$/, '.jpg');

// Looping hero media
const HERO_LOOP_MEDIA = [
  { type: 'video', src: '/videoassets/eldenring.webm', name: 'Elden Ring · Lands Between' },
  { type: 'video', src: '/videoassets/007firstflight.webm', name: 'Project 007 · Global Espionage' },
  { type: 'video', src: '/videoassets/pragmate.webm', name: 'Pragmata · Lunar Dystopia' },
  { type: 'video', src: '/videoassets/tidesofanihiation.webm', name: 'Tides of Annihilation · Naval Sci-Fi' },
  { type: 'video', src: '/videoassets/ghostreckonibreakpoint.webm', name: 'Ghost Recon Breakpoint · Auroa' },
  { type: 'video', src: '/videoassets/codmw4.webm', name: 'Call of Duty · Modern Warfare' },
  { type: 'video', src: '/videoassets/airforce.webm', name: 'Ace Combat · Aerial Combat' },
];

export function renderLanding(container: HTMLElement) {
  document.title = 'Backlot — Cultural Set Dresser for Game Worlds';

  container.innerHTML = `
    <!-- ── Nav ───────────────────────────────────────────── -->
    <nav class="nav" id="main-nav">
      <a href="/" data-spa class="nav-logo">BACKLOT.</a>
      <div class="nav-links">
        <a href="/how-it-works" data-spa class="shuffle-btn nav-hide-sm" data-shuffle-text="HOW IT WORKS →">HOW IT WORKS →</a>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="AGENT STUDIO →">AGENT STUDIO →</a>
        <button class="hero-menu-btn" id="nav-menu-btn" aria-label="Open Navigation Menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </nav>

    <!-- ══════════════════════════════════════════════════════
         HERO SECTION
    ══════════════════════════════════════════════════════ -->
    <section class="hero-stage" id="hero">
      <div class="hero-fullbleed-wrapper" id="hero-media-wrapper">
        ${HERO_LOOP_MEDIA.map((item, index) => {
          if (item.type === 'video') {
            return `
              <video muted loop playsinline preload="${index === 0 ? 'auto' : 'none'}" poster="${posterFor(item.src)}" class="hero-media-item ${index === 0 ? 'is-active' : ''}" data-index="${index}">
                <source src="${item.src}" type="video/webm">
              </video>
            `;
          } else {
            return `
              <img src="${item.src}" class="hero-media-item ${index === 0 ? 'is-active' : ''}" data-index="${index}" alt="${item.name}" />
            `;
          }
        }).join('')}
        <div class="hero-fullbleed-overlay"></div>
      </div>

      <!-- Overlaid Display Typography -->
      <div class="hero-typography">
        <div class="hero-text-line hero-line-top">REAL TASTE</div>
        <div class="hero-text-line hero-line-mid">REAL PLACES</div>
        <div class="hero-text-line hero-line-bot">GAME WORLDS</div>
      </div>

      <!-- Bottom controls: Ticker and Single Scroll Button -->
      <div class="hero-bottom-bar">
        <div class="hero-current-world">
          <span class="hero-indicator-dot"></span>
          <span class="hero-world-title" id="hero-world-title">${HERO_LOOP_MEDIA[0].name}</span>
        </div>
        <div>
          <a href="#how" class="shuffle-btn" data-shuffle-text="EXPLORE ↓" style="padding: 8px 20px; font-size: 11px;">
            EXPLORE ↓
          </a>
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         HOW IT WORKS (SIMPLE & CLEAR)
    ══════════════════════════════════════════════════════ -->
    <section class="section page-container" id="how" style="padding-top: var(--spacing-76);">
      <span class="section-label">How It Works</span>
      <h2 class="heading-sm" style="font-size: 32px; font-weight: 500; margin-bottom: 36px;">
        From a one-line pitch to engine-ready world content.
      </h2>

      <div class="how-grid">
        ${[
          { act: '01', title: 'Pitch a World', desc: 'Describe a city, era and genre in one line. Or adapt an existing game to a new market, or plan a seasonal live-service drop.' },
          { act: '02', title: 'Agent Scouts Qloo', desc: 'An agent picks its own Qloo taste queries across music, places, brands, TV and games, then compares your city with a similar one.' },
          { act: '03', title: 'Ground Every Item', desc: 'Quests, radio, storefronts, NPCs and districts each link to the Qloo entities behind them, checked against anachronisms for the era.' },
          { act: '04', title: 'Export to Engine', desc: 'Download JSON, a style bible, a Unity C# importer or a Godot resource, with spawn weights taken from Qloo scores.' },
        ].map(s => `
          <div style="background: var(--color-paper); padding: var(--spacing-46) var(--spacing-30);">
            <div class="caption" style="color: #fbc531; margin-bottom: var(--spacing-15); font-weight: 600;">ACT ${s.act}</div>
            <div class="heading-sm" style="font-size: 24px; margin-bottom: var(--spacing-19); color: var(--color-ink);">${s.title}</div>
            <p class="body-sm" style="line-height: 1.6;">${s.desc}</p>
          </div>
        `).join('')}
      </div>
      <div style="margin-top: 28px;">
        <a href="/how-it-works" data-spa class="shuffle-btn" data-shuffle-text="SEE THE FULL PROCESS →">SEE THE FULL PROCESS →</a>
      </div>
    </section>

    <hr class="hairline" />

    <!-- ══════════════════════════════════════════════════════
         WITH vs WITHOUT QLOO
    ══════════════════════════════════════════════════════ -->
    <section class="section page-container" id="qloo">
      <span class="section-label">Why Qloo</span>
      <h2 class="heading-sm" style="font-size: 32px; font-weight: 500; margin-bottom: 16px;">
        With Qloo vs without.
      </h2>
      <p class="body-sm vs-intro">
        A language model can write a city, but it can only guess what people there actually love. Qloo's Taste AI maps aggregate, privacy-safe taste across music, places, brands, TV and games for real locations. That is the signal Backlot is built on.
      </p>

      <div class="vs-grid">
        <div class="vs-row vs-head">
          <div class="vs-label"></div>
          <div class="vs-cell">An LLM on its own</div>
          <div class="vs-cell" style="color: #fbc531;">Backlot with Qloo</div>
        </div>
        <div class="vs-row">
          <div class="vs-label">Radio & music</div>
          <div class="vs-cell vs-without"><span class="vs-tag">Without</span>Plausible-sounding artists, sometimes invented, often the same global names for every city.</div>
          <div class="vs-cell vs-with"><span class="vs-tag vs-tag-on">With Qloo</span>Only artists Qloo's Taste AI returned for that city, each kept with its Qloo ID.</div>
        </div>
        <div class="vs-row">
          <div class="vs-label">Places & storefronts</div>
          <div class="vs-cell vs-without"><span class="vs-tag">Without</span>Tourist landmarks and familiar clichés.</div>
          <div class="vs-cell vs-with"><span class="vs-tag vs-tag-on">With Qloo</span>Inspired by the venues and brands Qloo returns for the place, linked as evidence.</div>
        </div>
        <div class="vs-row">
          <div class="vs-label">What makes it local</div>
          <div class="vs-cell vs-without"><span class="vs-tag">Without</span>No way to separate local from generic.</div>
          <div class="vs-cell vs-with"><span class="vs-tag vs-tag-on">With Qloo</span>Compared against a similar city, so the distinctive picks stand out.</div>
        </div>
        <div class="vs-row">
          <div class="vs-label">Proof</div>
          <div class="vs-cell vs-without"><span class="vs-tag">Without</span>None. You trust the text.</div>
          <div class="vs-cell vs-with"><span class="vs-tag vs-tag-on">With Qloo</span>Every item carries an evidence record you can open and check.</div>
        </div>
        <div class="vs-row">
          <div class="vs-label">Engine weights</div>
          <div class="vs-cell vs-without"><span class="vs-tag">Without</span>Arbitrary numbers.</div>
          <div class="vs-cell vs-with"><span class="vs-tag vs-tag-on">With Qloo</span>Spawn weights from Qloo affinity scores, or Qloo rank when no score is returned.</div>
        </div>
        <div class="vs-row">
          <div class="vs-label">Swap the city</div>
          <div class="vs-cell vs-without"><span class="vs-tag">Without</span>Output often changes little beyond the names.</div>
          <div class="vs-cell vs-with"><span class="vs-tag vs-tag-on">With Qloo</span>A different city means a different taste graph, so a different world.</div>
        </div>
      </div>
      <p class="caption vs-foot">Every Build run in the studio shows this live: the same brief generated with and without Qloo data, side by side.</p>
    </section>

    <hr class="hairline" />

    <!-- ══════════════════════════════════════════════════════
         FEATURED WORLDS
    ══════════════════════════════════════════════════════ -->
    <section class="section page-container" id="worlds">
      <div class="worlds-head">
        <div>
          <span class="section-label" style="margin-bottom: 8px;">Try It</span>
          <h2 class="heading-sm" style="font-size: 32px; font-weight: 500;">
            Example Worlds
          </h2>
        </div>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="BUILD IN STUDIO →">BUILD IN STUDIO →</a>
      </div>

      <div class="worlds-grid">
        ${FEATURED_GAMES.map((card, i) => `
          <div class="work-card grid-paper" data-preset="${card.presetId}" data-card-index="${i}" style="cursor: pointer;" role="link" tabindex="0" aria-label="Run ${card.title} in the studio">
            <div style="position: relative; overflow: hidden; aspect-ratio: 16/9;">
              <video muted loop playsinline preload="none" poster="${posterFor(card.video)}" class="work-card-media">
                <source src="${card.video}" type="video/webm">
              </video>
              <div class="work-card-overlay">Run in Studio</div>
            </div>
            <div class="work-card-body">
              <div class="work-card-title">${card.title}</div>
              <div class="work-card-meta">${card.meta}</div>
              <div class="work-card-meta" style="opacity: 0.6; margin-top: 4px;">Reel: ${card.reel}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <hr class="hairline" />

    <!-- ══════════════════════════════════════════════════════
         GAME ENGINES & COMPATIBILITY
    ══════════════════════════════════════════════════════ -->
    <section class="section-sm page-container">
      <span class="section-label">Engines & Tools</span>
      <h2 class="heading-sm" style="font-size: 26px; font-weight: 500; margin-bottom: 24px;">
        Data In, Engine Files Out
      </h2>
      <div class="logo-grid">
        ${WORKFLOW_LOGOS.map(item => `
          <div class="workflow-logo-card" title="${item.name}">
            <div class="workflow-logo-icon">
              ${item.imageSrc
                ? `<img src="${item.imageSrc}" class="workflow-logo-img ${item.filterClass || 'filter-invert'}" alt="${item.name} logo" />`
                : `<div class="workflow-logo-svg">${item.svg || ''}</div>`
              }
            </div>
            <span class="workflow-logo-name">${item.name}</span>
            <span class="workflow-logo-cat">${item.category}</span>
          </div>
        `).join('')}
      </div>
    </section>

    <hr class="hairline" />

    <!-- ══════════════════════════════════════════════════════
         FREQUENTLY ASKED QUESTIONS (FAQ)
    ══════════════════════════════════════════════════════ -->
    <section class="section page-container" id="faq">
      <span class="section-label">FAQ</span>
      <h2 class="heading-sm" style="font-size: 32px; font-weight: 500; margin-bottom: 36px;">
        Frequently Asked Questions
      </h2>

      <div class="faq-list">
        <div class="faq-item">
          <div class="faq-header">
            <span class="faq-question">How do I import this into my game engine?</span>
            <span class="faq-toggle-icon">+</span>
          </div>
          <div class="faq-body">
            Every world pack downloads as JSON and as a Markdown style bible. Unity gets a C# script that builds a ScriptableObject from the pack, Godot gets a GDScript resource with a weighted-pick helper, and Unreal users can map the JSON to a DataTable using the struct shown in the studio.
          </div>
        </div>

        <div class="faq-item">
          <div class="faq-header">
            <span class="faq-question">Where does the cultural data come from?</span>
            <span class="faq-toggle-icon">+</span>
          </div>
          <div class="faq-body">
            From Qloo's Taste AI: aggregate, anonymised signals of what people in a place like across music, venues, brands, TV and games. Every generated item links back to the Qloo entities that inspired it, so you can check where it came from.
          </div>
        </div>

        <div class="faq-item">
          <div class="faq-header">
            <span class="faq-question">How does Backlot avoid generic AI clichés?</span>
            <span class="faq-toggle-icon">+</span>
          </div>
          <div class="faq-body">
            The agent compares your city with a similar one and keeps what is distinctive. Each run also gets an era brief listing details to include and anachronisms to avoid, and radio stations only use artists Qloo actually returned.
          </div>
        </div>

        <div class="faq-item">
          <div class="faq-header">
            <span class="faq-question">What can the studio do?</span>
            <span class="faq-toggle-icon">+</span>
          </div>
          <div class="faq-body">
            Three modes. Build creates a world for any city and era. Localize adapts an existing game world for players in a new market, with what to keep, swap and add. Refresh plans a seasonal live-service drop around a local festival.
          </div>
        </div>

        <div class="faq-item">
          <div class="faq-header">
            <span class="faq-question">Can I test it right now?</span>
            <span class="faq-toggle-icon">+</span>
          </div>
          <div class="faq-body">
            Yes. Open the Agent Studio and pick an example: it replays a recorded live run instantly, and you can re-run it live or type your own brief. You will see each Qloo query the agent makes as it happens.
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════
         EDITORIAL FOOTER
    ══════════════════════════════════════════════════════ -->
    <footer style="background: #111111; border-top: 1px solid var(--color-stone); padding-top: 76px; padding-bottom: 40px;" class="page-container">
      <!-- Callout Banner -->
      <div class="footer-callout">
        <div>
          <span style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #fbc531; display: block; margin-bottom: 8px; font-weight: 600;">
            READY TO DRESS YOUR WORLD?
          </span>
          <h3 class="heading-sm" style="font-size: 28px; font-weight: 500;">
            Start building with the Cultural Director.
          </h3>
        </div>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="OPEN AGENT STUDIO →" style="padding: 14px 34px;">
          OPEN AGENT STUDIO →
        </a>
      </div>

      <!-- Footer Columns with Modern Hover Animations -->
      <div class="footer-grid">
        <!-- Col 1: Brand & Mission -->
        <div>
          <a href="/" data-spa class="nav-logo" style="font-size: 22px; margin-bottom: 16px; display: inline-block;">BACKLOT.</a>
          <p class="body-sm" style="line-height: 1.6; max-width: 320px; margin-bottom: 18px; color: var(--color-muted);">
            A Qloo-powered agent that turns what people in a place actually love into evidence-linked, engine-ready game world content.
          </p>
          <span class="caption" style="color: var(--color-muted); display: block;">Built for Qloo Agentic AI Hackathon 2026</span>
          <span class="caption" style="color: var(--color-muted); display: block; margin-top: 6px;">By <a href="https://www.linkedin.com/in/atharv-sanjeev-kumar/" target="_blank" rel="noopener noreferrer" style="color: var(--color-ink); text-decoration: underline;">Atharv Sanjeev Kumar</a></span>
        </div>

        <!-- Col 2: Navigation -->
        <div>
          <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-ink); margin-bottom: 18px; font-weight: 600;">
            Platform
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <a href="/" data-spa class="footer-link">Home <span class="link-arrow">→</span></a>
            <a href="/chat" data-spa class="footer-link">Agent Studio <span class="link-arrow">→</span></a>
            <a href="/how-it-works" data-spa class="footer-link">How It Works <span class="link-arrow">→</span></a>
            <a href="#qloo" class="footer-link">Why Qloo <span class="link-arrow">→</span></a>
          </div>
        </div>

        <!-- Col 3: Technology -->
        <div>
          <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-ink); margin-bottom: 18px; font-weight: 600;">
            Resources
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <a href="https://docs.qloo.com" target="_blank" class="footer-link">Qloo API Docs <span class="link-arrow">↗</span></a>
            <a href="https://qloo.com" target="_blank" class="footer-link">Taste AI <span class="link-arrow">↗</span></a>
            <a href="#faq" class="footer-link">Questions & Answers <span class="link-arrow">→</span></a>
            <a href="https://github.com/24f3003188/" target="_blank" rel="noopener noreferrer" class="footer-link">GitHub <span class="link-arrow">↗</span></a>
            <a href="https://www.linkedin.com/in/atharv-sanjeev-kumar/" target="_blank" rel="noopener noreferrer" class="footer-link">LinkedIn <span class="link-arrow">↗</span></a>
          </div>
        </div>

        <!-- Col 4: Legal & Credits -->
        <div>
          <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-ink); margin-bottom: 18px; font-weight: 600;">
            Attribution
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <a href="/about" data-spa class="footer-link" style="color: #fbc531;">About & License <span class="link-arrow">→</span></a>
            <a href="/credits" data-spa class="footer-link">Credits & Disclaimer <span class="link-arrow">→</span></a>
            <a href="/credits" data-spa class="footer-link">Demonstration Notice <span class="link-arrow">→</span></a>
            <a href="/credits" data-spa class="footer-link">Fair Use & Trademarks <span class="link-arrow">→</span></a>
          </div>
        </div>
      </div>

      <!-- Footer Bottom Bar -->
      <div style="
        border-top: 1px solid var(--color-stone);
        padding-top: 28px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
      ">
        <span class="caption">
          © 2026 BACKLOT. ALL GAME NAMES, MEDIA, AND TRADEMARKS ARE PROPERTY OF THEIR RESPECTIVE OWNERS (<a href="/credits" data-spa style="color: #fbc531; text-decoration: underline;">SEE CREDITS</a>).
        </span>
        <div style="display: flex; gap: 24px; align-items: center;">
          <a href="/about" data-spa class="footer-link" style="font-size: 12px;">MIT License</a>
          <a href="/credits" data-spa class="footer-link" style="font-size: 12px;">Credits</a>
          <a href="/chat" data-spa class="footer-link" style="font-size: 12px; color: var(--color-ink);">Agent Studio →</a>
        </div>
      </div>
    </footer>
  `;

  attachLandingListeners(container);
}

function attachLandingListeners(container: HTMLElement) {
  // Initialize Kinetic Character Shuffle on all buttons
  setupShuffleButtons(container);

  // Initialize Navigation Drawer
  initNavDrawer();

  // Connect single nav menu button
  const navMenuBtn = container.querySelector('#nav-menu-btn');
  navMenuBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openNavDrawer();
  });

  // Hero Background Media Looper
  // Only the active hero video is loaded/decoding; the next one is preloaded just before it's needed.
  const heroSection = container.querySelector('#hero') as HTMLElement;
  const mediaItems = container.querySelectorAll<HTMLVideoElement>('.hero-media-item');
  const titleEl = container.querySelector('#hero-world-title') as HTMLElement;
  let currentHeroIdx = 0;
  let heroVisible = true;
  const cleanups: Array<() => void> = [];

  const playActive = () => {
    const v = mediaItems[currentHeroIdx];
    if (v && heroVisible && !document.hidden) v.play().catch(() => {});
  };
  const pauseActive = () => mediaItems[currentHeroIdx]?.pause();

  function switchHeroMedia(nextIdx: number) {
    if (mediaItems.length === 0) return;
    const currentItem = mediaItems[currentHeroIdx];
    const nextItem = mediaItems[nextIdx];
    currentItem.classList.remove('is-active');
    currentItem.pause();

    nextItem.classList.add('is-active');
    nextItem.currentTime = 0;
    currentHeroIdx = nextIdx;
    playActive();

    // Warm up the following clip only
    const upcoming = mediaItems[(nextIdx + 1) % mediaItems.length];
    if (upcoming && upcoming.preload === 'none') upcoming.preload = 'metadata';

    if (titleEl && HERO_LOOP_MEDIA[nextIdx]) {
      titleEl.style.opacity = '0';
      setTimeout(() => {
        titleEl.textContent = HERO_LOOP_MEDIA[nextIdx].name;
        titleEl.style.opacity = '1';
      }, 300);
    }
  }

  playActive();
  const heroLoopTimer = window.setInterval(() => {
    if (!document.body.contains(heroSection)) return teardown();
    if (!heroVisible || document.hidden) return;
    switchHeroMedia((currentHeroIdx + 1) % mediaItems.length);
  }, 7500);
  cleanups.push(() => clearInterval(heroLoopTimer));

  // Pause the hero when scrolled away or the tab is hidden
  const heroObserver = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    heroVisible ? playActive() : pauseActive();
  }, { threshold: 0.05 });
  heroObserver.observe(heroSection);
  cleanups.push(() => heroObserver.disconnect());

  const onVisibility = () => (document.hidden ? pauseActive() : playActive());
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  // Featured cards show a poster; video decodes only on hover (or when on screen on touch devices)
  const cardVideos = container.querySelectorAll<HTMLVideoElement>('.work-card-media');
  const canHover = window.matchMedia('(hover: hover)').matches;
  if (canHover) {
    container.querySelectorAll<HTMLElement>('.work-card').forEach(card => {
      const v = card.querySelector('video');
      if (!v) return;
      card.addEventListener('mouseenter', () => { v.preload = 'auto'; v.play().catch(() => {}); });
      card.addEventListener('mouseleave', () => v.pause());
    });
  } else {
    const cardObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const v = e.target as HTMLVideoElement;
        e.isIntersecting ? v.play().catch(() => {}) : v.pause();
      });
    }, { threshold: 0.6 });
    cardVideos.forEach(v => cardObserver.observe(v));
    cleanups.push(() => cardObserver.disconnect());
  }

  // Nav scroll style (rAF-throttled)
  const nav = container.querySelector('#main-nav') as HTMLElement;
  let scrollTicking = false;
  const onScroll = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      scrollTicking = false;
      if (!document.body.contains(nav)) return teardown();
      nav.classList.toggle('scrolled', window.scrollY > 40);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));

  let tornDown = false;
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    cleanups.forEach(fn => fn());
    mediaItems.forEach(v => v.pause());
    cardVideos.forEach(v => v.pause());
  }
  // Leaving the page tears down media; a #section change on this page does not
  const onPop = () => { if (window.location.pathname !== '/') teardown(); };
  window.addEventListener('popstate', onPop);
  cleanups.push(() => window.removeEventListener('popstate', onPop));

  // Featured cards open the studio and run that preset
  container.querySelectorAll<HTMLElement>('[data-preset]').forEach(card => {
    const open = () => {
      teardown();
      history.pushState({}, '', `/chat?preset=${encodeURIComponent(card.dataset.preset || '')}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });

  // FAQ Accordion
  initFaq(container);

}

function initFaq(container: HTMLElement) {
  const faqItems = container.querySelectorAll<HTMLElement>('.faq-item');
  faqItems.forEach(item => {
    const header = item.querySelector('.faq-header');
    header?.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      faqItems.forEach(other => other.classList.remove('is-open'));
      if (!isOpen) {
        item.classList.add('is-open');
      }
    });
  });
}
