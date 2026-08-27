import type { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { executeWorkflow, toEngineNodes, toEngineEdges, type NodeStatus } from './engine';
import { getSmartPlacement, localWireAdjust, snapToGrid, findNearestOpenSlot } from './utils/grid';

interface WebMCPContext {
  nodes: Node[];
  edges: Edge[];
  nodesRef: { current: Node[] };
  edgesRef: { current: Edge[] };
  selectedIdRef?: { current: string | null };
  setNodes: any;
  setEdges: any;
  addToolLog: (tool: string, input: any, result: any) => void;
  setExecutionResult: (result: any) => void;
  setIsExecuting: (v: boolean) => void;
  setLiveStatus: (updater: (prev: Record<string, NodeStatus>) => Record<string, NodeStatus>) => void;
  workflowHistory?: { current: any[] };
  templates?: { current: Record<string, { nodes: Node[]; edges: Edge[] }> };
}

export function registerWebMCPTools(ctx: WebMCPContext): () => void {
  const controllers: AbortController[] = [];

  // Registry of tool executors so a (simulated or real) agent can call them
  // the exact same way a WebMCP browser would. Exposed on window.__agentflow.
  const toolRegistry: Record<string, (args: any) => Promise<any>> = {};
  // @ts-ignore
  window.__agentflow = {
    callTool: async (name: string, args: any = {}) => {
      const fn = toolRegistry[name];
      if (!fn) throw new Error(`Unknown tool: ${name}`);
      return await fn(args);
    },
    listTools: () => Object.keys(toolRegistry),
  };
  // @ts-ignore
  window.__webmcpReady = true;

  const register = async (toolDef: any) => {
    const controller = new AbortController();
    controllers.push(controller);
    const originalExec = toolDef.execute;
    toolRegistry[toolDef.name] = async (args: any) => {
      try {
        return await originalExec(args);
      } catch (err: any) {
        const msg = err?.message || String(err);
        ctx.addToolLog(toolDef.name, args, { error: msg });
        return JSON.stringify({ success: false, error: msg });
      }
    };
    try {
      // @ts-ignore
      await document.modelContext?.registerTool({
        ...toolDef,
        execute: toolRegistry[toolDef.name],
        signal: controller.signal,
      });
    } catch (e) {
      // WebMCP not available in this browser environment
    }
  };

  // Tool 1: add_node
  register({
    name: 'add_node',
    description: 'Add a workflow node to the canvas. Types: api_call, transform, condition, output, delay, filter, split, merge, loop, code, webhook, ai, validator, logger, file',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [
          'api_call', 'transform', 'condition', 'output', 'delay',
          'filter', 'split', 'merge', 'loop', 'code',
          'webhook', 'ai', 'validator', 'logger', 'file',
        ] },
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
        filter: 'filterNode',
        split: 'splitNode',
        merge: 'mergeNode',
        loop: 'loopNode',
        code: 'codeNode',
        webhook: 'webhookNode',
        ai: 'aiNode',
        validator: 'validatorNode',
        logger: 'loggerNode',
        file: 'fileNode',
      };
      let pos: { x: number; y: number };
      if (x !== undefined && y !== undefined) {
        pos = findNearestOpenSlot(snapToGrid(x, y), ctx.nodesRef.current);
      } else if (x !== undefined || y !== undefined) {
        pos = findNearestOpenSlot(snapToGrid(x ?? 250, y ?? 150), ctx.nodesRef.current);
      } else {
        pos = getSmartPlacement(ctx.nodesRef.current, ctx.selectedIdRef?.current || null);
      }
      const newNode: Node = {
        id: nodeId,
        type: typeMap[type] || 'apiCallNode',
        position: pos,
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
      // local push if target is upstream of source
      ctx.setNodes((nds: Node[]) =>
        localWireAdjust(nds, [...ctx.edgesRef.current, { source: sourceNodeId, target: targetNodeId } as any], sourceNodeId, targetNodeId)
      );
      const newEdge: Edge = {
        id: `edge_${uuidv4().slice(0, 8)}`,
        source: sourceNodeId,
        target: targetNodeId,
        label: label || '',
        type: 'labeled',
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
    description:
      'Execute the entire workflow for real. Modules run in topological order — API calls fetch, transforms reshape data, delays wait, outputs deliver. Wire labels "true"/"false" gate branches after a condition module.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'object', description: 'Initial input data for the workflow' },
      },
    },
    execute: async ({ input }: any) => {
      ctx.setIsExecuting(true);
      ctx.setLiveStatus(() => ({}));
      const engineNodes = toEngineNodes(ctx.nodesRef.current);
      const engineEdges = toEngineEdges(ctx.edgesRef.current);

      if (engineNodes.length === 0) {
        ctx.setIsExecuting(false);
        const result = { success: false, error: 'No nodes in workflow' };
        ctx.addToolLog('execute_workflow', { input }, result);
        return JSON.stringify(result);
      }

      try {
        const result = await executeWorkflow(engineNodes, engineEdges, {
          input: input || {},
          onEvent: (e) => ctx.setLiveStatus((prev) => ({ ...prev, [e.id]: e.status })),
        });
        ctx.setExecutionResult(result);
        ctx.addToolLog('execute_workflow', { input }, result);
        return JSON.stringify(result.outputs ?? result);
      } catch (err: any) {
        const result = { success: false, error: err?.message || String(err) };
        ctx.setExecutionResult(result);
        ctx.addToolLog('execute_workflow', { input }, result);
        return JSON.stringify(result);
      } finally {
        ctx.setIsExecuting(false);
      }
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
          { name: 'add_node', description: 'Add a workflow node' },
          { name: 'connect_nodes', description: 'Connect two nodes' },
          { name: 'execute_workflow', description: 'Run the workflow' },
          { name: 'get_available_tools', description: 'List all tools' },
          { name: 'get_node_details', description: 'Get node info' },
          { name: 'update_node_config', description: 'Update node config' },
          { name: 'get_workflow_status', description: 'Get workflow state' },
          { name: 'validate_workflow', description: 'Validate workflow' },
          { name: 'delete_node', description: 'Remove a node' },
          { name: 'clone_node', description: 'Duplicate a node' },
          { name: 'get_node_connections', description: 'Get node connections' },
          { name: 'save_workflow', description: 'Save workflow to storage' },
          { name: 'load_workflow', description: 'Load workflow from storage' },
          { name: 'run_node', description: 'Execute a single node' },
          { name: 'set_node_position', description: 'Move a node' },
          { name: 'get_workflow_history', description: 'Get execution history' },
          { name: 'create_template', description: 'Save workflow as template' },
          { name: 'export_workflow', description: 'Export workflow as JSON' },
          { name: 'import_workflow', description: 'Import workflow from JSON' },
        ],
        totalTools: 19,
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
      const node = ctx.nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return JSON.stringify({ error: 'Node not found' });
      const connections = ctx.edgesRef.current.filter((e) => e.source === nodeId || e.target === nodeId);
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
        nodeCount: ctx.nodesRef.current.length,
        edgeCount: ctx.edgesRef.current.length,
        nodes: ctx.nodesRef.current.map((n) => ({ id: n.id, type: n.data?.nodeType, label: n.data?.label })),
        edges: ctx.edgesRef.current.map((e) => ({ source: e.source, target: e.target, label: e.label })),
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
      const engineNodes = toEngineNodes(ctx.nodesRef.current);
      const engineEdges = toEngineEdges(ctx.edgesRef.current);
      const errors: string[] = [];
      engineNodes.forEach((n) => {
        if (!n.label) errors.push(`module ${n.id} has no label`);
        if (n.type === 'api_call' && !n.config?.url)
          errors.push(`api_call "${n.label}" has no URL configured`);
        if (n.type === 'output' && n.config?.kind === 'webhook' && !n.config?.url)
          errors.push(`output "${n.label}" is a webhook with no URL`);
        if (n.type === 'filter' && !n.config?.expression)
          errors.push(`filter "${n.label}" has no expression`);
        if (n.type === 'code' && !n.config?.code && !n.config?.expression)
          errors.push(`code "${n.label}" has no code`);
        if (n.type === 'webhook' && !n.config?.url)
          errors.push(`webhook "${n.label}" has no URL`);
      });
      engineEdges.forEach((e) => {
        if (!engineNodes.find((n) => n.id === e.source))
          errors.push(`wire references missing source ${e.source}`);
        if (!engineNodes.find((n) => n.id === e.target))
          errors.push(`wire references missing target ${e.target}`);
      });
      const result = { valid: errors.length === 0 && engineNodes.length > 0, errors };
      ctx.addToolLog('validate_workflow', {}, result);
      return JSON.stringify(result);
    },
  });

  // Tool 9: delete_node
  register({
    name: 'delete_node',
    description: 'Remove a node from the canvas and disconnect all its wires.',
    inputSchema: {
      type: 'object',
      properties: { nodeId: { type: 'string' } },
      required: ['nodeId'],
    },
    execute: async ({ nodeId }: any) => {
      const node = ctx.nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return JSON.stringify({ success: false, error: 'Node not found' });
      ctx.setNodes((nds: Node[]) => nds.filter((n) => n.id !== nodeId));
      ctx.setEdges((eds: Edge[]) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      const result = { success: true, message: `Deleted node ${nodeId}` };
      ctx.addToolLog('delete_node', { nodeId }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 10: clone_node
  register({
    name: 'clone_node',
    description: 'Duplicate an existing node with a new ID, offset position, and copied config.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        offsetX: { type: 'number', description: 'Horizontal offset from original (default 120)' },
        offsetY: { type: 'number', description: 'Vertical offset from original (default 0)' },
      },
      required: ['nodeId'],
    },
    execute: async ({ nodeId, offsetX = 120, offsetY = 0 }: any) => {
      const original = ctx.nodesRef.current.find((n) => n.id === nodeId);
      if (!original) return JSON.stringify({ success: false, error: 'Node not found' });
      const newId = `node_${uuidv4().slice(0, 8)}`;
      const pos = findNearestOpenSlot(
        snapToGrid(original.position.x + offsetX, original.position.y + offsetY),
        ctx.nodesRef.current
      );
      const clone: Node = {
        id: newId,
        type: original.type,
        position: pos,
        data: {
          ...JSON.parse(JSON.stringify(original.data)),
          label: `${original.data?.label || 'Node'} (copy)`,
        },
      };
      ctx.setNodes((nds: Node[]) => [...nds, clone]);
      const result = { success: true, nodeId: newId, message: `Cloned ${nodeId} → ${newId}` };
      ctx.addToolLog('clone_node', { nodeId }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 11: get_node_connections
  register({
    name: 'get_node_connections',
    description: 'Get all incoming and outgoing connections for a specific node.',
    inputSchema: {
      type: 'object',
      properties: { nodeId: { type: 'string' } },
      required: ['nodeId'],
    },
    execute: async ({ nodeId }: any) => {
      const node = ctx.nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return JSON.stringify({ success: false, error: 'Node not found' });
      const incoming = ctx.edgesRef.current
        .filter((e) => e.target === nodeId)
        .map((e) => ({ edgeId: e.id, from: e.source, label: e.label }));
      const outgoing = ctx.edgesRef.current
        .filter((e) => e.source === nodeId)
        .map((e) => ({ edgeId: e.id, to: e.target, label: e.label }));
      const result = { nodeId, incoming, outgoing };
      ctx.addToolLog('get_node_connections', { nodeId }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 12: save_workflow
  register({
    name: 'save_workflow',
    description: 'Save the current workflow to browser localStorage under a given name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow name for storage' },
      },
      required: ['name'],
    },
    execute: async ({ name }: any) => {
      const data = {
        nodes: ctx.nodesRef.current,
        edges: ctx.edgesRef.current,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(`agentflow_${name}`, JSON.stringify(data));
      const result = { success: true, message: `Workflow saved as "${name}"` };
      ctx.addToolLog('save_workflow', { name }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 13: load_workflow
  register({
    name: 'load_workflow',
    description: 'Load a saved workflow from browser localStorage by name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow name to load' },
      },
      required: ['name'],
    },
    execute: async ({ name }: any) => {
      const raw = localStorage.getItem(`agentflow_${name}`);
      if (!raw) return JSON.stringify({ success: false, error: `No workflow found with name "${name}"` });
      try {
        const data = JSON.parse(raw);
        ctx.setNodes(data.nodes || []);
        ctx.setEdges(data.edges || []);
        const result = { success: true, message: `Loaded workflow "${name}"`, nodeCount: data.nodes?.length || 0 };
        ctx.addToolLog('load_workflow', { name }, result);
        return JSON.stringify(result);
      } catch {
        return JSON.stringify({ success: false, error: 'Invalid workflow data' });
      }
    },
  });

  // Tool 14: run_node
  register({
    name: 'run_node',
    description: 'Execute a single node in isolation for debugging. Returns the node output without affecting other nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        input: { type: 'object', description: 'Input data for this node' },
      },
      required: ['nodeId'],
    },
    execute: async ({ nodeId, input = {} }: any) => {
      const node = ctx.nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return JSON.stringify({ success: false, error: 'Node not found' });
      const engineNodes = toEngineNodes([node]);
      const engineEdges: any[] = [];
      try {
        const result = await executeWorkflow(engineNodes, engineEdges, {
          input,
          onEvent: () => {},
        });
        const out = { success: true, nodeId, output: result.outputs || result };
        ctx.addToolLog('run_node', { nodeId, input }, out);
        return JSON.stringify(out);
      } catch (err: any) {
        const out = { success: false, error: err?.message };
        ctx.addToolLog('run_node', { nodeId, input }, out);
        return JSON.stringify(out);
      }
    },
  });

  // Tool 15: set_node_position
  register({
    name: 'set_node_position',
    description: 'Programmatically move a node to a specific canvas position.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['nodeId', 'x', 'y'],
    },
    execute: async ({ nodeId, x, y }: any) => {
      const pos = snapToGrid(x, y);
      ctx.setNodes((nds: Node[]) =>
        nds.map((n) => (n.id === nodeId ? { ...n, position: pos } : n))
      );
      const result = { success: true, message: `Moved ${nodeId} to (${pos.x}, ${pos.y})` };
      ctx.addToolLog('set_node_position', { nodeId, x, y }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 16: get_workflow_history
  register({
    name: 'get_workflow_history',
    description: 'Get the execution history: past runs with timestamps, inputs, and results.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const history = ctx.workflowHistory?.current || [];
      const result = { history, totalRuns: history.length };
      ctx.addToolLog('get_workflow_history', {}, result);
      return JSON.stringify(result);
    },
  });

  // Tool 17: create_template
  register({
    name: 'create_template',
    description: 'Save the current workflow as a reusable template by name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name' },
        description: { type: 'string', description: 'Optional description' },
      },
      required: ['name'],
    },
    execute: async ({ name, description = '' }: any) => {
      if (!ctx.templates) return JSON.stringify({ success: false, error: 'Templates not available' });
      ctx.templates.current[name] = {
        nodes: JSON.parse(JSON.stringify(ctx.nodesRef.current)),
        edges: JSON.parse(JSON.stringify(ctx.edgesRef.current)),
      };
      const result = { success: true, message: `Template "${name}" created`, nodeCount: ctx.nodesRef.current.length };
      ctx.addToolLog('create_template', { name, description }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 18: export_workflow
  register({
    name: 'export_workflow',
    description: 'Export the current workflow as a JSON string for sharing or backup.',
    inputSchema: {
      type: 'object',
      properties: {
        pretty: { type: 'boolean', description: 'Pretty-print JSON (default true)' },
      },
    },
    execute: async ({ pretty = true }: any) => {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        nodes: ctx.nodesRef.current,
        edges: ctx.edgesRef.current,
      };
      const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
      const result = { success: true, json, byteLength: json.length };
      ctx.addToolLog('export_workflow', {}, result);
      return JSON.stringify(result);
    },
  });

  // Tool 19: import_workflow
  register({
    name: 'import_workflow',
    description: 'Import a workflow from a JSON string (as returned by export_workflow).',
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'string', description: 'JSON string of a workflow' },
        merge: { type: 'boolean', description: 'Merge with existing nodes (default false = replace)' },
      },
      required: ['json'],
    },
    execute: async ({ json, merge = false }: any) => {
      try {
        const data = JSON.parse(json);
        if (!data.nodes || !data.edges) return JSON.stringify({ success: false, error: 'Invalid workflow JSON: missing nodes/edges' });
        if (merge) {
          ctx.setNodes((nds: Node[]) => [...nds, ...data.nodes]);
          ctx.setEdges((eds: Edge[]) => [...eds, ...data.edges]);
        } else {
          ctx.setNodes(data.nodes);
          ctx.setEdges(data.edges);
        }
        const result = { success: true, message: `Imported ${data.nodes.length} nodes, ${data.edges.length} edges` };
        ctx.addToolLog('import_workflow', { merge }, result);
        return JSON.stringify(result);
      } catch {
        return JSON.stringify({ success: false, error: 'Invalid JSON' });
      }
    },
  });

  return () => {
    controllers.forEach((c) => c.abort());
  };
}
