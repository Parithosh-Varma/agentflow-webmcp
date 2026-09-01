const STORAGE_KEY = 'agentflow_custom_nodes_v1';

export interface CustomNodeDef {
  type: string;
  displayName: string;
  description: string;
  color: string;
  icon: string;
  fields: CustomField[];
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

export function listCustomNodes(): CustomNodeDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function getCustomNode(type: string): CustomNodeDef | null {
  return listCustomNodes().find(n => n.type === type) || null;
}

export function saveCustomNode(node: CustomNodeDef): void {
  const all = listCustomNodes().filter(n => n.type !== node.type);
  all.push({ ...node, updatedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteCustomNode(type: string): void {
  const all = listCustomNodes().filter(n => n.type !== type);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function isCustomNodeType(type: string): boolean {
  return type.startsWith('custom_');
}
