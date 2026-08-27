const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

const workflows = new Map();
const executionLogs = new Map();
const tempKeys = new Map(); // judge self-serve temp keys (in-memory for local dev)

const TOOL_DEFINITIONS = [
  {
    name: 'add_node',
    description: 'Add a new node to the workflow canvas. Node types: api_call, transform, condition, output, delay',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['api_call', 'transform', 'condition', 'output', 'delay'] },
        label: { type: 'string', description: 'Display label for the node' },
        config: { type: 'object', description: 'Node-specific configuration' },
        position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }
      },
      required: ['type', 'label']
    }
  },
  {
    name: 'connect_nodes',
    description: 'Connect two nodes with a directed edge. Data flows from source to target.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceNodeId: { type: 'string' },
        targetNodeId: { type: 'string' },
        label: { type: 'string', description: 'Optional edge label describing the data flow' }
      },
      required: ['sourceNodeId', 'targetNodeId']
    }
  },
  {
    name: 'execute_workflow',
    description: 'Execute the current workflow. Runs all nodes in topological order, passing data between connected nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'ID of workflow to execute (uses current if omitted)' },
        input: { type: 'object', description: 'Initial input data for the workflow' }
      }
    }
  },
  {
    name: 'get_available_tools',
    description: 'List all available tool definitions and their schemas. Useful for discovering what the agent can do.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_node_details',
    description: 'Get detailed information about a specific node including its config, connections, and execution history.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'update_node_config',
    description: 'Update the configuration of an existing node without recreating it.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        config: { type: 'object', description: 'New configuration to merge' }
      },
      required: ['nodeId', 'config']
    }
  },
  {
    name: 'get_workflow_status',
    description: 'Get the current state of the workflow: nodes, edges, last execution result, and validation status.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'validate_workflow',
    description: 'Validate the workflow for errors: missing connections, invalid configs, circular dependencies.',
    inputSchema: { type: 'object', properties: {} }
  }
];

function createDefaultWorkflow() {
  const id = 'default';
  if (!workflows.has(id)) {
    workflows.set(id, { id, nodes: [], edges: [], createdAt: new Date().toISOString() });
  }
  return workflows.get(id);
}

function simulateNodeExecution(node, inputData) {
  const results = {
    api_call: { status: 'success', response: { data: `Simulated API response for: ${node.label}`, timestamp: new Date().toISOString() } },
    transform: { status: 'success', output: inputData, transformed: true },
    condition: { status: 'success', result: Math.random() > 0.5 ? 'true_branch' : 'false_branch', input: inputData },
    output: { status: 'success', delivered: true, payload: inputData },
    delay: { status: 'success', delayed: true, duration_ms: node.config?.duration || 1000 }
  };
  return results[node.type] || { status: 'unknown', nodeType: node.type };
}

function topologicalSort(nodes, edges) {
  const adj = {};
  const inDegree = {};
  nodes.forEach(n => { adj[n.id] = []; inDegree[n.id] = 0; });
  edges.forEach(e => { adj[e.source]?.push(e.target); inDegree[e.target] = (inDegree[e.target] || 0) + 1; });
  const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const sorted = [];
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);
    (adj[current] || []).forEach(neighbor => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }
  return sorted;
}

