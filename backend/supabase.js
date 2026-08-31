require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '';

let client = null;
function isEnabled() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}
function getClient() {
  if (!isEnabled()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

// Helper to ensure tables exist (called once)
async function ensureTables() {
  if (!isEnabled()) return;
  const sb = getClient();
  // We use a simple check: try to select, if fails, log
  try {
    const { error } = await sb.from('workflows').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.warn('[supabase] tables not found, run migration first');
    }
  } catch {}
}

module.exports = { isEnabled, getClient, ensureTables, SUPABASE_URL, SUPABASE_KEY, SUPABASE_JWT_SECRET };

// ---- DB helpers with Supabase fallback to file ----
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'workflows.json');
const CUSTOM_FILE = path.join(DATA_DIR, 'custom_nodes.json');

function ensureDataDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

// Workflows
async function dbLoadWorkflows(workflows, templates, nodeIndex, edgeIndex) {
  if (!isEnabled()) {
    // file fallback (existing logic)
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data.workflows) data.workflows.forEach(([k,v]) => {
          workflows.set(k,v);
          (v.nodes||[]).forEach(n => nodeIndex.set(n.id, k));
          (v.edges||[]).forEach(e => edgeIndex.set(e.id, k));
        });
        if (data.templates) data.templates.forEach(([k,v]) => templates.set(k,v));
      }
    } catch {}
    return;
  }
  const sb = getClient();
  try {
    // Load workflows (limit 100 most recent)
    const { data, error } = await sb.from('workflows').select('*').order('updated_at', { ascending: false }).limit(100);
    if (error) throw error;
    for (const row of data) {
      const key = row.id;
      const wf = {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        description: row.description,
        nodes: typeof row.nodes === 'string' ? JSON.parse(row.nodes) : row.nodes || [],
        edges: typeof row.edges === 'string' ? JSON.parse(row.edges) : row.edges || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      workflows.set(key, wf);
      (wf.nodes||[]).forEach(n => nodeIndex.set(n.id, key));
      (wf.edges||[]).forEach(e => edgeIndex.set(e.id, key));
    }
    // Load templates
    const { data: tmpl } = await sb.from('templates').select('*').limit(50);
    if (tmpl) tmpl.forEach(r => templates.set(r.name, { name:r.name, description:r.description, nodes: typeof r.nodes==='string'?JSON.parse(r.nodes):r.nodes, edges: typeof r.edges==='string'?JSON.parse(r.edges):r.edges, createdAt:r.created_at }));
  } catch (e) {
    console.warn('[supabase] load workflows failed, fallback to file', e.message);
    // fallback to file
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data.workflows) data.workflows.forEach(([k,v]) => workflows.set(k,v));
      }
    } catch {}
  }
}

async function dbPersistWorkflows(workflows, templates) {
  if (!isEnabled()) {
    try {
      ensureDataDir();
      const data = { workflows: Array.from(workflows.entries()), templates: Array.from(templates.entries()), at: new Date().toISOString() };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
    } catch {}
    return;
  }
  const sb = getClient();
  try {
    // Upsert each workflow (we do batch, but Supabase has no multi-upsert easily, so loop)
    for (const [id, wf] of workflows.entries()) {
      // Only persist user workflows (skip in-mem executionLogs)
      if (!wf.user_id) continue;
      const payload = {
        id: wf.id,
        user_id: wf.user_id,
        name: wf.name || wf.id,
        description: wf.description || '',
        nodes: wf.nodes || [],
        edges: wf.edges || [],
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from('workflows').upsert(payload, { onConflict: 'id' });
      if (error) console.warn('[supabase] upsert workflow failed', error.message);
    }
  } catch (e) {
    console.warn('[supabase] persist failed', e.message);
  }
  // Also keep file as backup
  try {
    ensureDataDir();
    const data = { workflows: Array.from(workflows.entries()), templates: Array.from(templates.entries()), at: new Date().toISOString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  } catch {}
}

// Custom nodes
async function dbLoadCustomNodes() {
  if (!isEnabled()) {
    try {
      if (fs.existsSync(CUSTOM_FILE)) {
        const raw = fs.readFileSync(CUSTOM_FILE, 'utf8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch {}
    return [];
  }
  const sb = getClient();
  try {
    const { data, error } = await sb.from('custom_nodes').select('*').order('updated_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data||[]).map(r => ({
      type: r.type,
      displayName: r.display_name,
      description: r.description,
      color: r.color,
      icon: r.icon,
      fields: typeof r.fields === 'string' ? JSON.parse(r.fields) : r.fields || [],
      code: r.code,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      user_id: r.user_id,
    }));
  } catch (e) {
    console.warn('[supabase] load custom nodes failed', e.message);
    return [];
  }
}

async function dbPersistCustomNodes(nodes, userId = null) {
  if (!isEnabled()) {
    try {
      ensureDataDir();
      fs.writeFileSync(CUSTOM_FILE, JSON.stringify(nodes, null, 2), 'utf8');
    } catch {}
    return;
  }
  const sb = getClient();
  try {
    // For Supabase, we need to upsert per user+type. We do delete + insert for simplicity if nodes is full list for user
    // Assume nodes is the full list for the current user (from cache). We will upsert each.
    for (const n of nodes) {
      const payload = {
        type: n.type,
        user_id: n.user_id || userId || '00000000-0000-0000-0000-000000000000',
        display_name: n.displayName,
        description: n.description,
        color: n.color,
        icon: n.icon,
        fields: n.fields || [],
        code: n.code,
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from('custom_nodes').upsert(payload, { onConflict: 'user_id,type' });
      if (error) console.warn('[supabase] upsert custom failed', error.message);
    }
  } catch (e) { console.warn('[supabase] persist custom failed', e.message); }
  // backup to file
  try {
    ensureDataDir();
    fs.writeFileSync(CUSTOM_FILE, JSON.stringify(nodes, null, 2), 'utf8');
  } catch {}
}

module.exports.dbLoadWorkflows = dbLoadWorkflows;
module.exports.dbPersistWorkflows = dbPersistWorkflows;
module.exports.dbLoadCustomNodes = dbLoadCustomNodes;
module.exports.dbPersistCustomNodes = dbPersistCustomNodes;
