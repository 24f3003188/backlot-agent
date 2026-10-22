// Runs every demo preset live once (with your real keys) so the server can replay them for free.
// Usage: start the backend, then:  node scripts/record-presets.mjs [baseUrl] [preset-id ...]
const base = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'http://localhost:3001';
const only = process.argv.slice(2).filter(a => !a.startsWith('http'));

const ids = only.length ? only : [
  'localize-tokyo-cyberpunk', 'localize-delhi-crime', 'localize-saopaulo-heist',
  'build-hangzhou-tang', 'build-delhi-2000s-vn', 'build-lagos-1990s', 'build-neworleans-1970s',
  'refresh-mexicocity-muertos', 'refresh-delhi-diwali', 'refresh-taipei-lunarnewyear',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const id of ids) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset_id: id, fresh: true, genre: 'x' }),
  });
  const { sceneId, error } = await res.json();
  if (!sceneId) { console.log(`✗ ${id}: ${error}`); continue; }
  let status = 'running';
  while (status === 'running' || status === 'pending') {
    await sleep(3000);
    status = (await (await fetch(`${base}/api/scene/${sceneId}`)).json()).status;
  }
  console.log(`${status === 'done' ? '✓' : '✗'} ${id} (${Math.round((Date.now() - t0) / 1000)}s)`);
}
console.log('Recordings are in backend/preset-cache/. Commit them so the hosted demo can replay them.');