// WebMCP tool execution endpoint
app.post('/api/execute-tool', (req, res) => {
  const { tool, input } = req.body;
  const workflow = createDefaultWorkflow();

  try {
    let result;
    switch (tool) {
      case 'add_node': {
        const node = {
          id: `node_${uuidv4().slice(0, 8)}`,
          type: input.type,
          label: input.label,
          config: input.config || {},
          position: input.position || { x: 250, y: 150 },
          createdAt: new Date().toISOString()
        };
        workflow.nodes.push(node);
        result = { success: true, node, message: `Added ${input.type} node: ${input.label}` };
        break;
      }
      case 'connect_nodes': {
        const edge = {
          id: `edge_${uuidv4().slice(0, 8)}`,
          source: input.sourceNodeId,
          target: input.targetNodeId,
          label: input.label || '',
          animated: true
        };
        workflow.edges.push(edge);
        result = { success: true, edge, message: `Connected ${input.sourceNodeId} → ${input.targetNodeId}` };
        break;
      }
      case 'execute_workflow': {
        const order = topologicalSort(workflow.nodes, workflow.edges);
        const outputs = {};
        let data = input?.input || {};
        for (const nodeId of order) {
          const node = workflow.nodes.find(n => n.id === nodeId);
          if (node) {
            const nodeResult = simulateNodeExecution(node, data);
            outputs[nodeId] = nodeResult;
            data = nodeResult;
          }
        }
        const execId = uuidv4().slice(0, 8);
        const log = { id: execId, executedAt: new Date().toISOString(), order, outputs };
        executionLogs.set(execId, log);
        result = { success: true, executionId: execId, order, outputs };
        break;
      }
      case 'get_available_tools':
        result = { success: true, tools: TOOL_DEFINITIONS };
        break;
      case 'get_node_details': {
        const node = workflow.nodes.find(n => n.id === input.nodeId);
        if (!node) { result = { success: false, error: 'Node not found' }; break; }
        const connectedEdges = workflow.edges.filter(e => e.source === node.id || e.target === node.id);
        result = { success: true, node, connections: connectedEdges };
        break;
      }
      case 'update_node_config': {
        const node = workflow.nodes.find(n => n.id === input.nodeId);
        if (!node) { result = { success: false, error: 'Node not found' }; break; }
        node.config = { ...node.config, ...input.config };
        result = { success: true, node, message: `Updated config for ${node.label}` };
        break;
      }
      case 'get_workflow_status':
        result = { success: true, workflow: { id: workflow.id, nodeCount: workflow.nodes.length, edgeCount: workflow.edges.length, nodes: workflow.nodes, edges: workflow.edges } };
        break;
      case 'validate_workflow': {
        const errors = [];
        workflow.nodes.forEach(n => {
          if (!n.label) errors.push(`Node ${n.id} missing label`);
          if (!n.config || Object.keys(n.config).length === 0) errors.push(`Node ${n.label} has empty config`);
        });
        workflow.edges.forEach(e => {
          if (!workflow.nodes.find(n => n.id === e.source)) errors.push(`Edge ${e.id} references missing source ${e.source}`);
          if (!workflow.nodes.find(n => n.id === e.target)) errors.push(`Edge ${e.id} references missing target ${e.target}`);
        });
        const order = topologicalSort(workflow.nodes, workflow.edges);
        if (order.length !== workflow.nodes.length) errors.push('Circular dependency detected');
        result = { success: true, valid: errors.length === 0, errors };
        break;
      }
      default:
        result = { success: false, error: `Unknown tool: ${tool}` };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get workflow state
app.get('/api/workflow', (req, res) => {
  const workflow = createDefaultWorkflow();
  res.json(workflow);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', tools: TOOL_DEFINITIONS.length, uptime: process.uptime() });
});

// Judge temp-key self-serve (public, no auth) — local dev mirror of Cloudflare Worker
app.post('/api/judge/generate-temp-key', (req, res) => {
  const crypto = require('crypto');
  const label = String(req.body?.label || 'judge-temp').slice(0, 64);
  const ttlHours = Math.min(Math.max(Number(req.body?.ttlHours || 24), 1), 72);
  const raw = `${uuidv4()}-${Date.now()}-${Math.random()}-${label}`;
  const key = crypto.createHash('sha256').update(raw).digest('hex');
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  tempKeys.set(key, { id, key, label, ttlHours, expiresAt, uses: 0, createdAt: new Date().toISOString() });
  res.json({ success: true, key, id, label, ttlHours, expiresAt, verifyUrl: `/api/judge/verify?key=${key}`, demoUrl: `/?key=${key}&workflow=judge-demo` });
});
app.get('/api/judge/verify', (req, res) => {
  const key = String(req.query.key || req.headers['x-demo-key'] || '').trim();
  if (!key) return res.status(400).json({ valid: false, error: 'missing key' });
  // master demo key (same as cloudflare ACCESS_CODE) always valid
  const MASTER = '7c29f34ff320ed1dd8be77c9b0fa2c9e671062f7c613b0178b3e94ce0a132316';
  if (key === MASTER) return res.json({ valid: true, source: 'master', label: 'master-demo-key', expiresAt: null });
  const rec = tempKeys.get(key);
  if (!rec) return res.status(404).json({ valid: false, error: 'not found' });
  if (new Date(rec.expiresAt) < new Date()) return res.status(410).json({ valid: false, error: 'expired', expiresAt: rec.expiresAt });
  rec.uses += 1;
  res.json({ valid: true, source: 'temp', label: rec.label, expiresAt: rec.expiresAt, uses: rec.uses });
});
app.get('/api/judge/list', (req, res) => {
  const list = Array.from(tempKeys.values()).slice(-20).map(r => ({ id: r.id, label: r.label, key_prefix: r.key.slice(0, 8), expiresAt: r.expiresAt, uses: r.uses, createdAt: r.createdAt }));
  res.json({ keys: list });
});

// Serve frontend SPA for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AgentFlow backend running on port ${PORT}`);
});
