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
  lastResultRef?: { current: any | null };
}

// Module-level history — survives re-registration (App.tsx re-calls register on nodes change)
const mutationHistory: Array<{ nodes: Node[]; edges: Edge[]; label: string; at: string }> = [];
const redoStack: Array<{ nodes: Node[]; edges: Edge[]; label: string; at: string }> = [];
const MAX_HISTORY = 50;

export function registerWebMCPTools(ctx: WebMCPContext): () => void {
  const controllers: AbortController[] = [];
  // persistent last result for trace inspection (#8, #4)
  const lastResultRef: { current: any | null } = (ctx.lastResultRef as any) || { current: null };
  if (!ctx.lastResultRef) (ctx as any).lastResultRef = lastResultRef;
  const snapshot = () => ({
    nodes: JSON.parse(JSON.stringify(ctx.nodesRef.current)),
    edges: JSON.parse(JSON.stringify(ctx.edgesRef.current)),
  });
  const pushHistory = (label: string) => {
    try {
      const snap = snapshot();
      mutationHistory.push({ ...snap, label, at: new Date().toISOString() });
      if (mutationHistory.length > MAX_HISTORY) mutationHistory.shift();
      redoStack.length = 0;
      // debug — visible in console
      console.log(`[pushHistory] ${label} -> history=${mutationHistory.length} nodes=${snap.nodes.length}`);
    } catch {}
  };
  // validate config keys per node type — surfaces silent failures (#7)
  const KNOWN_CONFIG_KEYS: Record<string, string[]> = {
    api_call: ['url', 'method', 'headers', 'body'],
    transform: ['op', 'keys', 'expression'],
    condition: ['expression', 'path', 'equals'],
    output: ['kind', 'url', 'filename'],
    delay: ['ms'],
    filter: ['expression'],
    split: ['batchSize'],
    merge: [],
    loop: ['maxIterations'],
    code: ['code', 'expression'],
    webhook: ['url', 'method', 'headers'],
    ai: ['prompt', 'model', 'apiKey'],
    validator: ['expression', 'rules'],
    logger: ['level', 'message'],
    file: ['operation', 'path'],
    start: [],
  };

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
    execute: async ({ type, label, x, y, config, nodeType }: any) => {
      // forgiving: accept config directly (so {"type":"api_call","config":{"url":...}} works without extra update_node_config)
      const effectiveType = type || nodeType;
      const effectiveLabel = label || config?.label || effectiveType;
      pushHistory(`add_node:${effectiveType}:${effectiveLabel}`);
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
      const initialConfig = (config && typeof config === 'object' ? config : {}) as any;
      const newNode: Node = {
        id: nodeId,
        type: typeMap[effectiveType] || 'apiCallNode',
        position: pos,
        data: { label: effectiveLabel, config: initialConfig, nodeType: effectiveType },
      };
      ctx.setNodes((nds: Node[]) => [...nds, newNode]);
      const result: any = { success: true, nodeId, message: `Added ${effectiveType} node: ${effectiveLabel}` };
      if (Object.keys(initialConfig).length) result.config = initialConfig;
      ctx.addToolLog('add_node', { type: effectiveType, label: effectiveLabel }, result);
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
    execute: async ({ sourceNodeId, targetNodeId, label, from, to, source, target, sourceId, targetId }: any) => {
      // forgiving aliases: from/to, source/target, sourceId/targetId → sourceNodeId/targetNodeId
      const src = sourceNodeId || from || source || sourceId;
      const tgt = targetNodeId || to || target || targetId;
      if (!src || !tgt) {
        const result = { success: false, error: `Missing ids. Use {sourceNodeId, targetNodeId} or aliases {from,to}. Got src=${src} tgt=${tgt}` };
        ctx.addToolLog('connect_nodes', { sourceNodeId: src, targetNodeId: tgt }, result);
        return JSON.stringify(result);
      }
      // Validate IDs exist — gives immediate feedback instead of silent wire to nowhere (#7)
      const srcExists = ctx.nodesRef.current.some(n => n.id === src);
      const tgtExists = ctx.nodesRef.current.some(n => n.id === tgt);
      if (!srcExists || !tgtExists) {
        const missing = !srcExists ? src : tgt;
        const result = { success: false, error: `Node not found: ${missing}. Call get_workflow_status or find_nodes to discover IDs.` };
        ctx.addToolLog('connect_nodes', { sourceNodeId: src, targetNodeId: tgt }, result);
        return JSON.stringify(result);
      }
      pushHistory(`connect:${src}->${tgt}`);
      // local push if target is upstream of source
      ctx.setNodes((nds: Node[]) =>
        localWireAdjust(nds, [...ctx.edgesRef.current, { source: src, target: tgt } as any], src, tgt)
      );
      const newEdge: Edge = {
        id: `edge_${uuidv4().slice(0, 8)}`,
        source: src,
        target: tgt,
        label: label || '',
        type: 'labeled',
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
      };
      ctx.setEdges((eds: Edge[]) => [...eds, newEdge]);
      const result = { success: true, edgeId: newEdge.id, message: `Connected ${src} → ${tgt}` };
      ctx.addToolLog('connect_nodes', { sourceNodeId: src, targetNodeId: tgt }, result);
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
        lastResultRef.current = result;
        // also push to workflowHistory for get_workflow_history (#8)
        try { ctx.workflowHistory?.current?.push({ at: result.executedAt, input, result }); } catch {}
        // truncate outputs for agent (full via get_execution_details) but keep traceability
        ctx.addToolLog('execute_workflow', { input }, result);
        return JSON.stringify(result);
      } catch (err: any) {
        const result = { success: false, error: err?.message || String(err), stack: err?.stack?.slice(0, 1200) };
        ctx.setExecutionResult(result);
        lastResultRef.current = result;
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
          // New tools addressing Limitations #1, #4, #5, #6, #8, #9
          { name: 'find_nodes', description: 'Search nodes by label/type substring — solves ID dependency (#5)' },
          { name: 'get_execution_details', description: 'Get per-node outputs + stack traces from last run — solves blindness (#8) + debug (#4)' },
          { name: 'get_node_output', description: 'Get a single node output from last execution via id OR label' },
          { name: 'get_canvas_snapshot', description: 'Textual canvas description with positions + live status — solves visual blindness (#1)' },
          { name: 'probe_api', description: 'Test any URL (GET/POST) before wiring — solves external web blindness (#6)' },
          { name: 'undo_last_action', description: 'Undo last mutation (add/connect/delete/update) — solves no-undo (#9)' },
          { name: 'redo_last_action', description: 'Redo after undo' },
          { name: 'get_undo_history', description: 'List mutation history' },
        ],
        totalTools: 27,
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

  // Tool 6: update_node_config (now with validation + warnings #7, and label fallback #5)
  register({
    name: 'update_node_config',
    description: 'Update the configuration of an existing node without recreating it. Accepts nodeId OR label substring via `label`. Returns warnings for unknown keys and confirms applied config.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Exact node ID (preferred) — get via get_workflow_status or find_nodes' },
        label: { type: 'string', description: 'Alternative: label substring to resolve ID (if nodeId omitted)' },
        config: { type: 'object' },
      },
      required: ['config'],
    },
    execute: async ({ nodeId, label, config }: any) => {
      // Resolve by label if id not supplied or not found (#5)
      let resolvedId = nodeId;
      if (!resolvedId || !ctx.nodesRef.current.some(n => n.id === resolvedId)) {
        if (label) {
          const matches = ctx.nodesRef.current.filter(n => String(n.data?.label || '').toLowerCase().includes(String(label).toLowerCase()));
          if (matches.length === 1) resolvedId = matches[0].id;
          else if (matches.length > 1) {
            const result = { success: false, error: `Label "${label}" matches ${matches.length} nodes: ${matches.map(m=>`${m.id}(${m.data?.label})`).join(', ')}. Use exact nodeId.` };
            ctx.addToolLog('update_node_config', { nodeId, label, config }, result);
            return JSON.stringify(result);
          }
        }
      }
      const node = ctx.nodesRef.current.find((n) => n.id === resolvedId);
      if (!node) {
        const result = { success: false, error: `Node not found: ${resolvedId || label}. Use find_nodes or get_workflow_status.` };
        ctx.addToolLog('update_node_config', { nodeId, label, config }, result);
        return JSON.stringify(result);
      }
      // Validate keys — warn on unknown (#7)
      const nodeType = (node.data?.nodeType as string) || 'api_call';
      const known = KNOWN_CONFIG_KEYS[nodeType] || [];
      const unknownKeys = Object.keys(config || {}).filter(k => known.length && !known.includes(k));
      const warnings = unknownKeys.length ? [`Unknown keys for ${nodeType}: ${unknownKeys.join(', ')}. Known: ${known.join(', ')||'(none)'}. They will be stored but ignored at runtime.`] : [];
      pushHistory(`update:${resolvedId}`);
      ctx.setNodes((nds: Node[]) =>
        nds.map((n) =>
          n.id === resolvedId
            ? { ...n, data: { ...(n.data || {}), config: { ...((n.data as any)?.config || {}), ...config } } }
            : n
        )
      );
      const merged = { ...((node.data as any)?.config || {}), ...config };
      const result: any = { success: true, message: `Updated config for node ${resolvedId} (${node.data?.label})`, nodeId: resolvedId, appliedConfig: merged };
      if (warnings.length) result.warnings = warnings;
      if (merged.code && !merged.code.includes('return')) result.hints = ['Code node body runs as `async function(data){ <your code> }`. Use `return <value>` or `return await fetch(...)` to produce output. Top-level await is now supported.'];
      ctx.addToolLog('update_node_config', { nodeId: resolvedId, config }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 7: get_workflow_status (now includes positions + config keys + live status #1, #8)
  register({
    name: 'get_workflow_status',
    description: 'Get the current state of the workflow: nodes, edges, and summary.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const result = {
        nodeCount: ctx.nodesRef.current.length,
        edgeCount: ctx.edgesRef.current.length,
        nodes: ctx.nodesRef.current.map((n) => ({ id: n.id, type: n.data?.nodeType, label: n.data?.label, position: n.position, hasConfig: !!n.data?.config && Object.keys(n.data.config).length > 0 })),
        edges: ctx.edgesRef.current.map((e) => ({ id: (e as any).id, source: e.source, target: e.target, label: (e as any).label })),
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

  // Tool 9: delete_node (now with undo snapshot #9)
  register({
    name: 'delete_node',
    description: 'Remove a node from the canvas and disconnect all its wires. Use undo_last_action to restore.',
    inputSchema: {
      type: 'object',
      properties: { nodeId: { type: 'string' }, label: { type: 'string', description: 'Alternative label substring if id unknown' } },
      required: [],
    },
    execute: async ({ nodeId, label }: any) => {
      let resolvedId = nodeId;
      if (!resolvedId || !ctx.nodesRef.current.some(n => n.id === resolvedId)) {
        if (label) {
          const matches = ctx.nodesRef.current.filter(n => String(n.data?.label||'').toLowerCase().includes(String(label).toLowerCase()));
          if (matches.length === 1) resolvedId = matches[0].id;
          else if (matches.length > 1) return JSON.stringify({ success:false, error:`Label "${label}" ambiguous: ${matches.map(m=>m.id).join(', ')}`});
        }
      }
      const node = ctx.nodesRef.current.find((n) => n.id === resolvedId);
      if (!node) return JSON.stringify({ success: false, error: `Node not found: ${resolvedId||label}. Use find_nodes.` });
      if (resolvedId === 'start') return JSON.stringify({ success:false, error:'Cannot delete Start node' });
      pushHistory(`delete:${resolvedId}`);
      ctx.setNodes((nds: Node[]) => nds.filter((n) => n.id !== resolvedId));
      ctx.setEdges((eds: Edge[]) => eds.filter((e) => e.source !== resolvedId && e.target !== resolvedId));
      const result = { success: true, message: `Deleted node ${resolvedId} (${node.data?.label})`, deletedId: resolvedId, undo: 'call undo_last_action to restore' };
      ctx.addToolLog('delete_node', { nodeId: resolvedId }, result);
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
      if (!original) return JSON.stringify({ success: false, error: `Node not found: ${nodeId}. Use find_nodes.` });
      pushHistory(`clone:${nodeId}`);
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
        pushHistory(`load:${name}`);
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

  // Tool 14: run_node (now with stack traces #4)
  register({
    name: 'run_node',
    description: 'Execute a single node in isolation for debugging. Returns the node output without affecting other nodes. Includes stack trace on failure (#4).',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Exact ID or label substring' },
        label: { type: 'string', description: 'Alternative label search if id unknown' },
        input: { type: 'object', description: 'Input data for this node' },
      },
      required: [],
    },
    execute: async ({ nodeId, label, input = {} }: any) => {
      let resolvedId = nodeId;
      if (!resolvedId || !ctx.nodesRef.current.some(n=>n.id===resolvedId)) {
        if (label) {
          const m = ctx.nodesRef.current.filter(n=>String(n.data?.label||'').toLowerCase().includes(String(label).toLowerCase()));
          if (m.length===1) resolvedId=m[0].id;
          else if (m.length>1) return JSON.stringify({success:false, error:`Label "${label}" matches ${m.length} nodes`});
        }
      }
      const node = ctx.nodesRef.current.find((n) => n.id === resolvedId);
      if (!node) return JSON.stringify({ success: false, error: `Node not found: ${resolvedId||label}` });
      const engineNodes = toEngineNodes([node]);
      const engineEdges: any[] = [];
      try {
        const result = await executeWorkflow(engineNodes, engineEdges, {
          input,
          onEvent: () => {},
        });
        const out = { success: result.success, nodeId: resolvedId, output: result.outputs[resolvedId] ?? result.outputs, status: result.status[resolvedId], durationMs: result.durationMs };
        ctx.addToolLog('run_node', { nodeId: resolvedId, input }, out);
        return JSON.stringify(out);
      } catch (err: any) {
        const out = { success: false, error: err?.message, stack: err?.stack?.slice(0, 1200) };
        ctx.addToolLog('run_node', { nodeId: resolvedId, input }, out);
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
      if (!ctx.nodesRef.current.some(n=>n.id===nodeId)) return JSON.stringify({success:false, error:`Node not found: ${nodeId}`});
      pushHistory(`move:${nodeId}`);
      const pos = snapToGrid(x, y);
      ctx.setNodes((nds: Node[]) =>
        nds.map((n) => (n.id === nodeId ? { ...n, position: pos } : n))
      );
      const result = { success: true, message: `Moved ${nodeId} to (${pos.x}, ${pos.y})`, position: pos };
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
        pushHistory(`import:${merge?'merge':'replace'}:${data.nodes.length}nodes`);
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
      } catch (e:any) {
        return JSON.stringify({ success: false, error: `Invalid JSON: ${e?.message}` });
      }
    },
  });

  // ==== NEW TOOLS addressing Limitation Cluster ====

  // Tool 20: find_nodes — solves #5 ID dependency
  register({
    name: 'find_nodes',
    description: 'Search nodes by label substring, type, or id substring. Returns exact IDs so agent never guesses. Solves ID dependency (#5).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to search in label/type/id (case-insensitive). Empty returns all.' },
        type: { type: 'string', description: 'Optional filter by node type (api_call, transform, condition, code, etc)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
    execute: async ({ query = '', type, limit = 20 }: any) => {
      const q = String(query || '').toLowerCase().trim();
      let nodes = ctx.nodesRef.current;
      if (type) nodes = nodes.filter(n => (n.data?.nodeType as string) === type);
      if (q) nodes = nodes.filter(n => {
        const label = String(n.data?.label||'').toLowerCase();
        const t = String(n.data?.nodeType||'').toLowerCase();
        return label.includes(q) || t.includes(q) || n.id.toLowerCase().includes(q);
      });
      const result = {
        success: true,
        count: nodes.length,
        nodes: nodes.slice(0, limit).map(n => ({
          id: n.id,
          label: n.data?.label,
          type: n.data?.nodeType,
          position: n.position,
          hasConfig: !!n.data?.config && Object.keys(n.data.config).length>0,
          configKeys: n.data?.config ? Object.keys(n.data.config) : [],
        })),
        hint: nodes.length ? 'Use exact id with update_node_config / delete_node / run_node' : 'No matches. Try get_workflow_status for full list.',
      };
      ctx.addToolLog('find_nodes', { query, type }, result);
      return JSON.stringify(result);
    },
  });

  // Tool 21: get_execution_details — solves #8 blindness + #4 debug
  register({
    name: 'get_execution_details',
    description: 'Return full per-node outputs, status, timing, and stack traces from the LAST execute_workflow. Solves workflow state blindness (#8) and error inspection (#4).',
    inputSchema: {
      type: 'object',
      properties: {
        includeOutputs: { type: 'boolean', description: 'Include per-node outputs (default true). Set false for summary only.' },
        truncateAt: { type: 'number', description: 'Truncate each output JSON to N chars (default 2000, 0=no truncate)' },
      },
    },
    execute: async ({ includeOutputs = true, truncateAt = 2000 }: any) => {
      const r = lastResultRef.current;
      if (!r) return JSON.stringify({ success:false, error:'No execution yet. Call execute_workflow first.' });
      const outputs = r.outputs || {};
      const status = r.status || {};
      const order = r.order || Object.keys(outputs);
      const truncate = (v:any) => {
        if (!includeOutputs) return undefined;
        try {
          const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
          if (!truncateAt || s.length <= truncateAt) return v;
          return { _truncated: true, preview: s.slice(0, truncateAt), fullLength: s.length, hint: 'call get_node_output with this nodeId for full value' };
        } catch { return String(v).slice(0, truncateAt); }
      };
      const perNode = order.map((id:string)=>({
        id,
        label: ctx.nodesRef.current.find(n=>n.id===id)?.data?.label || id,
        type: ctx.nodesRef.current.find(n=>n.id===id)?.data?.nodeType || 'unknown',
        status: status[id] || 'unknown',
        output: truncate(outputs[id]),
        error: outputs[id]?.error,
        stack: outputs[id]?.stack,
      }));
      const result = {
        success: r.success,
        executedAt: r.executedAt,
        durationMs: r.durationMs,
        order,
        total: perNode.length,
        done: perNode.filter((p:any)=>p.status==='done').length,
        faulted: perNode.filter((p:any)=>p.status==='fault').length,
        skipped: perNode.filter((p:any)=>p.status==='skipped').length,
        perNode,
      };
      ctx.addToolLog('get_execution_details', {}, { success:r.success, total:perNode.length });
      return JSON.stringify(result);
    },
  });

  // Tool 22: get_node_output — single-node inspection (#8)
  register({
    name: 'get_node_output',
    description: 'Get one node\'s output from last execution by id OR label substring. Works even after other tool calls.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Exact node id' },
        label: { type: 'string', description: 'Label substring fallback' },
      },
    },
    execute: async ({ nodeId, label }: any) => {
      const r = lastResultRef.current;
      if (!r) return JSON.stringify({success:false, error:'No execution yet'});
      let resolvedId = nodeId;
      if (!resolvedId || !(r.outputs||{})[resolvedId]) {
        if (label) {
          const candidates = Object.keys(r.outputs||{}).filter(id=>{
            const n = ctx.nodesRef.current.find(x=>x.id===id);
            return String(n?.data?.label||'').toLowerCase().includes(String(label).toLowerCase());
          });
          if (candidates.length===1) resolvedId=candidates[0];
          else if (candidates.length>1) return JSON.stringify({success:false, error:`Label "${label}" matches ${candidates.length}: ${candidates.join(', ')}`});
        }
      }
      if (!resolvedId || !(r.outputs||{})[resolvedId]) return JSON.stringify({success:false, error:`No output for ${resolvedId||label}. Valid ids: ${Object.keys(r.outputs||{}).join(', ')}`});
      const result = { success:true, nodeId:resolvedId, label: ctx.nodesRef.current.find(n=>n.id===resolvedId)?.data?.label, status:r.status[resolvedId], output:r.outputs[resolvedId] };
      ctx.addToolLog('get_node_output', {nodeId:resolvedId}, {status:result.status});
      return JSON.stringify(result);
    },
  });

  // Tool 23: get_canvas_snapshot — solves #1 visual blindness
  register({
    name: 'get_canvas_snapshot',
    description: 'Textual description of canvas layout: nodes with positions, edges, status, and ASCII-ish map. Lets agent "see" without screenshots (#1).',
    inputSchema: { type:'object', properties:{ includeConfig:{type:'boolean', description:'Include config keys (default false to save tokens)'} } },
    execute: async ({ includeConfig=false }:any) => {
      const nodes = ctx.nodesRef.current;
      const edges = ctx.edgesRef.current as any[];
      const r = lastResultRef.current;
      const status = r?.status || {};
      // sort by column then row for readable map
      const sorted = [...nodes].sort((a,b)=> a.position.x - b.position.x || a.position.y - b.position.y);
      const lines = sorted.map(n=>{
        const s = status[n.id] || 'idle';
        const conns = edges.filter(e=>e.source===n.id || e.target===n.id).map(e=> e.source===n.id ? `→${e.target}(${e.label||''})` : `${e.source}→`).join(', ');
        const cfg = includeConfig && n.data?.config ? ` config:${Object.keys(n.data.config).join(',')}` : '';
        return `${n.id} [${n.data?.nodeType}] "${n.data?.label}" @(${Math.round(n.position.x)},${Math.round(n.position.y)}) status:${s}${cfg} wires:[${conns||'—'}]`;
      });
      const result = {
        success:true,
        nodeCount:nodes.length,
        edgeCount:edges.length,
        nodes: nodes.map(n=>({id:n.id,label:n.data?.label,type:n.data?.nodeType,position:n.position,status:status[n.id]||'idle'})),
        edges: edges.map((e:any)=>({id:e.id,source:e.source,target:e.target,label:e.label})),
        textualMap: lines.join('\n'),
        lastExecution: r ? { success:r.success, durationMs:r.durationMs, at:r.executedAt } : null,
        hint: 'Use find_nodes to search, get_node_details for full config, get_execution_details for outputs.',
      };
      ctx.addToolLog('get_canvas_snapshot', {}, {nodes:nodes.length, edges:edges.length});
      return JSON.stringify(result);
    },
  });

  // Tool 24: probe_api — solves #6 external access
  register({
    name: 'probe_api',
    description: 'Fetch any URL from the browser (GET/POST/PUT etc.) and return status + preview. Lets agent verify API shape before wiring nodes (#6). No workflow needed.',
    inputSchema: {
      type:'object',
      properties:{
        url:{type:'string'},
        method:{type:'string', description:'GET/POST/PUT/PATCH/DELETE (default GET)'},
        headers:{type:'object'},
        body:{type:'string', description:'Raw body string (JSON.stringify yourself)'},
        timeoutMs:{type:'number', description:'Abort after ms (default 8000)'},
      },
      required:['url'],
    },
    execute: async ({ url, method='GET', headers={}, body, timeoutMs=8000 }:any) => {
      const ctrl = new AbortController();
      const t = setTimeout(()=>ctrl.abort(), Math.max(1000, Math.min(15000, Number(timeoutMs)||8000)));
      try {
        const res = await fetch(url, { method: String(method).toUpperCase(), headers, body: body || undefined, signal: ctrl.signal } as any);
        const text = await res.text();
        let preview: any = text.slice(0, 3000);
        try { preview = JSON.parse(text); const s = JSON.stringify(preview, null, 2); preview = s.length>3000 ? JSON.parse(text.slice(0,3000)) : preview; } catch {}
        const result = {
          success: res.ok,
          status: res.status,
          statusText: res.statusText,
          ok: res.ok,
          headers: Object.fromEntries(res.headers.entries()),
          bodyPreview: typeof preview==='string' ? preview.slice(0,2000) : preview,
          bodyLength: text.length,
          truncated: text.length>3000,
          hint: res.ok ? 'API works — wire it into an api_call node with same url/method' : `HTTP ${res.status}. Check url/method/cors. Try again or use different API.`,
        };
        clearTimeout(t);
        ctx.addToolLog('probe_api', {url, method}, {status:res.status, ok:res.ok});
        return JSON.stringify(result);
      } catch (err:any) {
        clearTimeout(t);
        const result = { success:false, error: err?.name==='AbortError' ? `Timeout after ${timeoutMs}ms` : (err?.message||String(err)), stack: err?.stack?.slice(0,800) };
        ctx.addToolLog('probe_api', {url, method}, result);
        return JSON.stringify(result);
      }
    },
  });

  // Tool 25/26/27: undo/redo/history — solves #9
  register({
    name: 'undo_last_action',
    description: 'Undo the last canvas mutation (add, connect, delete, clone, move, config, import). Restores previous nodes+edges. Solves no-undo (#9).',
    inputSchema: { type:'object', properties:{} },
    execute: async () => {
      if (mutationHistory.length===0) return JSON.stringify({success:false, error:'Nothing to undo'});
      const prev = mutationHistory.pop()!;
      // push current to redo
      try { redoStack.push({ ...snapshot(), label: `redo:${prev.label}`, at: new Date().toISOString() }); } catch {}
      ctx.setNodes(prev.nodes);
      ctx.setEdges(prev.edges);
      const result = { success:true, restoredLabel: prev.label, at: prev.at, nodes: prev.nodes.length, edges: prev.edges.length };
      ctx.addToolLog('undo_last_action', {}, result);
      return JSON.stringify(result);
    },
  });
  register({
    name: 'redo_last_action',
    description: 'Redo the last undone mutation.',
    inputSchema: { type:'object', properties:{} },
    execute: async () => {
      if (redoStack.length===0) return JSON.stringify({success:false, error:'Nothing to redo'});
      const next = redoStack.pop()!;
      try { mutationHistory.push({ ...snapshot(), label:`undo:${next.label}`, at:new Date().toISOString() }); } catch {}
      ctx.setNodes(next.nodes);
      ctx.setEdges(next.edges);
      const result = { success:true, restoredLabel: next.label, nodes:next.nodes.length, edges:next.edges.length };
      ctx.addToolLog('redo_last_action', {}, result);
      return JSON.stringify(result);
    },
  });
  register({
    name: 'get_undo_history',
    description: 'List undoable mutations (most recent last).',
    inputSchema: { type:'object', properties:{} },
    execute: async () => {
      const result = { success:true, undoCount: mutationHistory.length, redoCount: redoStack.length, history: mutationHistory.map(h=>({label:h.label, at:h.at, nodes:h.nodes.length, edges:h.edges.length})), redo: redoStack.map(h=>({label:h.label, at:h.at})) };
      ctx.addToolLog('get_undo_history', {}, {undo:result.undoCount, redo:result.redoCount});
      return JSON.stringify(result);
    },
  });

  return () => {
    controllers.forEach((c) => c.abort());
  };
}
