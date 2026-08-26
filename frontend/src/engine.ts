// Client-side workflow execution engine
// This allows the app to work without a backend for demo purposes

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config: any;
  position: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

function simulateNodeExecution(node: WorkflowNode, inputData: any) {
  const results: Record<string, any> = {
    api_call: {
      status: 'success',
      response: {
        data: `Simulated API response for: ${node.label}`,
        endpoint: node.config?.url || 'https://api.example.com/data',
        timestamp: new Date().toISOString(),
      },
    },
    transform: {
      status: 'success',
      input: inputData,
      output: typeof inputData === 'object' ? { ...inputData, transformed: true } : { value: inputData, transformed: true },
      transform: node.config?.transform || 'identity',
    },
    condition: {
      status: 'success',
      result: Math.random() > 0.5 ? 'true_branch' : 'false_branch',
      condition: node.config?.condition || 'always_true',
      input: inputData,
    },
    output: {
      status: 'success',
      delivered: true,
      payload: inputData,
      destination: node.config?.destination || 'console',
    },
    delay: {
      status: 'success',
      delayed: true,
      duration_ms: node.config?.duration || 1000,
    },
  };
  return results[node.type] || { status: 'unknown', nodeType: node.type };
}

function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
    inDegree[n.id] = 0;
  });
  edges.forEach((e) => {
    if (adj[e.source]) adj[e.source].push(e.target);
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  });
  const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    (adj[current] || []).forEach((neighbor) => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }
  return sorted;
}

export function executeWorkflowClient(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  input: any = {}
) {
  const order = topologicalSort(nodes, edges);
  const outputs: Record<string, any> = {};
  let data = input;

  for (const nodeId of order) {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      const nodeResult = simulateNodeExecution(node, data);
      outputs[nodeId] = nodeResult;
      data = nodeResult;
    }
  }

  return {
    success: true,
    executionId: `exec_${Date.now().toString(36)}`,
    executedAt: new Date().toISOString(),
    order,
    outputs,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

export function validateWorkflowClient(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const errors: string[] = [];
  nodes.forEach((n) => {
    if (!n.label) errors.push(`Node ${n.id} missing label`);
  });
  edges.forEach((e) => {
    if (!nodes.find((n) => n.id === e.source))
      errors.push(`Edge references missing source: ${e.source}`);
    if (!nodes.find((n) => n.id === e.target))
      errors.push(`Edge references missing target: ${e.target}`);
  });
  const order = topologicalSort(nodes, edges);
  if (order.length !== nodes.length) errors.push('Circular dependency detected');
  return { valid: errors.length === 0, errors, nodeCount: nodes.length };
}
