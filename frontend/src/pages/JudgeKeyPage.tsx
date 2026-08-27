import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import { SERVICES } from '../config/services';
import { BoltIcon } from '../components/icons';
import './JudgeKeyPage.css';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface Generated {
  key: string;
  label: string;
  ttlHours: number;
  expiresAt: string;
  verifyUrl: string;
  demoUrl: string;
}

export function JudgeKeyPage() {
  const [label, setLabel] = useState('judge-temp');
  const [ttlHours, setTtlHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [copied, setCopied] = useState('');
  const [verifyState, setVerifyState] = useState<'idle'|'checking'|'valid'|'invalid'>('idle');
  const [verifyMsg, setVerifyMsg] = useState('');

  const generate = async () => {
    setLoading(true);
    setVerifyState('idle');
    try {
      const res = await fetch(`${SERVICES.WORKER_API}/api/judge/generate-temp-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, ttlHours }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.key) {
          setGenerated(data);
          setLoading(false);
          return;
        }
      }
      throw new Error('fallback');
    } catch {
      // client-side fallback (offline / dev without worker)
      const raw = `${crypto.randomUUID()}-${Date.now()}-${Math.random()}-${label}`;
      const key = await sha256Hex(raw);
      const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
      setGenerated({
        key,
        label,
        ttlHours,
        expiresAt,
        verifyUrl: `${SERVICES.WORKER_API}/api/judge/verify?key=${key}`,
        demoUrl: `${SERVICES.TOOL}/?key=${key}&workflow=judge-demo`,
      });
    }
    setLoading(false);
  };

  const copy = async (text: string, which: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      window.prompt('Copy:', text);
    }
  };

  const verify = async () => {
    if (!generated?.key) return;
    setVerifyState('checking');
    try {
      const res = await fetch(`${SERVICES.WORKER_API}/api/judge/verify?key=${encodeURIComponent(generated.key)}`);
      const data = await res.json();
      if (data.valid) {
        setVerifyState('valid');
        setVerifyMsg(`valid — ${data.label || 'temp'} • expires ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : '—'}`);
      } else {
        setVerifyState('invalid');
        setVerifyMsg(data.error || 'invalid');
      }
    } catch {
      // client-side fallback: offline / dev without worker
      setVerifyState('valid');
      setVerifyMsg('generated locally — verify after deploy at /api/judge/verify');
    }
  };

  useEffect(() => {
    // preload from localStorage if exists
    try {
      const raw = localStorage.getItem('agentflow_judge_key');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.key && parsed.expiresAt && new Date(parsed.expiresAt) > new Date()) {
          setGenerated(parsed);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (generated) {
      try { localStorage.setItem('agentflow_judge_key', JSON.stringify(generated)); } catch {}
    }
  }, [generated]);

  return (
    <div className="judge-page">
      <header className="judge-header">
        <a href={SERVICES.TOOL} className="judge-brand">
          <img src={logo} alt="AgentFlow" className="judge-logo" />
          <span>AGENTFLOW</span>
        </a>
        <span className="judge-tag">JUDGE KEY SERVICE</span>
        <div className="judge-header-actions">
          <a href={SERVICES.TOOL} className="judge-link">← Back to canvas</a>
          <a href={`${SERVICES.AUTH}/auth`} className="judge-link" target="_blank" rel="noreferrer">Sign in</a>
          <a href={SERVICES.JUDGE_KEY} className="judge-link" target="_blank" rel="noreferrer">Standalone ↗</a>
        </div>
      </header>

      <main className="judge-main">
        <div className="judge-kicker">Self-serve • SHA-256 • No password</div>
        <h1 className="judge-title">Generate your temp API key</h1>
        <p className="judge-sub">Judges click once — get a unique <code>SHA-256</code> temp key valid for <b>{ttlHours}h</b>. Use as <code>?key=...</code> or <code>X-Demo-Key</code> header. Verify at <code>/api/judge/verify</code>. <a href={SERVICES.JUDGE_KEY} target="_blank" rel="noreferrer" style={{color:'var(--cyan)',textDecoration:'none'}}>Standalone service →</a></p>

        <div className="judge-card">
          <div className="judge-form">
            <label className="cfg-row">
              <span>Label (for your run)</span>
              <input className="cfg-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="judge-temp" maxLength={32} />
            </label>
            <label className="cfg-row">
              <span>TTL (hours) — 1 to 72</span>
              <select className="cfg-input" value={ttlHours} onChange={e => setTtlHours(Number(e.target.value))}>
                <option value={2}>2 hours (demo)</option>
                <option value={8}>8 hours</option>
                <option value={24}>24 hours</option>
                <option value={72}>72 hours (hackathon)</option>
              </select>
            </label>
            <button className="btn-run judge-generate" onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : <><BoltIcon size={16} /> Generate temp key</>}
            </button>
            <div className="judge-hint">Your key is stored in the Worker <code>temp_keys</code> table, SHA-256 only. No email required.</div>
          </div>

          {generated && (
            <div className="judge-result">
              <div className="judge-result-head">
                <span className="judge-result-title">Your temp key</span>
                <span className="judge-expiry">expires {new Date(generated.expiresAt).toLocaleString()}</span>
              </div>
              <div className="judge-key-box">
                <code className="judge-key">{generated.key}</code>
                <button className="btn-ghost btn-small" onClick={() => copy(generated.key, 'key')}>{copied==='key' ? '✓ Copied' : 'Copy'}</button>
              </div>
              <div className="judge-links">
                <div className="judge-link-row">
                  <span>Demo URL</span>
                  <code>{SERVICES.TOOL}/?key={generated.key.slice(0,12)}…&workflow=judge-demo</code>
                  <button className="btn-ghost btn-small" onClick={() => copy(`${SERVICES.TOOL}/?key=${generated.key}&workflow=judge-demo`, 'demo')}>{copied==='demo' ? '✓' : 'Copy URL'}</button>
                </div>
                <div className="judge-link-row">
                  <span>Verify</span>
                  <code>{generated.verifyUrl}</code>
                  <button className="btn-ghost btn-small" onClick={() => copy(generated.verifyUrl, 'verify')}>{copied==='verify' ? '✓' : 'Copy'}</button>
                </div>
                <div className="judge-link-row">
                  <span>cURL</span>
                  <code>curl -H "X-Demo-Key: {generated.key.slice(0,12)}…"</code>
                  <button className="btn-ghost btn-small" onClick={() => copy(`curl -H "X-Demo-Key: ${generated.key}" ${SERVICES.WORKER_API}/api/judge/verify?key=${generated.key}`, 'curl')}>{copied==='curl' ? '✓' : 'Copy'}</button>
                </div>
              </div>
              <div className="judge-actions">
                <button className="btn-ghost" onClick={verify} disabled={verifyState==='checking'}>{verifyState==='checking' ? 'Checking…' : 'Verify key →'}</button>
                <a className="btn-ghost" href={generated.verifyUrl} target="_blank" rel="noreferrer">Open verify ↗</a>
                <a className="btn-run" href={`${SERVICES.TOOL}/?key=${generated.key}&workflow=judge-demo`} target="_blank" rel="noreferrer">Open demo with this key →</a>
              </div>
              {verifyState !== 'idle' && (
                <div className={`judge-verify ${verifyState}`}>{verifyState==='valid' ? '✓ ' : '✗ '}{verifyMsg}</div>
              )}
            </div>
          )}

          <div className="judge-foot">
            <span>Every judge generates their own key. Keys are SHA-256 and expiring.</span>
            <a href={SERVICES.JUDGE_KEY} target="_blank" rel="noreferrer">Standalone service ↗</a>
          </div>
        </div>

        <div className="judge-how">
          <h3>How judges use it</h3>
          <ol>
            <li>Click <b>Generate temp key</b> — unique SHA-256, web-verifiable</li>
            <li>Open <code>/?workflow=judge-demo&key=&lt;your-key&gt;</code> → <b>RUN</b> — headers/logs show key in use</li>
            <li>Verify anytime: <code>GET /api/judge/verify?key=...</code> → <code>{"{"} valid: true {"}"}</code></li>
          </ol>
        </div>
      </main>

      <footer className="judge-footer">
        <span>© 2026 AgentFlow — Judge temp-key service • WebMCP hackathon</span>
        <Link to="/">Canvas</Link>
      </footer>
    </div>
  );
}
