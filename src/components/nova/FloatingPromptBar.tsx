import React, { useState } from 'react';
import { ArrowRight, ArrowUp, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { api } from '../../services/api';
import { NovaGenerationResult } from '../../types/workflow';

interface FloatingPromptBarProps {
  mode: 'dashboard' | 'editor';
  projectId?: string;
  onOpenCreatedWorkflow?: (workflowId: string) => void;
  onApplyToCanvas?: (generated: NovaGenerationResult) => void;
  placeholder?: string;
}

export const FloatingPromptBar: React.FC<FloatingPromptBarProps> = ({
  mode,
  projectId,
  onOpenCreatedWorkflow,
  onApplyToCanvas,
  placeholder = 'Describe what you want to automate...',
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<NovaGenerationResult | null>(null);
  const [opening, setOpening] = useState(false);
  const [editorToast, setEditorToast] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    setDrafted(null);
    setEditorToast(null);

    try {
      const res = await api.nova.generate(text);
      const result = res.result;

      if (mode === 'editor' && onApplyToCanvas) {
        onApplyToCanvas(result);
        setPrompt('');
        setEditorToast(`Workflow drafted! (${result.nodes.length} nodes)`);
        setTimeout(() => setEditorToast(null), 4000);
      } else {
        setDrafted(result);
        setPrompt('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to draft workflow.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrafted = async () => {
    if (!drafted || opening) return;
    setOpening(true);
    setError(null);
    try {
      const created = await api.workflows.create({
        name: drafted.name,
        description: drafted.description,
        ...(projectId ? { projectId } : {}),
        nodes: drafted.nodes,
        edges: drafted.edges,
      });
      setDrafted(null);
      onOpenCreatedWorkflow?.(created.workflow.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save drafted workflow.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="pointer-events-none sticky bottom-5 z-30 w-full flex flex-col items-center px-4 mt-auto">
      <div className="pointer-events-auto w-full max-w-2xl space-y-2.5">
        {error && (
          <div className="mx-auto max-w-xl rounded-xl bg-white dark:bg-[#141416] border border-red-200 dark:border-red-900/60 shadow-lg px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-red-600 dark:text-red-400">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/50"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {editorToast && (
          <div className="mx-auto w-fit rounded-full bg-zinc-900 dark:bg-zinc-800 text-white px-4 py-2 shadow-lg flex items-center gap-2 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{editorToast}</span>
          </div>
        )}

        {drafted && mode === 'dashboard' && (
          <div className="rounded-xl bg-white dark:bg-[#141416] border border-rose-200 dark:border-rose-900/60 shadow-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>I&apos;ve drafted a workflow for you</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate mt-0.5">
                {drafted.name} · {drafted.nodes.length} nodes (
                {drafted.nodes.map((n) => (n.data as { label?: string }).label).join(' → ')})
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDrafted(null)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => void handleOpenDrafted()}
                disabled={opening}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {opening ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Open it</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-full bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-lg px-3.5 py-2 focus-within:ring-2 focus-within:ring-[#E11D48]/20 focus-within:border-[#E11D48] transition-all duration-150"
        >
          <div className="w-7 h-7 rounded-full bg-rose-50 dark:bg-rose-950/50 text-[#E11D48] dark:text-rose-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            placeholder={placeholder}
            aria-label="Describe what you want to automate"
            className="flex-1 min-w-0 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || loading}
            className="w-8 h-8 rounded-full bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-45 text-white flex items-center justify-center shrink-0 transition-all duration-150"
            title="Generate workflow"
            aria-label="Generate workflow"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
