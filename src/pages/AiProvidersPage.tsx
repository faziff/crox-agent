import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { AiProviderConfigRecord, AiProviderId } from '../types/workflow';

function HealthTag({ status }: { status: string }) {
  const styles: Record<string, string> = {
    healthy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900',
    degraded: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    quota_exhausted: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    invalid: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    untested: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
  };
  const label =
    status === 'quota_exhausted'
      ? 'Quota Exhausted'
      : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${styles[status] || styles.untested}`}>
      {label}
    </span>
  );
}

export const AiProvidersPage: React.FC = () => {
  const [providers, setProviders] = useState<AiProviderConfigRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<AiProviderId>('gemini');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [defaultModelDraft, setDefaultModelDraft] = useState('');
  const [backupProviderDraft, setBackupProviderDraft] = useState<AiProviderId | ''>('');

  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [keyLabel, setKeyLabel] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [keyProjectTag, setKeyProjectTag] = useState('');
  const [keyPrimary, setKeyPrimary] = useState(true);

  const loadProviders = useCallback(async () => {
    try {
      setError(null);
      const res = await api.aiProviders.list();
      setProviders(res.providers);
      const cur = res.providers.find((p) => p.providerId === selectedId) || res.providers[0];
      if (cur) {
        setSelectedId(cur.providerId);
        setBaseUrlDraft(cur.baseUrl);
        setDefaultModelDraft(cur.defaultModel);
        setBackupProviderDraft(cur.backupProviderId || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI providers.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const activeProvider = providers.find((p) => p.providerId === selectedId) || providers[0];

  const handleSelectProvider = (p: AiProviderConfigRecord) => {
    setSelectedId(p.providerId);
    setBaseUrlDraft(p.baseUrl);
    setDefaultModelDraft(p.defaultModel);
    setBackupProviderDraft(p.backupProviderId || '');
    setNotice(null);
    setError(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProvider) return;
    setBusyAction('save_cfg');
    setError(null);
    setNotice(null);
    try {
      await api.aiProviders.updateConfig(activeProvider.providerId, {
        baseUrl: baseUrlDraft.trim(),
        defaultModel: defaultModelDraft.trim(),
        backupProviderId: backupProviderDraft,
      });
      setNotice(`${activeProvider.displayName} settings saved.`);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider settings.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleEnabled = async (p: AiProviderConfigRecord) => {
    setBusyAction(`toggle_${p.providerId}`);
    setError(null);
    try {
      await api.aiProviders.updateConfig(p.providerId, { isEnabled: !p.isEnabled });
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update provider status.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDiscoverModels = async () => {
    if (!activeProvider) return;
    setBusyAction('discover');
    setError(null);
    setNotice(null);
    try {
      const res = await api.aiProviders.discoverModels(activeProvider.providerId);
      setNotice(`Discovered ${res.models.length} live model(s) for ${activeProvider.displayName}.`);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model discovery failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestProvider = async () => {
    if (!activeProvider) return;
    setBusyAction('test_provider');
    setError(null);
    setNotice(null);
    try {
      const res = await api.aiProviders.testProvider(activeProvider.providerId);
      setNotice(`${res.message} (${res.latencyMs}ms · model: ${res.model})`);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider connection test failed.');
      await loadProviders();
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProvider) return;
    setBusyAction('add_key');
    setError(null);
    try {
      await api.aiProviders.addKey(activeProvider.providerId, {
        label: keyLabel.trim(),
        apiKey: keySecret.trim(),
        projectTag: keyProjectTag.trim(),
        isPrimary: keyPrimary,
      });
      setAddKeyOpen(false);
      setKeyLabel('');
      setKeySecret('');
      setKeyProjectTag('');
      setNotice(`Encrypted API key added to ${activeProvider.displayName}.`);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store API key.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestKey = async (keyId: string) => {
    setBusyAction(`test_key_${keyId}`);
    setError(null);
    setNotice(null);
    try {
      const res = await api.aiProviders.testKey(keyId);
      setNotice(`Key verified: ${res.message} (${res.latencyMs}ms)`);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Key test failed.');
      await loadProviders();
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleKey = async (keyId: string, patch: { isPrimary?: boolean; isEnabled?: boolean }) => {
    setBusyAction(`upd_key_${keyId}`);
    setError(null);
    try {
      await api.aiProviders.updateKey(keyId, patch);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update API key.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    setBusyAction(`del_key_${keyId}`);
    setError(null);
    try {
      await api.aiProviders.deleteKey(keyId);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove API key.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            AI Providers & Multi-Key Vault
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Configure LLM providers, encrypted API keys, live model discovery, and explicit cross-provider failover.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Provider Selector */}
          <div className="lg:col-span-4 space-y-2">
            {providers.map((p) => {
              const selected = activeProvider?.providerId === p.providerId;
              const activeKeys = p.keys.filter((k) => k.isEnabled).length;
              return (
                <button
                  key={p.providerId}
                  type="button"
                  onClick={() => handleSelectProvider(p)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-150 ${
                    selected
                      ? 'bg-white dark:bg-[#141416] border-[#E11D48] shadow-xs'
                      : 'bg-white/70 dark:bg-[#141416]/70 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Cpu className={`w-4 h-4 shrink-0 ${selected ? 'text-[#E11D48]' : 'text-zinc-400'}`} />
                      <span className="font-medium text-sm text-zinc-900 dark:text-white truncate">
                        {p.displayName}
                      </span>
                    </div>
                    <HealthTag status={p.healthStatus} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="truncate font-mono">{p.defaultModel}</span>
                    <span className="tabular-nums shrink-0">
                      {activeKeys > 0
                        ? `${activeKeys} key${activeKeys === 1 ? '' : 's'}`
                        : p.serverFallbackAvailable
                          ? 'Server Env Ready'
                          : 'No Key'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Provider Configuration & Key Vault */}
          {activeProvider && (
            <div className="lg:col-span-8 space-y-5">
              <form
                onSubmit={handleSaveConfig}
                className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">
                        {activeProvider.displayName}
                      </h2>
                      <HealthTag status={activeProvider.healthStatus} />
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Protocol: <span className="font-mono">{activeProvider.protocol}</span>
                      {activeProvider.serverFallbackAvailable && ' · Server GEMINI_API_KEY fallback active'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleToggleEnabled(activeProvider)}
                      disabled={busyAction === `toggle_${activeProvider.providerId}`}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        activeProvider.isEnabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400'
                      }`}
                    >
                      {activeProvider.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTestProvider()}
                      disabled={busyAction === 'test_provider'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium"
                    >
                      {busyAction === 'test_provider' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-[#E11D48]" />
                      )}
                      <span>Test</span>
                    </button>
                  </div>
                </div>

                {activeProvider.lastError && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{activeProvider.lastError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Base URL
                    </label>
                    <input
                      type="url"
                      required
                      value={baseUrlDraft}
                      onChange={(e) => setBaseUrlDraft(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Default Model
                      </label>
                      {activeProvider.supportsModelDiscovery && (
                        <button
                          type="button"
                          onClick={() => void handleDiscoverModels()}
                          disabled={busyAction === 'discover'}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48] hover:underline"
                        >
                          <RefreshCw className={`w-3 h-3 ${busyAction === 'discover' ? 'animate-spin' : ''}`} />
                          <span>Discover Models</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      list={`models_${activeProvider.providerId}`}
                      value={defaultModelDraft}
                      onChange={(e) => setDefaultModelDraft(e.target.value)}
                      placeholder="Select or type exact model ID"
                      className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-mono"
                    />
                    <datalist id={`models_${activeProvider.providerId}`}>
                      {activeProvider.discoveredModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Explicit Failover Backup Provider
                    </label>
                    <select
                      value={backupProviderDraft}
                      onChange={(e) => setBackupProviderDraft(e.target.value as AiProviderId | '')}
                      className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs"
                    >
                      <option value="">None (Fail fast on quota/outage)</option>
                      {providers
                        .filter((p) => p.providerId !== activeProvider.providerId)
                        .map((p) => (
                          <option key={p.providerId} value={p.providerId}>
                            {p.displayName}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busyAction === 'save_cfg'}
                      className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium transition-colors"
                    >
                      {busyAction === 'save_cfg' ? 'Saving...' : 'Save Provider Config'}
                    </button>
                  </div>
                </div>

                {/* Capabilities */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-zinc-500 font-medium">Capabilities:</span>
                  {Object.entries(activeProvider.capabilities).map(([cap, ok]) => (
                    <span
                      key={cap}
                      className={`px-2 py-0.5 rounded border ${
                        ok
                          ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
                          : 'border-zinc-200/60 dark:border-zinc-800/60 text-zinc-400 line-through'
                      }`}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </form>

              {/* Multi-Key Vault */}
              <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                      Encrypted API Keys ({activeProvider.keys.length})
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Keys are encrypted with AES-256-GCM. Quota-exhausted keys fail cleanly to your explicit backup provider.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddKeyOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium hover:opacity-90"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Key</span>
                  </button>
                </div>

                {activeProvider.keys.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-2">
                    <KeyRound className="w-5 h-5 text-zinc-400 mx-auto" />
                    <p className="text-xs text-zinc-500">
                      No custom keys saved for {activeProvider.displayName}.
                      {activeProvider.serverFallbackAvailable && ' Server environment key is active as fallback.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {activeProvider.keys.map((k) => (
                      <div key={k.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-zinc-900 dark:text-white">
                              {k.label}
                            </span>
                            {k.isPrimary && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 text-[10px] font-semibold">
                                <Star className="w-2.5 h-2.5 fill-current" /> Primary
                              </span>
                            )}
                            <HealthTag status={k.healthStatus} />
                            {k.projectTag && (
                              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-mono">
                                {k.projectTag}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-zinc-500">{k.maskedPreview}</p>
                          {k.lastError && <p className="text-[11px] text-red-600 dark:text-red-400">{k.lastError}</p>}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!k.isPrimary && (
                            <button
                              type="button"
                              onClick={() => void handleToggleKey(k.id, { isPrimary: true })}
                              className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                            >
                              Make Primary
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleToggleKey(k.id, { isEnabled: !k.isEnabled })}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          >
                            {k.isEnabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleTestKey(k.id)}
                            disabled={busyAction === `test_key_${k.id}`}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          >
                            {busyAction === `test_key_${k.id}` ? 'Testing...' : 'Test'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteKey(k.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            title="Delete key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Key Modal */}
      {addKeyOpen && activeProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleAddKey}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Add {activeProvider.displayName} Key</h2>
              <button type="button" onClick={() => setAddKeyOpen(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Key Label</label>
                <input
                  type="text"
                  required
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  placeholder="e.g. Production Key"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">API Key</label>
                <input
                  type="password"
                  required
                  value={keySecret}
                  onChange={(e) => setKeySecret(e.target.value)}
                  placeholder="Paste secret key (encrypted via AES-256-GCM)"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Project / Account Tag (Optional)
                </label>
                <input
                  type="text"
                  value={keyProjectTag}
                  onChange={(e) => setKeyProjectTag(e.target.value)}
                  placeholder="e.g. team-billing-acct"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keyPrimary}
                  onChange={(e) => setKeyPrimary(e.target.checked)}
                  className="rounded border-zinc-300 text-[#E11D48]"
                />
                <span>Set as primary active key for {activeProvider.displayName}</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddKeyOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction === 'add_key'}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                {busyAction === 'add_key' ? 'Encrypting...' : 'Save Key'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
