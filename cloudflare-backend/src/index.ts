// Cloudflare Workers have crypto.randomUUID() built-in

const ALLOWED_IPS = ['122.171.20.180', '2401:4900:894c:d56d:6db7:9211:c0ae:ec56'];

interface Env {
  DB: D1Database;
  AUTH: Fetcher;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface Workflow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  created_at: string;
  updated_at: string;
}

interface ExecutionLog {
  id: string;
  workflow_id: string;
  user_id: string;
  input: any;
  output: any;
  duration_ms: number;
  status: 'success' | 'error';
  executed_at: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      // Auth middleware - skip for public routes
      const publicRoutes = ['/api/health', '/api/auth/login', '/api/auth/register', '/api/stats'];
      const isPublicRoute = publicRoutes.some(route => path.startsWith(route));

      let userId: string | null = null;
      if (!isPublicRoute) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.slice(7);
          userId = await verifyToken(token, env.JWT_SECRET);
        }
        if (!userId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }
      }

      // Route handling
      if (path === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      // Stats route (IP-restricted)
      if (path === '/api/stats' && request.method === 'GET') {
        const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || '';
        if (!ALLOWED_IPS.includes(clientIp)) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...headers, 'Content-Type': 'application/json' },
          });
        }
        return await getStats(env, headers);
      }

      // Auth routes
      if (path === '/api/auth/register' && request.method === 'POST') {
        return await handleRegister(request, env, headers);
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env, headers);
      }
      if (path === '/api/auth/me' && request.method === 'GET') {
        return await handleMe(userId!, env, headers);
      }

      // Workflow routes
      if (path === '/api/workflows' && request.method === 'GET') {
        return await getWorkflows(userId!, env, headers);
      }
      if (path === '/api/workflows' && request.method === 'POST') {
        return await createWorkflow(request, userId!, env, headers);
      }
      if (path.match(/^\/api\/workflows\/[^/]+$/) && request.method === 'GET') {
        const id = path.split('/').pop()!;
        return await getWorkflow(id, userId!, env, headers);
      }
      if (path.match(/^\/api\/workflows\/[^/]+$/) && request.method === 'PUT') {
        const id = path.split('/').pop()!;
        return await updateWorkflow(request, id, userId!, env, headers);
      }
      if (path.match(/^\/api\/workflows\/[^/]+$/) && request.method === 'DELETE') {
        const id = path.split('/').pop()!;
        return await deleteWorkflow(id, userId!, env, headers);
      }

      // Execution routes
      if (path === '/api/execute' && request.method === 'POST') {
        return await executeWorkflow(request, userId!, env, headers);
      }
      if (path.match(/^\/api\/executions\/[^/]+$/) && request.method === 'GET') {
        const workflowId = path.split('/').pop()!;
        return await getExecutionLogs(workflowId, userId!, env, headers);
      }

      // Template routes
      if (path === '/api/templates' && request.method === 'GET') {
        return await getTemplates(userId!, env, headers);
      }
      if (path === '/api/templates' && request.method === 'POST') {
        return await createTemplate(request, userId!, env, headers);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
  },
};

// Auth helpers
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const [header, payload, signature] = token.split('.');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      Uint8Array.from(atob(signature), c => c.charCodeAt(0)),
      encoder.encode(`${header}.${payload}`)
    );
    if (!valid) return null;
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now() / 1000) return null;
    return data.sub;
  } catch {
    return null;
  }
}

async function createToken(userId: string, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 86400 }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

