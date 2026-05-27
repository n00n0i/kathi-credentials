import React, { useState } from 'react';
import { api } from '../api/settingsApi';

const AdminTokenSettings: React.FC = () => {
  const [token, setToken] = useState<string>('');          // real token
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchToken = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminToken();
      setToken(res.token);
      setRevealed(true);
    } catch (e: any) {
      setMessage({ type: 'error', text: ' Failed to fetch token: ' + e.message });
    }
    setLoading(false);
  };

  const handleRegenerate = async () => {
    if (!confirm(' Regenerating the admin token will INVALIDATE the current token immediately. Make sure to update all scripts using the old token. Continue?')) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.regenerateAdminToken();
      setToken(res.token);
      setRevealed(true);
      setMessage({ type: 'success', text: ' Admin token regenerated!' });
    } catch (e: any) {
      setMessage({ type: 'error', text: ' Failed to regenerate token: ' + e.message });
    }
    setLoading(false);
  };

  const handleCopy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setMessage({ type: 'success', text: ' Token copied to clipboard!' });
    setTimeout(() => setCopied(false), 2000);
  };

  const maskedToken = token
    ? (revealed ? token : token.slice(0, 4) + '-****-****-****-************'.slice(token.length))
    : '';

  return (
    <div className="settings-section">
      <h2>🔑 Admin Token</h2>
      <p className="section-desc">The master token for initial setup and administrative operations. Format: <code>sk-</code> followed by 16 alphanumeric characters.</p>

      <div className="form-group">
        <label>Current Token</label>
        <div className="input-with-button">
          <input
            type="text"
            value={maskedToken}
            readOnly
            className="input"
          />
          <button className="btn-icon" onClick={() => setRevealed(!revealed)} title={revealed ? 'Hide' : 'Show'}>
            {revealed ? '👁' : '👁'}
          </button>
          <button className="btn-icon" onClick={handleCopy} title="Copy">{copied ? '✅' : '📋'}</button>
        </div>
        <span className="hint">This token has full access to all operations</span>
      </div>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="button-row">
        <button className="btn btn-secondary" onClick={fetchToken} disabled={loading}>
          {revealed ? '🔄 Refresh' : '👁 Reveal Token'}
        </button>
        <button className="btn btn-danger" onClick={handleRegenerate} disabled={loading}>
          🔄 Regenerate Token
        </button>
      </div>

      <div className="warning-card">
        <h3>⚠️ Security Notice</h3>
        <ul>
          <li>Store this token securely — it grants full system access</li>
          <li>Never commit it to version control</li>
          <li>Rotate it immediately if you suspect it has been compromised</li>
          <li>Use agent-specific tokens for automated operations</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminTokenSettings;
