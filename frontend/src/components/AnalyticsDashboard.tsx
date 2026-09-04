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
    setError(null)
    try {
      const token = localStorage.getItem('agentflow_token')
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }
      const res = await fetch('https://agentflow.parithosh.workers.dev/api/stats', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        // successRate may arrive as a 0..1 fraction, a 0..100 percent, or be
        // absent. (Note: `a || 0 + '%'` parses as `a || '0%'` and drops the
        // % sign for real values, so format explicitly.)
        const raw = typeof data.successRate === 'number' ? data.successRate : null;
        const successLabel = raw === null ? '—' : `${(raw <= 1 ? raw * 100 : raw).toFixed(1)}%`;
        const metrics: Metric[] = [
          { name: 'Workflows', value: data.workflows || 0 },
          { name: 'Executions', value: data.executions || 0 },
          { name: 'Success Rate', value: successLabel },
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
  // Retry: previously a dead-end red message with no recovery path, and a
  // stale error was never cleared so a later success still rendered red.
  if (error) return (
    <div style={{ color: 'red' }}>
      <span>{error}</span>{' '}
      <button type="button" onClick={() => void fetchMetrics()} style={{ marginLeft: 8, cursor: 'pointer' }}>
        Retry
      </button>
    </div>
  )

  return (
    <div className="analytics-dashboard">
      <h3>Analytics</h3>
      <div className="metrics-grid">
        {metrics.map((m) => (
          <div key={m.name} className="metric-card">
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
