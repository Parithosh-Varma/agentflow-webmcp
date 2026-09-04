// Demo footage recorder — scripted 30s video + beat screenshots for the
// AgentFlow hackathon video (voiceover script: ADS/copy.json video_script).
//
// Produces (in OUT_DIR, default /tmp/agentflow-demo):
//   demo-30s.webm      — screen capture, 1280x720, trim to 30s in edit
//   beat-1-empty.png … beat-5-run.png — stills per script beat
//
// Usage:
//   AGENTFLOW_URL=https://agentflow-hackathon.pages.dev/ node demo-footage.cjs
//   OUT_DIR=/tmp/agentflow-demo node demo-footage.cjs

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.AGENTFLOW_URL || 'http://localhost:4173/';
const OUT_DIR = process.env.OUT_DIR || '/tmp/agentflow-demo';
const SHOTS_DIR = path.join(OUT_DIR, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('onboarding_dismissed_canvas-tour', 'true');
      localStorage.setItem('agentflow_agent_toast_dont_show_v1', 'true');
    } catch {}
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  const call = async (name, args = {}) => {
    const raw = await page.evaluate(([n, a]) => window.__agentflow.callTool(n, a), [name, args]);
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  console.log('=== DEMO FOOTAGE START ===');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__webmcpReady === true, { timeout: 15000 });
  await sleep(1200);

  // Beat 1 (0-3s): empty instrument, amber LED.
  await page.screenshot({ path: path.join(SHOTS_DIR, 'beat-1-empty.png') });
  console.log('[beat 1] empty canvas');

  // Beats 2-4 (3-18s): agent builds — nodes pop in, ToolLog fills, wires draw.
  const flow = [
    ['api_call', 'Fetch users', { url: 'https://jsonplaceholder.typicode.com/users', method: 'GET' }],
    ['transform', 'Active only', { op: 'passthrough' }],
    ['condition', 'Is premium?', { path: 'premium', equals: true }],
    ['output', 'Premium lane', { kind: 'console' }],
    ['output', 'Standard lane', { kind: 'console' }],
  ];
  const ids = [];
  for (const [type, label, config] of flow) {
    const added = await call('add_node', { type, label });
    ids.push(added.nodeId);
    await call('update_node_config', { nodeId: added.nodeId, config });
    await sleep(800); // let each module land on camera
  }
  await page.screenshot({ path: path.join(SHOTS_DIR, 'beat-2-modules.png') });
  console.log('[beat 2] modules placed');
  const wires = [[0, 1, ''], [1, 2, ''], [2, 3, 'true'], [2, 4, 'false']];
  for (const [a, b, label] of wires) {
    await call('connect_nodes', { sourceNodeId: ids[a], targetNodeId: ids[b], label });
    await sleep(700);
  }
  try {
    await page.locator('.react-flow__controls-fitview').click({ timeout: 5000 });
    await sleep(400);
  } catch {}
  await page.screenshot({ path: path.join(SHOTS_DIR, 'beat-3-wired.png') });
  console.log('[beats 3-4] wired');

  // Beat 5 (18-24s): press RUN like a human, watch signals march.
  await page.locator('[data-onboarding="run-button"]').click({ timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector('.readout')?.getAttribute('data-state') !== 'running',
    { timeout: 45000 },
  );
  await sleep(800);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'beat-4-complete.png') });
  console.log('[beat 5] run complete');

  // Beat 6 (24-30s): logo + CTA hold.
  await sleep(2500);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'beat-5-cta.png') });
  console.log('[beat 6] hold');

  await context.close();
  await browser.close();

  const videos = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm'));
  const raw = videos.map((f) => path.join(OUT_DIR, f)).sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  )[0];
  const final = path.join(OUT_DIR, 'demo-30s.webm');
  if (raw) {
    if (fs.existsSync(final)) fs.unlinkSync(final);
    fs.renameSync(raw, final);
    const kb = Math.round(fs.statSync(final).size / 1024);
    console.log(`video -> ${final} (${kb} KB)`);
  }
  console.log('shots ->', SHOTS_DIR);
  console.log('=== DEMO FOOTAGE END ===');
})().catch((e) => {
  console.error('FOOTAGE ERROR:', e);
  process.exit(1);
});
