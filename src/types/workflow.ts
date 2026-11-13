export type CroxTriggerNodeType =
  | 'manual_trigger'
  | 'webhook_trigger'
  | 'schedule_trigger'
  | 'chat_trigger'
  | 'form_trigger'
  | 'error_trigger';

export type CroxAiNodeType =
  | 'ai_agent'
  | 'agent_orchestrator'
  | 'ai_node'
  | 'gemini_chat_model'
  | 'openai_chat_model'
  | 'anthropic_chat_model'
  | 'simple_memory'
  | 'windowed_memory'
  | 'conversation_memory'
  | 'structured_output_parser'
  | 'autofix_output_parser'
  | 'tool_calculator'
  | 'tool_http_request'
  | 'tool_datetime'
  | 'tool_workflow'
  | 'tool_custom';

export type CroxCoreNodeType =
  | 'http_request'
  | 'edit_fields'
  | 'set_data'
  | 'transform_data'
  | 'code_node'
  | 'filter_items'
  | 'sort_items'
  | 'limit_items'
  | 'aggregate_items'
  | 'split_out'
  | 'remove_duplicates'
  | 'json_operations'
  | 'datetime_operations';

export type CroxFlowNodeType =
  | 'condition'
  | 'switch_node'
  | 'merge_node'
  | 'loop_items'
  | 'wait_node'
  | 'stop_and_error'
  | 'execute_workflow'
  | 'noop';

export type CroxCommunicationNodeType = 'send_email' | 'webhook_notify' | 'integration_action';

export type CroxNodeType =
  | CroxTriggerNodeType
  | CroxAiNodeType
  | CroxCoreNodeType
  | CroxFlowNodeType
  | CroxCommunicationNodeType;

export type NodeCategory = 'triggers' | 'ai' | 'integrations' | 'core' | 'flow' | 'communication' | 'actions';

export type EdgeKind = 'main' | 'ai_languageModel' | 'ai_memory' | 'ai_tool' | 'ai_outputParser';

export type ClusterRole = 'languageModel' | 'memory' | 'tool' | 'outputParser';

export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export type WorkflowExecutionStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

export type CredentialType = 'api_key' | 'ai_provider' | 'oauth2' | 'email_smtp' | 'http_auth' | 'app_credential';

export type WorkflowStructureType =
  | 'blank'
  | 'linear'
  | 'flowchart'
  | 'ai_agent'
  | 'event_driven'
  | 'multi_agent';

export type StickyNoteColor = 'amber' | 'slate' | 'rose' | 'emerald' | 'sky';

export interface KeyValueItem {
  key: string;
  value: string;
}

export interface TransformMapping {
  targetField: string;
  sourceExpression: string;
  operation: 'copy' | 'template' | 'uppercase' | 'lowercase' | 'trim' | 'json_parse' | 'static';
}

export interface ManualTriggerConfig {
  samplePayload: string;
}

export interface WebhookTriggerConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  requireSecret: boolean;
  samplePayload: string;
  responseMode: 'immediate' | 'last_node';
}

export interface ScheduleTriggerConfig {
  frequency: 'every_minute' | 'hourly' | 'daily' | 'weekly' | 'custom_cron';
  intervalMinutes: number;
  cronExpression: string;
  timezone: string;
}

export interface ChatTriggerConfig {
  welcomeMessage: string;
  sessionKey: string;
  sampleMessage: string;
}

export interface FormFieldSchema {
  name: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
}

export interface FormTriggerConfig {
  formTitle: string;
  formDescription: string;
  fields: FormFieldSchema[];
  sampleSubmission: string;
}

export interface ErrorTriggerConfig {
  captureStack: boolean;
  sampleError: string;
}

export interface AiAgentConfig {
  prompt: string;
  systemMessage: string;
  maxIterations: number;
  temperature: number;
  requireOutputParser?: boolean;
  humanApprovalRequired?: boolean;
}

export interface AgentOrchestratorConfig {
  goal: string;
  coordinationMode: 'sequential' | 'parallel';
  agentWorkflowIds: string[];
  synthesizerPrompt: string;
  maxRounds: number;
}

export interface AiNodeConfig {
  provider: 'gemini';
  model: string;
  credentialId: string;
  prompt: string;
  systemInstruction: string;
  outputFormat: 'text' | 'json';
}

