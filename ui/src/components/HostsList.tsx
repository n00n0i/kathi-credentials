import React, { useState, useEffect } from 'react';
import { api, Host } from '../api/settingsApi';

export default function HostsList() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editHost, setEditHost] = useState<Host | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Create form
  const [form, setForm] = useState({
    hostname: '', ip: '', role: 'development', owner: '',
    tags: '', environment: '',
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    hostname: '', ip: '', role: 'development', owner: '',
    tags: '', environment: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getHosts();
      setHosts(data.hosts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createHost({
        hostname: form.hostname,
        ip: form.ip,
        role: form.role,
        owner: form.owner,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        environment: form.environment,
      });
      setMsg({ type: 'success', text: 'Host created successfully' });
      setShowCreate(false);
      setForm({ hostname: '', ip: '', role: 'development', owner: '', tags: '', environment: '' });
      load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editHost) return;
    try {
      await api.updateHost(editHost.host_id, {
        hostname: editForm.hostname,
        ip: editForm.ip,
        role: editForm.role,
        owner: editForm.owner,
        tags: editForm.tags ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        environment: editForm.environment,
      });
      setMsg({ type: 'success', text: 'Host updated successfully' });
      setEditHost(null);
      load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api.deleteHost(deleteId);
      setMsg({ type: 'success', text: 'Host deleted successfully' });
      setDeleteId(null);
      load();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  }

  function openEdit(h: Host) {
    setEditForm({
      hostname: h.hostname,
      ip: h.ip,
      role: h.role,
      owner: h.owner,
      tags: h.tags?.join(', ') || '',
      environment: h.environment || '',
    });
    setEditHost(h);
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2>🖥️ Hosts</h2>
          <p className="section-desc">Manage infrastructure hosts. Credentials are attached to hosts.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Host</button>
      </div>

      {msg && <div className={`message ${msg.type}`}>{msg.text}</div>}
      {error && <div className="message error">{error}</div>}

      {hosts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🖥️</div>
          <p>No hosts yet. Add your first host to get started.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: '1rem' }}>+ Add Host</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>IP Address</th>
                <th>Role</th>
                <th>Owner</th>
                <th>Tags</th>
                <th>Environment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map(h => (
                <tr key={h.host_id}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#a5b4fc' }}>{h.hostname}</span>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#555' }}>{h.host_id}</span>
                  </td>
                  <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{h.ip}</span></td>
                  <td>
                    <span className={`perm-tag ${h.role === 'production' ? 'red' : 'green'}`}>{h.role}</span>
                  </td>
                  <td style={{ color: '#ccc', fontSize: '0.85rem' }}>{h.owner || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(h.tags || []).map(t => (
                        <span key={t} className="status-badge inactive">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {h.environment
                      ? <span className={`status-badge ${h.environment === 'production' ? 'red' : h.environment === 'development' ? 'green' : 'inactive'}`}>{h.environment}</span>
                      : <span style={{ color: '#555' }}>-</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(h)}>✏️</button>
                      <button className="btn-icon" title="Delete" onClick={() => setDeleteId(h.host_id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>+ Add Host</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Hostname *</label>
                <input type="text" className="input" placeholder="prod-server-01" value={form.hostname}
                  onChange={e => setForm({ ...form, hostname: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>IP Address *</label>
                <input type="text" className="input" placeholder="10.0.2.100" value={form.ip}
                  onChange={e => setForm({ ...form, ip: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="development">development</option>
                  <option value="staging">staging</option>
                  <option value="production">production</option>
                </select>
              </div>
              <div className="form-group">
                <label>Owner</label>
                <input type="text" className="input" placeholder="devops" value={form.owner}
                  onChange={e => setForm({ ...form, owner: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input type="text" className="input" placeholder="linux, kubernetes" value={form.tags}
                  onChange={e => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Environment</label>
                <input type="text" className="input" placeholder="production" value={form.environment}
                  onChange={e => setForm({ ...form, environment: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editHost && (
        <div className="modal-overlay" onClick={() => setEditHost(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>✏️ Edit Host</h3>
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label>Hostname *</label>
                <input type="text" className="input" value={editForm.hostname}
                  onChange={e => setEditForm({ ...editForm, hostname: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>IP Address *</label>
                <input type="text" className="input" value={editForm.ip}
                  onChange={e => setEditForm({ ...editForm, ip: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select className="input" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="development">development</option>
                  <option value="staging">staging</option>
                  <option value="production">production</option>
                </select>
              </div>
              <div className="form-group">
                <label>Owner</label>
                <input type="text" className="input" value={editForm.owner}
                  onChange={e => setEditForm({ ...editForm, owner: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input type="text" className="input" placeholder="linux, kubernetes" value={editForm.tags}
                  onChange={e => setEditForm({ ...editForm, tags: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Environment</label>
                <input type="text" className="input" value={editForm.environment}
                  onChange={e => setEditForm({ ...editForm, environment: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button type="button" className="btn" onClick={() => setEditHost(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3>🗑️ Delete Host</h3>
            <p style={{ color: '#ccc', marginBottom: '1.5rem' }}>
              Are you sure you want to delete this host? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}