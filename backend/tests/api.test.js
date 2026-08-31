import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

let server;
const BASE = 'http://localhost:3002';

// Server already running on 3002 (verified via curl in setup)
beforeAll(async () => {
  // Verify server is reachable
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (!res.ok) throw new Error('Server not responding');
  } catch {
    throw new Error('Backend server not running on port 3002. Start it with: cd backend && PORT=3002 node index.js');
  }
});

afterAll(() => {
  // No child process to kill - server started externally
});

describe('backend: custom nodes', () => {
  it('should create, execute, and delete custom node', async () => {
    const create = await fetch(`${BASE}/api/execute-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'create_custom_node', input: { type: 'custom_test_vitest', displayName: 'Test Vitest', code: 'return { v: data.value * 2 }' } })
    }).then(r=>r.json());
    expect(create.success).toBe(true);

    const add = await fetch(`${BASE}/api/execute-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'add_node', input: { type: 'custom_test_vitest', label: 't' } })
    }).then(r=>r.json());
    expect(add.success).toBe(true);

    const run = await fetch(`${BASE}/api/execute-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'run_node', input: { nodeId: add.nodeId, input: { value: 5 } } })
    }).then(r=>r.json());
    expect(run.success).toBe(true);
    expect(run.output.v).toBe(10);

    await fetch(`${BASE}/api/execute-tool`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'delete_node', input: { nodeId: add.nodeId } }) });
    await fetch(`${BASE}/api/execute-tool`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'delete_custom_node', input: { type: 'custom_test_vitest' } }) });
  });

  it('should block dangerous code', async () => {
    const bad = await fetch(`${BASE}/api/execute-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'create_custom_node', input: { type: 'custom_bad', code: 'while(true){}' } })
    }).then(r=>r.json());
    expect(bad.success).toBe(false);
    expect(bad.error).toMatch(/blocked/);
  });
});
