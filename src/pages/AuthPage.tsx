import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Play } from 'lucide-react';
import { CroxLogo } from '../components/brand/CroxLogo';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthPageProps {
  initialMode?: AuthMode;
  initialResetToken?: string;
  onBackToLanding: () => void;
  onSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  initialMode = 'login',
  initialResetToken = '',
  onBackToLanding,
  onSuccess,
}) => {
  const { login, loginDemo, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialResetToken ? 'reset' : initialMode);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (mode === 'register' && fullName.trim().length < 2) {
      errs.fullName = 'Name must be at least 2 characters.';
    }
    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }
    if (mode !== 'forgot') {
      if (mode === 'login' && !password) {
        errs.password = 'Password is required.';
      } else if ((mode === 'register' || mode === 'reset') && password.length < 8) {
        errs.password = 'Password must be at least 8 characters.';
      }
    }
    if ((mode === 'register' || mode === 'reset') && password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        onSuccess();
      } else if (mode === 'register') {
        await register(fullName.trim(), email.trim(), password, confirmPassword);
        onSuccess();
      } else if (mode === 'forgot') {
        const res = await api.auth.forgotPassword(email.trim());
        setSuccessMsg(res.message);
      } else if (mode === 'reset') {
        const res = await api.auth.resetPassword(resetToken.trim(), password, confirmPassword);
        setSuccessMsg(res.message);
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      await loginDemo();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start demo workspace.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#FAFAFA] dark:bg-[#0D0D0F] text-zinc-900 dark:text-zinc-100 flex flex-col"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(225, 29, 72, 0.06), transparent 55%)',
      }}
    >
      <div className="p-6 flex items-center justify-between max-w-5xl w-full mx-auto">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to CROX</span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pb-16">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-8 space-y-6 shadow-md">
          <div className="flex flex-col items-center text-center space-y-3">
            <CroxLogo size="lg" />
            <div className="space-y-1">
              <h1 className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {mode === 'login'
                  ? 'Welcome back'
                  : mode === 'register'
                    ? 'Create your CROX account'
                    : mode === 'forgot'
                      ? 'Recover your password'
                      : 'Set a new password'}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {mode === 'login'
                  ? 'Sign in to access your workflows, projects, and AI agents.'
                  : mode === 'register'
                    ? 'Start building automated workflows in seconds.'
                    : mode === 'forgot'
                      ? 'Enter your email address to request a recovery link.'
                      : 'Enter your recovery token and choose a new password.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setFieldErrors((p) => ({ ...p, fullName: '' }));
                  }}
                  placeholder="Elena Vance"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
                />
                {fieldErrors.fullName && (
                  <p className="text-[11px] text-red-600 mt-1">{fieldErrors.fullName}</p>
                )}
              </div>
            )}

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((p) => ({ ...p, email: '' }));
                  }}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
                />
                {fieldErrors.email && (
                  <p className="text-[11px] text-red-600 mt-1">{fieldErrors.email}</p>
                )}
              </div>
            )}

            {mode === 'reset' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Recovery Token
                </label>
                <input
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste token from recovery email"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm font-mono"
                />
              </div>
            )}

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccessMsg(null);
                        setMode('forgot');
                      }}
                      className="text-xs text-[#E11D48] dark:text-rose-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((p) => ({ ...p, password: '' }));
                  }}
                  placeholder={mode === 'register' || mode === 'reset' ? 'At least 8 characters' : '••••••••'}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
                />
                {fieldErrors.password && (
                  <p className="text-[11px] text-red-600 mt-1">{fieldErrors.password}</p>
                )}
              </div>
            )}

            {(mode === 'register' || mode === 'reset') && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((p) => ({ ...p, confirmPassword: '' }));
                  }}
                  placeholder="Repeat password"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-[11px] text-red-600 mt-1">{fieldErrors.confirmPassword}</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold transition-all duration-150 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {mode === 'login'
                  ? 'Log In'
                  : mode === 'register'
                    ? 'Sign Up'
                    : mode === 'forgot'
                      ? 'Send Recovery Link'
                      : 'Reset Password'}
              </span>
            </button>
          </form>

          {(mode === 'login' || mode === 'register') && (
            <button
              type="button"
              onClick={() => void handleDemo()}
              disabled={demoLoading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-all duration-150 disabled:opacity-50"
            >
              {demoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E11D48]" /> : <Play className="w-3.5 h-3.5 text-[#E11D48]" />}
              <span>Continue with Demo Workspace</span>
            </button>
          )}

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500 dark:text-zinc-400">
            {mode === 'login' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFieldErrors({});
                    setMode('register');
                  }}
                  className="text-[#E11D48] dark:text-rose-400 font-semibold hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setFieldErrors({});
                    setMode('login');
                  }}
                  className="text-[#E11D48] dark:text-rose-400 font-semibold hover:underline"
                >
                  Log in
                </button>
                {mode === 'forgot' && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMode('reset');
                      }}
                      className="text-zinc-700 dark:text-zinc-300 font-medium hover:underline"
                    >
                      Have a reset token?
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
