// Agent harness: drives AgentFlow's WebMCP tools the same way an in-browser
// WebMCP agent (e.g. ChatGPT) would. No UI clicking — direct tool calls.
const { chromium } = require('playwright');

const URL = process.env.AGENTFLOW_URL || 'http://localhost:4173/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window).__webmcpReady === true, { timeout: 10000 });

  const call = async (name, args = {}) => {
    const raw = await page.evaluate(
      ([n, a]) => window.__agentflow.callTool(n, a),
      [name, args]
    );
    return JSON.parse(raw);
  };

  console.log('=== AGENT SESSION START ===');
  console.log('tools discovered:', await page.evaluate(() => window.__agentflow.listTools()));

  console.log('\n[agent] get_available_tools');
  console.log(await call('get_available_tools'));

  console.log('\n[agent] add_node x4');
  const a = await call('add_node', { type: 'api_call', label: 'Fetch users', x: 360, y: 80 });
  const fetchId = a.nodeId;
  const b = await call('add_node', { type: 'transform', label: 'Filter active', x: 640, y: 80 });
  const filterId = b.nodeId;
  const c = await call('add_node', { type: 'condition', label: 'Is premium?', x: 920, y: 80 });
  const condId = c.nodeId;
  const d = await call('add_node', { type: 'output', label: 'Send email', x: 1200, y: 80 });
  const outId = d.nodeId;
  console.log({ fetchId, filterId, condId, outId });

  console.log('\n[agent] connect_nodes x3');
  console.log(await call('connect_nodes', { sourceNodeId: fetchId, targetNodeId: filterId }));
  console.log(await call('connect_nodes', { sourceNodeId: filterId, targetNodeId: condId }));
  console.log(await call('connect_nodes', { sourceNodeId: condId, targetNodeId: outId, label: 'true' }));

  console.log('\n[agent] update_node_config');
  console.log(await call('update_node_config', { nodeId: fetchId, config: { url: 'https://jsonplaceholder.typicode.com/users', method: 'GET' } }));

  console.log('\n[agent] validate_workflow');
  console.log(await call('validate_workflow'));

  console.log('\n[agent] execute_workflow');
  console.log(await call('execute_workflow', { input: { dryRun: true } }));

  console.log('\n[agent] get_workflow_status (final canvas state)');
  console.log(await call('get_workflow_status'));

  await page.screenshot({ path: '/tmp/agentflow-agent-result.png', fullPage: false });
  console.log('\n=== AGENT SESSION END ===');
  console.log('screenshot -> /tmp/agentflow-agent-result.png');
  await browser.close();
})().catch((e) => {
  console.error('AGENT ERROR:', e);
  process.exit(1);
});
