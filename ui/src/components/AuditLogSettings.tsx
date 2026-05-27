import React, { useState, useEffect } from 'react';

interface AuditEntry {
  log_id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  success: boolean;
}

const AuditLogSettings: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [credFilter, setCredFilter] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setMessage(null);
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (agentFilter) params.set('agent_id', agentFilter);
    if (credFilter) params.set('credential_id', credFilter);

    try {
      const res = await fetch(`/api/audit?${params}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
      });
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setMessage({ type: 'error', text: '❌ Failed to fetch audit log' });
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Agent', 'Action', 'Resource Type', 'Resource ID', 'Success'],
      ...entries.map(e => [e.timestamp, e.agent_name, e.action, e.resource_type, e.resource_id, String(e.success)]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-section">
      <h2>📋 Audit Log</h2>
      <p className="section-desc">Track all credential access and admin operations.</p>

      {/* Filters */}
      <div className="filter-row">
        <div className="form-group">
          <label>From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input input-sm" />
        </div>
        <div className="form-group">
          <label>To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input input-sm" />
        </div>
        <div className="form-group">
          <label>Agent</label>
          <input type="text" value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className="input input-sm" placeholder="Agent name" />
        </div>
        <div className="form-group">
          <label>Credential ID</label>
          <input type="text" value={credFilter} onChange={e => setCredFilter(e.target.value)} className="input input-sm" placeholder="cred_xxx" />
        </div>
        <button className="btn btn-primary btn-sm" onClick={fetchLogs} disabled={loading}>
          🔍 Search
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={entries.length === 0}>
          📥 Export CSV
        </button>
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Agent</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Success</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={5} className="empty-row">No audit entries found</td></tr>
            ) : entries.map(entry => (
              <tr key={entry.log_id}>
                <td><code>{new Date(entry.timestamp).toLocaleString()}</code></td>
                <td>{entry.agent_name || entry.agent_id}</td>
                <td><span className={`action-badge ${entry.action}`}>{entry.action}</span></td>
                <td>
                  <span className="resource-type">{entry.resource_type}</span>
                  <code className="resource-id">{entry.resource_id}</code>
                </td>
                <td>
                  <span className={`status-badge ${entry.success ? 'active' : 'inactive'}`}>
                    {entry.success ? '✅' : '❌'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="info-card">
        <p><strong>💡 Tip:</strong> Filter by credential ID to see all access history for a specific credential. Use agent filter to see all actions by a specific agent.</p>
      </div>
    </div>
  );
};

export default AuditLogSettings;