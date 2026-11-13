import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  KeyRound,
  Loader2,
  Play,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { CredentialRecord, CredentialType } from '../types/workflow';

const CREDENTIAL_TYPE_LABELS: Record<CredentialType, string> = {
  api_key: 'API Key',
  ai_provider: 'AI Provider Key',
  email_smtp: 'SMTP Email',
  http_auth: 'HTTP Auth',
  oauth2: 'OAuth2 Token',
  app_credential: 'App Credential',
};

export const CredentialsPage: React.FC = () => {
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testBanner, setTestBanner] = useState<{ ok: boolean; message: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialRecord | null>(null);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CredentialType>('api_key');
  const [secretValue, setSecretValue] = useState('');

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadCredentials = useCallback(async () => {
    try {
      setError(null);
      const res = await api.credentials.list();
      setCredentials(res.credentials);
      setEncryptionConfigured(res.encryptionConfigured);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const openCreateModal = () => {
    setEditing(null);
    setLabel('');
    setType('api_key');
    setSecretValue('');
    setSmtpHost('');
    setSmtpPort('587');
    setSmtpUser('');
    setSmtpPass('');
    setSmtpFrom('');
    setModalOpen(true);
  };

  const openEditModal = (cred: CredentialRecord) => {
    setEditing(cred);
    setLabel(cred.label);
    setType(cred.type);
    setSecretValue('');
    setSmtpHost('');
    setSmtpPort('587');
    setSmtpUser('');
    setSmtpPass('');
    setSmtpFrom('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let computedSecret = secretValue.trim();
      if (type === 'email_smtp') {
        const hasAnySmtp = smtpHost.trim() || smtpUser.trim() || smtpPass.trim();
        if (hasAnySmtp) {
          computedSecret = JSON.stringify({
            host: smtpHost.trim(),
            port: Number(smtpPort) || 587,
            user: smtpUser.trim(),
            pass: smtpPass,
            from: smtpFrom.trim() || smtpUser.trim(),
          });
        }
      }

      if (editing) {
        await api.credentials.update(editing.id, {
          label: label.trim(),
          type,
          ...(computedSecret ? { secretValue: computedSecret } : {}),
        });
      } else {
        await api.credentials.create({
          label: label.trim(),
          type,
          secretValue: computedSecret,
        });
      }
      setModalOpen(false);
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credential.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (cred: CredentialRecord) => {
    setTogglingId(cred.id);
    setError(null);
    try {
      const nextEnabled = cred.isEnabled === false;
      await api.credentials.setStatus(cred.id, nextEnabled);
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credential status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleTest = async (cred: CredentialRecord) => {
    setTestingId(cred.id);
    setTestBanner(null);
    setError(null);
    try {
      const res = await api.credentials.test(cred.id);
      setTestBanner({ ok: res.ok, message: `${cred.label}: ${res.message}` });
    } catch (err) {
      setTestBanner({
        ok: false,
        message: `${cred.label}: ${err instanceof Error ? err.message : 'Verification failed.'}`,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.credentials.delete(id);
      setConfirmDeleteId(null);
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete credential.');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Credentials
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Store encrypted API keys, OAuth2 tokens, app credentials, HTTP auth tokens, and SMTP configs.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium shadow-xs transition-all duration-150 whitespace-nowrap self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Add Credential</span>
        </button>
      </div>

      {!encryptionConfigured && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
          Server encryption key (CREDENTIAL_ENCRYPTION_KEY) is missing in production configuration.
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {testBanner && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            testBanner.ok
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
              : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {testBanner.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{testBanner.message}</span>
          </div>
          <button type="button" onClick={() => setTestBanner(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>
          Secrets are encrypted at rest with AES-256-GCM and redacted from all responses and execution logs.
        </span>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
        </div>
      ) : credentials.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs text-center space-y-4">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center mx-auto">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold">No credentials stored yet</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Add an API key, OAuth2 token, SMTP configuration, or AI provider credential to authenticate workflow steps securely.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium"
          >
            Add Your First Credential
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50/70 dark:bg-zinc-950/40">
                  <th className="py-3 px-4 font-medium">Label</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Secret Preview</th>
                  <th className="py-3 px-4 font-medium">Used In</th>
                  <th className="py-3 px-4 font-medium">Created</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {credentials.map((cred) => {
                  const enabled = cred.isEnabled !== false;
                  return (
                    <tr
                      key={cred.id}
                      className={`hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 ${!enabled ? 'opacity-65' : ''}`}
                    >
                      <td className="py-3.5 px-4 font-medium text-zinc-900 dark:text-white">{cred.label}</td>
                      <td className="py-3.5 px-4 text-xs text-zinc-600 dark:text-zinc-300">
                        {CREDENTIAL_TYPE_LABELS[cred.type]}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md border font-medium ${
                            enabled
                              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                              : 'border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-zinc-500">{cred.maskedPreview}</td>
                      <td className="py-3.5 px-4 text-xs text-zinc-500 tabular-nums">
                        {cred.usedInWorkflows ?? 0} {(cred.usedInWorkflows ?? 0) === 1 ? 'workflow' : 'workflows'}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-zinc-500 tabular-nums">
                        {new Date(cred.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {confirmDeleteId === cred.id ? (
                          <div className="inline-flex items-center gap-2 text-xs">
                            <span className="text-zinc-500">Are you sure?</span>
                            <button
                              type="button"
                              onClick={() => void handleDelete(cred.id)}
                              className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={testingId === cred.id}
                              onClick={() => void handleTest(cred)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                              title="Test / verify credential"
                            >
                              {testingId === cred.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={togglingId === cred.id}
                              onClick={() => void handleToggleStatus(cred)}
                              className={`p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 ${
                                enabled ? 'text-emerald-600' : 'text-zinc-400'
                              }`}
                              title={enabled ? 'Disable credential' : 'Enable credential'}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(cred)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              title="Edit credential"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(cred.id)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title="Delete credential"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold">
              {editing ? 'Update Credential' : 'Add Credential'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Credential Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CredentialType)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                >
                  <option value="api_key">API Key</option>
                  <option value="ai_provider">AI Provider Key (Gemini / OpenAI / Anthropic)</option>
                  <option value="email_smtp">SMTP Email</option>
                  <option value="http_auth">HTTP Auth (Bearer / Header)</option>
                  <option value="oauth2">OAuth2 Token</option>
                  <option value="app_credential">App Credential (JSON / Webhook Secret)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. OpenAI Key or Company SMTP"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                />
              </div>

              {type === 'email_smtp' ? (
                <div className="space-y-2.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <p className="text-[11px] font-medium text-zinc-500">
                    {editing ? 'Leave blank to keep existing SMTP credentials' : 'SMTP Server Details'}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      required={!editing}
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                      className="col-span-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      required={!editing}
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      placeholder="587"
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required={!editing}
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="SMTP Username"
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="password"
                      required={!editing}
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder="SMTP Password"
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <input
                    type="email"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="From Email (optional)"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    {editing ? 'New Secret Value (leave blank to keep existing)' : 'Secret / API Key Value'}
                  </label>
                  <textarea
                    rows={2}
                    required={!editing}
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder="Paste secret token or Bearer key"
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Encrypting...' : editing ? 'Save Changes' : 'Save Credential'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
