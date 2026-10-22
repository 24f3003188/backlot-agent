import { setupShuffleButtons } from '../components/shuffle-button.js';

const GITHUB_URL = 'https://github.com/24f3003188/';
const LINKEDIN_URL = 'https://www.linkedin.com/in/atharv-sanjeev-kumar/';

// Kept identical to the LICENSE file at the repository root.
const LICENSE_TEXT = `MIT License

Copyright (c) 2026 Atharv Sanjeev Kumar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export function renderAbout(container: HTMLElement) {
  document.title = 'Backlot — About & License';
  window.scrollTo(0, 0);

  const facts = [
    { label: 'Project', value: 'Backlot' },
    { label: 'License', value: 'MIT (open source)' },
    { label: 'Data', value: "Qloo's Taste AI" },
    { label: 'Exports', value: 'Unity · Godot · JSON' },
    { label: 'Author', value: `<a href="${LINKEDIN_URL}" target="_blank" rel="noopener noreferrer" style="color: var(--color-ink); text-decoration: underline;">Atharv Sanjeev Kumar</a>` },
    { label: 'Source', value: `<a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" style="color: var(--color-ink); text-decoration: underline;">GitHub</a>` },
  ];

  container.innerHTML = `
    <nav class="nav scrolled" id="main-nav">
      <a href="/" data-spa class="nav-logo">BACKLOT.</a>
      <div class="nav-links">
        <a href="/" data-spa class="shuffle-btn nav-hide-sm" data-shuffle-text="HOME →">HOME →</a>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="AGENT STUDIO →">AGENT STUDIO →</a>
      </div>
    </nav>

    <main class="page-container" style="padding-top: calc(80px + var(--spacing-76)); padding-bottom: var(--spacing-119); max-width: 1000px;">
      <span class="section-label">About</span>
      <h1 class="heading" style="margin-bottom: var(--spacing-30);">
        About Backlot
      </h1>

      <p class="body" style="line-height: 1.7; color: var(--color-ink); margin-bottom: 14px; max-width: 760px;">
        Backlot is a Qloo-powered agent that turns what people in a place actually love into evidence-linked, engine-ready game world content: quests, radio stations, storefronts, NPC profiles and districts, exportable to Unity, Godot and JSON.
      </p>
      <p class="body-sm" style="line-height: 1.7; color: var(--color-muted); margin-bottom: var(--spacing-46); max-width: 760px;">
        It was built for the Qloo Agentic AI Hackathon 2026. The full source code is open source under the MIT License, reproduced below and included as the LICENSE file at the root of the repository.
      </p>

      <div class="about-facts" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--color-stone); border: 1px solid var(--color-stone); margin-bottom: var(--spacing-76);">
        ${facts.map(f => `
          <div style="background: var(--color-paper); padding: 20px 24px;">
            <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-muted); margin-bottom: 8px; font-weight: 600;">${f.label}</div>
            <div style="font-size: 15px; color: var(--color-ink);">${f.value}</div>
          </div>
        `).join('')}
      </div>

      <h2 class="heading-sm" style="font-size: 24px; margin-bottom: var(--spacing-19);" id="license">
        Open-Source License
      </h2>
      <div style="
        background: #181818;
        border: 1px solid var(--color-stone);
        border-left: 3px solid #fbc531;
        padding: 28px 32px;
        margin-bottom: var(--spacing-46);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">
          <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #fbc531; font-weight: 600;">MIT License · LICENSE</div>
          <button type="button" id="copy-license-btn" class="shuffle-btn" data-shuffle-text="COPY TEXT" style="padding: 6px 16px; font-size: 11px;">COPY TEXT</button>
        </div>
        <pre id="license-text" style="margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.65; color: var(--color-ink);"></pre>
      </div>

      <p class="body-sm" style="line-height: 1.7; color: var(--color-muted); margin-bottom: var(--spacing-46); max-width: 760px;">
        The license covers Backlot's source code. Game titles, trailers and trademarks shown in the app belong to their respective owners and are not covered by this license; see <a href="/credits" data-spa style="color: var(--color-ink); text-decoration: underline;">Credits & Disclaimer</a>. Taste data is provided by Qloo under its own terms.
      </p>

      <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap; padding-top: var(--spacing-30); border-top: 1px solid var(--color-stone);">
        <a href="/" data-spa class="shuffle-btn" data-shuffle-text="← RETURN HOME">← RETURN HOME</a>
        <a href="/chat" data-spa class="shuffle-btn" data-shuffle-text="LAUNCH AGENT STUDIO →">LAUNCH AGENT STUDIO →</a>
      </div>
    </main>

    <footer style="background: #101010; border-top: 1px solid var(--color-stone); padding-top: 60px; padding-bottom: 40px;" class="page-container">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px;">
        <span class="nav-logo" style="font-size: 18px;">BACKLOT.</span>
        <span class="caption">MIT LICENSE · © 2026 ATHARV SANJEEV KUMAR</span>
        <a href="/credits" data-spa class="shuffle-btn" data-shuffle-text="CREDITS →" style="padding: 6px 16px; font-size: 11px;">CREDITS →</a>
      </div>
    </footer>
  `;

  // Display: reflow each paragraph so it wraps cleanly at any width. Copy: exact file text.
  const displayText = LICENSE_TEXT.split('\n\n').map(p => p.replace(/\n/g, ' ')).join('\n\n');
  (container.querySelector('#license-text') as HTMLElement).textContent = displayText;

  const copyBtn = container.querySelector('#copy-license-btn') as HTMLButtonElement;
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(LICENSE_TEXT);
      copyBtn.setAttribute('aria-label', 'License text copied');
      copyBtn.style.borderColor = '#fbc531';
      setTimeout(() => (copyBtn.style.borderColor = ''), 1200);
    } catch { /* clipboard blocked: text is still selectable */ }
  });

  setupShuffleButtons(container);
}
