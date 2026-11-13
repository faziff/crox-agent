import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  CopyPlus,
  FastForward,
  KeyRound,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { getCatalogEntry } from '../../constants/nodeCatalog';
import { getCategoryIconBadgeClass, getNodeIcon } from '../../constants/nodeIcons';
import { api } from '../../services/api';
import {
  AggregateItemsConfig,
  AgentOrchestratorConfig,
  AiAgentConfig,
  AiNodeConfig,
  AiProviderConfigRecord,
  AnthropicChatModelConfig,
  AutofixOutputParserConfig,
  ChatTriggerConfig,
  CodeNodeConfig,
  ConditionConfig,
  ConversationMemoryConfig,
  CredentialRecord,
  CredentialType,
  CroxFlowNode,
  DateTimeOperationsConfig,
  EditFieldsConfig,
  ErrorTriggerConfig,
  ExecuteWorkflowConfig,
  FilterItemsConfig,
  FormTriggerConfig,
  GeminiChatModelConfig,
  HttpRequestConfig,
  IntegrationActionConfig,
  IntegrationDefinition,
  JsonOperationsConfig,
  LimitItemsConfig,
  LoopItemsConfig,
  ManualTriggerConfig,
  MergeNodeConfig,
  NodeExecutionResult,
  NodeSettings,
  NoopConfig,
  OpenAiChatModelConfig,
  RemoveDuplicatesConfig,
  ScheduleTriggerConfig,
  SendEmailConfig,
  SetDataConfig,
  SimpleMemoryConfig,
  SortItemsConfig,
  SplitOutConfig,
  StopAndErrorConfig,
  StructuredOutputParserConfig,
  SwitchNodeConfig,
  ToolCalculatorConfig,
  ToolCustomConfig,
  ToolDateTimeConfig,
  ToolHttpRequestConfig,
  ToolWorkflowConfig,
  TransformDataConfig,
  WaitNodeConfig,
  WebhookNotifyConfig,
  WebhookTriggerConfig,
  WindowedMemoryConfig,
  WorkflowEdge,
  WorkflowExecutionRecord,
  WorkflowNode,
  WorkflowRecord,
} from '../../types/workflow';

interface NodeConfigPanelProps {
  node: CroxFlowNode | null;
  allNodes: WorkflowNode[];
  allEdges: WorkflowEdge[];
  allWorkflows: WorkflowRecord[];
  workflowId: string;
  webhookSecret: string;
  workflowIsActive: boolean;
  credentials: CredentialRecord[];
  latestNodeResult?: NodeExecutionResult | null;
  latestExecution?: WorkflowExecutionRecord | null;
  onCredentialCreated: (cred: CredentialRecord) => void;
  onChangeNode: (nodeId: string, updater: (node: WorkflowNode) => WorkflowNode) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRunFromHere: (nodeId: string) => void;
  onClose?: () => void;
}

