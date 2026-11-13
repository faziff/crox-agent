import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Blocks,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  CredentialRecord,
  IntegrationConnectionRecord,
  IntegrationDefinition,
} from '../types/workflow';

const CATEGORIES = ['All', 'Communication', 'Productivity', 'Business', 'Development', 'Google', 'Generic'];

function AvailabilityTag({ status }: { status: IntegrationDefinition['availability'] }) {
  if (status === 'available') {
    return (
      <span className="px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
        Available
      </span>
    );
  }
  if (status === 'requires_credentials') {
    return (
      <span className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium">
        Requires Credentials
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
      Coming Soon
    </span>
  );
}

export const IntegrationsPage: React.FC = () => {
  const [integrations, setIntegrations] = useState<IntegrationDefinition[]>([]);
  const [connections, setConnections] = useState<IntegrationConnectionRecord[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const [connectTarget, setConnectTarget] = useState<IntegrationDefinition | null>(null);
  const [connLabel, setConnLabel] = useState('');
  const [credMode, setCredMode] = useState<'existing' | 'new'>('existing');
  const [selectedCredId, setSelectedCredId] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [intRes, connRes, credRes] = await Promise.all([
        api.integrations.list(),
        api.integrations.listConnections(),
        api.credentials.list(),
      ]);
      setIntegrations(intRes.integrations);
      setConnections(connRes.connections);
      setCredentials(credRes.credentials.filter((c) => c.isEnabled !== false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return integrations.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [integrations, category, search]);

  const openConnect = (def: IntegrationDefinition) => {
    setConnectTarget(def);
    setConnLabel(`${def.name} Connection`);
    setSelectedCredId(credentials[0]?.id || '');
    setCredMode(credentials.length > 0 ? 'existing' : 'new');
    setNewSecretValue('');
    setError(null);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectTarget) return;
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      let credId = selectedCredId;
      if (connectTarget.availability === 'requires_credentials' && credMode === 'new') {
        const created = await api.credentials.create({
          label: `${connLabel.trim()} Secret`,
          type: connectTarget.authType === 'oauth2' ? 'oauth2' : 'app_credential',
          secretValue: newSecretValue.trim(),
          providerMeta: { appId: connectTarget.appId },
        });
        credId = created.credential.id;
      }

      await api.integrations.connect(connectTarget.appId, {
        label: connLabel.trim() || `${connectTarget.name} Connection`,
        credentialId: credId || undefined,
      });
      setConnectTarget(null);
      setNotice(`Saved connection for ${connectTarget.name}. Run Test Connection to verify credentials.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect integration.');
    } finally {
      setConnecting(false);
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    setTestingId(connectionId);
    setError(null);
    setNotice(null);
    try {
      const res = await api.integrations.testConnection(connectionId);
      setNotice(res.message);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection verification failed.');
      await loadAll();
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteConnection = async (connectionId: string) => {
    try {
      await api.integrations.deleteConnection(connectionId);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect.');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Integrations & Connectors
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Connect external SaaS services with AES-256-GCM credentials and SSRF-checked REST execution.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps & actions..."
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
          />
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Active Connections */}
      {connections.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-5 space-y-3 shadow-xs">
          <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
            Configured Connections ({connections.length})
          </h2>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {connections.map((conn) => (
              <div key={conn.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">{conn.label}</span>
                    <span className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-[11px] font-mono text-zinc-600 dark:text-zinc-300">
                      {conn.appId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                        conn.status === 'connected'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : conn.status === 'error'
                            ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
                      }`}
                    >
                      {conn.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {conn.credentialLabel ? `Credential: ${conn.credentialLabel}` : 'No credential linked'}
                    {conn.lastError ? ` · Error: ${conn.lastError}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleTestConnection(conn.id)}
                    disabled={testingId === conn.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {testingId === conn.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-[#E11D48]" />
                    )}
                    <span>Test Connection</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteConnection(conn.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Disconnect"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              category === cat
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.appId}
              className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col justify-between gap-4 shadow-xs"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200 shrink-0">
                      <Blocks className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white truncate">
                        {item.name}
                      </h3>
                      <p className="text-[11px] text-zinc-500">{item.category}</p>
                    </div>
                  </div>
                  <AvailabilityTag status={item.availability} />
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{item.description}</p>

                <div className="text-[11px] text-zinc-500 space-y-1 pt-1">
                  {item.actions.length > 0 && (
                    <p className="truncate">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Actions:</span>{' '}
                      {item.actions.map((a) => a.name).join(', ')}
                    </p>
                  )}
                  {item.rateLimitNote && (
                    <p className="truncate">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Rate Limit:</span>{' '}
                      {item.rateLimitNote}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500 tabular-nums">
                  {(item.connectedCount || 0) > 0
                    ? `${item.connectedCount} connected`
                    : item.availability === 'coming_soon'
                      ? 'Use HTTP Request'
                      : 'Not connected'}
                </span>
                {item.availability === 'coming_soon' ? (
                  <span className="text-xs font-medium text-zinc-400">Unavailable</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openConnect(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Connect</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Modal */}
      {connectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleConnect}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Connect {connectTarget.name}</h2>
              <button
                type="button"
                onClick={() => setConnectTarget(null)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Connection Label
                </label>
                <input
                  type="text"
                  required
                  value={connLabel}
                  onChange={(e) => setConnLabel(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                />
              </div>

              {connectTarget.availability === 'requires_credentials' && (
                <>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setCredMode('existing')}
                      disabled={credentials.length === 0}
                      className={`flex-1 py-1.5 rounded-lg border font-medium ${
                        credMode === 'existing'
                          ? 'border-[#E11D48] bg-rose-50 dark:bg-rose-950/30 text-[#E11D48]'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600'
                      } disabled:opacity-40`}
                    >
                      Use Saved Credential
                    </button>
                    <button
                      type="button"
                      onClick={() => setCredMode('new')}
                      className={`flex-1 py-1.5 rounded-lg border font-medium ${
                        credMode === 'new'
                          ? 'border-[#E11D48] bg-rose-50 dark:bg-rose-950/30 text-[#E11D48]'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600'
                      }`}
                    >
                      Save New Secret
                    </button>
                  </div>

                  {credMode === 'existing' ? (
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        Select Encrypted Credential
                      </label>
                      <select
                        required
                        value={selectedCredId}
                        onChange={(e) => setSelectedCredId(e.target.value)}
                        className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                      >
                        {credentials.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} ({c.maskedPreview})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                        {connectTarget.requiredCredentials.join(' / ')}
                      </label>
                      <input
                        type="password"
                        required
                        value={newSecretValue}
                        onChange={(e) => setNewSecretValue(e.target.value)}
                        placeholder="Paste token, bot key, or webhook URL"
                        className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConnectTarget(null)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={connecting}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                {connecting ? 'Connecting...' : 'Save Connection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
