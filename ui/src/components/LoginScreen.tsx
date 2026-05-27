import React, { useState } from 'react';
import "../styles/settings.css";
import { api } from '../api/settingsApi';

const LoginScreen: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('กรุณากรอก username และ password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Call /users/login → Keycloak password grant → returns access_token
      const data = await api.userLogin(username.trim(), password);
      // Store Keycloak access_token as session_token (same key used throughout app)
      localStorage.setItem('session_token', data.access_token);
      localStorage.setItem('session_name', data.username);
      localStorage.setItem('session_user_id', data.user_id);
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401')) {
        setError('❌ username หรือ password ไม่ถูกต้อง');
      } else if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
        setError('❌ เชื่อมต่อ API ไม่ได้ — ตรวจสอบว่า server รันอยู่หรือไม่');
      } else {
        setError(`❌ ${msg}`);
      }
    }
    setLoading(false);
  };

  return (
    <div className="login-screen">
      {/* Ambient background glow */}
      <div className="login-glow" />

      <div className="login-card">
        {/* Logo */}
        <div className="login-logo-wrap">
          <div className="login-icon">🔐</div>
          <div className="login-shield" />
        </div>

        <h1 className="login-title">KathiCredentials</h1>
        <p className="login-subtitle">Credential &amp; Agent Management System</p>

        <form onSubmit={handleSubmit} className="login-form">
          {/* Username */}
          <div className="form-group">
            <label className="login-label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="login-input"
              autoFocus
              autoComplete="username"
              spellCheck={false}
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="login-label">Password</label>
            <div className="token-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="login-input"
                autoComplete="current-password"
                spellCheck={false}
              />
              <button
                type="button"
                className="token-toggle-visibility"
                onClick={() => setShowPassword(v => !v)}
                title={showPassword ? 'ซ่อน password' : 'แสดง password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || !username.trim() || !password.trim()}
          >
            {loading ? (
              <span className="login-btn-loading">
                <span className="spinner-sm" />
                กำลังเข้าสู่ระบบ...
              </span>
            ) : (
              <span>🔓 เข้าสู่ระบบ</span>
            )}
          </button>
        </form>

        {/* Admin token fallback */}
        <div className="login-footer">
          <p>Keycloak SSO — หรือ ใส่ Keycloak access_token โดยตรง</p>
          <details className="admin-token-details">
            <summary>🔑 Login ด้วย Keycloak Token (Advanced)</summary>
            <AdminTokenFallback />
          </details>
        </div>

        <div className="login-footer">
          <div className="login-footer-line">
            <span className="login-footer-dot" />
            <span className="login-footer-dot" />
            <span className="login-footer-dot" />
          </div>
          <p>KathiCredentials v0.1.0 — Secure Credential Manager</p>
        </div>
      </div>
    </div>
  );
};

/** Admin token fallback — paste a raw Keycloak JWT or admin token */
const AdminTokenFallback: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError('กรุณากรอก token');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.login(tokenInput.trim());
      localStorage.setItem('session_token', data.session_token);
      localStorage.setItem('session_expires_at', data.expires_at);
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Token ไม่ถูกต้อง');
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="login-form" style={{ marginTop: 12 }}>
      <div className="form-group" style={{ marginBottom: 8 }}>
        <div className="token-input-wrap">
          <input
            type={showToken ? 'text' : 'password'}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="eyJh... (Keycloak JWT หรือ admin token)"
            className="login-input"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="token-toggle-visibility"
            onClick={() => setShowToken(v => !v)}
          >
            {showToken ? '🙈' : '👁️'}
          </button>
        </div>
      </div>
      {error && <div className="login-error" style={{ marginBottom: 8 }}><span>⚠️</span> {error}</div>}
      <button type="submit" className="btn btn-secondary login-btn" disabled={loading}>
        {loading ? 'กำลัง...' : '🔓 Login ด้วย Token'}
      </button>
    </form>
  );
};

export default LoginScreen;
