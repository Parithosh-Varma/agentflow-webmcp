import { useState, useEffect, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import * as api from '../api';
import { useAuth } from '../context/AuthContext';
import { CloseIcon } from './icons';

interface Props {
  nodes: Node[];
  edges: Edge[];
  setNodes: (updater: (nds: Node[]) => Node[]) => void;
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void;
  addToolLog: (tool: string, input: any, result: any, actor?: 'agent' | 'you') => void;
  currentWorkflowId: string | null;
  setCurrentWorkflowId: (id: string | null) => void;
  currentWorkflowName: string;
  setCurrentWorkflowName: (name: string) => void;
}

export function WorkflowManager({
  nodes, edges, setNodes, setEdges, addToolLog,
  currentWorkflowId, setCurrentWorkflowId,
  currentWorkflowName, setCurrentWorkflowName,
}: Props) {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<api.Workflow[]>([]);
  const [templates, setTemplates] = useState<api.Template[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveName, setSaveName] = useState(currentWorkflowName || '');
  const [tmplName, setTmplName] = useState('');
  const [tmplDesc, setTmplDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const loadWorkflows = useCallback(async () => {
    if (!user) return;
    try {
      const list = await api.listWorkflows();
      setWorkflows(list);
    } catch { /* silent */ }
  }, [user]);

  const loadTemplates = useCallback(async () => {
    if (!user) return;
    try {
      const list = await api.listTemplates();
      setTemplates(list);
    } catch { /* silent */ }
  }, [user]);

  useEffect(() => {
    loadWorkflows();
    loadTemplates();
  }, [loadWorkflows, loadTemplates]);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setLoading(true);
    try {
      if (currentWorkflowId) {
        const wf = await api.updateWorkflow(currentWorkflowId, saveName.trim(), nodes as any, edges as any);
        addToolLog('save_workflow', { name: saveName }, { success: true, workflowId: wf.id }, 'you');
      } else {
        const wf = await api.createWorkflow(saveName.trim(), nodes as any, edges as any);
        setCurrentWorkflowId(wf.id);
        addToolLog('save_workflow', { name: saveName }, { success: true, workflowId: wf.id }, 'you');
      }
      setCurrentWorkflowName(saveName.trim());
      setShowSave(false);
      loadWorkflows();
    } catch (err: any) {
      addToolLog('save_workflow', { name: saveName }, { error: err?.message }, 'you');
    }
    setLoading(false);
  };

  const handleLoad = async (wf: api.Workflow) => {
    setNodes(() => wf.nodes as Node[]);
    setEdges(() => wf.edges.map((e: any) => ({ ...e, animated: false, style: { stroke: '#3a342c', strokeWidth: 1.6 } })) as Edge[]);
    setCurrentWorkflowId(wf.id);
    setCurrentWorkflowName(wf.name);
    addToolLog('load_workflow', { name: wf.name }, { success: true, nodeCount: wf.nodes.length }, 'you');
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteWorkflow(id);
      if (currentWorkflowId === id) {
        setCurrentWorkflowId(null);
        setCurrentWorkflowName('Untitled');
      }
      loadWorkflows();
    } catch { /* silent */ }
  };

  const handleSaveTemplate = async () => {
    if (!tmplName.trim()) return;
    setLoading(true);
    try {
      await api.createTemplate(tmplName.trim(), tmplDesc.trim(), nodes as any, edges as any);
      addToolLog('create_template', { name: tmplName }, { success: true }, 'you');
      setTmplName('');
      setTmplDesc('');
      setShowTemplates(false);
      loadTemplates();
    } catch (err: any) {
      addToolLog('create_template', { name: tmplName }, { error: err?.message }, 'you');
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">Workflow</div>

      <div className="workflow-header">
        <span className="workflow-name">{currentWorkflowName || 'Untitled'}</span>
        {currentWorkflowId && <span className="workflow-saved">saved</span>}
      </div>

      <div className="workflow-actions">
        <button className="btn-ghost btn-small" onClick={() => { setSaveName(currentWorkflowName); setShowSave(!showSave); }}>
          {currentWorkflowId ? 'save' : 'save as'}
        </button>
        <button className="btn-ghost btn-small" onClick={() => setShowTemplates(!showTemplates)}>
          template
        </button>
      </div>

      {showSave && (
        <div style={{ marginBottom: 10 }}>
          <label className="cfg-row">
            <span>Name</span>
            <input
              className="cfg-input"
              placeholder="my workflow"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </label>
          <button className="btn-run btn-small" onClick={handleSave} disabled={loading || !saveName.trim()} style={{ width: '100%' }}>
            {loading ? '...' : 'Save'}
          </button>
        </div>
      )}

      {showTemplates && (
        <div style={{ marginBottom: 10 }}>
          <label className="cfg-row">
            <span>Template name</span>
            <input className="cfg-input" placeholder="my template" value={tmplName} onChange={(e) => setTmplName(e.target.value)} />
          </label>
          <label className="cfg-row">
            <span>Description</span>
            <input className="cfg-input" placeholder="optional" value={tmplDesc} onChange={(e) => setTmplDesc(e.target.value)} />
          </label>
          <button className="btn-run btn-small" onClick={handleSaveTemplate} disabled={loading || !tmplName.trim()} style={{ width: '100%' }}>
            {loading ? '...' : 'Save as Template'}
          </button>
        </div>
      )}

      {workflows.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div className="sidebar-section-title" style={{ marginBottom: 6 }}>Saved</div>
          <div className="node-list">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className={`node-item ${wf.id === currentWorkflowId ? 'node-item-active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleLoad(wf)}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</span>
                <button
                  className="node-item-delete"
                  onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}
                  title="Delete"
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="sidebar-section-title" style={{ marginBottom: 6 }}>Templates</div>
          <div className="node-list">
            {templates.map((t) => (
              <div
                key={t.id}
                className="node-item"
                style={{ cursor: 'pointer' }}
                onClick={() => handleLoad({ id: t.id, name: t.name, nodes: t.nodes, edges: t.edges, created_at: t.created_at, updated_at: t.created_at })}
                title={t.description || t.name}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {t.description && <span className="node-id" style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
