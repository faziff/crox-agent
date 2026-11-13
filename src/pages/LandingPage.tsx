import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Blocks,
  Bot,
  Calculator,
  Check,
  ChevronDown,
  Cpu,
  Database,
  GitBranch,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Mail,
  Menu,
  MessageSquareText,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { CroxLogo } from '../components/brand/CroxLogo';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { WorkflowTemplate } from '../types/workflow';

interface LandingPageProps {
  onNavigateAuth: (mode: 'login' | 'register') => void;
  onEnterDashboard: () => void;
  onUseTemplate: (templateId: string) => void;
}

type PreviewNodeKey = 'trigger' | 'agent' | 'model' | 'memory' | 'tool' | 'action';

const PREVIEW_NODES: Record<
  PreviewNodeKey,
  {
    title: string;
    category: string;
    summary: string;
    configPreview: string;
  }
> = {
  trigger: {
    title: 'Webhook / Chat Trigger',
    category: 'Trigger Node',
    summary: 'Starts execution on verified HTTPS webhook payloads, chat prompts, or cron schedules.',
    configPreview: 'POST /api/webhooks/support-intake · Secret header verified',
  },
  agent: {
    title: 'CROX AI Agent',
    category: 'Root Agent Cluster',
    summary: 'Executes bounded tool-calling loops with attached Chat Model, SQLite Memory, and Output Parser.',
    configPreview: 'Max iterations: 5 · Mode: Structured JSON + Tool Trace',
  },
  model: {
    title: 'Multi-Provider Chat Model',
    category: 'AI Language Model',
    summary: 'Connects Gemini, OpenAI, Anthropic, Groq, OpenRouter, DeepSeek, or local Ollama with safe failover.',
    configPreview: 'Primary: Gemini · Permitted backup: Anthropic / OpenAI-compatible',
  },
  memory: {
    title: 'SQLite Windowed Memory',
    category: 'AI Memory',
    summary: 'Persists conversation turns isolated by user, project, and session key across executions.',
    configPreview: 'Window: 8 turns · Storage: User-isolated SQLite memory',
  },
  tool: {
    title: 'Calculator & HTTP Tools',
    category: 'AI Agent Tools',
    summary: 'SSRF-checked outbound API requests, safe math, datetime queries, or sub-workflow delegation.',
    configPreview: 'SSRF guard enabled · Schema-validated arguments',
  },
  action: {
    title: 'Slack / Email / REST Action',
    category: 'Output Action',
    summary: 'Delivers results over encrypted SMTP credentials, Slack/Discord webhooks, or REST connectors.',
    configPreview: 'Vault credential: AES-256-GCM · Retries: Bounded backoff',
  },
};

const AI_FEATURES = [
  {
    icon: GitBranch,
    title: 'Visual DAG & Group Canvas',
    description:
      'Pure white dotted workspace with multi-branch routing, sticky notes, collapsible node groups, undo/redo, and auto-layout.',
  },
  {
    icon: Bot,
    title: 'Real AI Agent Clusters',
    description:
      'Attach separate Chat Model, Memory, Tools, and Structured Output Parser nodes with full execution traces.',
  },
  {
    icon: Cpu,
    title: 'Multi-Provider & Key Failover',
    description:
      'Configure Gemini, OpenAI, Anthropic, Groq, or OpenRouter keys with capability matching, circuit breakers, and cooldowns.',
  },
  {
    icon: ShieldCheck,
    title: 'AES-256-GCM Encrypted Vault',
    description:
      'API keys, OAuth tokens, and SMTP secrets remain server-side encrypted and masked across workflows and team logs.',
  },
];

