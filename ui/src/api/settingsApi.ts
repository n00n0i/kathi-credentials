const API_BASE = '';

interface RequestOptions {
  method?: string;
  body?: Record<string, unknown>;
}

export const api = {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = localStorage.getItem('session_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.detail || `HTTP ${res.status}`);
    }

    return res.json();
  },

  // Auth / Session
  login: (adminToken: string) =>
    api.request<{ session_token: string; expires_at: string; name: string; permissions: string[] }>(
      '/api/auth/login',
      { method: 'POST', body: { token: adminToken } }
    ),
  // Keycloak username+password login → returns raw access_token
  userLogin: (username: string, password: string) =>
    api.request<{
      access_token: string;
      expires_in: number;
      user_id: string;
      username: string;
      email: string;
      first_name: string;
      last_name: string;
    }>(
      '/api/users/login',
      { method: 'POST', body: { username, password } }
    ),
  getSession: () =>
    api.request<{ session_token: string; expires_at: string; name: string; permissions: string[] }>(
      '/api/auth/session'
    ),
  logout: () =>
    api.request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Telegram
  getTelegramConfig: () => api.request<{ bot_token: string; chat_id: string; is_enabled: boolean }>('/api/settings/telegram'),
  saveTelegram: (data: { bot_token: string; chat_id: string; is_enabled: boolean }) =>
    api.request('/api/settings/telegram', { method: 'PUT', body: data }),
  testTelegram: () => api.request<{ success: boolean; message_id?: number; error?: string }>('/api/settings/telegram/test', { method: 'POST' }),

  // Encryption
  getEncryptionMeta: () => api.request<{ created_at: string; algorithm: string }>('/api/settings/encryption/key'),
  rotateEncryptionKey: () => api.request<{ success: boolean; error?: string }>('/api/settings/encryption/rotate', { method: 'POST' }),

  // Admin Token
  getAdminToken: () => api.request<{ token: string }>('/api/settings/admin/token'),
  regenerateAdminToken: () => api.request<{ token: string }>('/api/settings/admin/token', { method: 'POST' }),

  // Hosts
  getHosts: () => api.request<{ hosts: Host[] }>('/api/hosts'),
  createHost: (data: { hostname: string; ip: string; role: string; owner: string; environment?: string; tags?: string[] }) =>
    api.request<{ host_id: string }>('/api/hosts', { method: 'POST', body: data }),
  updateHost: (hostId: string, data: { hostname?: string; ip?: string; role?: string; owner?: string; environment?: string; tags?: string[] }) =>
    api.request<{ success: boolean }>(`/api/hosts/${hostId}`, { method: 'PUT', body: data }),
  deleteHost: (hostId: string) =>
    api.request<{ success: boolean }>(`/api/hosts/${hostId}`, { method: 'DELETE' }),

  // Credentials
  getCredentials: (host_id?: string) => {
    const qs = host_id !== undefined ? `?host_id=${encodeURIComponent(host_id)}` : '';
    return api.request<{ credentials: Credential[] }>(`/api/credentials${qs}`);
  },
  getCredential: (id: string) => api.request<CredentialWithValue>(`/api/credentials/${id}`),
  createCredential: (data: { host_id: string; type: string; name?: string; key_ref: string; value: string; owner?: string; environment?: string }) =>
    api.request<{ credential_id: string }>('/api/credentials', { method: 'POST', body: data }),
  updateCredential: (id: string, data: { name?: string; value?: string }) =>
    api.request<{ success: boolean }>(`/api/credentials/${id}`, { method: 'PUT', body: data }),
  deleteCredential: (id: string) =>
    api.request<{ success: boolean }>(`/api/credentials/${id}`, { method: 'DELETE' }),

  // Agents
  getAgents: () => api.request<{ agents: Agent[] }>('/api/agents'),
  createAgent: (data: { name: string; permissions: string[] }) =>
    api.request<{ agent_id: string; token: string }>('/api/agents', { method: 'POST', body: data }),
  revokeAgent: (agentId: string) =>
    api.request('/api/agents/' + agentId, { method: 'DELETE' }),

  // Audit
  getAuditLog: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return api.request<{ entries: AuditEntry[] }>(`/api/audit?${qs}`);
  },

  // System
  getHealth: () => api.request<HealthStatus>('/health'),

  // Users
  listUsers: () => api.request<{ users: User[] }>('/api/users'),
  getUser: (userId: string) => api.request<User>(`/api/users/${userId}`),
  createUser: (data: UserCreate) => api.request<User>('/api/users', { method: 'POST', body: data as unknown as Record<string, unknown> }),
  updateUser: (userId: string, data: Partial<Omit<UserCreate, 'password'>> & { enabled?: boolean }) =>
    api.request<User>(`/api/users/${userId}`, { method: 'PUT', body: data }),
  resetUserPassword: (userId: string, newPassword: string) =>
    api.request<{ success: boolean }>(`/api/users/${userId}/reset-password`, { method: 'POST', body: { new_password: newPassword } }),
  deleteUser: (userId: string) =>
    api.request<{ success: boolean }>(`/api/users/${userId}`, { method: 'DELETE' }),
};

export interface Host {
  host_id: string;
  hostname: string;
  ip: string;
  role: string;
  owner: string;
  tags: string[];
  environment: string;
  created_at: string;
}

export interface Credential {
  credential_id: string;
  name: string;
  type: string;
  key_ref: string;
  hostname: string;
  host_id: string;
  environment: string;
  owner?: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialDetail extends Credential {
  value: string;
  owner?: string;
}

export interface CredentialWithValue {
  credential_id: string;
  type: string;
  key_ref: string;
  value: string;
  owner?: string;
}

export interface Agent {
  agent_id: string;
  name: string;
  permissions: string[];
  token_preview: string;
  created_at: string;
  is_active: boolean;
}

export interface AuditEntry {
  log_id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  success: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  neo4j: 'connected' | 'disconnected';
  telegram: 'connected' | 'not_configured' | 'error';
  uptime_seconds: number;
  version: string;
  total_credentials: number;
  total_hosts: number;
  total_agents: number;
}

// Users
export interface User {
  user_id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  enabled: boolean;
  created_at: string;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}
