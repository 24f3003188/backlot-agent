import { renderLanding } from './pages/landing.js';
import { renderCredits } from './pages/credits.js';
import { renderAbout } from './pages/about.js';
import { renderHowItWorks } from './pages/how-it-works.js';
import { curtainTransition, curtainIntro, landAtTarget } from './components/page-curtain.js';

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
  } else if (path === '/how-it-works' || path === '/how') {
    if (path === '/how') history.replaceState({}, '', '/how-it-works');
    renderHowItWorks(app);
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

// The page currently on screen. Only a change of path (or query) is a page change;
// a change of #hash alone stays on the same page and never plays the curtain.
let shownPath = location.pathname;
let shownQuery = location.search;

function render(): Promise<void> | void {
  shownPath = location.pathname;
  shownQuery = location.search;
  return route();
}

/** Show whatever the URL now points to. */
function navigate() {
  if (location.pathname === shownPath) {
    // Same page: a new query re-renders in place, a hash change needs nothing
    if (location.search !== shownQuery) Promise.resolve(render()).then(() => landAtTarget());
    return;
  }
  if (reduceMotion.matches) {
    Promise.resolve(render()).then(() => landAtTarget());
    return;
  }
  curtainTransition(render, app);
}

function scrollToHash(hash: string) {
  const target = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (target) target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  return !!target;
}

// SPA navigation
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const anchor = (e.target as HTMLElement).closest('a[data-spa]') as HTMLAnchorElement | null;
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return; // plain in-page anchors scroll natively
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();

  if (url.pathname === location.pathname && url.search === location.search) {
    // Already on this page: scroll instead of transitioning
    if (url.hash) {
      if (url.hash !== location.hash) history.pushState({}, '', url.hash);
      if (scrollToHash(url.hash)) return;
    }
    if (location.hash) history.pushState({}, '', url.pathname + url.search);
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    return;
  }
  history.pushState({}, '', url.pathname + url.search + url.hash);
  navigate();
});

window.addEventListener('popstate', navigate);

route();
if (location.hash) requestAnimationFrame(() => landAtTarget());

// One intro reveal per browser session
try {
  if (!reduceMotion.matches && !sessionStorage.getItem('backlot_intro_seen')) {
    sessionStorage.setItem('backlot_intro_seen', '1');
    curtainIntro(app);
  }
} catch { /* storage blocked: skip the intro */ }
