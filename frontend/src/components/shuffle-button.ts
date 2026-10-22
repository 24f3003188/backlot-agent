/**
 * Kinetic Character Shuffle Button
 * Exactly replicates the OFF+BRAND split/rolling character shuffle on hover:
 * characters vertically slide up and down with staggered micro-delays, creating
 * the tactile split-letter kinetic motion captured in the reference screenshot.
 */

export function setupShuffleButtons(root: HTMLElement = document.body) {
  const buttons = root.querySelectorAll<HTMLElement>('.shuffle-btn');
  buttons.forEach(initShuffleButton);
}

export function initShuffleButton(btn: HTMLElement) {
  if (btn.dataset.shuffleInit === 'true') return;
  btn.dataset.shuffleInit = 'true';

  const rawText = btn.getAttribute('data-shuffle-text') || btn.textContent?.trim() || '';
  if (!rawText) return;

  btn.innerHTML = '';
  const container = document.createElement('span');
  container.className = 'shuffle-label';

  // Process characters
  const chars = Array.from(rawText);
  chars.forEach((char, index) => {
    const slot = document.createElement('span');
    slot.className = 'char-slot';
    slot.style.setProperty('--char-idx', index.toString());

    if (char === ' ') {
      slot.innerHTML = '&nbsp;';
      slot.classList.add('char-space');
    } else {
      // Determine vertical direction per character (alternating or randomized pattern)
      const dir = (index % 2 === 0) ? 'up' : 'down';
      slot.setAttribute('data-dir', dir);

      const track = document.createElement('span');
      track.className = 'char-track';

      // 3 copies: upper, primary, lower
      const topSpan = document.createElement('span');
      topSpan.className = 'char-copy char-top';
      topSpan.textContent = char;

      const midSpan = document.createElement('span');
      midSpan.className = 'char-copy char-mid';
      midSpan.textContent = char;

      const botSpan = document.createElement('span');
      botSpan.className = 'char-copy char-bot';
      botSpan.textContent = char;

      track.appendChild(topSpan);
      track.appendChild(midSpan);
      track.appendChild(botSpan);
      slot.appendChild(track);
    }

    container.appendChild(slot);
  });

  btn.appendChild(container);

  // Dynamic mouse move shuffle jitter
  let shuffleTimeout: ReturnType<typeof setTimeout> | undefined;
  btn.addEventListener('mouseenter', () => {
    btn.classList.add('is-shuffling');
  });

  btn.addEventListener('mouseleave', () => {
    btn.classList.remove('is-shuffling');
    if (shuffleTimeout) clearTimeout(shuffleTimeout);
  });
}
