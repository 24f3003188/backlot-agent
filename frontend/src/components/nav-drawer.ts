import { setupShuffleButtons } from './shuffle-button.js';

/**
 * Slide-out Navigation Drawer Menu
 * Matches the reference screenshot:
 * - High-fashion list typography with clean underlines and right arrows
 * - Kinetic character shuffle on hover for every menu link
 * - Sub-links (Privacy, Documentation), Social icons row
 * - Theme toggle pill and large close button (✕)
 */

let drawerEl: HTMLElement | null = null;
let backdropEl: HTMLElement | null = null;

export function initNavDrawer() {
  if (drawerEl) return;

  // Backdrop
  backdropEl = document.createElement('div');
  backdropEl.className = 'drawer-backdrop';
  document.body.appendChild(backdropEl);

  // Drawer
  drawerEl = document.createElement('aside');
  drawerEl.className = 'nav-drawer';
  drawerEl.setAttribute('aria-hidden', 'true');

  drawerEl.innerHTML = `
    <div class="drawer-inner">
      <!-- Main Navigation Links -->
      <nav class="drawer-nav">
        <a href="/" data-spa class="drawer-link shuffle-btn" data-shuffle-text="HOME →">
          HOME →
        </a>
        <a href="/chat" data-spa class="drawer-link shuffle-btn" data-shuffle-text="AGENT STUDIO →">
          AGENT STUDIO →
        </a>
        <a href="#how" class="drawer-link shuffle-btn" data-shuffle-text="HOW IT WORKS →">
          HOW IT WORKS →
        </a>
        <a href="/about" data-spa class="drawer-link shuffle-btn" data-shuffle-text="ABOUT & LICENSE →">
          ABOUT & LICENSE →
        </a>
        <a href="/credits" data-spa class="drawer-link shuffle-btn" data-shuffle-text="CREDITS & LEGAL →">
          CREDITS & LEGAL →
        </a>
        <a href="https://docs.qloo.com" target="_blank" class="drawer-link shuffle-btn" data-shuffle-text="QLOO API ↗">
          QLOO API ↗
        </a>
        <a href="#worlds" class="drawer-link shuffle-btn" data-shuffle-text="EXAMPLE WORLDS →">
          EXAMPLE WORLDS →
        </a>
      </nav>

      <!-- Drawer Bottom Section -->
      <div class="drawer-bottom">
        <!-- Sub-links -->
        <div class="drawer-sublinks">
          <a href="#faq" class="drawer-sublink">FAQ <span class="arrow">→</span></a>
          <a href="/credits" data-spa class="drawer-sublink">CREDITS <span class="arrow">→</span></a>
        </div>

        <!-- Social Icons Row -->
        <div class="drawer-socials">
          <a href="https://github.com/24f3003188/" target="_blank" rel="noopener noreferrer" aria-label="GitHub" class="social-icon-link">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
          </a>
          <a href="https://www.linkedin.com/in/atharv-sanjeev-kumar/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" class="social-icon-link">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
          </a>
        </div>

        <!-- Bottom Controls Row: Close X -->
        <div class="drawer-controls" style="justify-content: flex-end;">
          <!-- Large Close Button -->
          <button class="drawer-close-btn" id="drawer-close-btn" aria-label="Close Navigation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(drawerEl);
  setupShuffleButtons(drawerEl);

  // Events
  backdropEl.addEventListener('click', closeNavDrawer);

  const closeBtn = drawerEl.querySelector('#drawer-close-btn');
  closeBtn?.addEventListener('click', closeNavDrawer);

  // Close when clicking any menu link
  drawerEl.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      closeNavDrawer();
    });
  });

  // Keyboard Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isNavDrawerOpen()) {
      closeNavDrawer();
    }
  });

}

export function openNavDrawer() {
  initNavDrawer();
  drawerEl?.classList.add('is-open');
  backdropEl?.classList.add('is-open');
  drawerEl?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeNavDrawer() {
  drawerEl?.classList.remove('is-open');
  backdropEl?.classList.remove('is-open');
  drawerEl?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

export function isNavDrawerOpen(): boolean {
  return drawerEl?.classList.contains('is-open') ?? false;
}
