import React, { useState, useEffect } from 'react';
import SettingsPage from './SettingsPage';
import LoginScreen from './components/LoginScreen';
import { api } from './api/settingsApi';

const App: React.FC = () => {
  const [sessionValid, setSessionValid] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const token = localStorage.getItem('session_token');
    if (!token) {
      setSessionValid(false);
      return;
    }
    // Validate session with API
    api.getSession()
      .then(() => setSessionValid(true))
      .catch(() => {
        // Session expired or invalid → clear and show login
        localStorage.removeItem('session_token');
        localStorage.removeItem('session_expires_at');
        setSessionValid(false);
      });
  }, []);

  if (sessionValid === null) {
    // Still checking session validity
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff' }}>
        Loading...
      </div>
    );
  }

  if (!sessionValid) {
    return <LoginScreen />;
  }

  return <SettingsPage />;
};

export default App;
