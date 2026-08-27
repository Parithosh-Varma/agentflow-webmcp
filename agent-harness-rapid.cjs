const { chromium } = require('playwright');
const URL = process.env.AGENTFLOW_URL || 'http://localhost:4173/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__webmcpReady === true, { timeout: 10000 });

  const call = (name, args = {}) =>
    page.evaluate(([n, a]) => window.__agentflow.callTool(n, a), [name, args]);

  // Fire back-to-back like a fast agent (Leo) would — NO delays between calls.
  const a = await call('add_node', { type: 'api_call', label: 'Fetch users', x: 360, y: 80, config: {} });
  const fetchId = JSON.parse(a).nodeId;
  await call('update_node_config', { nodeId: fetchId, config: { url: 'https://jsonplaceholder.typicode.com/users', method: 'GET' } });
  const b = await call('add_node', { type: 'transform', label: 'Transform Data', x: 640, y: 80 });
  const filterId = JSON.parse(b).nodeId;
  await call('connect_nodes', { sourceNodeId: fetchId, targetNodeId: filterId });
  const exec = await call('execute_workflow', { input: { request: 'get users' } });
  const out = JSON.parse(exec);

  console.log('EXECUTE OUTPUT KEYS:', Object.keys(out));
  console.log('api_call present:', out[fetchId] ? 'YES' : 'NO');
  console.log('transform present:', out[filterId] ? 'YES' : 'NO');
  const apiOut = out[fetchId];
  console.log('api_call returned array of length:', Array.isArray(apiOut) ? apiOut.length : '(not an array)');
  console.log(JSON.stringify(out).slice(0, 200));
  await browser.close();
  process.exit(Array.isArray(apiOut) && apiOut.length > 0 ? 0 : 2);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
