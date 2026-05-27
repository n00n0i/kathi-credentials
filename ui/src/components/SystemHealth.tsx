import React, { useState, useEffect } from 'react';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  neo4j: 'connected' | 'disconnected';
  telegram: 'connected' | 'not_configured' | 'error';
  uptime_seconds: number;
  version: string;
  total_credentials: number;
  total_hosts: number;
  total_agents: number;
}

const SystemHealth: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  const handleRestart = async () => {
    if (!confirm('🔄 Restart the KathiCredentials service? Current API requests will be interrupted.')) return;
    setRestarting(true);
    try {
      const res = await fetch('/api/admin/restart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '✅ Service restarting...' });
        setTimeout(fetchHealth, 5000);
      } else {
        setMessage({ type: 'error', text: '❌ Failed to restart' });
      }
    } catch {
      setMessage({ type: 'error', text: '❌ Network error' });
    }
    setRestarting(false);
  };

  const formatUptime = (secs: number) => {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <div className="settings-section">
      <h2>⚙️ System Status</h2>
      <p className="section-desc">Service health, connectivity, and statistics.</p>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {/* Status Cards */}
      <div className="status-cards">
        <div className={`status-card ${health?.neo4j === 'connected' ? 'healthy' : 'down'}`}>
          <div className="status-icon">{health?.neo4j === 'connected' ? '🟢' : '🔴'}</div>
          <div className="status-info">
            <h4>Neo4j</h4>
            <p>{health?.neo4j === 'connected' ? 'Connected (bolt://localhost:7688)' : 'Disconnected'}</p>
          </div>
        </div>

        <div className={`status-card ${health?.telegram === 'connected' ? 'healthy' : health?.telegram === 'not_configured' ? 'warning' : 'down'}`}>
          <div className="status-icon">{health?.telegram === 'connected' ? '🟢' : health?.telegram === 'not_configured' ? '🟡' : '🔴'}</div>
          <div className="status-info">
            <h4>Telegram</h4>
            <p>{health?.telegram === 'connected' ? 'Bot connected' : health?.telegram === 'not_configured' ? 'Not configured' : 'Error'}</p>
          </div>
        </div>

        <div className={`status-card ${health?.status === 'healthy' ? 'healthy' : health?.status === 'degraded' ? 'warning' : 'down'}`}>
          <div className="status-icon">{health?.status === 'healthy' ? '🟢' : health?.status === 'degraded' ? '🟡' : '🔴'}</div>
          <div className="status-info">
            <h4>Overall</h4>
            <p>{health?.status === 'healthy' ? 'All systems operational' : health?.status === 'degraded' ? 'Degraded' : 'Service down'}</p>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{health?.version || '—'}</div>
          <div className="stat-label">Version</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{health ? formatUptime(health.uptime_seconds) : '—'}</div>
          <div className="stat-label">Uptime</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{health?.total_hosts ?? '—'}</div>
          <div className="stat-label">Hosts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{health?.total_credentials ?? '—'}</div>
          <div className="stat-label">Credentials</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{health?.total_agents ?? '—'}</div>
          <div className="stat-label">Agents</div>
        </div>
      </div>

      {/* Actions */}
      <div className="action-card">
        <h3>🛠️ Service Actions</h3>
        <div className="button-row">
          <button className="btn btn-secondary" onClick={fetchHealth} disabled={loading}>
            🔄 Refresh Status
          </button>
          <button className="btn btn-danger" onClick={handleRestart} disabled={restarting}>
            {restarting ? '⏳ Restarting...' : '🔄 Restart Service'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemHealth;