import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Briefcase,
  Code2,
  Database,
  Loader2,
  Mail,
  Megaphone,
  ShieldAlert,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { api } from '../services/api';
import { TemplateCategory, WorkflowTemplate } from '../types/workflow';

interface TemplatesPageProps {
  selectedProjectId?: string;
  onInstalled: (workflowId: string) => void;
}

const CATEGORY_ICON: Record<TemplateCategory, React.ComponentType<{ className?: string }>> = {
  'AI Automation': Bot,
  Marketing: Megaphone,
  'Lead Generation': UserPlus,
  Sales: TrendingUp,
  Communication: Mail,
  'Data Processing': Database,
  'Developer Automation': Code2,
  'Business Operations': Briefcase,
  'AI & Content': Bot,
  'Developer & API': Code2,
  Operations: ShieldAlert,
};

export const TemplatesPage: React.FC<TemplatesPageProps> = ({
  selectedProjectId,
  onInstalled,
}) => {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.templates
      .list()
      .then((res) => setTemplates(res.templates))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load templates.'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(templates.map((t) => t.category)));
    return ['All', ...unique];
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== 'All' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [templates, category, search]);

  const handleInstall = async (templateId: string) => {
    setInstallingId(templateId);
    setError(null);
    try {
      const res = await api.templates.install(templateId, selectedProjectId || undefined);
      onInstalled(res.workflow.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install template.');
      setInstallingId(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Workflow Templates
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Launch pre-configured AI Agent, lead routing, data processing, and webhook blueprints.
          </p>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter templates..."
          className="w-full lg:w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap border ${
              category === cat
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white'
                : 'bg-white dark:bg-[#141416] text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#E11D48]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((tpl) => {
            const Icon = CATEGORY_ICON[tpl.category] || Bot;
            const flowNodes = tpl.nodes.filter((n) => n.type === 'croxNode');
            return (
              <div
                key={tpl.id}
                className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-xs hover:shadow-md hover:border-[#E11D48]/40 transition-all duration-150 p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {tpl.category} · {flowNodes.length} nodes
                    </span>
                  </div>

                  <div>
                    <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                      {tpl.name}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mt-1.5 line-clamp-2">
                      {tpl.description}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                    <div className="flex items-center gap-1.5 min-w-max">
                      {flowNodes.slice(0, 5).map((n, idx) => (
                        <React.Fragment key={n.id}>
                          <span className="px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                            {(n.data as { label?: string }).label}
                          </span>
                          {idx < Math.min(flowNodes.length, 5) - 1 && (
                            <ArrowRight className="w-3 h-3 text-zinc-400" />
                          )}
                        </React.Fragment>
                      ))}
                      {flowNodes.length > 5 && (
                        <span className="text-[11px] text-zinc-400">+{flowNodes.length - 5}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleInstall(tpl.id)}
                  disabled={installingId === tpl.id}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50 transition-all duration-150"
                >
                  {installingId === tpl.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Use Template</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
