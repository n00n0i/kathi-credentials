import React, { useState, useEffect } from 'react';
import { api, User, UserCreate } from '../api/settingsApi';

type ModalMode = 'closed' | 'create' | 'edit' | 'resetPw' | 'delete';

interface Toast { msg: string; type: 'success' | 'error'; id: number }

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<{ mode: ModalMode; user?: User }>({ mode: 'closed' });
  const [form, setForm] = useState<UserCreate>({ username: '', email: '', password: '', first_name: '', last_name: '' });
  const [editForm, setEditForm] = useState({ email: '', first_name: '', last_name: '', enabled: true, username: '' });
  const [pw, setPw] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  const toast = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listUsers();
      setUsers(data.users);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const openCreate = () => { setForm({ username: '', email: '', password: '', first_name: '', last_name: '' }); setModal({ mode: 'create' }); };
  const openEdit = (u: User) => {
    setEditForm({ email: u.email, first_name: u.first_name, last_name: u.last_name, enabled: u.enabled, username: u.username });
    setModal({ mode: 'edit', user: u });
  };
  const openResetPw = (u: User) => { setPw(''); setModal({ mode: 'resetPw', user: u }); };
  const openDelete = (u: User) => { setConfirmDelete(''); setModal({ mode: 'delete', user: u }); };

  const handleCreate = async () => {
    try {
      await api.createUser(form);
      toast('User created successfully');
      setModal({ mode: 'closed' });
      loadUsers();
    } catch (e: unknown) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const handleEdit = async () => {
    if (!modal.user) return;
    try {
      await api.updateUser(modal.user.user_id, editForm);
      toast('User updated');
      setModal({ mode: 'closed' });
      loadUsers();
    } catch (e: unknown) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const handleResetPw = async () => {
    if (!modal.user || !pw.trim()) return;
    try {
      await api.resetUserPassword(modal.user.user_id, pw);
      toast('Password reset successfully');
      setModal({ mode: 'closed' });
    } catch (e: unknown) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const handleDelete = async () => {
    if (!modal.user || confirmDelete !== modal.user.username) return;
    try {
      await api.deleteUser(modal.user.user_id);
      toast('User deleted');
      setModal({ mode: 'closed' });
      loadUsers();
    } catch (e: unknown) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const copyId = (id: string) => { navigator.clipboard.writeText(id).catch(() => {}); toast('Copied!'); };
  const formatDate = (ts: string) => { if (!ts) return '—'; try { return new Date(ts).toLocaleDateString('th-TH'); } catch { return ts; } };

  return (
    <div className="user-mgmt">
      <style>{`
        .user-mgmt { color: #e2e8f0; }
        .user-mgmt .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .user-mgmt h2 { margin: 0; font-size: 1.1rem; color: #e2e8f0; }
        .user-mgmt .btn { padding: 8px 16px; border-radius: 8px; border: 1px solid #2a2a3a; background: #1a1a2e; color: #e2e8f0; cursor: pointer; font-size: 0.875rem; transition: all 0.15s; }
        .user-mgmt .btn:hover { background: #252540; }
        .user-mgmt .btn-primary { background: #4f46e5; border-color: #4f46e5; }
        .user-mgmt .btn-primary:hover { background: #4338ca; }
        .user-mgmt .btn-danger { background: transparent; border-color: #ef4444; color: #ef4444; }
        .user-mgmt .btn-danger:hover { background: #ef444420; }
        .user-mgmt .btn-sm { padding: 5px 10px; font-size: 0.8rem; }
        .user-mgmt table { width: 100%; border-collapse: collapse; }
        .user-mgmt th { text-align: left; padding: 10px 12px; border-bottom: 1px solid #2a2a3a; color: #888; font-size: 0.75rem; font-weight: 500; text-transform: uppercase; }
        .user-mgmt td { padding: 12px; border-bottom: 1px solid #1e1e30; vertical-align: middle; }
        .user-mgmt tr:hover td { background: #1a1a2e; }
        .user-mgmt .uid-cell { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #888; font-family: monospace; }
        .user-mgmt .copy-btn { background: none; border: none; color: #888; cursor: pointer; padding: 2px 6px; font-size: 0.7rem; border-radius: 4px; }
        .user-mgmt .copy-btn:hover { color: #e2e8f0; background: #2a2a3a; }
        .user-mgmt .badge { display: inline-block; padding: 3px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: 500; }
        .user-mgmt .badge-active { background: #22c55e20; color: #22c55e; }
        .user-mgmt .badge-inactive { background: #ef444420; color: #ef4444; }
        .user-mgmt .actions { display: flex; gap: 6px; }
        .user-mgmt .table-wrap { border: 1px solid #2a2a3a; border-radius: 10px; overflow: hidden; }
        .user-mgmt .modal-overlay { position: fixed; inset: 0; background: #00000080; display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .user-mgmt .modal { background: #1a1a2e; border: 1px solid #2a2a3a; border-radius: 12px; padding: 24px; width: 420px; max-width: 90vw; }
        .user-mgmt .modal h3 { margin: 0 0 16px; font-size: 1rem; }
        .user-mgmt .form-row { margin-bottom: 12px; }
        .user-mgmt .form-row label { display: block; font-size: 0.75rem; color: #888; margin-bottom: 4px; }
        .user-mgmt .form-row input { width: 100%; padding: 8px 10px; background: #0f1117; border: 1px solid #2a2a3a; border-radius: 6px; color: #e2e8f0; font-size: 0.875rem; box-sizing: border-box; }
        .user-mgmt .form-row input:focus { outline: none; border-color: #4f46e5; }
        .user-mgmt .form-row .check-row { display: flex; align-items: center; gap: 8px; }
        .user-mgmt .form-row input[type="checkbox"] { width: auto; }
        .user-mgmt .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
        .user-mgmt .loading { text-align: center; padding: 40px; color: #888; }
        .user-mgmt .error { text-align: center; padding: 20px; color: #ef4444; }
        .user-mgmt .empty { text-align: center; padding: 40px; color: #555; }
        .user-mgmt .toast { position: fixed; bottom: 20px; right: 20px; padding: 10px 16px; border-radius: 8px; font-size: 0.875rem; z-index: 2000; animation: slideIn 0.2s; }
        .user-mgmt .toast-success { background: #22c55e; color: white; }
        .user-mgmt .toast-error { background: #ef4444; color: white; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      {/* Toasts */}
      {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}

      {/* Header */}
      <div className="section-header">
        <h2>👥 User Management</h2>
        <button className="btn btn-primary" onClick={openCreate}>+ Create User</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading">Loading users…</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : users.length === 0 ? (
        <div className="empty">No users found.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td>
                    <div className="uid-cell">
                      <span>{u.user_id.slice(0, 8)}…</span>
                      <button className="copy-btn" onClick={() => copyId(u.user_id)} title="Copy full ID">📋</button>
                    </div>
                  </td>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td>
                    <span className={`badge ${u.enabled ? 'badge-active' : 'badge-inactive'}`}>
                      {u.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{formatDate(u.created_at)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-sm" onClick={() => openEdit(u)}>Edit</button>
                      <button className="btn btn-sm" onClick={() => openResetPw(u)}>Reset PW</button>
                      <button className="btn btn-sm btn-danger" onClick={() => openDelete(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {modal.mode === 'create' && (
        <div className="modal-overlay" onClick={() => setModal({ mode: 'closed' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create User</h3>
            {(['username', 'email', 'password', 'first_name', 'last_name'] as const).map(field => (
              <div className="form-row" key={field}>
                <label>{field.replace('_', ' ')}</label>
                <input type={field === 'password' ? 'password' : 'text'} value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn" onClick={() => setModal({ mode: 'closed' })}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}

      {modal.mode === 'edit' && modal.user && (
        <div className="modal-overlay" onClick={() => setModal({ mode: 'closed' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Edit User: {modal.user.username}</h3>
            {(['username', 'email', 'first_name', 'last_name'] as const).map(field => (
              <div className="form-row" key={field}>
                <label>{field.replace('_', ' ')}</label>
                <input type="text" value={editForm[field]} onChange={e => setEditForm(p => ({ ...p, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="form-row">
              <div className="check-row">
                <input type="checkbox" id="enabled-check" checked={editForm.enabled} onChange={e => setEditForm(p => ({ ...p, enabled: e.target.checked }))} />
                <label htmlFor="enabled-check">Enabled</label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModal({ mode: 'closed' })}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      {modal.mode === 'resetPw' && modal.user && (
        <div className="modal-overlay" onClick={() => setModal({ mode: 'closed' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Reset Password: {modal.user.username}</h3>
            <div className="form-row">
              New Password
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Enter new password" />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModal({ mode: 'closed' })}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResetPw}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {modal.mode === 'delete' && modal.user && (
        <div className="modal-overlay" onClick={() => setModal({ mode: 'closed' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete User: {modal.user.username}</h3>
            <p style={{color: '#ef4444', fontSize: '0.875rem'}}>This action cannot be undone. Type <strong>{modal.user.username}</strong> to confirm:</p>
            <div className="form-row">
              <input type="text" value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} placeholder={modal.user.username} />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setModal({ mode: 'closed' })}>Cancel</button>
              <button className="btn btn-danger" disabled={confirmDelete !== modal.user.username} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
