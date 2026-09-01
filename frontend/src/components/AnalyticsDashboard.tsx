import React, { useEffect, useState } from 'react'

interface Metric {
  name: string
  value: number | string
  change?: number
}

export const AnalyticsDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('agentflow_access_token')
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }
      const res = await fetch('https://agentflow.parithosh.workers.dev/api/stats', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        const metrics: Metric[] = [
          { name: 'Workflows', value: data.workflows || 0 },
          { name: 'Executions', value: data.executions || 0 },
          { name: 'Success Rate', value: data.successRate || 0 + '%' },
          { name: 'Unique Users', value: data.uniqueWorkflowUsers || 0 },
        ]
        setMetrics(metrics)
      } else {
        setError(data.error || 'Failed to load stats')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading analytics...</div>
  if (error) return <div style={{ color: 'red' }}>{error}</div>

  return (
    <div className="analytics-dashboard">
      <h3>Analytics</h3>
      <div className="metrics-grid">
        {metrics.map((m, i) => (
          <div key={i} className="metric-card">
            <span className="metric-name">{m.name}</span>
            <span className="metric-value">{m.value}</span>
            {m.change !== undefined && (
              <span className={m.change > 0 ? 'positive' : 'negative'}>
                {m.change > 0 ? '▲' : '▼'} {Math.abs(m.change)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
