import React, { useState, useEffect } from 'react';
import { api, Credential, CredentialDetail, Host } from '../api/settingsApi';

interface Props {
  initialToken?: string;
}

const CRED_TYPES = ['ssh_key', 'password', 'api_key', 'token', 'certificate', 'other'];
const ENVIRONMENTS = ['development', 'staging', 'production'];

export default function CredentialsList({ initialToken }: Props) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CredentialDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editCredId, setEditCredId] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEnv, setFilterEnv] = useState('');

  // Reveal state
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create form
  const [form, setForm] = useState({ host_id: '', type: 'ssh_key', name: '', key_ref: '', value: '', owner: '', username: '', environment: '' });
  // Edit form
  const [editForm, setEditForm] = useState({ name: '', username: '', value: '' });

  useEffect(() => {
    if (initialToken) localStorage.setItem('admin_token', initialToken);
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [creds, hs] = await Promise.all([api.getCredentials(), api.getHosts()]);
      setCredentials(creds.credentials);
      setHosts(hs.hosts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createCredential(form);
      setMsg({ type: 'success', text: 'Credential created ✓' });
      setShowCreate(false);
      setForm({ host_id: '', type: 'ssh_key', name: '', key_ref: '', value: '', owner: '', username: '', environment: '' });
      load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this credential?')) return;
    try {
      await api.deleteCredential(id);
      setMsg({ type: 'success', text: 'Credential deleted ✓' });
      setSelected(null);
      load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function handleReveal(cred: Credential) {
    if (revealedId === cred.credential_id) {
      setRevealedId(null);
      setRevealedValue(null);
      return;
    }
    try {
      const res = await api.getCredential(cred.credential_id);
      setRevealedId(cred.credential_id);
      setRevealedValue(res.value);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function handleCopy(value: string, credId: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(credId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setMsg({ type: 'error', text: 'Copy failed' });
    }
  }

  async function openEdit(cred: Credential) {
    setEditCredId(cred.credential_id);
    setEditForm({ name: cred.name, username: (cred as any).username || '', value: '' });
    setShowEdit(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data: any = {};
      if (editForm.name) data.name = editForm.name;
      if (editForm.value) data.value = editForm.value;
      if (editForm.username) data.username = editForm.username;
      await api.updateCredential(editCredId, data);
      setMsg({ type: 'success', text: 'Credential updated ✓' });
      setShowEdit(false);
      setRevealedId(null);
      setRevealedValue(null);
      load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function fmtDate(v: string | null | undefined) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function typeColor(type: string) {
    const map: Record<string, string> = {
      ssh_key: '#3b82f6', password: '#ef4444', api_key: '#10b981',
      token: '#f59e0b', certificate: '#8b5cf6', other: '#6b7280',
    };
    return map[type] || '#6b7280';
  }

  function envColor(env: string) {
    const map: Record<string, string> = {
      development: '#6b7280', staging: '#f59e0b', production: '#ef4444',
    };
    return map[env] || '#6b7280';
  }

  const filtered = credentials.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.credential_id.toLowerCase().includes(search.toLowerCase());
    const matchType = !filterType || c.type === filterType;
    const matchEnv = !filterEnv || c.environment === filterEnv;
    return matchSearch && matchType && matchEnv;
  });

  if (loading) return <div className="cred-loading"><div className="spinner" /></div>;

  return (
    <div className="cred-page">
      {msg && <div className={`cred-toast ${msg.type}`}>{msg.text}</div>}

      {/* Header */}
      <div className="cred-header">
        <div className="cred-header-left">
          <h2>🔑 Credentials</h2>
          <p className="cred-subtitle">Manage stored credentials — values are encrypted at rest</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowCreate(true)}>
          + Add Credential
        </button>
      </div>

      {/* Filters */}
      <div className="cred-filters">
        <div className="cred-search-wrap">
          <span className="cred-search-icon">🔍</span>
          <input
            className="cred-search"
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="cred-filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {CRED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="cred-filter-select" value={filterEnv} onChange={e => setFilterEnv(e.target.value)}>
          <option value="">All Environments</option>
          {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        {(search || filterType || filterEnv) && (
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setFilterType(''); setFilterEnv(''); }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="cred-stats">
        <span className="cred-stat">{filtered.length} of {credentials.length} credentials</span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="cred-empty">
          <div className="cred-empty-icon">🔐</div>
          <div className="cred-empty-title">No credentials found</div>
          <div className="cred-empty-sub">
            {credentials.length === 0
              ? 'Add your first credential to get started'
              : 'Try adjusting your filters'}
          </div>
          {credentials.length === 0 && (
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowCreate(true)}>
              + Add First Credential
            </button>
          )}
        </div>
      ) : (
        <div className="cred-grid">
          {filtered.map(c => (
            <div
              key={c.credential_id}
              className={`cred-card ${selected?.credential_id === c.credential_id ? 'active' : ''}`}
              onClick={() => setSelected(c as CredentialDetail)}
            >
              <div className="cred-card-top">
                <div className="cred-card-name-row">
                  <span className="cred-card-name">{c.name || '(unnamed)'}</span>
                  <span
                    className="cred-badge"
                    style={{ color: typeColor(c.type), borderColor: typeColor(c.type) }}
                  >
                    {c.type}
                  </span>
                </div>
                <div className="cred-card-id-row">
                  <span className="cred-card-id">{c.credential_id}</span>
                  <button
                    className="btn-icon"
                    title="Copy ID"
                    onClick={e => { e.stopPropagation(); copyId(c.credential_id); }}
                  >
                    {copiedId === c.credential_id ? '✓' : '📋'}
                  </button>
                </div>
              </div>

              <div className="cred-card-meta">
                {c.hostname ? (
                  <span className="cred-meta-item">🏠 {c.hostname}</span>
                ) : (
                  <span className="cred-meta-item" style={{ color: '#4a4a6a' }}>🏠 —</span>
                )}
                {c.environment ? (
                  <span
                    className="cred-meta-badge"
                    style={{ color: envColor(c.environment), borderColor: envColor(c.environment) }}
                  >
                    {c.environment}
                  </span>
                ) : null}
              </div>

              <div className="cred-card-actions">
                <button
                  className="btn btn-sm"
                  onClick={e => { e.stopPropagation(); handleReveal(c); }}
                  title="Reveal value"
                >
                  {revealedId === c.credential_id ? '🙈 Hide' : '👁️ Reveal'}
                </button>
                {revealedId === c.credential_id && revealedValue && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={e => { e.stopPropagation(); handleCopy(revealedValue, c.credential_id); }}
                  >
                    {copiedId === c.credential_id ? '✓ Copied' : '📋 Copy'}
                  </button>
                )}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={e => { e.stopPropagation(); openEdit(c); }}
                >
                  ✏️ Edit
                </button>
                <button
                  className="btn btn-sm btn-danger-ghost"
                  onClick={e => { e.stopPropagation(); handleDelete(c.credential_id); }}
                >
                  🗑️
                </button>
              </div>

              {/* Inline reveal */}
              {revealedId === c.credential_id && revealedValue && (
                <div className="cred-card-reveal">
                  <div className="cred-reveal-value">{revealedValue}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail Slide Panel */}
      {selected && (
        <>
          <div className="cred-panel-overlay" onClick={() => setSelected(null)} />
          <div className="cred-panel">
            <div className="cred-panel-header">
              <div>
                <h3 className="cred-panel-title">{selected.name || '(unnamed)'}</h3>
                <span className="cred-panel-id">{selected.credential_id}</span>
              </div>
              <button className="btn-icon" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className="cred-panel-body">
              <div className="cred-panel-field">
                <span className="cred-panel-label">Type</span>
                <span className="cred-badge" style={{ color: typeColor(selected.type), borderColor: typeColor(selected.type) }}>
                  {selected.type}
                </span>
              </div>
              <div className="cred-panel-field">
                <span className="cred-panel-label">Host</span>
                <span className="cred-panel-value">{selected.hostname || '—'}</span>
              </div>
              <div className="cred-panel-field">
                <span className="cred-panel-label">Host ID</span>
                <span className="cred-panel-value" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{selected.host_id || '—'}</span>
              </div>
              <div className="cred-panel-field">
                <span className="cred-panel-label">Environment</span>
                <span className="cred-panel-value">
                  {selected.environment
                    ? <span style={{ color: envColor(selected.environment) }}>{selected.environment}</span>
                    : '—'}
                </span>
              </div>
              <div className="cred-panel-field">
                <span className="cred-panel-label">Owner</span>
                <span className="cred-panel-value">{selected.owner || '—'}</span>
              </div>
              {selected.username && (
              <div className="cred-panel-field">
                <span className="cred-panel-label">Username</span>
                <span className="cred-panel-value">{selected.username}</span>
              </div>
              )}
              <div className="cred-panel-field">
                <span className="cred-panel-label">Created</span>
                <span className="cred-panel-value">{fmtDate(selected.created_at)}</span>
              </div>
              <div className="cred-panel-field">
                <span className="cred-panel-label">Updated</span>
                <span className="cred-panel-value">{fmtDate(selected.updated_at)}</span>
              </div>

              {/* Value */}
              <div className="cred-panel-value-section">
                <div className="cred-panel-label">Secret Value</div>
                {revealedId === selected.credential_id && revealedValue ? (
                  <div className="cred-panel-reveal">
                    <div className="cred-panel-reveal-text">{revealedValue}</div>
                    <div className="cred-panel-reveal-actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => handleCopy(revealedValue, selected.credential_id)}
                      >
                        {copiedId === selected.credential_id ? '✓ Copied' : '📋 Copy'}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => { setRevealedId(null); setRevealedValue(null); }}
                      >
                        🙈 Hide
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-ghost" onClick={() => handleReveal(selected)}>
                    👁️ Reveal Value
                  </button>
                )}
              </div>
            </div>

            <div className="cred-panel-footer">
              <button className="btn btn-ghost" onClick={() => openEdit(selected)}>✏️ Edit</button>
              <button className="btn btn-danger" onClick={() => handleDelete(selected.credential_id)}>🗑️ Delete</button>
            </div>
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ Add Credential</h3>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {CRED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Host</label>
                  <select className="input" value={form.host_id} onChange={e => setForm({ ...form, host_id: e.target.value })}>
                    <option value="">— None —</option>
                    {hosts.map(h => <option key={h.host_id} value={h.host_id}>{h.hostname}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Name</label>
                <input className="input" placeholder="e.g. Production SSH Key" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>key_ref <span style={{ color: '#555', fontSize: '0.8rem' }}>(internal identifier)</span></label>
                <input className="input" placeholder="e.g. prod-ssh-key" value={form.key_ref}
                  onChange={e => setForm({ ...form, key_ref: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Secret Value</label>
                <textarea className="input" rows={3} placeholder="Paste the secret value here…"
                  value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Username <span style={{ color: '#555', fontSize: '0.8rem' }}>(for SSH_KEY / password)</span></label>
                <input className="input" placeholder="e.g. opc, ubuntu, root"
                  value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Environment</label>
                  <select className="input" value={form.environment || ''} onChange={e => setForm({ ...form, environment: e.target.value })}>
                    <option value="">— None —</option>
                    {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Owner <span style={{ color: '#555' }}>(optional)</span></label>
                  <input className="input" placeholder="e.g. devops" value={form.owner}
                    onChange={e => setForm({ ...form, owner: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Credential</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Edit Credential</h3>
              <button className="btn-icon" onClick={() => setShowEdit(false)}>✕</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label>Name</label>
                <input className="input" value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>New Value <span style={{ color: '#555', fontSize: '0.82rem' }}>(leave blank to keep current)</span></label>
                <textarea className="input" rows={3} placeholder="Enter new secret value to update…"
                  value={editForm.value} onChange={e => setEditForm({ ...editForm, value: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Username</label>
                <input className="input" placeholder="Username for this credential"
                  value={editForm.username} onChange={e => setEditForm({ ...editForm, username: e.target.value })} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowEdit(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}