export interface GeminiChatModelConfig {
  model: string;
  credentialId: string;
  providerKeyId?: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface OpenAiChatModelConfig {
  providerId?: AiProviderId;
  baseUrl: string;
  model: string;
  credentialId: string;
  providerKeyId?: string;
  temperature: number;
  maxTokens: number;
}

export interface AnthropicChatModelConfig {
  model: string;
  credentialId: string;
  providerKeyId?: string;
  temperature: number;
  maxTokens: number;
}

export interface SimpleMemoryConfig {
  sessionKey: string;
  conversationIdExpression: string;
  maxMessages: number;
}

export interface WindowedMemoryConfig {
  sessionKey: string;
  conversationIdExpression: string;
  windowSize: number;
}

export interface ConversationMemoryConfig {
  sessionKey: string;
  conversationIdExpression: string;
  contextWindowMessages: number;
  retentionDays: number;
  resetOnTrigger?: boolean;
}

export interface StructuredOutputParserConfig {
  schemaJson: string;
  strict: boolean;
}

export interface AutofixOutputParserConfig {
  schemaJson: string;
  maxRepairAttempts: number;
}

export interface ToolCalculatorConfig {
  description: string;
}

export interface ToolHttpRequestConfig {
  toolName: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: KeyValueItem[];
  credentialId: string;
  bodyTemplate: string;
}

export interface ToolDateTimeConfig {
  defaultTimezone: string;
  description: string;
}

export interface ToolWorkflowConfig {
  toolName: string;
  description: string;
  targetWorkflowId: string;
}

export interface ToolCustomConfig {
  toolName: string;
  description: string;
  parametersSchemaJson: string;
  code: string;
}

export interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: KeyValueItem[];
  queryParams: KeyValueItem[];
  body: string;
  credentialId: string;
  timeoutMs: number;
  responseType: 'auto' | 'json' | 'text';
}

export interface EditFieldsConfig {
  mode: 'merge' | 'replace';
  fields: Array<{ name: string; value: string; type: 'string' | 'number' | 'boolean' | 'json' }>;
}

export interface SetDataConfig {
  keepOnlySet: boolean;
  values: Array<{ key: string; value: string; valueType: 'string' | 'number' | 'boolean' | 'json' }>;
}

export interface IntegrationActionConfig {
  appId: string;
  actionId: string;
  credentialId: string;
  parameters: Record<string, string>;
}

export interface TransformDataConfig {
  mode: 'map' | 'merge';
  mappings: TransformMapping[];
}

export interface CodeNodeConfig {
  language: 'javascript';
  code: string;
}

export interface FilterItemsConfig {
  itemsPath: string;
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  value: string;
}

export interface SortItemsConfig {
  itemsPath: string;
  field: string;
  direction: 'asc' | 'desc';
}

export interface LimitItemsConfig {
  itemsPath: string;
  limit: number;
  offset: number;
}

export interface AggregateItemsConfig {
  itemsPath: string;
  operation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'collect';
  field: string;
  outputField: string;
}

export interface SplitOutConfig {
  itemsPath: string;
  includeParentFields: boolean;
}

export interface RemoveDuplicatesConfig {
  itemsPath: string;
  keyField: string;
}

export interface JsonOperationsConfig {
  operation: 'parse' | 'stringify' | 'pick' | 'flatten';
  sourcePath: string;
  keys: string;
}

export interface DateTimeOperationsConfig {
  operation: 'now' | 'format' | 'add_days' | 'diff_days';
  inputExpression: string;
  amount: number;
  timezone: string;
}

export interface SendEmailConfig {
  to: string;
  subject: string;
  body: string;
  credentialId: string;
  isHtml: boolean;
}

export interface ConditionConfig {
  inputVariable: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'greater_than'
    | 'less_than'
    | 'exists'
    | 'is_empty';
  comparisonValue: string;
}

export interface SwitchRule {
  outputKey: string;
  label: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists';
  comparisonValue: string;
}

export interface SwitchNodeConfig {
  inputVariable: string;
  rules: SwitchRule[];
  includeDefault: boolean;
}

export interface MergeNodeConfig {
  mode: 'combine' | 'append' | 'first_non_empty';
}

export interface LoopItemsConfig {
  itemsPath: string;
  batchSize: number;
  maxItems: number;
}

export interface WebhookNotifyConfig {
  platform: 'slack' | 'discord' | 'generic';
  webhookUrl: string;
  message: string;
  username: string;
}

export interface WaitNodeConfig {
  durationMs: number;
}

export interface StopAndErrorConfig {
  errorMessage: string;
}

export interface ExecuteWorkflowConfig {
  targetWorkflowId: string;
  payloadExpression: string;
}

export interface NoopConfig {
  note: string;
}

