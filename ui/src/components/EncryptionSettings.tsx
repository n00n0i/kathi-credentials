import React, { useState } from 'react';
import { api } from '../api/settingsApi';

const EncryptionSettings: React.FC = () => {
  const [keyCreated, setKeyCreated] = useState<string | null>(null);
  const [algorithm, setAlgorithm] = useState<string>('AES-128-CBC (Fernet)');
  const [credentialCount, setCredentialCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  React.useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [encMeta, healthData] = await Promise.all([
          api.getEncryptionMeta(),
          api.getHealth(),
        ]);
        if (encMeta.created_at) setKeyCreated(encMeta.created_at);
        if (encMeta.algorithm) setAlgorithm(encMeta.algorithm);
        setCredentialCount(healthData.total_credentials);
      } catch {
        // silently ignore — show no-key state
      }
    };
    fetchMeta();
  }, []);

  const handleRotate = async () => {
    if (!confirm('⚠️ Rotating the encryption key will re-encrypt ALL credentials. Agents will not be able to decrypt existing values until the rotation completes. Continue?')) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.rotateEncryptionKey();
      if (res.success) {
        setKeyCreated(new Date().toISOString());
        setMessage({ type: 'success', text: '🔄 Encryption key rotated successfully!' });
      } else {
        setMessage({ type: 'error', text: '❌ ' + (res.error || 'Rotation failed') });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: '❌ ' + (e.message || 'Network error') });
    }
    setLoading(false);
  };

  return (
    <div className="settings-section">
      <h2>🔐 Encryption Key Management</h2>
      <p className="section-desc">AES-128 encryption protects all credential values stored in Neo4j.</p>

      <div className="info-card">
        <div className="info-row">
          <span className="info-label">Algorithm</span>
          <span className="info-value">{algorithm}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Key Created</span>
          <span className="info-value">{keyCreated ? new Date(keyCreated).toLocaleString() : 'No key — generate one to get started'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Stored</span>
          <span className="info-value">Environment variable (ENCRYPTION_KEY)</span>
        </div>
        <div className="info-row">
          <span className="info-label">Credentials Encrypted</span>
          <span className="info-value">{credentialCount ?? '—'}</span>
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="action-card">
        <h3>🔑 {(keyCreated ? 'Key Rotation' : 'Initialize Encryption Key')}</h3>
        {keyCreated ? (
          <>
            <p>Rotate the encryption key when:</p>
            <ul>
              <li>Key may have been compromised</li>
              <li>Scheduled rotation policy requires it</li>
              <li>Compliance mandates periodic key changes</li>
            </ul>
            <p className="warning-text">⚠️ This will re-encrypt all credential values. The API will be unavailable during rotation.</p>
            <button className="btn btn-warning" onClick={handleRotate} disabled={loading}>
              {loading ? '⏳ Rotating...' : '🔄 Rotate Encryption Key'}
            </button>
          </>
        ) : (
          <>
            <p>No encryption key found. Generate one to start encrypting credential values in Neo4j.</p>
            <button className="btn btn-primary" onClick={handleRotate} disabled={loading}>
              {loading ? '⏳ Generating...' : '🔑 Generate Encryption Key'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EncryptionSettings;
