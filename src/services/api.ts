import {
  AiModelMetadata,
  AiProviderConfigRecord,
  AiProviderId,
  AiProviderKeyRecord,
  CredentialRecord,
  CredentialType,
  CroxFlowNode,
  InsightsSummary,
  IntegrationConnectionRecord,
  IntegrationDefinition,
  NovaGenerationResult,
  ProjectRecord,
  UserProfile,
  UserSessionInfo,
  WorkflowEdge,
  WorkflowEvaluationRecord,
  WorkflowExecutionRecord,
  WorkflowNode,
  WorkflowRecord,
  WorkflowSettings,
  WorkflowTemplate,
  WorkflowVersionRecord,
} from '../types/workflow';

const TOKEN_STORAGE_KEY = 'crox_session_token';

export function getStoredSessionToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredSessionToken();
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    if (
      res.status === 401 &&
      typeof window !== 'undefined' &&
      !url.startsWith('/api/auth/login') &&
      !url.startsWith('/api/auth/register')
    ) {
      setStoredSessionToken(null);
      if (!url.startsWith('/api/auth/me')) {
        window.dispatchEvent(new CustomEvent('crox:unauthorized'));
      }
    }
    throw new ApiError(String(data.error || `Request failed (${res.status})`), res.status, data);
  }
  return data as T;
}