// Auth handlers
async function handleRegister(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const { email, password, name } = await request.json();
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)')
      .bind(id, email, name, passwordHash)
      .run();

    const token = await createToken(id, env.JWT_SECRET);
    return new Response(JSON.stringify({ user: { id, email, name }, token }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Email already exists' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}

async function handleLogin(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const { email, password } = await request.json();
  const passwordHash = await hashPassword(password);

  const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE email = ? AND password_hash = ?')
    .bind(email, passwordHash)
    .first<User>();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const token = await createToken(user.id, env.JWT_SECRET);
  return new Response(JSON.stringify({ user, token }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function handleMe(userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?')
    .bind(userId)
    .first<User>();

  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ user }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Workflow handlers
async function getWorkflows(userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const workflows = await env.DB.prepare('SELECT * FROM workflows WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(userId)
    .all<Workflow>();

  return new Response(JSON.stringify(workflows.results), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function createWorkflow(request: Request, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const { name, description, nodes, edges } = await request.json();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO workflows (id, user_id, name, description, nodes, edges) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, name, description || '', JSON.stringify(nodes || []), JSON.stringify(edges || []))
    .run();

  return new Response(JSON.stringify({ id, name, message: 'Workflow created' }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function getWorkflow(id: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const workflow = await env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<Workflow>();

  if (!workflow) {
    return new Response(JSON.stringify({ error: 'Workflow not found' }), {
      status: 404,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    ...workflow,
    nodes: JSON.parse(workflow.nodes as any),
    edges: JSON.parse(workflow.edges as any),
  }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function updateWorkflow(request: Request, id: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const { name, description, nodes, edges } = await request.json();

  await env.DB.prepare(
    'UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).bind(name, description || '', JSON.stringify(nodes || []), JSON.stringify(edges || []), id, userId)
    .run();

  return new Response(JSON.stringify({ message: 'Workflow updated' }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function deleteWorkflow(id: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  await env.DB.prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  return new Response(JSON.stringify({ message: 'Workflow deleted' }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Execution handlers
async function executeWorkflow(request: Request, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const { workflowId, input } = await request.json();

  const workflow = await env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?')
    .bind(workflowId, userId)
    .first<Workflow>();

  if (!workflow) {
    return new Response(JSON.stringify({ error: 'Workflow not found' }), {
      status: 404,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const nodes = JSON.parse(workflow.nodes as any);
  const edges = JSON.parse(workflow.edges as any);

  // Execute workflow logic here
  const result = { success: true, output: { message: 'Workflow executed', nodes: nodes.length } };
  const durationMs = Date.now() - startTime;

  // Log execution
  const logId = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO execution_logs (id, workflow_id, user_id, input, output, duration_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(logId, workflowId, userId, JSON.stringify(input), JSON.stringify(result), durationMs, 'success')
    .run();

  return new Response(JSON.stringify({ ...result, executionId: logId, durationMs }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function getExecutionLogs(workflowId: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const logs = await env.DB.prepare(
    'SELECT * FROM execution_logs WHERE workflow_id = ? AND user_id = ? ORDER BY executed_at DESC LIMIT 50'
  ).bind(workflowId, userId)
    .all<ExecutionLog>();

  return new Response(JSON.stringify(logs.results), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Template handlers
async function getTemplates(userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const templates = await env.DB.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all();

  return new Response(JSON.stringify(templates.results), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function createTemplate(request: Request, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const { name, description, nodes, edges } = await request.json();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO templates (id, user_id, name, description, nodes, edges) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, userId, name, description || '', JSON.stringify(nodes), JSON.stringify(edges))
    .run();

  return new Response(JSON.stringify({ id, name, message: 'Template created' }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Stats handler
async function getStats(env: Env, headers: Record<string, string>): Promise<Response> {
  const [
    users, workflows, executions, recentExecutions, templates,
    successCount, errorCount, avgDuration, uniqueWorkflowUsers,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM workflows').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM execution_logs').first<{ count: number }>(),
    env.DB.prepare(
      `SELECT id, workflow_id, status, duration_ms, executed_at
       FROM execution_logs ORDER BY executed_at DESC LIMIT 20`
    ).all<ExecutionLog>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM templates').first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM execution_logs WHERE status = 'success'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM execution_logs WHERE status = 'error'").first<{ count: number }>(),
    env.DB.prepare('SELECT AVG(duration_ms) as avg_ms FROM execution_logs').first<{ avg_ms: number }>(),
    env.DB.prepare('SELECT COUNT(DISTINCT user_id) as count FROM workflows').first<{ count: number }>(),
  ]);

  const execCount = executions?.count ?? 0;

  return new Response(JSON.stringify({
    users: users?.count ?? 0,
    workflows: workflows?.count ?? 0,
    executions: execCount,
    templates: templates?.count ?? 0,
    uniqueWorkflowUsers: uniqueWorkflowUsers?.count ?? 0,
    successRate: execCount
      ? Math.round(((successCount?.count ?? 0) / execCount) * 100)
      : 0,
    successCount: successCount?.count ?? 0,
    errorCount: errorCount?.count ?? 0,
    avgDurationMs: Math.round(avgDuration?.avg_ms ?? 0),
    recentExecutions: recentExecutions?.results ?? [],
    timestamp: new Date().toISOString(),
  }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
