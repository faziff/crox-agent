import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Cpu, Laptop, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AiProviderConfigRecord, UserSessionInfo } from '../types/workflow';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

interface SettingsPageProps {
  onOpenAiProviders?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onOpenAiProviders }) => {
  const { user, setUser, theme, setThemeLocal, logout } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notificationsEnabled ?? true
  );
  const [prefMsg, setPrefMsg] = useState<string | null>(null);

  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [providers, setProviders] = useState<AiProviderConfigRecord[]>([]);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    api.settings
      .sessions()
      .then((res) => setSessions(res.sessions))
      .catch(() => {});
    api.aiProviders
      .list()
      .then((res) => setProviders(res.providers))
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const res = await api.settings.updateProfile(fullName, email);
      setUser(res.user);
      setProfileMsg('Profile saved.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Unable to update profile.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);
    try {
      const res = await api.settings.changePassword(currentPassword, newPassword, confirmPassword);
      setPwMsg(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Password update failed.');
    }
  };

  const handleSavePreferences = async (nextTheme: 'light' | 'dark' = theme) => {
    setPrefMsg(null);
    try {
      const res = await api.settings.updatePreferences({
        timezone,
        theme: nextTheme,
        notificationsEnabled,
      });
      setUser(res.user);
      setThemeLocal(nextTheme);
      setPrefMsg('Preferences saved.');
    } catch {
      // ignore
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await api.settings.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // ignore
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteErr(null);
    try {
      await api.settings.deleteAccount(deletePassword);
      setUser(null);
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : 'Failed to delete account.');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl w-full mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Account Settings
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Manage your profile, dark-first appearance, timezone, and security sessions.
        </p>
      </div>

      {/* Profile */}
      <form
        onSubmit={handleSaveProfile}
        className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Profile</h2>
          <span className="px-2.5 py-0.5 rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 text-xs font-semibold capitalize">
            {user?.plan || 'free'} plan
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
            />
          </div>
        </div>
        {profileErr && <p className="text-xs text-red-600">{profileErr}</p>}
        {profileMsg && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> {profileMsg}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium transition-colors"
          >
            Save Changes
          </button>
        </div>
      </form>

      {/* Preferences */}
      <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs p-6 space-y-4">
        <h2 className="font-display text-base font-semibold">Preferences</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Default Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Appearance
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void handleSavePreferences(mode)}
                  className={`py-2 px-3 rounded-xl border text-sm font-medium capitalize transition-colors ${
                    theme === mode
                      ? 'border-[#E11D48] bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(e) => setNotificationsEnabled(e.target.checked)}
            className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
          />
          <span>Enable execution failure alerts in workspace</span>
        </label>

        <div className="flex items-center justify-between">
          {prefMsg ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> {prefMsg}
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => void handleSavePreferences(theme)}
            className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Save Preferences
          </button>
        </div>
      </div>

      {/* AI Providers & API Keys */}
      <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#E11D48]" />
            <h2 className="font-display text-base font-semibold">AI Providers &amp; API Keys</h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Configure Gemini, OpenAI, Anthropic, OpenRouter, Groq, Mistral, DeepSeek, Cohere, or Ollama with encrypted multi-key vault &amp; backup provider failover.
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 tabular-nums pt-0.5">
            {providers.filter((p) => p.keys.length > 0).length} providers configured ·{' '}
            {providers.reduce((sum, p) => sum + p.keys.filter((k) => k.isEnabled).length, 0)} active keys
          </p>
        </div>
        {onOpenAiProviders && (
          <button
            type="button"
            onClick={onOpenAiProviders}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium whitespace-nowrap shrink-0"
          >
            <span>Manage AI Providers</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Security & Sessions */}
      <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs p-6 space-y-6">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <h2 className="font-display text-base font-semibold">Security</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (8+ chars)"
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
          {pwErr && <p className="text-xs text-red-600">{pwErr}</p>}
          {pwMsg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{pwMsg}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Update Password
            </button>
          </div>
        </form>

        <div className="pt-5 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <h3 className="text-sm font-semibold">Active Sessions</h3>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sessions.map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {s.userAgent} {s.isCurrent ? '(Current Session)' : ''}
                    </p>
                    <p className="text-zinc-500 tabular-nums">
                      Started {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    type="button"
                    onClick={() => void handleRevokeSession(s.id)}
                    className="text-[#E11D48] dark:text-rose-400 hover:underline shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account Actions */}
      <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold">Account</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void logout()}
            className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Log out
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Account</span>
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleDeleteAccount}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl"
          >
            <h2 className="font-display text-lg font-semibold text-red-600">Delete Account</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This permanently removes your account, workflows, credentials, and execution records. Enter your
              password to confirm.
            </p>
            <input
              type="password"
              required
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter password to confirm"
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
            {deleteErr && <p className="text-xs text-red-600">{deleteErr}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
              >
                Permanently Delete
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