export const api = {
  health: () =>
    request<{
      status: string;
      capabilities: {
        aiProviderConfigured: boolean;
        smtpConfigured: boolean;
        credentialEncryptionConfigured: boolean;
      };
    }>('/api/health'),

  auth: {
    me: () => request<{ user: UserProfile }>('/api/auth/me'),
    login: async (email: string, password: string) => {
      const res = await request<{ user: UserProfile; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.token) setStoredSessionToken(res.token);
      return res;
    },
    demo: async () => {
      const res = await request<{ user: UserProfile; token?: string }>('/api/auth/demo', { method: 'POST' });
      if (res.token) setStoredSessionToken(res.token);
      return res;
    },
    register: async (fullName: string, email: string, password: string, confirmPassword: string) => {
      const res = await request<{ user: UserProfile; token?: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, confirmPassword }),
      });
      if (res.token) setStoredSessionToken(res.token);
      return res;
    },
    logout: async () => {
      try {
        return await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
      } finally {
        setStoredSessionToken(null);
      }
    },
    forgotPassword: (email: string) =>
      request<{ ok: boolean; message: string; emailConfigured: boolean }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string, confirmPassword: string) =>
      request<{ ok: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password, confirmPassword }),
      }),
  },

  projects: {
    list: () => request<{ projects: ProjectRecord[] }>('/api/projects'),
    get: (id: string) => request<{ project: ProjectRecord }>(`/api/projects/${id}`),
    create: (payload: { name: string; description?: string; workspaceName?: string }) =>
      request<{ project: ProjectRecord }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (
      id: string,
      payload: { name?: string; description?: string; workspaceName?: string; isArchived?: boolean }
    ) =>
      request<{ project: ProjectRecord }>(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<{ ok: boolean; fallbackProjectId: string }>(`/api/projects/${id}`, {
        method: 'DELETE',
      }),
  },

  workflows: {
    list: (projectId?: string) => {
      const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      return request<{
        workflows: WorkflowRecord[];
        stats: {
          totalWorkflows: number;
          activeWorkflows: number;
          totalExecutions: number;
          successfulExecutions: number;
        };
      }>(`/api/workflows${q}`);
    },
    insights: () => request<{ insights: InsightsSummary }>('/api/workflows/insights'),
    get: (id: string) => request<{ workflow: WorkflowRecord }>(`/api/workflows/${id}`),
    create: (payload: {
      name: string;
      description?: string;
      projectId?: string;
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
      settings?: WorkflowSettings;
    }) =>
      request<{ workflow: WorkflowRecord }>('/api/workflows', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    importJson: (workflowJson: unknown, projectId?: string) =>
      request<{ workflow: WorkflowRecord }>('/api/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ workflow: workflowJson, projectId }),
      }),
    exportJson: (id: string) =>
      request<{
        export: {
          croxVersion: string;
          exportedAt: string;
          name: string;
          description: string;
          nodes: WorkflowNode[];
          edges: WorkflowEdge[];
          settings: WorkflowSettings;
        };
      }>(`/api/workflows/${id}/export`),
    update: (
      id: string,
      payload: {
        name?: string;
        description?: string;
        projectId?: string;
        nodes?: WorkflowNode[];
        edges?: WorkflowEdge[];
        settings?: WorkflowSettings;
        saveVersion?: boolean;
        versionNote?: string;
      }
    ) =>
      request<{ workflow: WorkflowRecord }>(`/api/workflows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    moveToProject: (id: string, projectId: string) =>
      request<{ workflow: WorkflowRecord }>(`/api/workflows/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    setStatus: (id: string, isActive: boolean) =>
      request<{ workflow: WorkflowRecord }>(`/api/workflows/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    duplicate: (id: string) =>
      request<{ workflow: WorkflowRecord }>(`/api/workflows/${id}/duplicate`, {
        method: 'POST',
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/workflows/${id}`, {
        method: 'DELETE',
      }),
    versions: (id: string) => request<{ versions: WorkflowVersionRecord[] }>(`/api/workflows/${id}/versions`),
    createVersion: (id: string, note?: string) =>
      request<{ version: WorkflowVersionRecord }>(`/api/workflows/${id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    restoreVersion: (id: string, versionId: string) =>
      request<{ workflow: WorkflowRecord }>(`/api/workflows/${id}/versions/${versionId}/restore`, {
        method: 'POST',
      }),
    run: (id: string, mode: 'manual' | 'test' | 'chat' | 'form', payload?: unknown) =>
      request<{ execution: WorkflowExecutionRecord }>(`/api/workflows/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({ mode, payload }),
      }),
    runFromNode: (id: string, nodeId: string, payload?: unknown) =>
      request<{ execution: WorkflowExecutionRecord }>(`/api/workflows/${id}/run-from-node`, {
        method: 'POST',
        body: JSON.stringify({ nodeId, payload }),
      }),
    testNode: (
      id: string,
      node: WorkflowNode,
      sampleInput?: unknown,
      nodes?: WorkflowNode[],
      edges?: WorkflowEdge[]
    ) =>
      request<{ result: { output: unknown; simulated: boolean; durationMs: number; branch?: string } }>(
        `/api/workflows/${id}/test-node`,
        {
          method: 'POST',
          body: JSON.stringify({ node, sampleInput, nodes, edges }),
        }
      ),
    testModelConnection: (node: CroxFlowNode) =>
      request<{
        result: { ok: boolean; provider: string; model: string; reply: string; simulated: boolean };
      }>('/api/workflows/test-model-connection', {
        method: 'POST',
        body: JSON.stringify({ node }),
      }),
    clearAiMemory: (sessionKey: string, conversationId = 'default') =>
      request<{ ok: boolean; cleared: number }>('/api/workflows/ai-memory', {
        method: 'DELETE',
        body: JSON.stringify({ sessionKey, conversationId }),
      }),
    executions: (id: string) =>
      request<{ executions: WorkflowExecutionRecord[] }>(`/api/workflows/${id}/executions`),
    evaluations: (id: string) =>
      request<{ evaluations: WorkflowEvaluationRecord[] }>(`/api/workflows/${id}/evaluations`),
    evaluate: (id: string, runTest = true) =>
      request<{ evaluation: WorkflowEvaluationRecord }>(`/api/workflows/${id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({ runTest }),
      }),
    validateCron: (cronExpression: string, timezone: string) =>
      request<{ valid: boolean; nextRuns: string[]; error?: string }>('/api/workflows/validate-cron', {
        method: 'POST',
        body: JSON.stringify({ cronExpression, timezone }),
      }),
  },

  executions: {
    list: (params: { limit?: number; offset?: number; status?: string; workflowId?: string } = {}) => {
      const sp = new URLSearchParams();
      if (params.limit) sp.set('limit', String(params.limit));
      if (params.offset) sp.set('offset', String(params.offset));
      if (params.status) sp.set('status', params.status);
      if (params.workflowId) sp.set('workflowId', params.workflowId);
      return request<{
        executions: WorkflowExecutionRecord[];
        total: number;
        limit: number;
        offset: number;
      }>(`/api/executions?${sp.toString()}`);
    },
    get: (id: string) => request<{ execution: WorkflowExecutionRecord }>(`/api/executions/${id}`),
    cancel: (id: string) =>
      request<{ ok: boolean; cancelled: boolean }>(`/api/executions/${id}/cancel`, { method: 'POST' }),
  },

  credentials: {
    list: () =>
      request<{ credentials: CredentialRecord[]; encryptionConfigured: boolean }>('/api/credentials'),
    create: (payload: {
      label: string;
      type: CredentialType;
      secretValue: string;
      providerMeta?: Record<string, unknown>;
    }) =>
      request<{ credential: CredentialRecord }>('/api/credentials', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (
      id: string,
      payload: { label: string; type: CredentialType; secretValue?: string; providerMeta?: Record<string, unknown> }
    ) =>
      request<{ credential: CredentialRecord }>(`/api/credentials/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    setStatus: (id: string, isEnabled: boolean) =>
      request<{ credential: CredentialRecord }>(`/api/credentials/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled }),
      }),
    test: (id: string) =>
      request<{ ok: boolean; message: string }>(`/api/credentials/${id}/test`, {
        method: 'POST',
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/credentials/${id}`, {
        method: 'DELETE',
      }),
  },

  aiProviders: {
    list: () => request<{ providers: AiProviderConfigRecord[] }>('/api/ai-providers'),
    updateConfig: (
      providerId: AiProviderId,
      payload: {
        baseUrl?: string;
        defaultModel?: string;
        backupProviderId?: AiProviderId | '';
        isPrimary?: boolean;
        isEnabled?: boolean;
      }
    ) =>
      request<{ provider: AiProviderConfigRecord }>(`/api/ai-providers/${providerId}/config`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    discoverModels: (providerId: AiProviderId) =>
      request<{ models: AiModelMetadata[] }>(`/api/ai-providers/${providerId}/discover-models`, {
        method: 'POST',
      }),
    testProvider: (providerId: AiProviderId, keyId?: string) =>
      request<{ result: { ok: boolean; latencyMs: number; message: string; model: string } }>(
        `/api/ai-providers/${providerId}/test`,
        {
          method: 'POST',
          body: JSON.stringify({ keyId }),
        }
      ),
    addKey: (
      providerId: AiProviderId,
      payload: { label: string; apiKey: string; isPrimary?: boolean; projectTag?: string }
    ) =>
      request<{ key: AiProviderKeyRecord }>(`/api/ai-providers/${providerId}/keys`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateKey: (
      keyId: string,
      payload: { label?: string; isPrimary?: boolean; isEnabled?: boolean; projectTag?: string }
    ) =>
      request<{ key: AiProviderKeyRecord }>(`/api/ai-providers/keys/${keyId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteKey: (keyId: string) =>
      request<{ ok: boolean }>(`/api/ai-providers/keys/${keyId}`, {
        method: 'DELETE',
      }),
    testKey: (keyId: string) =>
      request<{ result: { ok: boolean; latencyMs: number; message: string; model: string } }>(
        `/api/ai-providers/keys/${keyId}/test`,
        { method: 'POST' }
      ),
  },

  integrations: {
    list: () =>
      request<{ integrations: IntegrationDefinition[]; connections: IntegrationConnectionRecord[] }>(
        '/api/integrations'
      ),
    connect: (
      appId: string,
      payload: { label: string; credentialId?: string | null; config?: Record<string, string> }
    ) =>
      request<{ connection: IntegrationConnectionRecord }>(`/api/integrations/${appId}/connect`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    testConnection: (connectionId: string) =>
      request<{ ok: boolean; message: string; connection: IntegrationConnectionRecord }>(
        `/api/integrations/connections/${connectionId}/test`,
        { method: 'POST' }
      ),
    deleteConnection: (connectionId: string) =>
      request<{ ok: boolean }>(`/api/integrations/connections/${connectionId}`, {
        method: 'DELETE',
      }),
  },

  templates: {
    list: () => request<{ templates: WorkflowTemplate[] }>('/api/templates'),
    install: (id: string, projectId?: string) =>
      request<{ workflow: WorkflowRecord }>(`/api/templates/${id}/install`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
  },

  nova: {
    status: () => request<{ providerConfigured: boolean; provider: 'gemini' | 'rule-based' }>('/api/nova/status'),
    generate: (prompt: string) =>
      request<{ result: NovaGenerationResult }>('/api/nova/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      }),
  },

  settings: {
    updateProfile: (fullName: string, email: string) =>
      request<{ user: UserProfile }>('/api/settings/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, email }),
      }),
    updatePreferences: (payload: { timezone: string; theme: 'light' | 'dark'; notificationsEnabled: boolean }) =>
      request<{ user: UserProfile }>('/api/settings/preferences', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
      request<{ ok: boolean; message: string }>('/api/settings/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      }),
    sessions: () => request<{ sessions: UserSessionInfo[] }>('/api/settings/sessions'),
    revokeSession: (sessionId: string) =>
      request<{ ok: boolean }>(`/api/settings/sessions/${sessionId}`, { method: 'DELETE' }),
    deleteAccount: (password: string) =>
      request<{ ok: boolean }>('/api/settings/account', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      }),
  },
};
