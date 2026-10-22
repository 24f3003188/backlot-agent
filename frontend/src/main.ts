import { renderLanding } from './pages/landing.js';
import { renderCredits } from './pages/credits.js';
import { renderAbout } from './pages/about.js';
import { curtainTransition, curtainIntro } from './components/page-curtain.js';

const app = document.getElementById('app')!;

function route(): Promise<void> | void {
  const path = window.location.pathname;

  if (path === '/' || path === '/index.html') {
    renderLanding(app);
  } else if (path === '/chat' || path === '/gallery') {
    if (path === '/gallery') {
      history.replaceState({}, '', '/chat');
    }
    // Studio (and React/motion for the thinking line) loads only when opened
    return import('./pages/chat.js').then(m => m.renderChat(app));
  } else if (path === '/credits') {
    renderCredits(app);
  } else if (path === '/about' || path === '/license') {
    if (path === '/license') history.replaceState({}, '', '/about');
    renderAbout(app);
  } else {
    app.innerHTML = `
      <div style="padding:120px 24px;text-align:center;min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span class="section-label">404</span>
        <h1 class="heading" style="margin-bottom:20px;">WORLD NOT FOUND</h1>
        <p class="body-sm" style="margin-bottom:32px;">The coordinates you requested are outside the known cultural graph.</p>
        <a href="/" data-spa class="shuffle-btn" data-shuffle-text="RETURN HOME →">RETURN HOME →</a>
      </div>
    `;
  }
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Page change with the cinematic curtain (plain swap for reduced motion). */
function navigate() {
  if (reduceMotion.matches) {
    route();
    return;
  }
  curtainTransition(route, app);
}

// SPA navigation
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const anchor = target.closest('a[data-spa]') as HTMLAnchorElement | null;
  if (anchor) {
    const href = anchor.getAttribute('href');
    if (href && (href.startsWith('/') || href.startsWith('#'))) {
      if (href.startsWith('#')) return; // Allow anchor scrolling
      e.preventDefault();
      if (href === window.location.pathname + window.location.search) return;
      history.pushState({}, '', href);
      navigate();
    }
  }
});

window.addEventListener('popstate', navigate);

route();

// One intro reveal per browser session
try {
  if (!reduceMotion.matches && !sessionStorage.getItem('backlot_intro_seen')) {
    sessionStorage.setItem('backlot_intro_seen', '1');
    curtainIntro(app);
  }
} catch { /* storage blocked: skip the intro */ }
