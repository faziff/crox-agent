import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Info, Loader2, Send, Sparkles, X } from 'lucide-react';
import { api } from '../../services/api';
import { NovaGenerationResult } from '../../types/workflow';

interface NovaAssistantProps {
  open: boolean;
  onClose: () => void;
  onOpenOpenInEditor?: (generated: NovaGenerationResult) => Promise<void> | void;
  contextLabel?: string;
}

const EXAMPLE_PROMPTS = [
  'Build a research AI agent with memory, calculator, and datetime tools.',
  'Notify me on Slack whenever someone submits a contact form.',
  'Fetch data from an API, filter items, and summarize with AI.',
  'Send me an email every morning with a daily operations digest.',
];

export const NovaAssistant: React.FC<NovaAssistantProps> = ({
  open,
  onClose,
  onOpenOpenInEditor,
  contextLabel = 'Open in Workflow Editor',
}) => {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'ready' | 'error'>('idle');
  const [generated, setGenerated] = useState<NovaGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [providerMode, setProviderMode] = useState<'gemini' | 'rule-based' | null>(null);

  useEffect(() => {
    if (!open) return;
    api.nova
      .status()
      .then((res) => setProviderMode(res.provider))
      .catch(() => setProviderMode(null));
  }, [open]);

  if (!open) return null;

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;
    setError(null);
    setGenerated(null);
    setStatus('thinking');

    try {
      const res = await api.nova.generate(prompt);
      setGenerated(res.result);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to generate workflow.');
    }
  };

  const handleApply = async () => {
    if (!generated || !onOpenOpenInEditor) return;
    setApplying(true);
    try {
      await onOpenOpenInEditor(generated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow.');
      setStatus('error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center bg-black/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="CROX AI Workflow Builder"
    >
      <div className="w-full sm:max-w-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-[#E11D48] dark:text-rose-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white truncate">
                NOVA AI Workflow Builder
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {providerMode === 'gemini' ? 'Gemini AI Connected' : 'Deterministic Workflow Builder'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close AI Builder"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          <form onSubmit={handleGenerate} className="space-y-3">
            <label htmlFor="nova-prompt" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Describe what you want to automate
            </label>
            <textarea
              id="nova-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. When a chat message arrives, build an AI Agent with calculator tool and memory..."
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48] resize-none"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Generates editable triggers, AI Agent clusters, conditions, and API nodes.
              </p>
              <button
                type="submit"
                disabled={!prompt.trim() || status === 'thinking'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                {status === 'thinking' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Drafting</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Generate Workflow</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {!generated && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Examples</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="text-left p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-[#E11D48]/50 hover:bg-rose-50/40 dark:hover:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {generated && (
            <div className="space-y-4 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                    {generated.name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{generated.explanation}</p>
                </div>
                <span className="text-xs font-mono tabular-nums text-zinc-500 whitespace-nowrap shrink-0">
                  {generated.nodes.length} nodes
                </span>
              </div>

              {generated.mode === 'rule-based' && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Drafted with the deterministic builder. Every node and connection is editable in the canvas.
                  </span>
                </div>
              )}

              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max">
                  {generated.nodes.map((node, index) => (
                    <React.Fragment key={node.id}>
                      <div className="px-3.5 py-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 min-w-[140px]">
                        <p className="text-[11px] font-mono text-zinc-500 capitalize">
                          {(node.data as { category?: string }).category || 'note'}
                        </p>
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate max-w-[170px]">
                          {(node.data as { label?: string }).label || 'Node'}
                        </p>
                      </div>
                      {index < generated.nodes.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setGenerated(null)}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Refine Prompt
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{contextLabel}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