export type CroxNodeConfig =
  | ManualTriggerConfig
  | WebhookTriggerConfig
  | ScheduleTriggerConfig
  | ChatTriggerConfig
  | FormTriggerConfig
  | ErrorTriggerConfig
  | AiAgentConfig
  | AgentOrchestratorConfig
  | AiNodeConfig
  | GeminiChatModelConfig
  | OpenAiChatModelConfig
  | AnthropicChatModelConfig
  | SimpleMemoryConfig
  | WindowedMemoryConfig
  | ConversationMemoryConfig
  | StructuredOutputParserConfig
  | AutofixOutputParserConfig
  | ToolCalculatorConfig
  | ToolHttpRequestConfig
  | ToolDateTimeConfig
  | ToolWorkflowConfig
  | ToolCustomConfig
  | HttpRequestConfig
  | EditFieldsConfig
  | SetDataConfig
  | IntegrationActionConfig
  | TransformDataConfig
  | CodeNodeConfig
  | FilterItemsConfig
  | SortItemsConfig
  | LimitItemsConfig
  | AggregateItemsConfig
  | SplitOutConfig
  | RemoveDuplicatesConfig
  | JsonOperationsConfig
  | DateTimeOperationsConfig
  | SendEmailConfig
  | ConditionConfig
  | SwitchNodeConfig
  | MergeNodeConfig
  | LoopItemsConfig
  | WebhookNotifyConfig
  | WaitNodeConfig
  | StopAndErrorConfig
  | ExecuteWorkflowConfig
  | NoopConfig;

export interface NodeSettings {
  retryOnFailure?: boolean;
  maxRetries?: number;
  waitBetweenRetriesMs?: number;
  continueOnFail?: boolean;
  alwaysOutputData?: boolean;
  onError?: 'stop' | 'continue';
  timeoutMs?: number;
  notes?: string;
}

export interface WorkflowNodeData {
  label: string;
  nodeType: CroxNodeType;
  category: NodeCategory;
  description?: string;
  config: CroxNodeConfig;
  nodeSettings?: NodeSettings;
  disabled?: boolean;
  executionStatus?: NodeExecutionStatus;
  executionDurationMs?: number;
  simulated?: boolean;
  [key: string]: unknown;
}

export interface StickyNoteNodeData {
  text: string;
  color: StickyNoteColor;
  title?: string;
  [key: string]: unknown;
}

export interface GroupNodeData {
  title: string;
  color?: 'zinc' | 'rose' | 'blue' | 'emerald' | 'amber';
  collapsed?: boolean;
  [key: string]: unknown;
}

export interface WorkflowNode {
  id: string;
  type: 'croxNode' | 'stickyNote' | 'group';
  position: { x: number; y: number };
  parentId?: string;
  extent?: 'parent';
  hidden?: boolean;
  style?: { width?: number; height?: number };
  width?: number;
  height?: number;
  data: WorkflowNodeData | StickyNoteNodeData | GroupNodeData;
}

export interface CroxFlowNode extends WorkflowNode {
  type: 'croxNode';
  data: WorkflowNodeData;
}

export interface StickyNoteNode extends WorkflowNode {
  type: 'stickyNote';
  data: StickyNoteNodeData;
}

export interface CanvasGroupNode extends WorkflowNode {
  type: 'group';
  data: GroupNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  edgeKind?: EdgeKind;
}

export interface WorkflowSettings {
  timeoutMs: number;
  retryOnFailure: boolean;
  maxRetries: number;
  retryDelayMs?: number;
  errorWorkflowId?: string;
  timezone?: string;
  maxExecutionMs?: number;
}

