import React, { useState, useEffect } from 'react';

interface Agent {
  agent_id: string;
  name: string;
  permissions: string[];
  token_preview: string;
  created_at: string;
  is_active: boolean;
}

const AgentsSettings: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Created agent — used to show setup instructions
  const [createdAgent, setCreatedAgent] = useState<{ name: string; token: string; agent_id: string; permissions: string[] } | null>(null);

  // New agent form
  const [newName, setNewName] = useState('');
  const [newPerms, setNewPerms] = useState<string[]>([]);

  // API URL for the agent to connect back to this server
  const [agentApiUrl, setAgentApiUrl] = useState(() => {
    return localStorage.getItem('agent_api_url') || window.location.origin;
  });

  const PERM_OPTIONS = [
    'host:read', 'host:write',
    'credential:read', 'credential:write', 'credential:delete',
    'agent:read', 'agent:write',
    'audit:read',
  ];

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
      });
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      setMessage({ type: 'error', text: '❌ Failed to fetch agents' });
    }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
        body: JSON.stringify({ name: newName, permissions: newPerms }),
      });
      const data = await res.json();
      if (data.agent_id) {
        setCreatedAgent({ name: newName, token: data.token, agent_id: data.agent_id, permissions: newPerms });
        setShowModal(false);
        setNewName('');
        setNewPerms([]);
        fetchAgents();
      } else {
        setMessage({ type: 'error', text: '❌ Failed to create agent' });
      }
    } catch {
      setMessage({ type: 'error', text: '❌ Network error' });
    }
    setCreating(false);
  };

  const handleRevoke = async (agentId: string, agentName: string) => {
    if (!confirm(`Revoke all tokens for agent "${agentName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `✅ Agent "${agentName}" revoked` });
        fetchAgents();
      } else {
        setMessage({ type: 'error', text: '❌ Failed to revoke agent' });
      }
    } catch {
      setMessage({ type: 'error', text: '❌ Network error' });
    }
  };

  const handleShowSetup = async (agentId: string, agentName: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/tokens`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const token = data.tokens?.[0]?.token_value;
      if (!token) throw new Error('No token found');
      // Fetch agent details for permissions
      const agRes = await fetch(`/api/agents`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
      });
      const agData = await agRes.json();
      const agentInfo = (agData.agents || []).find((a: any) => a.agent_id === agentId);
      setCreatedAgent({
        name: agentName,
        token,
        agent_id: agentId,
        permissions: agentInfo?.permissions || [],
      });
    } catch {
      setMessage({ type: 'error', text: '❌ Could not load agent setup info' });
    }
  };

  const togglePerm = (perm: string) => {
    setNewPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
  };

  const handleSaveApiUrl = () => {
    localStorage.setItem('agent_api_url', agentApiUrl);
    setMessage({ type: 'success', text: '✅ API URL saved' });
  };

  const copySetupSnippet = () => {
    if (!createdAgent) return;
const snippet = `KATHI_API_URL=${agentApiUrl}
KATHI_AGENT_TOKEN=${createdAgent.token}
KATHI_AGENT_ID=${createdAgent.agent_id}
KATHI_PERMISSIONS=${createdAgent.permissions.join(', ')}`;
    navigator.clipboard.writeText(snippet);
    setMessage({ type: 'success', text: '✅ Setup snippet copied!' });
  };

  return (
    <div className="settings-section">
      <h2>🤖 Agent Management</h2>
      <p className="section-desc">Create and manage agent tokens with granular permissions.</p>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {/* Agent API URL config */}
      <div className="form-group" style={{ marginBottom: '1.5rem' }}>
        <label>🤖 Agent API URL <span style={{ color: '#555', fontSize: '0.75rem' }}>— used in setup links sent to agents</span></label>
        <div className="input-with-button">
          <input
            type="text"
            className="input"
            value={agentApiUrl}
            onChange={e => setAgentApiUrl(e.target.value)}
            placeholder="http://100.68.243.11:8124"
          />
          <button className="btn btn-sm" onClick={handleSaveApiUrl}>Save</button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Permissions</th>
              <th>Token (last 8)</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr><td colSpan={6} className="empty-row">No agents yet — create one below</td></tr>
            ) : agents.map(agent => (
              <tr key={agent.agent_id}>
                <td><strong>{agent.name}</strong></td>
                <td>
                  <div className="perm-tags">
                    {agent.permissions.map(p => <span key={p} className="perm-tag">{p}</span>)}
                  </div>
                </td>
                <td><code>{agent.token_preview}</code></td>
                <td>{new Date(agent.created_at).toLocaleDateString()}</td>
                <td>
                  <span className={`status-badge ${agent.is_active ? 'active' : 'inactive'}`}>
                    {agent.is_active ? '🟢 Active' : '🔴 Revoked'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-sm btn-danger" onClick={() => handleRevoke(agent.agent_id, agent.name)}>
                      Revoke
                    </button>
                    <button className="btn btn-sm" onClick={() => handleShowSetup(agent.agent_id, agent.name)}>
                      🔗 Setup
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn btn-primary" onClick={() => setShowModal(true)}>
        ➕ Create Agent
      </button>

      {/* Create Agent Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🤖 Create New Agent</h3>
            <div className="form-group">
              <label>Agent Name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="input" placeholder="e.g. deep-tutor-agent" />
            </div>
            <div className="form-group">
              <label>Permissions</label>
              <div className="perm-grid">
                {PERM_OPTIONS.map(perm => (
                  <label key={perm} className="perm-checkbox">
                    <input type="checkbox" checked={newPerms.includes(perm)} onChange={() => togglePerm(perm)} />
                    <span>{perm}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? 'Creating...' : '✅ Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Setup Info Modal */}
      {createdAgent && (
        <div className="modal-overlay" onClick={() => setCreatedAgent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🤖 {createdAgent.name} — Setup</h3>
            <p className="section-desc" style={{ marginBottom: '1rem' }}>
              Add these to your agent's <code>.env</code> or config. The agent will use these to connect and auth automatically.
            </p>

            <div className="form-group">
              <label>Agent API URL <span style={{ color: '#555', fontSize: '0.8rem' }}>(read-only hint)</span></label>
              <div className="input-with-button">
                <input type="text" className="input" value={agentApiUrl} readOnly />
                <button className="btn-icon" onClick={() => navigator.clipboard.writeText(agentApiUrl)} title="Copy">📋</button>
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Agent Token
                <span style={{ fontSize: '0.7rem', color: '#a5b4fc', background: '#1a1a3a', padding: '2px 8px', borderRadius: '4px' }}>✂️ copy below</span>
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  className="input"
                  value={createdAgent.token}
                  readOnly
                  style={{ fontFamily: 'monospace', color: '#a5b4fc' }}
                />
                <button className="btn-icon" onClick={() => navigator.clipboard.writeText(createdAgent.token)} title="Copy">📋</button>
              </div>
            </div>

            {/* Agent Setup Instructions — explain to the agent what KathiCredentials is */}
            <div style={{ background: '#13152a', border: '1px solid #2a2a4a', borderRadius: '8px', padding: '0.85rem 1rem', marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#86efac', marginBottom: '0.4rem', fontFamily: 'monospace', fontWeight: 600 }}>
                🤖 AGENT SETUP INSTRUCTIONS
              </div>
              <pre style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{`WHAT IS THIS:
  KathiCredentials is your credential & host management system.
  Store, retrieve, and manage secrets (SSH keys, API tokens, passwords)
  for the systems you operate.

AUTHENTICATION:
  1. Set KATHI_API_URL, KATHI_AGENT_TOKEN, KATHI_AGENT_ID in your .env
  2. All API calls must include: Authorization: Bearer <KATHI_AGENT_TOKEN>
  3. Your agent_id must match KATHI_AGENT_ID

YOUR PERMISSIONS:
  ${createdAgent.permissions.join(', ') || 'credential:read'}

AVAILABLE TOOLS (HTTP REST):
  GET    /credentials          — list your credentials
  POST   /credentials           — create a credential
  GET    /credentials/{id}      — get a single credential
  PUT    /credentials/{id}      — update a credential
  DELETE /credentials/{id}      — delete a credential
  GET    /hosts                 — list hosts
  POST   /hosts                 — create a host
  GET    /hosts/{id}            — get a host
  PUT    /hosts/{id}            — update a host
  DELETE /hosts/{id}            — delete a host
  GET    /mcp/setup             — self-onboarding (GET ?agent_token=<token>)

EXAMPLE — store a credential:
  POST /credentials
  Body: {"name": "github-token", "type": "API_KEY",
         "secret_value": "ghp_xxxx", "tags": ["github", "prod"]}

EXAMPLE — retrieve a credential:
  GET /credentials
  → returns all credentials you own (filtered by your agent_id)

SECURITY:
  - All secret_values are encrypted at rest (Fernet)
  - You can only access credentials matching your agent_id
  - Credential type determines how the secret is used
  - Tags are for searching/filtering (not access control)

CREDENTIAL TYPES:
  API_KEY     — generic API key (GitHub, Stripe, etc.)
  SSH_KEY     — SSH private key
  PASSWORD    — username + password pair
  CERTIFICATE — TLS/SSL certificate
  TOKEN       — OAuth / bearer token
  OTHER       — any other secret`}</pre>
            </div>

            <div style={{ background: '#0f1117', border: '1px solid #2a2a3a', borderRadius: '8px', padding: '1rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#555', marginBottom: '0.5rem', fontFamily: 'monospace' }}># .env — paste these lines</div>
              <pre style={{ margin: 0, fontSize: '0.78rem', color: '#86efac', fontFamily: 'monospace', lineHeight: '1.8', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{`KATHI_API_URL=${agentApiUrl}
KATHI_AGENT_TOKEN=${createdAgent.token}
KATHI_AGENT_ID=${createdAgent.agent_id}
KATHI_PERMISSIONS=${createdAgent.permissions.join(', ')}`}</pre>
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#555' }}>
              Permissions granted: <span style={{ color: '#ccc' }}>{createdAgent.permissions.join(', ') || 'credential:read'}</span>
            </div>

            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setCreatedAgent(null)}>Done</button>
              <button className="btn btn-primary" onClick={copySetupSnippet}>📋 Copy Setup Snippet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentsSettings;