const COMMON_TIMEZONES = [
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

const EXPRESSION_CHIPS = [
  { label: 'trigger.body', value: '{{trigger.body}}' },
  { label: 'trigger.chatInput', value: '{{trigger.chatInput}}' },
  { label: 'prev', value: '{{prev}}' },
  { label: 'prev.text', value: '{{prev.text}}' },
  { label: 'prev.data', value: '{{prev.data}}' },
];

const inputCls =
  'w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48] transition-all';

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  allNodes,
  allEdges,
  allWorkflows,
  workflowId,
  webhookSecret,
  workflowIsActive,
  credentials,
  latestNodeResult,
  latestExecution,
  onCredentialCreated,
  onChangeNode,
  onDuplicateNode,
  onDeleteNode,
  onRunFromHere,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'parameters' | 'input' | 'settings' | 'output' | 'docs'>('parameters');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedExpression, setCopiedExpression] = useState<string | null>(null);
  const [nextRuns, setNextRuns] = useState<string[]>([]);
  const [cronError, setCronError] = useState<string | null>(null);

  const [aiProviders, setAiProviders] = useState<AiProviderConfigRecord[]>([]);
  const [integrationsCatalog, setIntegrationsCatalog] = useState<IntegrationDefinition[]>([]);

  const [testingNode, setTestingNode] = useState(false);
  const [nodeTestOutput, setNodeTestOutput] = useState<{
    output: unknown;
    simulated: boolean;
    durationMs: number;
  } | null>(null);
  const [nodeTestError, setNodeTestError] = useState<string | null>(null);

  const [testingModel, setTestingModel] = useState(false);
  const [modelConnStatus, setModelConnStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [memoryClearedMsg, setMemoryClearedMsg] = useState<string | null>(null);

  // Inline + Connect Credential Modal
  const [credModalType, setCredModalType] = useState<CredentialType | null>(null);
  const [credLabel, setCredLabel] = useState('');
  const [credSecret, setCredSecret] = useState('');
  const [savingCred, setSavingCred] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);

  const scheduleCfg =
    node?.data.nodeType === 'schedule_trigger' ? (node.data.config as ScheduleTriggerConfig) : null;

  useEffect(() => {
    api.aiProviders
      .list()
      .then((res) => setAiProviders(res.providers))
      .catch(() => {});
    api.integrations
      .list()
      .then((res) => setIntegrationsCatalog(res.integrations))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setNodeTestOutput(null);
    setNodeTestError(null);
    setModelConnStatus(null);
    setMemoryClearedMsg(null);
  }, [node?.id]);

  useEffect(() => {
    if (!scheduleCfg) {
      setNextRuns([]);
      setCronError(null);
      return;
    }
    let cancelled = false;
    api.workflows
      .validateCron(scheduleCfg.cronExpression || '0 9 * * *', scheduleCfg.timezone || 'UTC')
      .then((res) => {
        if (!cancelled) {
          setNextRuns(res.nextRuns || []);
          setCronError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setNextRuns([]);
          setCronError(err instanceof Error ? err.message : 'Invalid cron expression');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scheduleCfg?.cronExpression, scheduleCfg?.timezone]);

  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-zinc-500 dark:text-zinc-400 bg-white dark:bg-[#141416]">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No node selected</p>
        <p className="text-xs mt-1.5 max-w-[240px]">
          Click any node on the canvas to configure parameters, retry settings, credentials, and run live step tests.
        </p>
      </div>
    );
  }

  const catalogEntry = getCatalogEntry(node.data.nodeType);
  const NodeIcon = getNodeIcon(node.data.nodeType);
  const nodeSettings: NodeSettings = node.data.nodeSettings || {};

  const updateConfig = (patch: Record<string, unknown>) => {
    onChangeNode(node.id, (prev) => ({
      ...prev,
      data: {
        ...(prev.data as CroxFlowNode['data']),
        config: {
          ...(prev.data as CroxFlowNode['data']).config,
          ...patch,
        } as CroxFlowNode['data']['config'],
      },
    }));
  };

  const updateSettings = (patch: Partial<NodeSettings>) => {
    onChangeNode(node.id, (prev) => ({
      ...prev,
      data: {
        ...(prev.data as CroxFlowNode['data']),
        nodeSettings: {
          ...((prev.data as CroxFlowNode['data']).nodeSettings || {}),
          ...patch,
        },
      },
    }));
  };

  const updateMeta = (field: 'label' | 'description', value: string) => {
    onChangeNode(node.id, (prev) => ({
      ...prev,
      data: {
        ...(prev.data as CroxFlowNode['data']),
        [field]: value,
      },
    }));
  };

  const handleTestStep = async () => {
    setTestingNode(true);
    setNodeTestError(null);
    setNodeTestOutput(null);
    try {
      const res = await api.workflows.testNode(
        workflowId,
        node,
        {
          status: 'active',
          type: 'urgent',
          email: 'alex@acme.io',
          message: 'Sample test event',
          chatInput: 'Calculate 15 * 8 and tell me today’s date.',
          items: [
            { id: 1, price: 20, status: 'active' },
            { id: 2, price: 45, status: 'pending' },
          ],
        },
        allNodes,
        allEdges
      );
      setNodeTestOutput(res.result);
      setActiveTab('output');
    } catch (err) {
      setNodeTestError(err instanceof Error ? err.message : 'Step test failed.');
      setActiveTab('output');
    } finally {
      setTestingNode(false);
    }
  };

  const handleTestModelConnection = async () => {
    setTestingModel(true);
    setModelConnStatus(null);
    try {
      const res = await api.workflows.testModelConnection(node);
      setModelConnStatus({
        ok: res.result.ok,
        text: `${res.result.simulated ? '[Simulated] ' : '[Connected] '}${res.result.reply}`,
      });
    } catch (err) {
      setModelConnStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTestingModel(false);
    }
  };

  const handleClearMemory = async (sessionKey: string) => {
    setClearingMemory(true);
    setMemoryClearedMsg(null);
    try {
      const res = await api.workflows.clearAiMemory(sessionKey || 'default_agent');
      setMemoryClearedMsg(`Cleared ${res.cleared} stored memory turn(s).`);
    } catch (err) {
      setMemoryClearedMsg(err instanceof Error ? err.message : 'Failed to clear memory.');
    } finally {
      setClearingMemory(false);
    }
  };

  const handleInlineCredentialSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credModalType || !credLabel.trim() || !credSecret.trim()) return;
    setSavingCred(true);
    setCredError(null);
    try {
      const res = await api.credentials.create({
        label: credLabel.trim(),
        type: credModalType,
        secretValue: credSecret.trim(),
      });
      onCredentialCreated(res.credential);
      updateConfig({ credentialId: res.credential.id });
      setCredModalType(null);
      setCredLabel('');
      setCredSecret('');
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Failed to save credential.');
    } finally {
      setSavingCred(false);
    }
  };

  const renderCredentialSelector = (
    labelText: string,
    selectedId: string,
    allowedTypes: CredentialType[],
    defaultCreateType: CredentialType,
    emptyLabel: string
  ) => {
    const filtered = credentials.filter((c) => allowedTypes.includes(c.type));
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{labelText}</label>
          <button
            type="button"
            onClick={() => {
              setCredError(null);
              setCredLabel('');
              setCredSecret('');
              setCredModalType(defaultCreateType);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48] hover:underline"
          >
            <Plus className="w-3 h-3" /> Connect Credential
          </button>
        </div>
        <select
          value={selectedId || ''}
          onChange={(e) => updateConfig({ credentialId: e.target.value })}
          className={inputCls}
        >
          <option value="">{emptyLabel}</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.maskedPreview})
            </option>
          ))}
        </select>
      </div>
    );
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${origin}/api/webhooks/${workflowId}`;

  const renderSpecificFields = () => {
    switch (node.data.nodeType) {
      case 'manual_trigger': {
        const cfg = node.data.config as ManualTriggerConfig;
        return (
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Sample Test Payload (JSON)
            </label>
            <textarea
              rows={6}
              value={cfg.samplePayload || '{}'}
              onChange={(e) => updateConfig({ samplePayload: e.target.value })}
              className={`${inputCls} font-mono`}
            />
          </div>
        );
      }

      case 'webhook_trigger': {
        const cfg = node.data.config as WebhookTriggerConfig;
        return (
          <div className="space-y-4">
            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Webhook Endpoint</span>
                <span
                  className={`text-[11px] font-medium ${
                    workflowIsActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'
                  }`}
                >
                  {workflowIsActive ? 'Listening (Published)' : 'Draft (Publish to listen)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 truncate">
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(webhookUrl);
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 1500);
                  }}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Copy webhook URL"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  HTTP Method
                </label>
                <select
                  value={cfg.method}
                  onChange={(e) => updateConfig({ method: e.target.value })}
                  className={inputCls}
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Label Path
                </label>
                <input
                  type="text"
                  value={cfg.path}
                  onChange={(e) => updateConfig({ path: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(cfg.requireSecret)}
                onChange={(e) => updateConfig({ requireSecret: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
              <span>Require x-crox-webhook-secret header</span>
            </label>

            {cfg.requireSecret && (
              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <p className="text-[11px] text-zinc-500 mb-1">Secret Header Value</p>
                <code className="text-[11px] font-mono break-all text-zinc-800 dark:text-zinc-200">
                  {webhookSecret}
                </code>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sample Payload (JSON)
              </label>
              <textarea
                rows={4}
                value={cfg.samplePayload}
                onChange={(e) => updateConfig({ samplePayload: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        );
      }

      case 'schedule_trigger': {
        const cfg = node.data.config as ScheduleTriggerConfig;
        const applyPreset = (freq: ScheduleTriggerConfig['frequency']) => {
          const map: Record<ScheduleTriggerConfig['frequency'], { cron: string; mins: number }> = {
            every_minute: { cron: '* * * * *', mins: 1 },
            hourly: { cron: '0 * * * *', mins: 60 },
            daily: { cron: '0 9 * * *', mins: 1440 },
            weekly: { cron: '0 9 * * 1', mins: 10080 },
            custom_cron: { cron: cfg.cronExpression || '0 9 * * *', mins: cfg.intervalMinutes || 60 },
          };
          updateConfig({
            frequency: freq,
            cronExpression: map[freq].cron,
            intervalMinutes: map[freq].mins,
          });
        };

        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Frequency Preset
              </label>
              <select
                value={cfg.frequency}
                onChange={(e) => applyPreset(e.target.value as ScheduleTriggerConfig['frequency'])}
                className={inputCls}
              >
                <option value="every_minute">Every Minute</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily (09:00)</option>
                <option value="weekly">Weekly (Monday 09:00)</option>
                <option value="custom_cron">Custom Cron</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Cron Expression
              </label>
              <input
                type="text"
                value={cfg.cronExpression}
                onChange={(e) => updateConfig({ cronExpression: e.target.value, frequency: 'custom_cron' })}
                className={`${inputCls} font-mono`}
              />
              {cronError && <p className="text-[11px] text-red-500 mt-1">{cronError}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Timezone
              </label>
              <select
                value={cfg.timezone}
                onChange={(e) => updateConfig({ timezone: e.target.value })}
                className={inputCls}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            {nextRuns.length > 0 && (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <p className="text-[11px] font-medium text-zinc-500">Next Scheduled Runs</p>
                {nextRuns.map((iso) => (
                  <p key={iso} className="text-[11px] font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                    {new Date(iso).toLocaleString()}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      }

      case 'chat_trigger': {
        const cfg = node.data.config as ChatTriggerConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Session Key
              </label>
              <input
                type="text"
                value={cfg.sessionKey || 'default_chat'}
                onChange={(e) => updateConfig({ sessionKey: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Welcome Message
              </label>
              <input
                type="text"
                value={cfg.welcomeMessage || ''}
                onChange={(e) => updateConfig({ welcomeMessage: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sample Chat Input (for test runs)
              </label>
              <textarea
                rows={3}
                value={cfg.sampleMessage || ''}
                onChange={(e) => updateConfig({ sampleMessage: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        );
      }

      case 'form_trigger': {
        const cfg = node.data.config as FormTriggerConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Form Title
              </label>
              <input
                type="text"
                value={cfg.formTitle || ''}
                onChange={(e) => updateConfig({ formTitle: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sample Submission JSON
              </label>
              <textarea
                rows={5}
                value={cfg.sampleSubmission || '{}'}
                onChange={(e) => updateConfig({ sampleSubmission: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        );
      }

      case 'error_trigger': {
        const cfg = node.data.config as ErrorTriggerConfig;
        return (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(cfg.captureStack)}
                onChange={(e) => updateConfig({ captureStack: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
              <span>Capture stack / failing node metadata</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sample Error Payload (JSON)
              </label>
              <textarea
                rows={4}
                value={cfg.sampleError || '{}'}
                onChange={(e) => updateConfig({ sampleError: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        );
      }

      case 'ai_agent': {
        const cfg = node.data.config as AiAgentConfig;
        return (
          <div className="space-y-4">
            <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-[11px] text-zinc-700 dark:text-zinc-300">
              Attach a <strong>Chat Model</strong> (required) plus optional Memory, Tools, and Output Parser to the bottom ports of this node.
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Agent Input / Prompt
              </label>
              <textarea
                rows={4}
                value={cfg.prompt || '{{trigger.chatInput}}'}
                onChange={(e) => updateConfig({ prompt: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                System Instructions
              </label>
              <textarea
                rows={3}
                value={cfg.systemMessage || ''}
                onChange={(e) => updateConfig({ systemMessage: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Max Tool Iterations (1-10)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={cfg.maxIterations ?? 5}
                  onChange={(e) => updateConfig({ maxIterations: Number(e.target.value) })}
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Temperature
                </label>
                <input
                  type="number"
                  min={0}
                  max={1.5}
                  step={0.1}
                  value={cfg.temperature ?? 0.2}
                  onChange={(e) => updateConfig({ temperature: Number(e.target.value) })}
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </div>
            </div>
          </div>
        );
      }

      case 'agent_orchestrator': {
        const cfg = node.data.config as AgentOrchestratorConfig;
        const targets = allWorkflows.filter((w) => w.id !== workflowId);
        const selectedIds = cfg.agentWorkflowIds || [];
        return (
          <div className="space-y-4">
            <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-[11px] text-zinc-700 dark:text-zinc-300">
              Coordinates multiple specialist AI agent workflows sequentially or in parallel and synthesizes their outputs.
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Orchestration Goal / Prompt
              </label>
              <textarea
                rows={3}
                value={cfg.goal || '{{trigger.body}}'}
                onChange={(e) => updateConfig({ goal: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Coordination Mode
                </label>
                <select
                  value={cfg.coordinationMode || 'sequential'}
                  onChange={(e) => updateConfig({ coordinationMode: e.target.value })}
                  className={inputCls}
                >
                  <option value="sequential">Sequential (Chain)</option>
                  <option value="parallel">Parallel (Fan-out)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Max Rounds
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={cfg.maxRounds ?? 2}
                  onChange={(e) => updateConfig({ maxRounds: Number(e.target.value) })}
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Specialist Agent Workflows ({selectedIds.length} selected)
              </label>
              {targets.length === 0 ? (
                <p className="text-[11px] text-zinc-500 p-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700">
                  Create additional workflows to delegate sub-agent tasks.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                  {targets.map((w) => {
                    const checked = selectedIds.includes(w.id);
                    return (
                      <label
                        key={w.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-900 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedIds, w.id]
                              : selectedIds.filter((id) => id !== w.id);
                            updateConfig({ agentWorkflowIds: next });
                          }}
                          className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
                        />
                        <span className="truncate flex-1">{w.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Synthesizer Instructions
              </label>
              <textarea
                rows={3}
                value={cfg.synthesizerPrompt || ''}
                onChange={(e) => updateConfig({ synthesizerPrompt: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        );
      }

      case 'gemini_chat_model': {
        const cfg = node.data.config as GeminiChatModelConfig;
        const geminiProv = aiProviders.find((p) => p.providerId === 'gemini');
        const discoveredGeminiModels = geminiProv?.discoveredModels?.length
          ? geminiProv.discoveredModels
          : [
              { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
              { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash-Lite' },
            ];
        const geminiModels = cfg.model && !discoveredGeminiModels.some((m) => m.id === cfg.model)
          ? [{ id: cfg.model, displayName: `Saved model (${cfg.model})` }, ...discoveredGeminiModels]
          : discoveredGeminiModels;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Gemini Model
              </label>
              <select
                value={cfg.model || 'gemini-3.8-flash'}
                onChange={(e) => updateConfig({ model: e.target.value })}
                className={inputCls}
              >
                {geminiModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>

            {geminiProv && geminiProv.keys.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  AI Provider Vault Key
                </label>
                <select
                  value={cfg.providerKeyId || ''}
                  onChange={(e) => updateConfig({ providerKeyId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Auto (Primary Gemini Key / Server Default)</option>
                  {geminiProv.keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} ({k.maskedPreview}){k.isPrimary ? ' · Primary' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {renderCredentialSelector(
              'Manual Credential Override',
              cfg.credentialId,
              ['ai_provider', 'api_key'],
              'ai_provider',
              'Use AI Provider Vault / Server GEMINI_API_KEY'
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Temperature
                </label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={cfg.temperature ?? 0.2}
                  onChange={(e) => updateConfig({ temperature: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Max Output Tokens
                </label>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  value={cfg.maxOutputTokens ?? 2048}
                  onChange={(e) => updateConfig({ maxOutputTokens: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleTestModelConnection()}
              disabled={testingModel}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {testingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#E11D48]" />}
              <span>Test Model Connection</span>
            </button>
            {modelConnStatus && (
              <div
                className={`p-2.5 rounded-lg text-[11px] border ${
                  modelConnStatus.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300'
                }`}
              >
                {modelConnStatus.text}
              </div>
            )}
          </div>
        );
      }

      case 'openai_chat_model': {
        const cfg = node.data.config as OpenAiChatModelConfig;
        const activeProviderId = cfg.providerId || 'openai';
        const provObj = aiProviders.find((p) => p.providerId === activeProviderId);
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Provider Preset
              </label>
              <select
                value={activeProviderId}
                onChange={(e) => {
                  const nextId = e.target.value as OpenAiChatModelConfig['providerId'];
                  const nextProv = aiProviders.find((p) => p.providerId === nextId);
                  updateConfig({
                    providerId: nextId,
                    ...(nextProv?.baseUrl ? { baseUrl: nextProv.baseUrl } : {}),
                    ...(nextProv?.defaultModel ? { model: nextProv.defaultModel } : {}),
                  });
                }}
                className={inputCls}
              >
                {['openai', 'openrouter', 'groq', 'mistral', 'deepseek', 'cohere', 'ollama'].map((pid) => (
                  <option key={pid} value={pid}>
                    {pid}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Base URL
              </label>
              <input
                type="url"
                value={cfg.baseUrl || 'https://api.openai.com/v1'}
                onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Model Name
              </label>
              <input
                type="text"
                value={cfg.model || 'gpt-4o-mini'}
                onChange={(e) => updateConfig({ model: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            {provObj && provObj.keys.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  AI Provider Vault Key
                </label>
                <select
                  value={cfg.providerKeyId || ''}
                  onChange={(e) => updateConfig({ providerKeyId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Auto (Primary {provObj.displayName} Key)</option>
                  {provObj.keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} ({k.maskedPreview})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {renderCredentialSelector(
              'Credential Override',
              cfg.credentialId,
              ['ai_provider', 'api_key'],
              'ai_provider',
              'Use AI Provider Vault key'
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Temperature
                </label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={cfg.temperature ?? 0.2}
                  onChange={(e) => updateConfig({ temperature: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min={64}
                  max={16384}
                  value={cfg.maxTokens ?? 2048}
                  onChange={(e) => updateConfig({ maxTokens: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleTestModelConnection()}
              disabled={testingModel}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {testingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#E11D48]" />}
              <span>Test Endpoint Connection</span>
            </button>
            {modelConnStatus && (
              <div
                className={`p-2.5 rounded-lg text-[11px] border ${
                  modelConnStatus.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {modelConnStatus.text}
              </div>
            )}
          </div>
        );
      }

      case 'anthropic_chat_model': {
        const cfg = node.data.config as AnthropicChatModelConfig;
        const anthropicProv = aiProviders.find((p) => p.providerId === 'anthropic');
        const discoveredAnthropicModels = anthropicProv?.discoveredModels?.length
          ? anthropicProv.discoveredModels
          : [
              { id: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5' },
              { id: 'claude-haiku-5-5', displayName: 'Claude Haiku 5.5' },
            ];
        const anthropicModels = cfg.model && !discoveredAnthropicModels.some((m) => m.id === cfg.model)
          ? [{ id: cfg.model, displayName: `Saved model (${cfg.model})` }, ...discoveredAnthropicModels]
          : discoveredAnthropicModels;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Claude Model
              </label>
              <select
                value={cfg.model || 'claude-sonnet-5-5'}
                onChange={(e) => updateConfig({ model: e.target.value })}
                className={inputCls}
              >
                {anthropicModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
            {anthropicProv && anthropicProv.keys.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  AI Provider Vault Key
                </label>
                <select
                  value={cfg.providerKeyId || ''}
                  onChange={(e) => updateConfig({ providerKeyId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Auto (Primary Anthropic Key)</option>
                  {anthropicProv.keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} ({k.maskedPreview})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {renderCredentialSelector(
              'Manual Credential Override',
              cfg.credentialId,
              ['ai_provider', 'api_key'],
              'ai_provider',
              'Use AI Provider Vault key'
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Temperature
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={cfg.temperature ?? 0.2}
                  onChange={(e) => updateConfig({ temperature: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min={64}
                  max={8192}
                  value={cfg.maxTokens ?? 2048}
                  onChange={(e) => updateConfig({ maxTokens: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleTestModelConnection()}
              disabled={testingModel}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {testingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#E11D48]" />}
              <span>Test Claude Connection</span>
            </button>
            {modelConnStatus && (
              <div
                className={`p-2.5 rounded-lg text-[11px] border ${
                  modelConnStatus.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {modelConnStatus.text}
              </div>
            )}
          </div>
        );
      }

      case 'simple_memory':
      case 'windowed_memory':
      case 'conversation_memory': {
        const isWin = node.data.nodeType === 'windowed_memory';
        const isConv = node.data.nodeType === 'conversation_memory';
        const cfg = node.data.config as SimpleMemoryConfig | WindowedMemoryConfig | ConversationMemoryConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Session Key
              </label>
              <input
                type="text"
                value={cfg.sessionKey || 'default_agent'}
                onChange={(e) => updateConfig({ sessionKey: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Conversation ID Expression
              </label>
              <input
                type="text"
                value={cfg.conversationIdExpression || '{{trigger.sessionId}}'}
                onChange={(e) => updateConfig({ conversationIdExpression: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                {isWin
                  ? 'Sliding Window Size (messages)'
                  : isConv
                    ? 'Context Window (messages)'
                    : 'Max Stored Messages'}
              </label>
              <input
                type="number"
                min={2}
                max={100}
                value={
                  isWin
                    ? (cfg as WindowedMemoryConfig).windowSize ?? 6
                    : isConv
                      ? (cfg as ConversationMemoryConfig).contextWindowMessages ?? 16
                      : (cfg as SimpleMemoryConfig).maxMessages ?? 12
                }
                onChange={(e) =>
                  updateConfig(
                    isWin
                      ? { windowSize: Number(e.target.value) }
                      : isConv
                        ? { contextWindowMessages: Number(e.target.value) }
                        : { maxMessages: Number(e.target.value) }
                  )
                }
                className={`${inputCls} font-mono`}
              />
            </div>
            {isConv && (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Retention (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={(cfg as ConversationMemoryConfig).retentionDays ?? 30}
                    onChange={(e) => updateConfig({ retentionDays: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean((cfg as ConversationMemoryConfig).resetOnTrigger)}
                    onChange={(e) => updateConfig({ resetOnTrigger: e.target.checked })}
                    className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
                  />
                  <span>Reset conversation buffer on each trigger</span>
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleClearMemory(cfg.sessionKey)}
              disabled={clearingMemory}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              {clearingMemory ? 'Clearing...' : 'Clear Stored Session Memory'}
            </button>
            {memoryClearedMsg && <p className="text-[11px] text-emerald-600">{memoryClearedMsg}</p>}
          </div>
        );
      }

      case 'structured_output_parser':
      case 'autofix_output_parser': {
        const cfg = node.data.config as StructuredOutputParserConfig | AutofixOutputParserConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target JSON Schema
              </label>
              <textarea
                rows={8}
                value={cfg.schemaJson || '{}'}
                onChange={(e) => updateConfig({ schemaJson: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            {node.data.nodeType === 'autofix_output_parser' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Max Repair Attempts
                </label>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={(cfg as AutofixOutputParserConfig).maxRepairAttempts ?? 1}
                  onChange={(e) => updateConfig({ maxRepairAttempts: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
          </div>
        );
      }

      case 'tool_calculator': {
        const cfg = node.data.config as ToolCalculatorConfig;
        return (
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Tool Description (shown to AI Agent)
            </label>
            <textarea
              rows={3}
              value={cfg.description || ''}
              onChange={(e) => updateConfig({ description: e.target.value })}
              className={inputCls}
            />
          </div>
        );
      }

      case 'tool_datetime': {
        const cfg = node.data.config as ToolDateTimeConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Default Timezone
              </label>
              <select
                value={cfg.defaultTimezone || 'UTC'}
                onChange={(e) => updateConfig({ defaultTimezone: e.target.value })}
                className={inputCls}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Tool Description
              </label>
              <textarea
                rows={2}
                value={cfg.description || ''}
                onChange={(e) => updateConfig({ description: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        );
      }

      case 'tool_http_request': {
        const cfg = node.data.config as ToolHttpRequestConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Tool Function Name
              </label>
              <input
                type="text"
                value={cfg.toolName || 'fetch_external_api'}
                onChange={(e) => updateConfig({ toolName: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Description for AI Agent
              </label>
              <textarea
                rows={2}
                value={cfg.description || ''}
                onChange={(e) => updateConfig({ description: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={cfg.method || 'GET'}
                onChange={(e) => updateConfig({ method: e.target.value })}
                className={`${inputCls} font-mono`}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="url"
                value={cfg.url || ''}
                onChange={(e) => updateConfig({ url: e.target.value })}
                placeholder="https://api.example.com"
                className={`${inputCls} col-span-2 font-mono`}
              />
            </div>
            {renderCredentialSelector(
              'Auth Credential',
              cfg.credentialId,
              ['http_auth', 'api_key'],
              'http_auth',
              'None'
            )}
          </div>
        );
      }

      case 'tool_workflow': {
        const cfg = node.data.config as ToolWorkflowConfig;
        const targets = allWorkflows.filter((w) => w.id !== workflowId);
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Tool Function Name
              </label>
              <input
                type="text"
                value={cfg.toolName || 'run_helper_workflow'}
                onChange={(e) => updateConfig({ toolName: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target Workflow
              </label>
              <select
                value={cfg.targetWorkflowId || ''}
                onChange={(e) => updateConfig({ targetWorkflowId: e.target.value })}
                className={inputCls}
              >
                <option value="">Select workflow...</option>
                {targets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Tool Description
              </label>
              <textarea
                rows={2}
                value={cfg.description || ''}
                onChange={(e) => updateConfig({ description: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        );
      }

      case 'tool_custom': {
        const cfg = node.data.config as ToolCustomConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Tool Function Name
              </label>
              <input
                type="text"
                value={cfg.toolName || 'custom_tool'}
                onChange={(e) => updateConfig({ toolName: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={cfg.description || ''}
                onChange={(e) => updateConfig({ description: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Parameters JSON Schema
              </label>
              <textarea
                rows={4}
                value={cfg.parametersSchemaJson || '{}'}
                onChange={(e) => updateConfig({ parametersSchemaJson: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sandboxed JS Body (receives <code className="font-mono">args</code>)
              </label>
              <textarea
                rows={5}
                value={cfg.code || ''}
                onChange={(e) => updateConfig({ code: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        );
      }

      case 'http_request': {
        const cfg = node.data.config as HttpRequestConfig;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Method
                </label>
                <select
                  value={cfg.method}
                  onChange={(e) => updateConfig({ method: e.target.value })}
                  className={`${inputCls} font-mono`}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Timeout (ms)
                </label>
                <input
                  type="number"
                  min={1000}
                  max={30000}
                  value={cfg.timeoutMs}
                  onChange={(e) => updateConfig({ timeoutMs: Number(e.target.value) })}
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Request URL
              </label>
              <input
                type="url"
                value={cfg.url}
                onChange={(e) => updateConfig({ url: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            {renderCredentialSelector(
              'Authentication Credential',
              cfg.credentialId,
              ['http_auth', 'api_key'],
              'http_auth',
              'None'
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Headers</span>
                <button
                  type="button"
                  onClick={() => updateConfig({ headers: [...(cfg.headers || []), { key: '', value: '' }] })}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48]"
                >
                  <Plus className="w-3 h-3" /> Add Header
                </button>
              </div>
              {(cfg.headers || []).map((h, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Key"
                    value={h.key}
                    onChange={(e) => {
                      const next = [...cfg.headers];
                      next[i] = { ...next[i], key: e.target.value };
                      updateConfig({ headers: next });
                    }}
                    className="w-1/2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) => {
                      const next = [...cfg.headers];
                      next[i] = { ...next[i], value: e.target.value };
                      updateConfig({ headers: next });
                    }}
                    className="w-1/2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => updateConfig({ headers: cfg.headers.filter((_, idx) => idx !== i) })}
                    className="p-1 text-zinc-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {cfg.method !== 'GET' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Request Body
                </label>
                <textarea
                  rows={4}
                  value={cfg.body}
                  onChange={(e) => updateConfig({ body: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
          </div>
        );
      }

      case 'set_data': {
        const cfg = node.data.config as SetDataConfig;
        const rows = cfg.values || [];
        return (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(cfg.keepOnlySet)}
                onChange={(e) => updateConfig({ keepOnlySet: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
              <span>Keep only explicitly set fields (drop upstream keys)</span>
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Key-Value Assignments</span>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({
                      values: [...rows, { key: '', value: '', valueType: 'string' }],
                    })
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48]"
                >
                  <Plus className="w-3 h-3" /> Add Field
                </button>
              </div>
              {rows.map((v, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="key (e.g. customerEmail)"
                      value={v.key}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...next[idx], key: e.target.value };
                        updateConfig({ values: next });
                      }}
                      className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono"
                    />
                    <select
                      value={v.valueType}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = {
                          ...next[idx],
                          valueType: e.target.value as 'string' | 'number' | 'boolean' | 'json',
                        };
                        updateConfig({ values: next });
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="json">JSON</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => updateConfig({ values: rows.filter((_, i) => i !== idx) })}
                      className="p-1 text-zinc-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Value or {{trigger.email}}"
                    value={v.value}
                    onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...next[idx], value: e.target.value };
                      updateConfig({ values: next });
                    }}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'edit_fields': {
        const cfg = node.data.config as EditFieldsConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Mode
              </label>
              <select
                value={cfg.mode || 'merge'}
                onChange={(e) => updateConfig({ mode: e.target.value })}
                className={inputCls}
              >
                <option value="merge">Keep &amp; Merge Upstream Fields</option>
                <option value="replace">Include Only Defined Fields</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Fields</span>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({
                      fields: [...(cfg.fields || []), { name: '', value: '', type: 'string' }],
                    })
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48]"
                >
                  <Plus className="w-3 h-3" /> Add Field
                </button>
              </div>
              {(cfg.fields || []).map((f, idx) => (
                <div key={idx} className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Field name"
                      value={f.name}
                      onChange={(e) => {
                        const next = [...cfg.fields];
                        next[idx] = { ...next[idx], name: e.target.value };
                        updateConfig({ fields: next });
                      }}
                      className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono"
                    />
                    <select
                      value={f.type}
                      onChange={(e) => {
                        const next = [...cfg.fields];
                        next[idx] = { ...next[idx], type: e.target.value as 'string' | 'number' | 'boolean' | 'json' };
                        updateConfig({ fields: next });
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="json">JSON</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => updateConfig({ fields: cfg.fields.filter((_, i) => i !== idx) })}
                      className="p-1 text-zinc-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Value or {{expression}}"
                    value={f.value}
                    onChange={(e) => {
                      const next = [...cfg.fields];
                      next[idx] = { ...next[idx], value: e.target.value };
                      updateConfig({ fields: next });
                    }}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'code_node': {
        const cfg = node.data.config as CodeNodeConfig;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                JavaScript (Sandboxed VM)
              </label>
              <span className="text-[10px] font-mono text-zinc-400">prev, trigger, nodes</span>
            </div>
            <textarea
              rows={10}
              value={cfg.code || ''}
              onChange={(e) => updateConfig({ code: e.target.value })}
              className={`${inputCls} font-mono leading-relaxed`}
            />
          </div>
        );
      }

      case 'transform_data': {
        const cfg = node.data.config as TransformDataConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Output Mode
              </label>
              <select
                value={cfg.mode}
                onChange={(e) => updateConfig({ mode: e.target.value })}
                className={inputCls}
              >
                <option value="merge">Merge with previous output</option>
                <option value="map">Map only defined fields</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Mappings</span>
                <button
                  type="button"
                  onClick={() =>
                    updateConfig({
                      mappings: [...(cfg.mappings || []), { targetField: '', sourceExpression: '', operation: 'copy' }],
                    })
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48]"
                >
                  <Plus className="w-3 h-3" /> Add Field
                </button>
              </div>
              {(cfg.mappings || []).map((m, idx) => (
                <div key={idx} className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Target field"
                      value={m.targetField}
                      onChange={(e) => {
                        const next = [...cfg.mappings];
                        next[idx] = { ...next[idx], targetField: e.target.value };
                        updateConfig({ mappings: next });
                      }}
                      className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => updateConfig({ mappings: cfg.mappings.filter((_, i) => i !== idx) })}
                      className="p-1 text-zinc-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      placeholder="Source path"
                      value={m.sourceExpression}
                      onChange={(e) => {
                        const next = [...cfg.mappings];
                        next[idx] = { ...next[idx], sourceExpression: e.target.value };
                        updateConfig({ mappings: next });
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono"
                    />
                    <select
                      value={m.operation}
                      onChange={(e) => {
                        const next = [...cfg.mappings];
                        next[idx] = {
                          ...next[idx],
                          operation: e.target.value as TransformDataConfig['mappings'][number]['operation'],
                        };
                        updateConfig({ mappings: next });
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
                    >
                      <option value="copy">Copy Path</option>
                      <option value="template">Template String</option>
                      <option value="uppercase">Uppercase</option>
                      <option value="lowercase">Lowercase</option>
                      <option value="trim">Trim</option>
                      <option value="json_parse">Parse JSON</option>
                      <option value="static">Static Value</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'filter_items': {
        const cfg = node.data.config as FilterItemsConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Items Array Path
              </label>
              <input
                type="text"
                value={cfg.itemsPath || 'prev.data'}
                onChange={(e) => updateConfig({ itemsPath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Item Field
              </label>
              <input
                type="text"
                value={cfg.field || ''}
                onChange={(e) => updateConfig({ field: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Operator
              </label>
              <select
                value={cfg.operator || 'equals'}
                onChange={(e) => updateConfig({ operator: e.target.value })}
                className={inputCls}
              >
                <option value="equals">Equals</option>
                <option value="not_equals">Not Equals</option>
                <option value="contains">Contains</option>
                <option value="greater_than">Greater Than</option>
                <option value="less_than">Less Than</option>
                <option value="exists">Exists</option>
              </select>
            </div>
            {cfg.operator !== 'exists' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Comparison Value
                </label>
                <input
                  type="text"
                  value={cfg.value ?? ''}
                  onChange={(e) => updateConfig({ value: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
          </div>
        );
      }

      case 'sort_items': {
        const cfg = node.data.config as SortItemsConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Items Array Path
              </label>
              <input
                type="text"
                value={cfg.itemsPath || 'prev.items'}
                onChange={(e) => updateConfig({ itemsPath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Sort Field
              </label>
              <input
                type="text"
                value={cfg.field || 'id'}
                onChange={(e) => updateConfig({ field: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Direction
              </label>
              <select
                value={cfg.direction || 'asc'}
                onChange={(e) => updateConfig({ direction: e.target.value })}
                className={inputCls}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        );
      }

      case 'limit_items': {
        const cfg = node.data.config as LimitItemsConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Items Array Path
              </label>
              <input
                type="text"
                value={cfg.itemsPath || 'prev.data'}
                onChange={(e) => updateConfig({ itemsPath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Limit
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={cfg.limit ?? 5}
                  onChange={(e) => updateConfig({ limit: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Offset
                </label>
                <input
                  type="number"
                  min={0}
                  value={cfg.offset ?? 0}
                  onChange={(e) => updateConfig({ offset: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
          </div>
        );
      }

      case 'aggregate_items': {
        const cfg = node.data.config as AggregateItemsConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Items Array Path
              </label>
              <input
                type="text"
                value={cfg.itemsPath || 'prev.items'}
                onChange={(e) => updateConfig({ itemsPath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Operation
              </label>
              <select
                value={cfg.operation || 'count'}
                onChange={(e) => updateConfig({ operation: e.target.value })}
                className={inputCls}
              >
                <option value="count">Count</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
                <option value="collect">Collect Field Array</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Field
                </label>
                <input
                  type="text"
                  value={cfg.field || 'id'}
                  onChange={(e) => updateConfig({ field: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Output Key
                </label>
                <input
                  type="text"
                  value={cfg.outputField || 'result'}
                  onChange={(e) => updateConfig({ outputField: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
          </div>
        );
      }

      case 'split_out': {
        const cfg = node.data.config as SplitOutConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Items Array Path
              </label>
              <input
                type="text"
                value={cfg.itemsPath || 'prev.data'}
                onChange={(e) => updateConfig({ itemsPath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(cfg.includeParentFields)}
                onChange={(e) => updateConfig({ includeParentFields: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
              <span>Include parent object fields</span>
            </label>
          </div>
        );
      }

      case 'remove_duplicates': {
        const cfg = node.data.config as RemoveDuplicatesConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Items Array Path
              </label>
              <input
                type="text"
                value={cfg.itemsPath || 'prev.items'}
                onChange={(e) => updateConfig({ itemsPath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Unique Key Field
              </label>
              <input
                type="text"
                value={cfg.keyField || 'id'}
                onChange={(e) => updateConfig({ keyField: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        );
      }

      case 'json_operations': {
        const cfg = node.data.config as JsonOperationsConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Operation
              </label>
              <select
                value={cfg.operation || 'flatten'}
                onChange={(e) => updateConfig({ operation: e.target.value })}
                className={inputCls}
              >
                <option value="flatten">Flatten Object</option>
                <option value="parse">Parse JSON String</option>
                <option value="stringify">Stringify JSON</option>
                <option value="pick">Pick Specific Keys</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Source Path
              </label>
              <input
                type="text"
                value={cfg.sourcePath || 'prev'}
                onChange={(e) => updateConfig({ sourcePath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            {cfg.operation === 'pick' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Keys (comma-separated)
                </label>
                <input
                  type="text"
                  value={cfg.keys || ''}
                  onChange={(e) => updateConfig({ keys: e.target.value })}
                  placeholder="id, email, name"
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
          </div>
        );
      }

      case 'datetime_operations': {
        const cfg = node.data.config as DateTimeOperationsConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Operation
              </label>
              <select
                value={cfg.operation || 'now'}
                onChange={(e) => updateConfig({ operation: e.target.value })}
                className={inputCls}
              >
                <option value="now">Current Date &amp; Time</option>
                <option value="format">Format Timestamp</option>
                <option value="add_days">Add Days</option>
                <option value="diff_days">Difference in Days from Now</option>
              </select>
            </div>
            {cfg.operation !== 'now' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Input Date Expression
                </label>
                <input
                  type="text"
                  value={cfg.inputExpression || ''}
                  onChange={(e) => updateConfig({ inputExpression: e.target.value })}
                  placeholder="{{prev.createdAt}}"
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
            {cfg.operation === 'add_days' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Days (+/-)
                </label>
                <input
                  type="number"
                  value={cfg.amount ?? 1}
                  onChange={(e) => updateConfig({ amount: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Timezone
              </label>
              <select
                value={cfg.timezone || 'UTC'}
                onChange={(e) => updateConfig({ timezone: e.target.value })}
                className={inputCls}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      }

      case 'condition': {
        const cfg = node.data.config as ConditionConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Input Variable Path
              </label>
              <input
                type="text"
                value={cfg.inputVariable}
                onChange={(e) => updateConfig({ inputVariable: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Operator
              </label>
              <select
                value={cfg.operator}
                onChange={(e) => updateConfig({ operator: e.target.value })}
                className={inputCls}
              >
                <option value="equals">Equals</option>
                <option value="not_equals">Not Equals</option>
                <option value="contains">Contains</option>
                <option value="not_contains">Does Not Contain</option>
                <option value="greater_than">Greater Than</option>
                <option value="less_than">Less Than</option>
                <option value="exists">Exists</option>
                <option value="is_empty">Is Empty</option>
              </select>
            </div>
            {cfg.operator !== 'exists' && cfg.operator !== 'is_empty' && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Comparison Value
                </label>
                <input
                  type="text"
                  value={cfg.comparisonValue}
                  onChange={(e) => updateConfig({ comparisonValue: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            )}
          </div>
        );
      }

      case 'switch_node': {
        const cfg = node.data.config as SwitchNodeConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Input Variable Path
              </label>
              <input
                type="text"
                value={cfg.inputVariable || ''}
                onChange={(e) => updateConfig({ inputVariable: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Branch Rules</span>
                <button
                  type="button"
                  onClick={() => {
                    const idx = (cfg.rules || []).length;
                    updateConfig({
                      rules: [
                        ...(cfg.rules || []),
                        {
                          outputKey: `case_${idx}`,
                          label: `Case ${idx + 1}`,
                          operator: 'equals',
                          comparisonValue: '',
                        },
                      ],
                    });
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#E11D48]"
                >
                  <Plus className="w-3 h-3" /> Add Branch
                </button>
              </div>
              {(cfg.rules || []).map((rule, idx) => (
                <div key={idx} className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={rule.label}
                      onChange={(e) => {
                        const next = [...cfg.rules];
                        next[idx] = { ...next[idx], label: e.target.value };
                        updateConfig({ rules: next });
                      }}
                      placeholder="Branch label"
                      className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => updateConfig({ rules: cfg.rules.filter((_, i) => i !== idx) })}
                      className="p-1 text-zinc-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={rule.operator}
                      onChange={(e) => {
                        const next = [...cfg.rules];
                        next[idx] = {
                          ...next[idx],
                          operator: e.target.value as SwitchNodeConfig['rules'][number]['operator'],
                        };
                        updateConfig({ rules: next });
                      }}
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
                    >
                      <option value="equals">Equals</option>
                      <option value="not_equals">Not Equals</option>
                      <option value="contains">Contains</option>
                      <option value="greater_than">Greater Than</option>
                      <option value="less_than">Less Than</option>
                      <option value="exists">Exists</option>
                    </select>
                    <input
                      type="text"
                      value={rule.comparisonValue}
                      onChange={(e) => {
                        const next = [...cfg.rules];
                        next[idx] = { ...next[idx], comparisonValue: e.target.value };
                        updateConfig({ rules: next });
                      }}
                      placeholder="Value"
                      className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.includeDefault !== false}
                onChange={(e) => updateConfig({ includeDefault: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
              <span>Include Fallback Default Branch</span>
            </label>
          </div>
        );
      }

      case 'merge_node': {
        const cfg = node.data.config as MergeNodeConfig;
        return (
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Merge Strategy
            </label>
            <select
              value={cfg.mode || 'combine'}
              onChange={(e) => updateConfig({ mode: e.target.value })}
              className={inputCls}
            >
              <option value="combine">Combine Upstream Objects</option>
              <option value="append">Collect Into Array</option>
              <option value="first_non_empty">First Non-Empty Branch</option>
            </select>
          </div>
        );
      }

      case 'loop_items': {
        const cfg = node.data.config as LoopItemsConfig;
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Items Array Path
              </label>
              <input
                type="text"
                value={cfg.itemsPath || 'prev.items'}
                onChange={(e) => updateConfig({ itemsPath: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Batch Size
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={cfg.batchSize ?? 5}
                  onChange={(e) => updateConfig({ batchSize: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Max Items
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={cfg.maxItems ?? 50}
                  onChange={(e) => updateConfig({ maxItems: Number(e.target.value) })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
          </div>
        );
      }

      case 'wait_node': {
        const cfg = node.data.config as WaitNodeConfig;
        return (
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Delay Duration (ms, max 10000)
            </label>
            <input
              type="number"
              min={0}
              max={10000}
              step={100}
              value={cfg.durationMs}
              onChange={(e) => updateConfig({ durationMs: Number(e.target.value) })}
              className={`${inputCls} font-mono`}
            />
          </div>
        );
      }

      case 'stop_and_error': {
        const cfg = node.data.config as StopAndErrorConfig;
        return (
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Error Message
            </label>
            <textarea
              rows={3}
              value={cfg.errorMessage || ''}
              onChange={(e) => updateConfig({ errorMessage: e.target.value })}
              className={inputCls}
            />
          </div>
        );
      }

      case 'execute_workflow': {
        const cfg = node.data.config as ExecuteWorkflowConfig;
        const targets = allWorkflows.filter((w) => w.id !== workflowId);
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target Sub-Workflow
              </label>
              <select
                value={cfg.targetWorkflowId || ''}
                onChange={(e) => updateConfig({ targetWorkflowId: e.target.value })}
                className={inputCls}
              >
                <option value="">Select workflow...</option>
                {targets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Input Payload Expression
              </label>
              <input
                type="text"
                value={cfg.payloadExpression || '{{prev}}'}
                onChange={(e) => updateConfig({ payloadExpression: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        );
      }

      case 'noop': {
        const cfg = node.data.config as NoopConfig;
        return (
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Checkpoint Note
            </label>
            <input
              type="text"
              value={cfg.note || ''}
              onChange={(e) => updateConfig({ note: e.target.value })}
              className={inputCls}
            />
          </div>
        );
      }

      case 'send_email': {
        const cfg = node.data.config as SendEmailConfig;
        return (
          <div className="space-y-4">
            {renderCredentialSelector(
              'Sender SMTP Credential',
              cfg.credentialId,
              ['email_smtp'],
              'email_smtp',
              'Simulated Delivery (No SMTP configured)'
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Recipient (To)
              </label>
              <input
                type="text"
                value={cfg.to}
                onChange={(e) => updateConfig({ to: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={cfg.subject}
                onChange={(e) => updateConfig({ subject: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Email Body
              </label>
              <textarea
                rows={4}
                value={cfg.body}
                onChange={(e) => updateConfig({ body: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(cfg.isHtml)}
                onChange={(e) => updateConfig({ isHtml: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
              <span>Send body as HTML</span>
            </label>
          </div>
        );
      }

      case 'webhook_notify': {
        const cfg = node.data.config as WebhookNotifyConfig;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Platform
              </label>
              <select
                value={cfg.platform}
                onChange={(e) => updateConfig({ platform: e.target.value })}
                className={inputCls}
              >
                <option value="slack">Slack Incoming Webhook</option>
                <option value="discord">Discord Webhook</option>
                <option value="generic">Generic JSON Webhook</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Webhook URL
              </label>
              <input
                type="url"
                value={cfg.webhookUrl}
                onChange={(e) => updateConfig({ webhookUrl: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Display Username
              </label>
              <input
                type="text"
                value={cfg.username}
                onChange={(e) => updateConfig({ username: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Message Content
              </label>
              <textarea
                rows={4}
                value={cfg.message}
                onChange={(e) => updateConfig({ message: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
        );
      }

      case 'ai_node': {
        const cfg = node.data.config as AiNodeConfig;
        const geminiProvider = aiProviders.find((p) => p.providerId === 'gemini');
        const discoveredModels = geminiProvider?.discoveredModels?.length
          ? geminiProvider.discoveredModels
          : [
              { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
              { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash-Lite' },
            ];
        const modelOptions = cfg.model && !discoveredModels.some((m) => m.id === cfg.model)
          ? [{ id: cfg.model, displayName: `Saved model (${cfg.model})` }, ...discoveredModels]
          : discoveredModels;
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Model
              </label>
              <select
                value={cfg.model}
                onChange={(e) => updateConfig({ model: e.target.value })}
                className={inputCls}
              >
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>{model.id}</option>
                ))}
              </select>
            </div>
            {renderCredentialSelector(
              'Credential Override',
              cfg.credentialId,
              ['ai_provider'],
              'ai_provider',
              'Use Connected Server Gemini Key'
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                System Instruction
              </label>
              <input
                type="text"
                value={cfg.systemInstruction}
                onChange={(e) => updateConfig({ systemInstruction: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Prompt
              </label>
              <textarea
                rows={4}
                value={cfg.prompt}
                onChange={(e) => updateConfig({ prompt: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Output Format
              </label>
              <select
                value={cfg.outputFormat}
                onChange={(e) => updateConfig({ outputFormat: e.target.value })}
                className={inputCls}
              >
                <option value="text">Plain Text</option>
                <option value="json">Structured JSON</option>
              </select>
            </div>
          </div>
        );
      }

      case 'integration_action': {
        const cfg = node.data.config as IntegrationActionConfig;
        const selectedApp = integrationsCatalog.find((a) => a.appId === cfg.appId) || integrationsCatalog[0];
        const selectedAction =
          selectedApp?.actions.find((a) => a.id === cfg.actionId) || selectedApp?.actions[0];
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Integration App
              </label>
              <select
                value={cfg.appId || ''}
                onChange={(e) => {
                  const nextApp = integrationsCatalog.find((a) => a.appId === e.target.value);
                  updateConfig({
                    appId: e.target.value,
                    actionId: nextApp?.actions[0]?.id || '',
                    parameters: {},
                  });
                }}
                className={inputCls}
              >
                <option value="">Select app...</option>
                {integrationsCatalog.map((app) => (
                  <option key={app.appId} value={app.appId}>
                    {app.name}{app.availability === 'coming_soon' ? ' (Coming Soon)' : app.availability === 'requires_credentials' ? ' (Credentials required)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedApp?.availability === 'coming_soon' && (
              <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-300">
                {selectedApp.name} is planned for a future release and cannot execute live yet.
              </div>
            )}

            {selectedApp?.availability === 'requires_credentials' && (
              <div className="p-2.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 text-[11px] text-blue-800 dark:text-blue-300">
                Connect {selectedApp.name} and select an encrypted credential before running this action.
              </div>
            )}

            {selectedApp && selectedApp.actions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Action
                </label>
                <select
                  value={cfg.actionId || ''}
                  onChange={(e) => updateConfig({ actionId: e.target.value, parameters: {} })}
                  className={inputCls}
                >
                  {selectedApp.actions.map((act) => (
                    <option key={act.id} value={act.id}>
                      {act.name}
                    </option>
                  ))}
                </select>
                {selectedAction?.description && (
                  <p className="text-[11px] text-zinc-500 mt-1">{selectedAction.description}</p>
                )}
              </div>
            )}

            {selectedApp?.authType !== 'none' &&
              renderCredentialSelector(
                'App Credential / Token',
                cfg.credentialId,
                ['oauth2', 'app_credential', 'api_key', 'http_auth'],
                'api_key',
                'Select connected credential...'
              )}

            {selectedAction?.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {field.label} {field.required && <span className="text-[#E11D48]">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={cfg.parameters?.[field.key] || ''}
                    onChange={(e) =>
                      updateConfig({
                        parameters: { ...(cfg.parameters || {}), [field.key]: e.target.value },
                      })
                    }
                    placeholder={field.placeholder || ''}
                    className={`${inputCls} font-mono`}
                  />
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={cfg.parameters?.[field.key] || ''}
                    onChange={(e) =>
                      updateConfig({
                        parameters: { ...(cfg.parameters || {}), [field.key]: e.target.value },
                      })
                    }
                    placeholder={field.placeholder || ''}
                    className={`${inputCls} font-mono`}
                  />
                )}
              </div>
            ))}
          </div>
        );
      }
    }
  };

  const incomingEdgeSources = allEdges
    .filter((e) => e.target === node.id && (!e.edgeKind || e.edgeKind === 'main'))
    .map((e) => e.source);
  const upstreamResults = (latestExecution?.nodeResults || []).filter((r) =>
    incomingEdgeSources.includes(r.nodeId)
  );
  const dynamicVariableChips: Array<{ label: string; value: string }> = [
    ...EXPRESSION_CHIPS,
    ...upstreamResults.flatMap((r) => {
      const base: Array<{ label: string; value: string }> = [
        { label: `nodes.${r.nodeId}`, value: `{{nodes.${r.nodeId}}}` },
      ];
      if (r.output && typeof r.output === 'object' && !Array.isArray(r.output)) {
        Object.keys(r.output as Record<string, unknown>)
          .slice(0, 5)
          .forEach((k) => {
            base.push({
              label: `prev.${k}`,
              value: `{{prev.${k}}}`,
            });
          });
      }
      return base;
    }),
  ];

  const displayedOutput = nodeTestOutput || (latestNodeResult ? {
    output: latestNodeResult.output,
    simulated: latestNodeResult.simulated,
    durationMs: latestNodeResult.durationMs,
  } : null);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#141416]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getCategoryIconBadgeClass(
              node.data.category,
              catalogEntry.clusterRole
            )}`}
          >
            <NodeIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
              {node.data.label}
            </h3>
            <p className="text-[11px] font-mono text-zinc-400 truncate">
              {node.data.nodeType.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handleTestStep()}
            disabled={testingNode}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-medium whitespace-nowrap disabled:opacity-50 transition-colors"
          >
            {testingNode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            <span>Test</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1 text-xs overflow-x-auto">
        {(['parameters', 'input', 'settings', 'output', 'docs'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-2 py-1.5 font-medium capitalize border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'border-[#E11D48] text-zinc-900 dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'parameters' && (
          <>
            <div className="space-y-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Step Name
                </label>
                <input
                  type="text"
                  value={node.data.label}
                  onChange={(e) => updateMeta('label', e.target.value)}
                  className={`${inputCls} font-medium`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={node.data.description || ''}
                  onChange={(e) => updateMeta('description', e.target.value)}
                  placeholder="Optional description..."
                  className={inputCls}
                />
              </div>
            </div>

            {renderSpecificFields()}

            {/* Upstream Variable Browser & Copy Chips */}
            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
              <p className="text-[11px] font-medium text-zinc-500">
                Variable Browser (click to copy expression):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dynamicVariableChips.map((chip, idx) => (
                  <button
                    key={`${chip.value}-${idx}`}
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(chip.value);
                      setCopiedExpression(chip.value);
                      setTimeout(() => setCopiedExpression(null), 1200);
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono text-zinc-700 dark:text-zinc-300 hover:border-[#E11D48]"
                  >
                    {copiedExpression === chip.value ? 'Copied!' : chip.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'input' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">
              Upstream Input Data
            </p>
            {latestNodeResult?.input && Object.keys(latestNodeResult.input as object).length > 0 ? (
              <pre className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono overflow-x-auto max-h-96 text-zinc-800 dark:text-zinc-200">
                {JSON.stringify(latestNodeResult.input, null, 2)}
              </pre>
            ) : upstreamResults.length > 0 ? (
              <div className="space-y-3">
                {upstreamResults.map((ur) => (
                  <div key={ur.id} className="space-y-1">
                    <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                      From {ur.nodeName} (<code className="font-mono">{ur.nodeId}</code>)
                    </p>
                    <pre className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono overflow-x-auto max-h-60 text-zinc-800 dark:text-zinc-200">
                      {JSON.stringify(ur.output ?? null, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center space-y-1.5">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  No upstream execution data yet
                </p>
                <p className="text-[11px] text-zinc-500">
                  Run a workflow test or execute upstream nodes to inspect live incoming JSON here.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Node Timeout Override (ms)
              </label>
              <input
                type="number"
                min={500}
                max={120000}
                step={500}
                value={nodeSettings.timeoutMs ?? 15000}
                onChange={(e) => updateSettings({ timeoutMs: Number(e.target.value) })}
                className={`${inputCls} font-mono tabular-nums`}
              />
            </div>

            <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <span>Disable Node (Skip in execution)</span>
              <input
                type="checkbox"
                checked={Boolean(node.data.disabled)}
                onChange={(e) =>
                  onChangeNode(node.id, (prev) => ({
                    ...prev,
                    data: { ...(prev.data as CroxFlowNode['data']), disabled: e.target.checked },
                  }))
                }
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <span>Retry on Failure</span>
              <input
                type="checkbox"
                checked={Boolean(nodeSettings.retryOnFailure)}
                onChange={(e) => updateSettings({ retryOnFailure: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
            </label>

            {nodeSettings.retryOnFailure && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Max Retries
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={nodeSettings.maxRetries ?? 2}
                    onChange={(e) => updateSettings({ maxRetries: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Wait Between (ms)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={100}
                    value={nodeSettings.waitBetweenRetriesMs ?? 400}
                    onChange={(e) => updateSettings({ waitBetweenRetriesMs: Number(e.target.value) })}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            )}

            <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <span>Continue Workflow on Error</span>
              <input
                type="checkbox"
                checked={Boolean(nodeSettings.continueOnFail || nodeSettings.onError === 'continue')}
                onChange={(e) =>
                  updateSettings({
                    continueOnFail: e.target.checked,
                    onError: e.target.checked ? 'continue' : 'stop',
                  })
                }
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <span>Always Output Data</span>
              <input
                type="checkbox"
                checked={Boolean(nodeSettings.alwaysOutputData)}
                onChange={(e) => updateSettings({ alwaysOutputData: e.target.checked })}
                className="rounded border-zinc-300 text-[#E11D48] focus:ring-[#E11D48]"
              />
            </label>
          </div>
        )}

        {activeTab === 'output' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleTestStep()}
                disabled={testingNode}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium disabled:opacity-50"
              >
                {testingNode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>Test Step</span>
              </button>
              <button
                type="button"
                onClick={() => onRunFromHere(node.id)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Run From Here</span>
              </button>
            </div>

            {nodeTestError && (
              <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400">
                {nodeTestError}
              </div>
            )}

            {displayedOutput ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Output {displayedOutput.simulated ? '(Simulated)' : ''}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-500">{displayedOutput.durationMs}ms</span>
                </div>
                <pre className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono overflow-x-auto max-h-96 text-zinc-800 dark:text-zinc-200">
                  {JSON.stringify(displayedOutput.output, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 text-center py-8">
                Click &ldquo;Test Step&rdquo; above to preview this node&apos;s output JSON.
              </p>
            )}
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-4 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            <div>
              <h4 className="font-semibold text-zinc-900 dark:text-white mb-1">{catalogEntry.label}</h4>
              <p>{catalogEntry.documentation}</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">Expression Context</p>
              <p><code className="font-mono">{'{{trigger.*}}'}</code> — initial webhook, chat, form, or schedule trigger data.</p>
              <p><code className="font-mono">{'{{prev.*}}'}</code> — output object from the immediate upstream node.</p>
              <p><code className="font-mono">{'{{nodes.<nodeId>.*}}'}</code> — output from any executed node by ID.</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 bg-zinc-50 dark:bg-zinc-950">
        <button
          type="button"
          onClick={() => onDuplicateNode(node.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <CopyPlus className="w-3.5 h-3.5" />
          <span>Duplicate</span>
        </button>
        <button
          type="button"
          onClick={() => onDeleteNode(node.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-white dark:bg-zinc-900 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Node</span>
        </button>
      </div>

      {/* Inline + Connect Credential Modal */}
      {credModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleInlineCredentialSave}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-5 space-y-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#E11D48]" />
                <h4 className="font-display text-sm font-semibold">Connect Credential</h4>
              </div>
              <button type="button" onClick={() => setCredModalType(null)}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">Label</label>
              <input
                type="text"
                required
                autoFocus
                value={credLabel}
                onChange={(e) => setCredLabel(e.target.value)}
                placeholder="e.g. Production API Key"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Secret / Key Value
              </label>
              <textarea
                rows={3}
                required
                value={credSecret}
                onChange={(e) => setCredSecret(e.target.value)}
                placeholder="Paste secret key (encrypted with AES-256-GCM)"
                className={`${inputCls} font-mono`}
              />
            </div>
            {credError && <p className="text-xs text-red-600">{credError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCredModalType(null)}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCred}
                className="px-3 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-medium disabled:opacity-50"
              >
                {savingCred ? 'Saving...' : 'Save & Link'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
