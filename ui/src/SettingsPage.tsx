import React, { useState, useEffect } from 'react';
import TelegramSettings from './components/TelegramSettings';
import EncryptionSettings from './components/EncryptionSettings';
import AdminTokenSettings from './components/AdminTokenSettings';
import AgentsSettings from './components/AgentsSettings';
import AuditLogSettings from './components/AuditLogSettings';
import SystemHealth from './components/SystemHealth';
import CredentialsList from './components/CredentialsList';
import HostsList from './components/HostsList';
import UserManagement from './components/UserManagement';
import './styles/settings.css';
import './styles/credentials.css';

type TabId = 'telegram' | 'encryption' | 'admin' | 'credentials' | 'hosts' | 'agents' | 'audit' | 'system' | 'users';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
  description: string;
}

const TABS: Tab[] = [
  { id: 'telegram', label: 'Telegram', icon: '📱', description: 'Bot token, chat ID, test notification' },
  { id: 'encryption', label: 'Encryption', icon: '🔐', description: 'Key management & rotation' },
  { id: 'admin', label: 'Admin Token', icon: '🔑', description: 'Master token for setup & admin' },
  { id: 'credentials', label: 'Credentials', icon: '🔑', description: 'Stored credentials — SSH keys, passwords, API keys' },
  { id: 'hosts', label: 'Hosts', icon: '🖥️', description: 'Manage hosts — attach credentials to servers' },
  { id: 'agents', label: 'Agents', icon: '🤖', description: 'Manage agent tokens & permissions' },
  { id: 'audit', label: 'Audit Log', icon: '📋', description: 'Credential access history' },
  { id: 'system', label: 'System', icon: '⚙️', description: 'Health check & service status' },
  { id: 'users', label: 'Users', icon: '👥', description: 'Manage users via Keycloak' },
];

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('telegram');
  const [loading, setLoading] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'telegram':
        return <TelegramSettings />;
      case 'encryption':
        return <EncryptionSettings />;
      case 'admin':
        return <AdminTokenSettings />;
      case 'credentials':
        return <CredentialsList />;
      case 'hosts':
        return <HostsList />;
      case 'agents':
        return <AgentsSettings />;
      case 'audit':
        return <AuditLogSettings />;
      case 'system':
        return <SystemHealth />;
      case 'users':
        return <UserManagement />;
      default:
        return null;
    }
  };

  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-header">
        <div className="settings-title-row">
          <h1>⚙️ KathiCredentials Settings</h1>
          <span className="badge">v0.1.0</span>
        </div>
        <p className="settings-subtitle">
          Manage Telegram notifications, encryption keys, credentials, agent permissions, and audit logs.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="settings-layout">
        <nav className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
              <span className="tab-desc">{tab.description}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="settings-content">
          {loading ? (
            <div className="loading-overlay">
              <div className="spinner" />
            </div>
          ) : (
            renderContent()
          )}
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;