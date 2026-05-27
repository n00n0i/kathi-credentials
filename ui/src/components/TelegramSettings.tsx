import React, { useState, useEffect } from 'react';

const TelegramSettings: React.FC = () => {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load saved config on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/telegram', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
        });
        if (res.ok) {
          const data = await res.json();
          setChatId(data.chat_id || '');
          setIsEnabled(data.is_enabled ?? true);
          // bot_token is masked as *** — only set if user hasn't typed a new one
          if (data.bot_token === '***') {
            setBotToken('***'); // tell UX it's pre-filled but not changeable
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        bot_token: botToken && botToken !== '***' ? botToken : '',
        chat_id: chatId,
        is_enabled: isEnabled,
      };
      const res = await fetch('/api/settings/telegram', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '✅ Telegram settings saved!' });
      } else {
        setMessage({ type: 'error', text: '❌ Failed to save settings' });
      }
    } catch {
      setMessage({ type: 'error', text: '❌ Network error' });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/telegram/test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('session_token')}` },
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `✅ Test message sent! (${data.message_id})` });
      } else {
        setMessage({ type: 'error', text: `❌ ${data.error || 'Failed to send'}` });
      }
    } catch {
      setMessage({ type: 'error', text: '❌ Network error' });
    }
    setTesting(false);
  };

  return (
    <div className="settings-section">
      <h2>📱 Telegram Notification</h2>
      <p className="section-desc">Configure the Telegram bot to receive credential access notifications.</p>

      <div className="form-group">
        <label>Bot Token</label>
        <div className="input-with-button">
          <input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456:ABC-DEFxxxxx"
            className="input"
          />
          <button className="btn-icon" onClick={() => navigator.clipboard.readText().then(t => setBotToken(t))} title="Paste">📋</button>
        </div>
        <span className="hint">Create a bot via <strong>@BotFather</strong> and copy the token</span>
      </div>

      <div className="form-group">
        <label>Chat ID</label>
        <div className="input-with-button">
          <input
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="123456789"
            className="input"
          />
          <button className="btn-icon" onClick={() => navigator.clipboard.readText().then(t => setChatId(t))} title="Paste">📋</button>
        </div>
        <span className="hint">Your Telegram user ID — send a message to <strong>@userinfobot</strong> to find out</span>
      </div>

      <div className="form-group">
        <label className="toggle-label">
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          <span>Enable notifications</span>
        </label>
      </div>

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      <div className="button-row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '💾 Saving...' : '💾 Save Settings'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || !chatId}>
          {testing ? '📤 Sending...' : '📤 Send Test Message'}
        </button>
      </div>
    </div>
  );
};

export default TelegramSettings;