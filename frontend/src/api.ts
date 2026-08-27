const API_BASE = 'https://agentflow.parithosh.workers.dev';

function getToken(): string | null {
  return localStorage.getItem('agentflow_token');
}

function setToken(token: string) {
  localStorage.setItem('agentflow_token', token);
}

function clearToken() {
  localStorage.removeItem('agentflow_token');
}

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// ---- Auth ----

export interface User {
  id: string;
  username: string;
  email: string;
}

export async function register(username: string, email: string, password: string): Promise<{ user: User; token: string }> {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
  setToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export function logout() {
  clearToken();
}

export async function getMe(): Promise<{ user: User }> {
  return request('/api/auth/me');
}

// ---- Workflows ----

export interface Workflow {
  id: string;
  name: string;
  nodes: any[];
  edges: any[];
  created_at: string;
  updated_at: string;
}

export async function listWorkflows(): Promise<Workflow[]> {
  const data = await request('/api/workflows');
  return data.workflows || data;
}

export async function getWorkflow(id: string): Promise<Workflow> {
  return request(`/api/workflows/${id}`);
}

export async function createWorkflow(name: string, nodes: any[], edges: any[]): Promise<Workflow> {
  return request('/api/workflows', {
    method: 'POST',
    body: JSON.stringify({ name, nodes, edges }),
  });
}

export async function updateWorkflow(id: string, name: string, nodes: any[], edges: any[]): Promise<Workflow> {
  return request(`/api/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, nodes, edges }),
  });
}

export async function deleteWorkflow(id: string): Promise<void> {
  await request(`/api/workflows/${id}`, { method: 'DELETE' });
}

// ---- Templates ----

export interface Template {
  id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  created_at: string;
}

export async function listTemplates(): Promise<Template[]> {
  const data = await request('/api/templates');
  return data.templates || data;
}

export async function createTemplate(name: string, description: string, nodes: any[], edges: any[]): Promise<Template> {
  return request('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ name, description, nodes, edges }),
  });
}

// ---- Execute ----

export async function executeWorkflowAPI(nodes: any[], edges: any[], input?: any): Promise<any> {
  return request('/api/execute', {
    method: 'POST',
    body: JSON.stringify({ nodes, edges, input }),
  });
}
