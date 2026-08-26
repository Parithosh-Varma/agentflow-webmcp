interface LogEntry {
  tool: string;
  input: any;
  result: any;
  time: string;
}

interface Props {
  logs: LogEntry[];
}

export function ToolLog({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <div className="tool-log">
        <h3>📋 Tool Log</h3>
        <div className="log-empty">
          No tools called yet.<br />
          Agent tools will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="tool-log">
      <h3>📋 Tool Log ({logs.length})</h3>
      <div className="log-entries">
        {[...logs].reverse().map((log, i) => (
          <div key={i} className="log-entry">
            <div className="log-header">
              <span className="log-tool">{log.tool}</span>
              <span className="log-time">{log.time}</span>
            </div>
            <pre className="log-data">{JSON.stringify(log.result, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