export interface ProjectRecord {
  id: string;
  userId: string;
  workspaceName: string;
  name: string;
  description: string;
  isDefault: boolean;
  isArchived: boolean;
  workflowCount?: number;
  activeWorkflowCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRecord {
  id: string;
  userId: string;
  projectId?: string | null;
  projectName?: string;
  workspaceName?: string;
  name: string;
  description: string;
  isActive: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  webhookSecret: string;
  lastExecutionStatus: WorkflowExecutionStatus | null;
  lastExecutedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersionRecord {
  id: string;
  workflowId: string;
  userId: string;
  versionNumber: number;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  note: string;
  createdAt: string;
}

export interface AiAgentToolCallTrace {
  iteration: number;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  error?: string;
}

export interface AiAgentExecutionTrace {
  provider: AiProviderId | 'multi_agent' | 'simulated';
  model: string;
  iterations: number;
  memorySessionKey?: string;
  loadedMessagesCount: number;
  toolCalls: AiAgentToolCallTrace[];
  outputParserApplied?: boolean;
  outputParserValid?: boolean;
}

export interface NodeExecutionResult {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: CroxNodeType;
  status: NodeExecutionStatus;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  durationMs: number;
  startedAt: string;
  completedAt: string | null;
  simulated: boolean;
}

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowName?: string;
  userId: string;
  triggerType: 'manual' | 'test' | 'webhook' | 'schedule' | 'chat' | 'form' | 'subworkflow' | 'error';
  status: WorkflowExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  summary: {
    totalNodes: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
  };
  errorMessage: string | null;
  nodeResults?: NodeExecutionResult[];
}

export interface WorkflowEvaluationCheck {
  name: string;
  passed: boolean;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface WorkflowEvaluationRecord {
  id: string;
  workflowId: string;
  status: 'passed' | 'warnings' | 'failed';
  checks: WorkflowEvaluationCheck[];
  executionId: string | null;
  durationMs: number;
  createdAt: string;
}

export interface ValidationIssue {
  id: string;
  nodeId?: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface CredentialRecord {
  id: string;
  userId: string;
  label: string;
  type: CredentialType;
  maskedPreview: string;
  isEnabled: boolean;
  providerMeta?: Record<string, unknown>;
  usedInWorkflows?: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export type AiProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'deepseek'
  | 'mistral'
  | 'ollama'
  | 'openai_compatible';

export interface AiModelCapability {
  text: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  jsonMode: boolean;
  vision: boolean;
  streaming: boolean;
  embeddings: boolean;
}

export interface AiModelMetadata {
  id: string;
  displayName: string;
  providerId: AiProviderId;
  capabilities: AiModelCapability;
  source: 'provider_api' | 'verified_catalog' | 'manual';
}

export interface AiProviderKeyRecord {
  id: string;
  userId: string;
  providerId: AiProviderId;
  label: string;
  maskedPreview: string;
  isPrimary: boolean;
  isEnabled: boolean;
  projectTag: string;
  healthStatus: 'healthy' | 'degraded' | 'quota_exhausted' | 'invalid' | 'untested';
  lastSuccessAt: string | null;
  lastError: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderConfigRecord {
  providerId: AiProviderId;
  displayName: string;
  protocol: 'gemini' | 'openai_compatible' | 'anthropic';
  defaultBaseUrl: string;
  baseUrl: string;
  requiresKey: boolean;
  supportsModelDiscovery: boolean;
  defaultModel: string;
  backupProviderId: AiProviderId | '';
  isPrimary: boolean;
  isEnabled: boolean;
  discoveredModels: AiModelMetadata[];
  capabilities: AiModelCapability;
  healthStatus: 'healthy' | 'degraded' | 'quota_exhausted' | 'invalid' | 'untested';
  lastError: string | null;
  lastTestedAt: string | null;
  serverFallbackAvailable?: boolean;
  keys: AiProviderKeyRecord[];
}

export type IntegrationAvailability = 'available' | 'requires_credentials' | 'coming_soon';

export interface IntegrationActionSchema {
  id: string;
  name: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'json';
    required: boolean;
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  outputPreviewDescription: string;
}

export interface IntegrationDefinition {
  appId: string;
  name: string;
  category: 'Google' | 'Communication' | 'Productivity' | 'Business' | 'Development' | 'Generic';
  description: string;
  availability: IntegrationAvailability;
  authType: 'oauth2' | 'api_key' | 'webhook_url' | 'http_auth' | 'none';
  requiredCredentials: string[];
  oauthScopes?: string[];
  rateLimitNote: string;
  triggers: Array<{ id: string; name: string; description: string }>;
  actions: IntegrationActionSchema[];
  connectedCount?: number;
  connectionStatus?: 'connected' | 'disconnected' | 'error';
}

export interface IntegrationConnectionRecord {
  id: string;
  userId: string;
  appId: string;
  label: string;
  authType: string;
  credentialId: string | null;
  credentialLabel?: string;
  status: 'connected' | 'disconnected' | 'error';
  config: Record<string, string>;
  lastTestedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TemplateCategory =
  | 'AI Automation'
  | 'Marketing'
  | 'Lead Generation'
  | 'Sales'
  | 'Communication'
  | 'Data Processing'
  | 'Developer Automation'
  | 'Business Operations'
  | 'AI & Content'
  | 'Developer & API'
  | 'Operations';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  featuredOnLanding?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  timezone: string;
  theme: 'light' | 'dark';
  notificationsEnabled: boolean;
  plan: 'free' | 'pro';
  createdAt: string;
  updatedAt: string;
}

export interface UserSessionInfo {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface NovaGenerationResult {
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  explanation: string;
  unsupportedRequirements: string[];
  mode: 'gemini' | 'rule-based';
}

export interface InsightsSummary {
  totalWorkflows: number;
  activeWorkflows: number;
  totalProjects: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageDurationMs: number;
  dailySeries: Array<{
    date: string;
    total: number;
    success: number;
    failed: number;
    avgDurationMs: number;
  }>;
  topWorkflows: Array<{
    workflowId: string;
    name: string;
    runs: number;
    successCount: number;
    avgDurationMs: number;
  }>;
  recentFailures: Array<{
    executionId: string;
    workflowId: string;
    workflowName: string;
    errorMessage: string | null;
    startedAt: string;
  }>;
}
