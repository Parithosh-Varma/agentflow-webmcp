interface LogEntry {
  tool: string;
  input: any;
  result: any;
  time: string;
  actor: 'agent' | 'you';
}

interface Props {
  logs: LogEntry[];
}

export function ToolLog({ logs }: Props) {
  return (
    <div className="tool-log">
      <div className="sidebar-section" style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border-faint)' }}>
        <div className="sidebar-section-title">
          Telemetry{logs.length > 0 ? ` · ${logs.length}` : ''}
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="log-empty">
          No tool calls yet. When an agent works on this flow — or you press Run
          — every call lands here with its actor and output.
        </p>
      ) : (
        <div className="log-entries">
          {[...logs].reverse().map((log, i) => (
            <div key={`${log.time}-${i}`} className={`log-entry actor-${log.actor}`}>
              <div className="log-header">
                <span className={`actor-tag ${log.actor}`}>{log.actor === 'agent' ? 'AGENT' : 'YOU'}</span>
                <span className="log-tool">{log.tool}</span>
                <span className="log-time">{log.time}</span>
              </div>
              <pre className="log-data">{JSON.stringify(log.result, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