const INTEGRATIONS_PREVIEW = [
  { name: 'Google Gemini', category: 'AI Model', status: 'Available' },
  { name: 'OpenAI', category: 'AI Model', status: 'Requires Credentials' },
  { name: 'Anthropic Claude', category: 'AI Model', status: 'Requires Credentials' },
  { name: 'GitHub', category: 'Development', status: 'Requires Credentials' },
  { name: 'Slack', category: 'Communication', status: 'Requires Credentials' },
  { name: 'Discord', category: 'Communication', status: 'Requires Credentials' },
  { name: 'Telegram', category: 'Communication', status: 'Requires Credentials' },
  { name: 'Notion', category: 'Productivity', status: 'Requires Credentials' },
  { name: 'Airtable', category: 'Productivity', status: 'Requires Credentials' },
  { name: 'Linear', category: 'Productivity', status: 'Requires Credentials' },
  { name: 'HubSpot', category: 'Business', status: 'Requires Credentials' },
  { name: 'Stripe', category: 'Business', status: 'Requires Credentials' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Choose a workflow structure',
    description:
      'Start from Blank, Linear Pipeline, Branching Flowchart, AI Agent Cluster, Event-Driven Trigger, or Multi-Agent Orchestrator.',
  },
  {
    step: '02',
    title: 'Connect models, tools & apps',
    description:
      'Browse upstream variables dynamically, wire encrypted credentials, and configure node-level retries and error outputs.',
  },
  {
    step: '03',
    title: 'Test live, snapshot & monitor',
    description:
      'Run single steps with real JSON inspection, publish scheduled or webhook workflows, and restore version snapshots anytime.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How does CROX store my API keys and app credentials?',
    a: 'All secrets are encrypted on the backend using AES-256-GCM before storage in SQLite. Masked previews are returned to the interface and raw keys are never exposed in frontend state or logs.',
  },
  {
    q: 'Which AI providers and models are supported?',
    a: 'CROX supports Google Gemini, OpenAI, Anthropic, and OpenAI-compatible endpoints (Groq, OpenRouter, DeepSeek, Mistral, Ollama). Provider keys can be tested and configured with explicit backup failover.',
  },
  {
    q: 'Can I import or export workflows as JSON?',
    a: 'Yes. Every workflow exports to portable JSON and imported workflows are validated, sanitized, and stripped of untrusted credentials before saving.',
  },
  {
    q: 'How does quota & rate-limit handling work across multiple keys?',
    a: 'CROX handles transient rate spikes with Retry-After delays and exponential backoff, and fails cleanly on genuine project quota exhaustion without cycling keys to bypass provider limits.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateAuth,
  onEnterDashboard,
  onUseTemplate,
}) => {
  const { user, loginDemo } = useAuth();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<PreviewNodeKey>('agent');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [infoModal, setInfoModal] = useState<'docs' | 'contact' | 'terms' | 'privacy' | null>(null);
  const [contactSent, setContactSent] = useState(false);

  useEffect(() => {
    api.templates
      .list()
      .then((res) => setTemplates(res.templates.filter((t) => t.featuredOnLanding).slice(0, 3)))
      .catch(() => {});
  }, []);

  const handleLaunchDemo = async () => {
    if (user) {
      onEnterDashboard();
      return;
    }
    setDemoLoading(true);
    try {
      await loginDemo();
      onEnterDashboard();
    } catch {
      onNavigateAuth('register');
    } finally {
      setDemoLoading(false);
    }
  };

  const activePreviewInfo = PREVIEW_NODES[selectedPreview];

  return (
    <div id="top" className="min-h-screen bg-[#FAFAFA] dark:bg-[#0D0D0F] text-zinc-900 dark:text-zinc-100">
      {/* 1. Sticky Navigation */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0D0D0F]/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto h-15 px-4 sm:px-6 flex items-center justify-between gap-6">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <CroxLogo size="md" />
          </a>

          <nav aria-label="Landing sections" className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <a href="#features" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap">
              Features
            </a>
            <a href="#integrations" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap">
              Integrations
            </a>
            <a href="#templates" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap">
              Templates
            </a>
            <a href="#pricing" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap">
              Pricing
            </a>
            <a href="#faq" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap">
              FAQ
            </a>
          </nav>

          <div className="hidden md:flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={onEnterDashboard}
                className="px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                Open Workspace
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateAuth('login')}
                  className="px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateAuth('register')}
                  className="px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Get Started Free
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg text-zinc-600 dark:text-zinc-300"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden px-4 pb-4 space-y-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416]">
            <div className="flex flex-col gap-2 pt-3 text-sm font-medium">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-1.5">Features</a>
              <a href="#integrations" onClick={() => setMobileMenuOpen(false)} className="py-1.5">Integrations</a>
              <a href="#templates" onClick={() => setMobileMenuOpen(false)} className="py-1.5">Templates</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="py-1.5">Pricing</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="py-1.5">FAQ</a>
            </div>
            <div className="flex items-center gap-3 pt-2">
              {user ? (
                <button
                  type="button"
                  onClick={onEnterDashboard}
                  className="w-full py-2.5 rounded-lg bg-[#E11D48] text-white text-sm font-semibold"
                >
                  Open Workspace
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigateAuth('login')}
                    className="flex-1 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateAuth('register')}
                    className="flex-1 py-2.5 rounded-lg bg-[#E11D48] text-white text-sm font-semibold"
                  >
                    Get Started Free
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main>
        {/* 2. Hero & 3. Interactive Workflow Canvas Preview */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-20 space-y-12">
          <div className="text-center space-y-5 max-w-3xl mx-auto">
            <p className="text-xs font-mono uppercase tracking-[0.14em] text-[#E11D48] font-semibold">
              CROX Automation Platform · Visual DAG + AI Agents
            </p>

            <h1
              className="font-display font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.06]"
              style={{ fontSize: 'clamp(2.35rem, 5vw, 3.85rem)', textWrap: 'balance' }}
            >
              Build reliable AI workflows and API automations visually.
            </h1>

            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Design multi-step pipelines on a clean node canvas, connect AI agents to models, SQLite memory, and tools, and manage encrypted multi-provider credentials in one workspace.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => (user ? onEnterDashboard() : onNavigateAuth('register'))}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <span>{user ? 'Open Workspace' : 'Start Building Free'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#how-it-works"
                className="px-5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#141416] hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-colors whitespace-nowrap"
              >
                See Architecture
              </a>
              {!user && (
                <button
                  type="button"
                  onClick={() => void handleLaunchDemo()}
                  disabled={demoLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-[#E11D48] dark:text-rose-400 hover:text-[#BE123C] transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {demoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>Launch Interactive Demo</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive White Dotted Workflow Canvas Component Preview */}
          <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 font-medium">
                <CroxLogo showWordmark={false} size="sm" />
                <span>Personal / Customer Triage AI Agent</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500">
                <span>Click any node to inspect</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Live DAG</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div
                className="lg:col-span-8 px-6 py-10 overflow-x-auto bg-white dark:bg-[#0D0D0F]"
                style={{
                  backgroundImage: 'radial-gradient(#E4E4E7 1.2px, transparent 1.2px)',
                  backgroundSize: '20px 20px',
                }}
              >
                <div className="min-w-[580px] max-w-2xl mx-auto space-y-6">
                  {/* Top Primary Flow */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPreview('trigger')}
                      className={`w-44 text-left rounded-xl bg-white dark:bg-[#141416] border p-3.5 transition-all ${
                        selectedPreview === 'trigger'
                          ? 'border-[#E11D48] ring-2 ring-[#E11D48]/15'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] flex items-center justify-center shrink-0">
                          <MessageSquareText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono uppercase text-zinc-400">Trigger</p>
                          <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">Chat Trigger</p>
                        </div>
                      </div>
                    </button>

                    <div className="flex-1 h-0.5 bg-zinc-300 dark:bg-zinc-700 relative">
                      <span className="absolute right-0 -top-1 w-2 h-2 rounded-full bg-zinc-400" />
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedPreview('agent')}
                      className={`w-48 text-left rounded-xl bg-white dark:bg-[#141416] border p-3.5 transition-all ${
                        selectedPreview === 'agent'
                          ? 'border-[#E11D48] ring-2 ring-[#E11D48]/15'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#E11D48] text-white flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono uppercase text-zinc-400">Agent Cluster</p>
                          <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">AI Agent</p>
                        </div>
                      </div>
                    </button>

                    <div className="flex-1 h-0.5 bg-zinc-300 dark:bg-zinc-700 relative">
                      <span className="absolute right-0 -top-1 w-2 h-2 rounded-full bg-zinc-400" />
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedPreview('action')}
                      className={`w-44 text-left rounded-xl bg-white dark:bg-[#141416] border p-3.5 transition-all ${
                        selectedPreview === 'action'
                          ? 'border-[#E11D48] ring-2 ring-[#E11D48]/15'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono uppercase text-zinc-400">Action</p>
                          <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">Send Reply</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Typed Sub-Ports beneath AI Agent */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedPreview('model')}
                      className={`px-3 py-2 rounded-lg bg-white dark:bg-[#141416] border border-dashed flex items-center gap-2 text-xs transition-colors ${
                        selectedPreview === 'model'
                          ? 'border-[#E11D48] text-[#E11D48]'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      <Cpu className="w-3.5 h-3.5 text-[#E11D48]" />
                      <span className="font-medium">Chat Model</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPreview('memory')}
                      className={`px-3 py-2 rounded-lg bg-white dark:bg-[#141416] border border-dashed flex items-center gap-2 text-xs transition-colors ${
                        selectedPreview === 'memory'
                          ? 'border-[#E11D48] text-[#E11D48]'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5 text-teal-600" />
                      <span className="font-medium">Windowed Memory</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPreview('tool')}
                      className={`px-3 py-2 rounded-lg bg-white dark:bg-[#141416] border border-dashed flex items-center gap-2 text-xs transition-colors ${
                        selectedPreview === 'tool'
                          ? 'border-[#E11D48] text-[#E11D48]'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      <Calculator className="w-3.5 h-3.5 text-amber-600" />
                      <span className="font-medium">HTTP &amp; Math Tools</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Inspector Side Preview */}
              <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 p-5 bg-zinc-50/60 dark:bg-[#141416] flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                    <span>NODE INSPECTOR</span>
                    <span>{activePreviewInfo.category}</span>
                  </div>
                  <h2 className="font-display text-base font-semibold text-zinc-900 dark:text-white">
                    {activePreviewInfo.title}
                  </h2>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {activePreviewInfo.summary}
                  </p>
                  <div className="p-3 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                    {activePreviewInfo.configPreview}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (user ? onEnterDashboard() : void handleLaunchDemo())}
                  className="w-full py-2 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-100 transition-colors"
                >
                  Open Full Canvas Editor
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 4. AI Automation Features & 6. AI Agent Architecture */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">Core Architecture</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Engineered for serious workflow automation
            </h2>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
              Every node in CROX maps to real server-side validation, typed port edges, and traceable execution logs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {AI_FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="p-5 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 space-y-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[#E11D48] flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">{feat.title}</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{feat.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Integrations Ecosystem */}
        <section id="integrations" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">App &amp; Model Ecosystem</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Connect your APIs, apps, and AI providers
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Dedicated REST adapters, encrypted credential testing, and Generic HTTP support for custom endpoints.
              </p>
            </div>
            <button
              type="button"
              onClick={() => (user ? onEnterDashboard() : onNavigateAuth('register'))}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#E11D48] hover:text-[#BE123C] whitespace-nowrap"
            >
              <Blocks className="w-4 h-4" />
              <span>Explore Integrations Library</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {INTEGRATIONS_PREVIEW.map((item) => (
              <div
                key={item.name}
                className="p-4 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{item.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {item.category} · {item.status}
                  </p>
                </div>
                <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
              </div>
            ))}
          </div>
        </section>

        {/* 7. Featured Workflow Templates */}
        <section id="templates" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-8">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">Blueprints</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Start with working templates
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Clone any template into your project with validated node graphs and clean credential prompts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-5 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between gap-5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                    <span>{tpl.category}</span>
                    <span>{tpl.nodes.length} nodes</span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-white">{tpl.name}</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{tpl.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUseTemplate(tpl.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E11D48] hover:text-[#BE123C] transition-colors"
                >
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  <span>Use Template</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 8. Execution & Debugging Highlights */}
        <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">How CROX Works</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                From structure selection to live debugging
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Pick a starting pattern, wire upstream JSON fields via the variable browser, and inspect live execution traces without guesswork.
              </p>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {HOW_IT_WORKS.map((item) => (
                <div
                  key={item.step}
                  className="p-5 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 space-y-2.5"
                >
                  <span className="text-xs font-mono font-bold text-[#E11D48]">{item.step}</span>
                  <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">{item.title}</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center shrink-0">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Transparent Execution &amp; Error Diagnostics
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Every run explicitly separates Live, Failed, Cancelled, and Simulated steps with node-level JSON inspection and click-to-focus errors.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => (user ? onEnterDashboard() : void handleLaunchDemo())}
              className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Inspect Live Workspace
            </button>
          </div>
        </section>

        {/* 9. Pricing */}
        <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-8">
          <div className="max-w-xl space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">Pricing</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Transparent workspace plans
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Start building on the Starter plan and upgrade when you need unlimited active workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
            <div className="p-6 rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Starter</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Personal projects, templates, and API key vault</p>
                </div>
                <p className="font-display text-3xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  $0 <span className="text-sm font-normal text-zinc-500">/month</span>
                </p>
                <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#E11D48]" /> Up to 3 active scheduled/webhook workflows</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#E11D48]" /> Full visual DAG editor, groups, and sticky notes</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#E11D48]" /> AES-256-GCM encrypted credentials &amp; BYOK AI providers</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => (user ? onEnterDashboard() : onNavigateAuth('register'))}
                className="w-full py-2.5 px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold transition-colors"
              >
                Create Free Account
              </button>
            </div>

            <div className="p-6 rounded-xl bg-white dark:bg-[#141416] border-2 border-[#E11D48] flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">Pro</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Recommended · Production automation teams</p>
                  </div>
                </div>
                <p className="font-display text-3xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  $15 <span className="text-sm font-normal text-zinc-500">/month</span>
                </p>
                <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#E11D48]" /> Unlimited active workflows &amp; projects</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#E11D48]" /> Multi-Agent orchestration &amp; version history restore</li>
                  <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-[#E11D48]" /> Multi-provider failover &amp; execution insights</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => (user ? onEnterDashboard() : onNavigateAuth('register'))}
                className="w-full py-2.5 px-4 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-semibold transition-colors"
              >
                Get Started with Pro
              </button>
            </div>
          </div>
        </section>

        {/* 10. FAQ */}
        <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 py-16 border-t border-zinc-200 dark:border-zinc-800 space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-mono uppercase tracking-wider text-zinc-500">FAQ</p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Common technical questions
            </h2>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-[#141416]">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 text-sm font-semibold text-zinc-900 dark:text-white"
                    aria-expanded={isOpen}
                  >
                    <span>{item.q}</span>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* 11. Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-2.5">
            <CroxLogo size="sm" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Visual AI workflow automation platform.
            </p>
            <p className="text-xs text-zinc-400">© 2026 CROX</p>
          </div>

          <div className="space-y-2.5 text-xs">
            <p className="font-semibold text-zinc-900 dark:text-white">Platform</p>
            <div className="flex flex-col gap-2 text-zinc-500 dark:text-zinc-400">
              <a href="#features" className="hover:text-zinc-900 dark:hover:text-white">Features</a>
              <a href="#integrations" className="hover:text-zinc-900 dark:hover:text-white">Integrations</a>
              <a href="#templates" className="hover:text-zinc-900 dark:hover:text-white">Templates</a>
              <a href="#pricing" className="hover:text-zinc-900 dark:hover:text-white">Pricing</a>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <p className="font-semibold text-zinc-900 dark:text-white">Resources</p>
            <div className="flex flex-col items-start gap-2 text-zinc-500 dark:text-zinc-400">
              <button type="button" onClick={() => setInfoModal('docs')} className="hover:text-zinc-900 dark:hover:text-white">
                Documentation
              </button>
              <button type="button" onClick={() => setInfoModal('contact')} className="hover:text-zinc-900 dark:hover:text-white">
                Contact
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <p className="font-semibold text-zinc-900 dark:text-white">Legal</p>
            <div className="flex flex-col items-start gap-2 text-zinc-500 dark:text-zinc-400">
              <button type="button" onClick={() => setInfoModal('privacy')} className="hover:text-zinc-900 dark:hover:text-white">
                Privacy Policy
              </button>
              <button type="button" onClick={() => setInfoModal('terms')} className="hover:text-zinc-900 dark:hover:text-white">
                Terms of Service
              </button>
            </div>
          </div>
        </div>
      </footer>

      {infoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">
                {infoModal === 'docs'
                  ? 'CROX Documentation'
                  : infoModal === 'contact'
                    ? 'Contact CROX'
                    : infoModal === 'terms'
                      ? 'Terms of Service'
                      : 'Privacy Policy'}
              </h3>
              <button type="button" onClick={() => setInfoModal(null)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            {infoModal === 'docs' && (
              <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2.5">
                <p><strong>AI Agents:</strong> Connect a Chat Model, optional Memory, Tools, and Output Parser directly to the bottom cluster ports of an AI Agent node.</p>
                <p><strong>Variables:</strong> Reference upstream node data using <code className="font-mono text-xs">{'{{ $json.field }}'}</code>, <code className="font-mono text-xs">{'{{trigger.body.field}}'}</code>, or <code className="font-mono text-xs">{'{{prev.text}}'}</code>.</p>
                <p><strong>Credentials:</strong> Store API keys, OAuth2 tokens, HTTP auth tokens, AI provider keys, and SMTP configs encrypted with AES-256-GCM.</p>
              </div>
            )}

            {infoModal === 'contact' && (
              contactSent ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Thank you. Your message has been received.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setContactSent(true);
                  }}
                  className="space-y-3"
                >
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <textarea
                    rows={3}
                    required
                    placeholder="How can we help?"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                  />
                  <button type="submit" className="px-4 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold">
                    Send Message
                  </button>
                </form>
              )
            )}

            {infoModal === 'terms' && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                CROX workflows execute according to user-defined triggers and configurations. Users are responsible for authorizing external endpoints and keeping account credentials secure.
              </p>
            )}

            {infoModal === 'privacy' && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                CROX stores user account profiles, workflow graphs, execution diagnostics, and AES-256-GCM encrypted credentials solely to operate your automations.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
