import type { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

const API_URL = import.meta.env.VITE_API_URL || '';

interface WebMCPContext {
  nodes: Node[];
  edges: Edge[];
  setNodes: any;
  setEdges: any;
  addToolLog: (tool: string, input: any, result: any) => void;
  setExecutionResult: (result: any) => void;
  setIsExecuting: (v: boolean) => void;
}

function toBackendNode(node: Node) {
  const typeMap: Record<string, string> = {
    apiCallNode: 'api_call',
    transformNode: 'transform',
    conditionNode: 'condition',
    outputNode: 'output',
    delayNode: 'delay',
    startNode: 'api_call',
  };
  return {
    id: node.id,
    type: typeMap[node.type || ''] || 'api_call',
    label: node.data?.label || 'Untitled',
    config: node.data?.config || {},
    position: node.position,
  };
}

async function callTool(tool: string, input: any) {
  const res = await fetch(`${API_URL}/api/execute-tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  return res.json();
}

export function registerWebMCPTools(ctx: WebMCPContext): () => void {
  const controllers: AbortController[] = [];

  const register = async (toolDef: any) => {
    const controller = new AbortController();
    controllers.push(controller);
    try {
      // @ts-ignore
      await document.modelContext?.registerTool({
        ...toolDef,
        signal: controller.signal,
      });
    } catch (e) {
      // WebMCP not available in this environment
    }
  };

  // Tool 1: add_node
  register({
    name: 'add_node',
    description: 'Add a workflow node to the canvas. Types: api_call, transform, condition, output, delay',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['api_call', 'transform', 'condition', 'output', 'delay'] },
        label: { type: 'string' },
        x: { type: 'number', description: 'X position on canvas' },
        y: { type: 'number', description: 'Y position on canvas' },
      },
      required: ['type', 'label'],
    },
    execute: async ({ type, label, x, y }: any) => {
      const nodeId = `node_${uuidv4().slice(0, 8)}`;
      const typeMap: Record<string, string> = {
        api_call: 'apiCallNode',
        transform: 'transformNode',
        condition: 'conditionNode',
        output: 'outputNode',
        delay: 'delayNode',
      };
      const newNode: Node = {
        id: nodeId,
        type: typeMap[type] || 'apiCallNode',
        position: { x: x ?? 250 + ctx.nodes.length * 50, y: y ?? 150 + ctx.nodes.length * 30 },
        data: { label, config: {}, nodeType: type },
      };
      ctx.setNodes((nds: Node[]) => [...nds, newNode]);

      const result = await callTool('add_node', { type, label, position: newNode.position });
      ctx.addToolLog('add_node', { type, label }, result);
      return JSON.stringify({ success: true, nodeId, message: `Added ${type} node: ${label}` });
    },
  });

  // Tool 2: connect_nodes
  register({
    name: 'connect_nodes',
    description: 'Connect two nodes with a directed edge. Data flows from source to target.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceNodeId: { type: 'string' },
        targetNodeId: { type: 'string' },
        label: { type: 'string' },
      },
      required: ['sourceNodeId', 'targetNodeId'],
    },
    execute: async ({ sourceNodeId, targetNodeId, label }: any) => {
      const newEdge: Edge = {
        id: `edge_${uuidv4().slice(0, 8)}`,
        source: sourceNodeId,
        target: targetNodeId,
        label: label || '',
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
      };
      ctx.setEdges((eds: Edge[]) => [...eds, newEdge]);

      const result = await callTool('connect_nodes', { sourceNodeId, targetNodeId, label });
      ctx.addToolLog('connect_nodes', { sourceNodeId, targetNodeId }, result);
      return JSON.stringify({ success: true, edgeId: newEdge.id, message: `Connected ${sourceNodeId} → ${targetNodeId}` });
    },
  });

  // Tool 3: execute_workflow
  register({
    name: 'execute_workflow',
    description: 'Execute the entire workflow. Runs all nodes in topological order.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'object', description: 'Initial input data' },
      },
    },
    execute: async ({ input }: any) => {
      ctx.setIsExecuting(true);
      ctx.addToolLog('execute_workflow', { input }, { status: 'running' });

      // Sync current state to backend first
      for (const node of ctx.nodes) {
        await callTool('add_node', toBackendNode(node));
      }
      for (const edge of ctx.edges) {
        await callTool('connect_nodes', { sourceNodeId: edge.source, targetNodeId: edge.target, label: edge.label });
      }

      const result = await callTool('execute_workflow', { input: input || {} });
      ctx.setExecutionResult(result);
      ctx.setIsExecuting(false);
      ctx.addToolLog('execute_workflow', { input }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 4: get_available_tools
  register({
    name: 'get_available_tools',
    description: 'List all available WebMCP tools and their schemas.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const result = await callTool('get_available_tools', {});
      ctx.addToolLog('get_available_tools', {}, result);
      return JSON.stringify(result);
    },
  });

  // Tool 5: get_node_details
  register({
    name: 'get_node_details',
    description: 'Get detailed info about a specific node on the canvas.',
    inputSchema: {
      type: 'object',
      properties: { nodeId: { type: 'string' } },
      required: ['nodeId'],
    },
    execute: async ({ nodeId }: any) => {
      const node = ctx.nodes.find(n => n.id === nodeId);
      if (!node) return JSON.stringify({ error: 'Node not found' });
      const connections = ctx.edges.filter(e => e.source === nodeId || e.target === nodeId);
      const result = { node: node.data, connections };
      ctx.addToolLog('get_node_details', { nodeId }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 6: update_node_config
  register({
    name: 'update_node_config',
    description: 'Update the configuration of an existing node.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        config: { type: 'object' },
      },
      required: ['nodeId', 'config'],
    },
    execute: async ({ nodeId, config }: any) => {
      ctx.setNodes((nds: Node[]) =>
        nds.map(n => n.id === nodeId ? { ...n, data: { ...(n.data || {}), config: { ...((n.data as any)?.config || {}), ...config } } } : n)
      );
      const result = await callTool('update_node_config', { nodeId, config });
      ctx.addToolLog('update_node_config', { nodeId, config }, result);
      return JSON.stringify({ success: true, message: `Updated config for node ${nodeId}` });
    },
  });

  // Tool 7: get_workflow_status
  register({
    name: 'get_workflow_status',
    description: 'Get current workflow state: nodes, edges, and summary.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const result = {
        nodeCount: ctx.nodes.length,
        edgeCount: ctx.edges.length,
        nodes: ctx.nodes.map(n => ({ id: n.id, type: n.type, label: n.data?.label })),
        edges: ctx.edges.map(e => ({ source: e.source, target: e.target, label: e.label })),
      };
      ctx.addToolLog('get_workflow_status', {}, result);
      return JSON.stringify(result);
    },
  });

  // Tool 8: validate_workflow
  register({
    name: 'validate_workflow',
    description: 'Validate the workflow for errors: missing connections, invalid configs, cycles.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const errors: string[] = [];
      ctx.nodes.forEach(n => {
        if (!n.data?.label) errors.push(`Node ${n.id} missing label`);
      });
      ctx.edges.forEach(e => {
        if (!ctx.nodes.find(n => n.id === e.source)) errors.push(`Edge references missing source ${e.source}`);
        if (!ctx.nodes.find(n => n.id === e.target)) errors.push(`Edge references missing target ${e.target}`);
      });
      const result = { valid: errors.length === 0, errors, nodeCount: ctx.nodes.length };
      ctx.addToolLog('validate_workflow', {}, result);
      return JSON.stringify(result);
    },
  });

  return () => {
    controllers.forEach(c => c.abort());
  };
}
