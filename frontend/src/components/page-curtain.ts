/**
 * Cinematic page transition: a staggered curtain of vertical bars (accent layer leading,
 * ink layer following) covers the page, the destination name rises through a mask,
 * the new page renders underneath, then the bars lift away in reverse.
 * Transforms only (GPU-composited); skipped entirely for reduced-motion users.
 */

const BAR_COUNT = 5;
const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
const COVER_MS = 520;
const REVEAL_MS = 580;
const STAGGER_MS = 42;

const PAGES: Array<{ path: string; label: string }> = [
  { path: '/', label: 'Home' },
  { path: '/how-it-works', label: 'Process' },
  { path: '/chat', label: 'Studio' },
  { path: '/about', label: 'About' },
  { path: '/credits', label: 'Credits' },
];

let root: HTMLElement | null = null;

/** After a page swap: jump to the URL's #section if it exists, otherwise to the top. */
export function landAtTarget() {
  const hash = window.location.hash;
  const target = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (target) target.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}

function el(): HTMLElement {
  if (root) return root;
  const bars = Array.from({ length: BAR_COUNT }, () => '<div class="curtain-bar"></div>').join('');
  root = document.createElement('div');
  root.className = 'curtain';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="curtain-layer curtain-accent">${bars}</div>
    <div class="curtain-layer curtain-ink">${bars}</div>
    <div class="curtain-center">
      <div class="curtain-mask"><div class="curtain-label"></div></div>
      <div class="curtain-mask"><div class="curtain-meta"></div></div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function setLabel(c: HTMLElement, path: string) {
  const idx = PAGES.findIndex(p => p.path === path);
  const label = idx >= 0 ? PAGES[idx].label : 'Backlot';
  (c.querySelector('.curtain-label') as HTMLElement).innerHTML = `${label}<span class="curtain-dot">.</span>`;
  (c.querySelector('.curtain-meta') as HTMLElement).textContent =
    idx >= 0 ? `${String(idx + 1).padStart(2, '0')} / ${String(PAGES.length).padStart(2, '0')}  —  Backlot` : 'Taste-grounded game worlds';
}

const bars = (c: HTMLElement, layer: 'accent' | 'ink') =>
  Array.from(c.querySelectorAll<HTMLElement>(`.curtain-${layer} .curtain-bar`));

function animateBars(list: HTMLElement[], from: number, to: number, origin: 'top' | 'bottom', delay: number, duration: number, reverseStagger = false) {
  return list.map((b, i) => {
    b.style.transformOrigin = origin;
    const order = reverseStagger ? list.length - 1 - i : i;
    return b.animate(
      [{ transform: `scaleY(${from})` }, { transform: `scaleY(${to})` }],
      { duration, delay: delay + order * STAGGER_MS, easing: EASE, fill: 'forwards' }
    );
  });
}

function textIn(c: HTMLElement, delay: number) {
  return [
    c.querySelector('.curtain-label')!.animate(
      [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }],
      { duration: 520, delay, easing: EASE, fill: 'forwards' }),
    c.querySelector('.curtain-meta')!.animate(
      [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }],
      { duration: 460, delay: delay + 70, easing: EASE, fill: 'forwards' }),
  ];
}

function textOut(c: HTMLElement) {
  return [
    c.querySelector('.curtain-label')!.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }],
      { duration: 480, easing: EASE, fill: 'forwards' }),
    c.querySelector('.curtain-meta')!.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }],
      { duration: 420, delay: 40, easing: EASE, fill: 'forwards' }),
  ];
}

const done = (anims: Animation[]) => Promise.all(anims.map(a => a.finished.catch(() => undefined)));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function reveal(c: HTMLElement, app: HTMLElement) {
  const out = textOut(c);
  const lift = [
    ...animateBars(bars(c, 'ink'), 1, 0, 'top', 60, REVEAL_MS, true),
    ...animateBars(bars(c, 'accent'), 1, 0, 'top', 130, REVEAL_MS, true),
  ];
  // New page settles in as the curtain lifts
  // Remove the class afterwards: a lingering transform on #app would re-anchor fixed elements
  app.classList.remove('page-enter');
  void app.offsetWidth;
  app.classList.add('page-enter');
  const clear = (e: AnimationEvent) => {
    if (e.target !== app) return; // ignore animations bubbling up from page content
    app.classList.remove('page-enter');
    app.removeEventListener('animationend', clear);
  };
  app.addEventListener('animationend', clear);
  await done([...out, ...lift]);
  c.getAnimations({ subtree: true }).forEach(a => a.cancel());
  c.classList.remove('is-active');
}

let busy = false;
let pending: (() => Promise<void> | void) | null = null;

/** Run `render` (which swaps the page) under the curtain. */
export async function curtainTransition(render: () => Promise<void> | void, app: HTMLElement) {
  if (busy) { pending = render; return; }
  busy = true;
  const c = el();
  setLabel(c, window.location.pathname);
  c.classList.add('is-active');

  const label = textIn(c, 240);
  await done([
    ...animateBars(bars(c, 'accent'), 0, 1, 'bottom', 0, COVER_MS),
    ...animateBars(bars(c, 'ink'), 0, 1, 'bottom', 80, COVER_MS),
  ]);

  // Swap the page while fully covered, then lift once the label has landed
  await Promise.all([Promise.resolve(render()).then(landAtTarget), done(label)]);
  await wait(60);
  await reveal(c, app);

  busy = false;
  if (pending) {
    const next = pending;
    pending = null;
    curtainTransition(next, app);
  }
}

/** First visit of the session: start covered, show the wordmark, then lift. */
export async function curtainIntro(app: HTMLElement) {
  const c = el();
  (c.querySelector('.curtain-label') as HTMLElement).innerHTML = 'Backlot<span class="curtain-dot">.</span>';
  (c.querySelector('.curtain-meta') as HTMLElement).textContent = 'Taste-grounded game worlds';
  c.classList.add('is-active');
  busy = true;
  await done([
    ...animateBars(bars(c, 'accent'), 1, 1, 'bottom', 0, 1),
    ...animateBars(bars(c, 'ink'), 1, 1, 'bottom', 0, 1),
  ]);
  await done(textIn(c, 0));
  await wait(160);
  await reveal(c, app);
  busy = false;
}
