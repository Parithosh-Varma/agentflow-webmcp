import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

interface Version {
  id: string
  workflow_id: string
  user_id: string
  nodes: any[]
  edges: any[]
  created_at: string
}

export const WorkflowVersionsPanel: React.FC = () => {
  const { id: workflowId } = useParams()
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workflowId) return
    fetchVersions()
  }, [workflowId])

  const fetchVersions = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('agentflow_token')
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }
      const res = await fetch(`https://agentflow.parithosh.workers.dev/api/workflows/${workflowId}/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setVersions(data.versions || [])
      } else {
        setError(data.error || 'Failed to load versions')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load versions')
    } finally {
      setLoading(false)
    }
  }

  if (!workflowId) return null
  if (loading) return <div>Loading versions...</div>
  if (error) return <div style={{ color: 'red' }}>{error}</div>

  return (
    <div className="versions-panel">
      <h3>Version History ({versions.length})</h3>
      {versions.map((v: Version) => (
        <div key={v.id} className="version-item">
          <span>{v.created_at}</span>
          <button
            onClick={() => window.alert(`Version ${v.id.substring(0, 8)}...`)}
            style={{ marginLeft: '10px', cursor: 'pointer' }}
          >
            Restore
          </button>
        </div>
      ))}
      {versions.length === 0 && <p>No versions yet. Create a workflow to start.</p>}
    </div>
  )
}
