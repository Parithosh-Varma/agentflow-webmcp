import type { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { executeWorkflowClient, validateWorkflowClient } from './engine';

interface WebMCPContext {
  nodes: Node[];
  edges: Edge[];
  setNodes: any;
  setEdges: any;
  addToolLog: (tool: string, input: any, result: any) => void;
  setExecutionResult: (result: any) => void;
  setIsExecuting: (v: boolean) => void;
}

function toEngineNodes(nodes: Node[]) {
  return nodes.map((n) => ({
    id: n.id,
    type: (n.data?.nodeType as string) || 'api_call',
    label: (n.data?.label as string) || 'Untitled',
    config: (n.data?.config as any) || {},
    position: n.position,
  }));
}

function toEngineEdges(edges: Edge[]) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.label as string) || '',
  }));
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
      // WebMCP not available in this browser environment
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
        position: { x: x ?? 250 + ctx.nodes.length * 60, y: y ?? 150 + ctx.nodes.length * 40 },
        data: { label, config: {}, nodeType: type },
      };
      ctx.setNodes((nds: Node[]) => [...nds, newNode]);
      const result = { success: true, nodeId, message: `Added ${type} node: ${label}` };
      ctx.addToolLog('add_node', { type, label }, result);
      return JSON.stringify(result);
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
      const result = { success: true, edgeId: newEdge.id, message: `Connected ${sourceNodeId} → ${targetNodeId}` };
      ctx.addToolLog('connect_nodes', { sourceNodeId, targetNodeId }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 3: execute_workflow
  register({
    name: 'execute_workflow',
    description: 'Execute the entire workflow. Runs all nodes in topological order, passing data between connected nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'object', description: 'Initial input data for the workflow' },
      },
    },
    execute: async ({ input }: any) => {
      ctx.setIsExecuting(true);
      const engineNodes = toEngineNodes(ctx.nodes);
      const engineEdges = toEngineEdges(ctx.edges);

      if (engineNodes.length === 0) {
        ctx.setIsExecuting(false);
        const result = { success: false, error: 'No nodes in workflow' };
        ctx.addToolLog('execute_workflow', { input }, result);
        return JSON.stringify(result);
      }

      // Simulate brief delay for visual feedback
      await new Promise((r) => setTimeout(r, 500));

      const result = executeWorkflowClient(engineNodes, engineEdges, input || {});
      ctx.setExecutionResult(result);
      ctx.setIsExecuting(false);
      ctx.addToolLog('execute_workflow', { input }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 4: get_available_tools
  register({
    name: 'get_available_tools',
    description: 'List all available WebMCP tools and their schemas. Use this to discover what the agent can do.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const result = {
        success: true,
        tools: [
          { name: 'add_node', description: 'Add a workflow node', inputCount: 3 },
          { name: 'connect_nodes', description: 'Connect two nodes', inputCount: 3 },
          { name: 'execute_workflow', description: 'Run the workflow', inputCount: 1 },
          { name: 'get_available_tools', description: 'List all tools', inputCount: 0 },
          { name: 'get_node_details', description: 'Get node info', inputCount: 1 },
          { name: 'update_node_config', description: 'Update node config', inputCount: 2 },
          { name: 'get_workflow_status', description: 'Get workflow state', inputCount: 0 },
          { name: 'validate_workflow', description: 'Validate workflow', inputCount: 0 },
        ],
        totalTools: 8,
      };
      ctx.addToolLog('get_available_tools', {}, result);
      return JSON.stringify(result);
    },
  });

  // Tool 5: get_node_details
  register({
    name: 'get_node_details',
    description: 'Get detailed information about a specific node on the canvas.',
    inputSchema: {
      type: 'object',
      properties: { nodeId: { type: 'string' } },
      required: ['nodeId'],
    },
    execute: async ({ nodeId }: any) => {
      const node = ctx.nodes.find((n) => n.id === nodeId);
      if (!node) return JSON.stringify({ error: 'Node not found' });
      const connections = ctx.edges.filter((e) => e.source === nodeId || e.target === nodeId);
      const result = {
        node: { id: node.id, type: node.data?.nodeType, label: node.data?.label, config: node.data?.config },
        connections: connections.map((e) => ({ source: e.source, target: e.target, label: e.label })),
      };
      ctx.addToolLog('get_node_details', { nodeId }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 6: update_node_config
  register({
    name: 'update_node_config',
    description: 'Update the configuration of an existing node without recreating it.',
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
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...(n.data || {}), config: { ...((n.data as any)?.config || {}), ...config } } }
            : n
        )
      );
      const result = { success: true, message: `Updated config for node ${nodeId}` };
      ctx.addToolLog('update_node_config', { nodeId, config }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 7: get_workflow_status
  register({
    name: 'get_workflow_status',
    description: 'Get the current state of the workflow: nodes, edges, and summary.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const result = {
        nodeCount: ctx.nodes.length,
        edgeCount: ctx.edges.length,
        nodes: ctx.nodes.map((n) => ({ id: n.id, type: n.data?.nodeType, label: n.data?.label })),
        edges: ctx.edges.map((e) => ({ source: e.source, target: e.target, label: e.label })),
      };
      ctx.addToolLog('get_workflow_status', {}, result);
      return JSON.stringify(result);
    },
  });

  // Tool 8: validate_workflow
  register({
    name: 'validate_workflow',
    description: 'Validate the workflow for errors: missing connections, invalid configs, circular dependencies.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const engineNodes = toEngineNodes(ctx.nodes);
      const engineEdges = toEngineEdges(ctx.edges);
      const result = validateWorkflowClient(engineNodes, engineEdges);
      ctx.addToolLog('validate_workflow', {}, result);
      return JSON.stringify(result);
    },
  });

  return () => {
    controllers.forEach((c) => c.abort());
  };
}
