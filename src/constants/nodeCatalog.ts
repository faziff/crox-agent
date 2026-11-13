import {
  CanvasGroupNode,
  ClusterRole,
  CroxNodeConfig,
  CroxNodeType,
  NodeCategory,
  StickyNoteColor,
  StickyNoteNode,
  WorkflowNode,
} from '../types/workflow';

export interface NodeCatalogEntry {
  type: CroxNodeType;
  label: string;
  category: Exclude<NodeCategory, 'actions'>;
  shortDescription: string;
  documentation: string;
  clusterRole?: ClusterRole;
  requiresCredential?: boolean;
  searchTerms?: string[];
  suggestedNext?: CroxNodeType[];
  defaultConfig: () => CroxNodeConfig;
}

export const CATEGORY_LABELS: Record<Exclude<NodeCategory, 'actions'>, string> = {
  triggers: 'Triggers',
  ai: 'AI & Agents',
  core: 'Core & Data',
  flow: 'Flow Control',
  communication: 'Communication',
  integrations: 'Integrations',
};

export const NODE_CATALOG: NodeCatalogEntry[] = [
  // TRIGGERS
  {
    type: 'manual_trigger',
    label: 'Manual Trigger',
    category: 'triggers',
    shortDescription: 'Starts workflow on-demand from editor or API',
    documentation:
      'Use Manual Trigger to test or run workflows interactively with a customizable JSON test payload.',
    suggestedNext: ['ai_agent', 'http_request', 'edit_fields', 'code_node'],
    defaultConfig: () => ({
      samplePayload: JSON.stringify({ request: 'Run daily summary check', priority: 'normal' }, null, 2),
    }),
  },
  {
    type: 'webhook_trigger',
    label: 'Webhook Trigger',
    category: 'triggers',
    shortDescription: 'Starts workflow when an HTTP request arrives',
    documentation:
      'Exposes a unique endpoint URL (/api/webhooks/:id) with optional secret verification header x-crox-webhook-secret.',
    suggestedNext: ['condition', 'edit_fields', 'ai_agent', 'http_request'],
    defaultConfig: () => ({
      method: 'POST',
      path: '/incoming',
      requireSecret: false,
      samplePayload: JSON.stringify({ event: 'user.created', email: 'alex@acme.io', name: 'Alex' }, null, 2),
      responseMode: 'immediate',
    }),
  },
  {
    type: 'schedule_trigger',
    label: 'Schedule Trigger',
    category: 'triggers',
    shortDescription: 'Runs automatically on a cron or interval schedule',
    documentation:
      'Triggers automatically when workflow is Published using standard 5-field cron expressions and IANA timezones.',
    suggestedNext: ['http_request', 'ai_agent', 'ai_node', 'code_node'],
    defaultConfig: () => ({
      frequency: 'daily',
      intervalMinutes: 1440,
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
    }),
  },
  {
    type: 'chat_trigger',
    label: 'Chat Trigger',
    category: 'triggers',
    shortDescription: 'Triggers on user chat input for conversational agents',
    documentation:
      'Provides {{trigger.chatInput}} and {{trigger.sessionId}} variables ideal for AI Agent + Memory clusters.',
    suggestedNext: ['ai_agent', 'ai_node', 'condition'],
    defaultConfig: () => ({
      welcomeMessage: 'Ask me anything about your operations.',
      sessionKey: 'default_chat',
      sampleMessage: 'Calculate 420 * 1.15 and tell me today’s date.',
    }),
  },
  {
    type: 'form_trigger',
    label: 'Form Trigger',
    category: 'triggers',
    shortDescription: 'Captures structured form submissions into workflow',
    documentation:
      'Defines structured fields (name, email, etc.) and injects submitted data at {{trigger.body}}.',
    suggestedNext: ['condition', 'code_node', 'send_email', 'webhook_notify'],
    defaultConfig: () => ({
      formTitle: 'Contact & Lead Intake',
      formDescription: 'Collects inquiry details for automated routing.',
      fields: [
        { name: 'name', label: 'Full Name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'message', label: 'Message', type: 'textarea', required: false },
      ],
      sampleSubmission: JSON.stringify(
        { name: 'Taylor Swift', email: 'taylor@example.com', message: 'Interested in team plan' },
        null,
        2
      ),
    }),
  },
  {
    type: 'error_trigger',
    label: 'Error Trigger',
    category: 'triggers',
    shortDescription: 'Handles failures dispatched from other workflows',
    documentation:
      'Set another workflow’s Error Workflow setting to this workflow ID to receive {{trigger.error}} incident payloads.',
    suggestedNext: ['webhook_notify', 'send_email', 'edit_fields'],
    defaultConfig: () => ({
      captureStack: true,
      sampleError: JSON.stringify(
        { failedWorkflowName: 'Billing Sync', errorMessage: 'Upstream HTTP 503', failedAt: new Date().toISOString() },
        null,
        2
      ),
    }),
  },

  // AI & AGENT CLUSTER SYSTEM
  {
    type: 'ai_agent',
    label: 'AI Agent',
    category: 'ai',
    shortDescription: 'Autonomous multi-turn agent with Chat Model, Memory & Tools',
    documentation:
      'Connect a Chat Model (required) to its bottom port, plus optional Memory, Tools (Calculator, HTTP, DateTime, Workflow, Custom), and an Output Parser.',
    suggestedNext: ['edit_fields', 'condition', 'send_email', 'webhook_notify'],
    defaultConfig: () => ({
      prompt: '{{trigger.chatInput}}',
      systemMessage: 'You are a helpful, accurate CROX AI agent. Use attached tools whenever helpful.',
      maxIterations: 5,
      temperature: 0.2,
    }),
  },
  {
    type: 'agent_orchestrator',
    label: 'Agent Orchestrator',
    category: 'ai',
    shortDescription: 'Coordinates multiple sub-agent workflows sequentially or in parallel',
    documentation:
      'Runs selected CROX sub-agent workflows sequentially or concurrently, then synthesizes their outputs via an attached Chat Model.',
    suggestedNext: ['edit_fields', 'send_email', 'webhook_notify'],
    defaultConfig: () => ({
      goal: '{{trigger.body}}',
      coordinationMode: 'sequential',
      agentWorkflowIds: [],
      synthesizerPrompt:
        'You are a Multi-Agent Orchestrator. Combine all sub-agent findings into one clear, accurate response.',
      maxRounds: 5,
    }),
  },
  {
    type: 'gemini_chat_model',
    label: 'Gemini Chat Model',
    category: 'ai',
    clusterRole: 'languageModel',
    requiresCredential: true,
    searchTerms: ['google', 'gemini', 'llm', 'chat model', 'language model'],
    shortDescription: 'Sub-node: Google Gemini LLM for AI Agent',
    documentation: 'Attach to the Chat Model port at the bottom of an AI Agent or Orchestrator node.',
    defaultConfig: () => ({
      providerId: 'gemini',
      providerKeyId: '',
      model: 'gemini-3.8-flash',
      credentialId: '',
      temperature: 0.2,
      maxOutputTokens: 2048,
    }),
  },
  {
    type: 'openai_chat_model',
    label: 'OpenAI-Compatible Model',
    category: 'ai',
    clusterRole: 'languageModel',
    requiresCredential: true,
    searchTerms: ['openai', 'groq', 'openrouter', 'deepseek', 'mistral', 'ollama', 'compatible api', 'llm'],
    shortDescription: 'Sub-node: OpenAI / Groq / OpenRouter / DeepSeek / Ollama',
    documentation:
      'Attach to an AI Agent Chat Model port. Uses your configured AI Provider vault keys or a linked API Key credential.',
    defaultConfig: () => ({
      providerId: 'openai',
      providerKeyId: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      credentialId: '',
      temperature: 0.2,
      maxTokens: 2048,
    }),
  },
  {
    type: 'anthropic_chat_model',
    label: 'Anthropic Claude Model',
    category: 'ai',
    clusterRole: 'languageModel',
    requiresCredential: true,
    searchTerms: ['anthropic', 'claude', 'sonnet', 'haiku', 'llm', 'chat model'],
    shortDescription: 'Sub-node: Anthropic Claude Messages LLM for AI Agent',
    documentation:
      'Attach to an AI Agent Chat Model port. Uses your Anthropic AI Provider vault keys or an encrypted API Key credential.',
    defaultConfig: () => ({
      providerId: 'anthropic',
      providerKeyId: '',
      model: 'claude-sonnet-5-5',
      credentialId: '',
      temperature: 0.2,
      maxTokens: 2048,
    }),
  },
  {
    type: 'simple_memory',
    label: 'Simple Memory',
    category: 'ai',
    clusterRole: 'memory',
    shortDescription: 'Sub-node: Persistent SQLite conversation memory',
    documentation: 'Stores and loads per-user conversation turns in SQLite by sessionKey & conversationId.',
    defaultConfig: () => ({
      sessionKey: 'default_agent',
      conversationIdExpression: '{{trigger.sessionId}}',
      maxMessages: 12,
    }),
  },
  {
    type: 'windowed_memory',
    label: 'Window Buffer Memory',
    category: 'ai',
    clusterRole: 'memory',
    shortDescription: 'Sub-node: Sliding window of recent N chat turns',
    documentation: 'Keeps the latest N turns in SQLite to bound context token size.',
    defaultConfig: () => ({
      sessionKey: 'default_agent',
      conversationIdExpression: '{{trigger.sessionId}}',
      windowSize: 6,
    }),
  },
  {
    type: 'conversation_memory',
    label: 'Conversation Memory',
    category: 'ai',
    clusterRole: 'memory',
    shortDescription: 'Sub-node: Multi-turn persistent session store with reset control',
    documentation: 'Maintains durable multi-turn conversation history across triggers with optional reset support.',
    defaultConfig: () => ({
      sessionKey: 'conv_session',
      conversationIdExpression: '{{trigger.sessionId}}',
      maxMessages: 20,
      resetOnTrigger: false,
    }),
  },
  {
    type: 'structured_output_parser',
    label: 'Structured Output Parser',
    category: 'ai',
    clusterRole: 'outputParser',
    shortDescription: 'Sub-node: Enforces a strict JSON schema on agent output',
    documentation: 'Validates AI Agent responses against your JSON Schema and exposes parsed JSON fields.',
    defaultConfig: () => ({
      schemaJson: JSON.stringify(
        {
          type: 'object',
          required: ['summary', 'confidence'],
          properties: {
            summary: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
        null,
        2
      ),
      strict: true,
    }),
  },
  {
    type: 'autofix_output_parser',
    label: 'Auto-Fix Output Parser',
    category: 'ai',
    clusterRole: 'outputParser',
    shortDescription: 'Sub-node: Validates JSON & automatically repairs malformed output',
    documentation:
      'If initial AI Agent JSON fails schema validation, issues a targeted repair pass before continuing.',
    defaultConfig: () => ({
      schemaJson: JSON.stringify(
        {
          type: 'object',
          required: ['answer', 'tags'],
          properties: {
            answer: { type: 'string' },
            tags: { type: 'array' },
          },
        },
        null,
        2
      ),
      maxRepairAttempts: 1,
    }),
  },
  {
    type: 'tool_calculator',
    label: 'Calculator Tool',
    category: 'ai',
    clusterRole: 'tool',
    shortDescription: 'Tool sub-node: Safe mathematical expression evaluator',
    documentation: 'Lets the AI Agent compute arithmetic, roots, trig, and powers accurately.',
    defaultConfig: () => ({
      description: 'Evaluates mathematical expressions safely (no eval).',
    }),
  },
  {
    type: 'tool_datetime',
    label: 'DateTime Tool',
    category: 'ai',
    clusterRole: 'tool',
    shortDescription: 'Tool sub-node: Live UTC & timezone clock',
    documentation: 'Allows the AI Agent to fetch the exact current date and time.',
    defaultConfig: () => ({
      defaultTimezone: 'UTC',
      description: 'Returns the current ISO timestamp and formatted local time.',
    }),
  },
  {
    type: 'tool_http_request',
    label: 'HTTP Request Tool',
    category: 'ai',
    clusterRole: 'tool',
    shortDescription: 'Tool sub-node: Lets AI Agent call external REST APIs',
    documentation: 'Exposes a parameterized, SSRF-protected external API endpoint as a callable agent tool.',
    defaultConfig: () => ({
      toolName: 'fetch_external_api',
      description: 'Fetch JSON data from an external REST API endpoint.',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
      headers: [],
      credentialId: '',
      bodyTemplate: '',
    }),
  },
  {
    type: 'tool_workflow',
    label: 'Workflow Tool',
    category: 'ai',
    clusterRole: 'tool',
    shortDescription: 'Tool sub-node: Invokes another CROX workflow as a tool',
    documentation: 'Allows an AI Agent to delegate specialized tasks to another saved workflow.',
    defaultConfig: () => ({
      toolName: 'run_helper_workflow',
      description: 'Execute a target CROX workflow and return its output.',
      targetWorkflowId: '',
    }),
  },
  {
    type: 'tool_custom',
    label: 'Custom JS Tool',
    category: 'ai',
    clusterRole: 'tool',
    shortDescription: 'Tool sub-node: Custom sandboxed JavaScript agent tool',
    documentation: 'Runs safe sandboxed JavaScript with access to tool arguments (`args`).',
    defaultConfig: () => ({
      toolName: 'custom_formatter',
      description: 'Transforms text or computes custom deterministic logic.',
      parametersSchemaJson: JSON.stringify(
        { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
        null,
        2
      ),
      code: 'return { transformed: String(args.input || "").toUpperCase(), length: String(args.input || "").length };',
    }),
  },
  {
    type: 'ai_node',
    label: 'AI Prompt (Single Step)',
    category: 'ai',
    shortDescription: 'Single-turn Gemini completion or JSON extraction',
    documentation: 'Fast single-turn Gemini prompt node ideal for summarization and classification.',
    suggestedNext: ['send_email', 'webhook_notify', 'condition', 'edit_fields'],
    defaultConfig: () => ({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      credentialId: '',
      prompt: 'Analyze and summarize the following data:\n{{prev}}',
      systemInstruction: 'Provide a clear, concise response.',
      outputFormat: 'text',
    }),
  },

  // CORE & DATA NODES
  {
    type: 'http_request',
    label: 'HTTP Request',
    category: 'core',
    shortDescription: 'Sends an HTTP request to any external API',
    documentation: 'Executes SSRF-guarded HTTP GET/POST/PUT/PATCH/DELETE calls with optional encrypted auth credentials.',
    suggestedNext: ['edit_fields', 'filter_items', 'code_node', 'ai_agent'],
    defaultConfig: () => ({
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      method: 'GET',
      headers: [],
      queryParams: [],
      body: '',
      credentialId: '',
      timeoutMs: 10000,
      responseType: 'json',
    }),
  },
  {
    type: 'edit_fields',
    label: 'Edit Fields (Set)',
    category: 'core',
    shortDescription: 'Sets, overwrites, or adds typed fields on the item',
    documentation: 'Cleanly creates typed string, number, boolean, or JSON fields while optionally merging previous data.',
    suggestedNext: ['condition', 'send_email', 'webhook_notify', 'http_request'],
    defaultConfig: () => ({
      mode: 'merge',
      fields: [{ name: 'processed', value: 'true', type: 'boolean' }],
    }),
  },
  {
    type: 'set_data',
    label: 'Set Data',
    category: 'core',
    shortDescription: 'Constructs a clean JSON payload with explicit typed fields',
    documentation: 'Assigns typed string, number, boolean, or JSON fields with optional Keep Only Set filtering.',
    suggestedNext: ['condition', 'ai_agent', 'integration_action', 'http_request'],
    defaultConfig: () => ({
      keepOnlySet: false,
      values: [{ key: 'status', value: 'ready', valueType: 'string' }],
    }),
  },
  {
    type: 'code_node',
    label: 'Code (JavaScript)',
    category: 'core',
    shortDescription: 'Runs custom sandboxed JavaScript over workflow data',
    documentation:
      'Executes strict sandboxed JS via Node VM (`prev`, `trigger`, `nodes` available; no filesystem/process access). Return an object.',
    suggestedNext: ['condition', 'filter_items', 'edit_fields', 'webhook_notify'],
    defaultConfig: () => ({
      language: 'javascript',
      code: 'const data = prev || {};\nreturn { ...data, processedAt: new Date().toISOString() };',
    }),
  },
  {
    type: 'transform_data',
    label: 'Transform / Map Fields',
    category: 'core',
    shortDescription: 'Maps, uppercases, trims, or parses upstream expressions',
    documentation: 'Maps variables cleanly using copy, template, uppercase, lowercase, trim, or json_parse operations.',
    suggestedNext: ['condition', 'ai_node', 'send_email'],
    defaultConfig: () => ({
      mode: 'merge',
      mappings: [
        {
          targetField: 'summaryLabel',
          sourceExpression: 'trigger.body.event',
          operation: 'uppercase',
        },
      ],
    }),
  },
  {
    type: 'filter_items',
    label: 'Filter Items',
    category: 'core',
    shortDescription: 'Keeps array items matching a condition',
    documentation: 'Filters an array at itemsPath (e.g. prev.data) based on field and operator.',
    suggestedNext: ['sort_items', 'limit_items', 'aggregate_items'],
    defaultConfig: () => ({
      itemsPath: 'prev.data',
      field: 'id',
      operator: 'greater_than',
      value: '0',
    }),
  },
  {
    type: 'sort_items',
    label: 'Sort Items',
    category: 'core',
    shortDescription: 'Sorts array items ascending or descending',
    documentation: 'Orders array collections numerically or alphabetically by field name.',
    suggestedNext: ['limit_items', 'aggregate_items'],
    defaultConfig: () => ({
      itemsPath: 'prev.items',
      field: 'id',
      direction: 'asc',
    }),
  },
  {
    type: 'limit_items',
    label: 'Limit Items',
    category: 'core',
    shortDescription: 'Slices array items by offset and max count',
    documentation: 'Caps batch payloads to the first N records for safe downstream processing.',
    suggestedNext: ['aggregate_items', 'loop_items'],
    defaultConfig: () => ({
      itemsPath: 'prev.data',
      limit: 5,
      offset: 0,
    }),
  },
  {
    type: 'aggregate_items',
    label: 'Aggregate / Summarize',
    category: 'core',
    shortDescription: 'Computes count, sum, avg, min, max, or field list',
    documentation: 'Collapses an array of items into a single summary object.',
    suggestedNext: ['edit_fields', 'send_email', 'webhook_notify'],
    defaultConfig: () => ({
      itemsPath: 'prev.items',
      operation: 'count',
      field: 'id',
      outputField: 'totalCount',
    }),
  },
  {
    type: 'split_out',
    label: 'Split Out',
    category: 'core',
    shortDescription: 'Unpacks a nested array into indexed items',
    documentation: 'Extracts items from a nested property path and attaches index metadata.',
    defaultConfig: () => ({
      itemsPath: 'prev.data',
      includeParentFields: false,
    }),
  },
  {
    type: 'remove_duplicates',
    label: 'Remove Duplicates',
    category: 'core',
    shortDescription: 'Deduplicates items by a unique key field',
    documentation: 'Removes repeated records sharing the same field value.',
    defaultConfig: () => ({
      itemsPath: 'prev.items',
      keyField: 'id',
    }),
  },
  {
    type: 'json_operations',
    label: 'JSON Utilities',
    category: 'core',
    shortDescription: 'Parse, stringify, pick keys, or flatten JSON objects',
    documentation: 'Manipulates nested JSON strings or objects safely.',
    defaultConfig: () => ({
      operation: 'flatten',
      sourcePath: 'prev',
      keys: '',
    }),
  },
  {
    type: 'datetime_operations',
    label: 'Date & Time',
    category: 'core',
    shortDescription: 'Format dates, add days, or compute time differences',
    documentation: 'Generates localized timestamps or performs date arithmetic.',
    defaultConfig: () => ({
      operation: 'now',
      inputExpression: '',
      amount: 1,
      timezone: 'UTC',
    }),
  },

  // FLOW CONTROL
  {
    type: 'condition',
    label: 'If (Condition)',
    category: 'flow',
    shortDescription: 'Branches execution into True or False paths',
    documentation: 'Evaluates an expression or variable path and routes to either the TRUE or FALSE handle.',
    suggestedNext: ['send_email', 'webhook_notify', 'edit_fields'],
    defaultConfig: () => ({
      inputVariable: 'trigger.body.status',
      operator: 'equals',
      comparisonValue: 'active',
    }),
  },
  {
    type: 'switch_node',
    label: 'Switch (Multi-Branch)',
    category: 'flow',
    shortDescription: 'Routes items across multiple named output branches',
    documentation: 'Evaluates ordered rules and routes execution to case_0, case_1, or default handles.',
    defaultConfig: () => ({
      inputVariable: 'trigger.body.type',
      rules: [
        { outputKey: 'case_0', label: 'Case A', operator: 'equals', comparisonValue: 'urgent' },
        { outputKey: 'case_1', label: 'Case B', operator: 'equals', comparisonValue: 'billing' },
      ],
      includeDefault: true,
    }),
  },
  {
    type: 'merge_node',
    label: 'Merge',
    category: 'flow',
    shortDescription: 'Combines inputs from multiple upstream branches',
    documentation: 'Merges properties or collects outputs from parallel upstream branches.',
    defaultConfig: () => ({
      mode: 'combine',
    }),
  },
  {
    type: 'loop_items',
    label: 'Split In Batches',
    category: 'flow',
    shortDescription: 'Chunks arrays into fixed-size batches',
    documentation: 'Partitions an input array into deterministic batch slices.',
    defaultConfig: () => ({
      itemsPath: 'prev.items',
      batchSize: 5,
      maxItems: 50,
    }),
  },
  {
    type: 'wait_node',
    label: 'Wait / Delay',
    category: 'flow',
    shortDescription: 'Pauses execution for a configurable duration',
    documentation: 'Waits between 0 and 10,000 ms before continuing downstream nodes.',
    defaultConfig: () => ({
      durationMs: 1000,
    }),
  },
  {
    type: 'stop_and_error',
    label: 'Stop and Error',
    category: 'flow',
    shortDescription: 'Explicitly aborts execution with a custom error',
    documentation: 'Halts the workflow with a structured error message (triggers Error Workflow if configured).',
    defaultConfig: () => ({
      errorMessage: 'Validation guard failed: halted intentionally.',
    }),
  },
  {
    type: 'execute_workflow',
    label: 'Execute Sub-Workflow',
    category: 'flow',
    shortDescription: 'Calls another workflow owned by your workspace',
    documentation: 'Invokes another workflow cleanly (up to nesting depth 3) and returns its final output.',
    defaultConfig: () => ({
      targetWorkflowId: '',
      payloadExpression: '{{prev}}',
    }),
  },
  {
    type: 'noop',
    label: 'No Operation (Pin / Label)',
    category: 'flow',
    shortDescription: 'Passes data through unchanged for clean branching',
    documentation: 'Passes {{prev}} directly downstream; useful for organizing complex canvas branches.',
    defaultConfig: () => ({
      note: 'Passthrough checkpoint',
    }),
  },

  // COMMUNICATION
  {
    type: 'send_email',
    label: 'Send Email',
    category: 'communication',
    shortDescription: 'Sends email via configured SMTP credential',
    documentation: 'Delivers plain text or HTML email via linked SMTP credential (or simulated preview if unlinked).',
    defaultConfig: () => ({
      to: 'recipient@example.com',
      subject: 'CROX Workflow Notification',
      body: 'Workflow completed with output:\n{{prev}}',
      credentialId: '',
      isHtml: false,
    }),
  },
  {
    type: 'webhook_notify',
    label: 'Slack / Discord Alert',
    category: 'communication',
    shortDescription: 'Posts formatted alerts to Slack, Discord, or Teams webhooks',
    documentation: 'Sends SSRF-checked JSON messages to Slack, Discord, or generic webhook URLs.',
    defaultConfig: () => ({
      platform: 'slack',
      webhookUrl: '',
      message: 'Workflow event: {{prev}}',
      username: 'CROX Bot',
    }),
  },

  // INTEGRATIONS
  {
    type: 'integration_action',
    label: 'App Integration Action',
    category: 'integrations',
    requiresCredential: true,
    searchTerms: [
      'google sheets', 'gmail', 'google drive', 'google calendar', 'slack', 'discord', 'telegram',
      'notion', 'airtable', 'trello', 'asana', 'linear', 'hubspot', 'shopify', 'woocommerce',
      'wordpress', 'stripe', 'github', 'app', 'connector', 'integration',
    ],
    shortDescription: 'Executes a real Slack, GitHub, Notion, Airtable, Linear, HubSpot, Stripe, or Telegram action',
    documentation:
      'Executes SSRF-guarded external SaaS API actions using your encrypted CROX credentials and Connections.',
    suggestedNext: ['edit_fields', 'condition', 'send_email'],
    defaultConfig: () => ({
      appId: 'slack',
      actionId: 'post_message',
      credentialId: '',
      parameters: { channel: '#general', text: '{{prev}}' },
    }),
  },
];

export function getCatalogEntry(nodeType: CroxNodeType): NodeCatalogEntry {
  return NODE_CATALOG.find((n) => n.type === nodeType) || NODE_CATALOG[0];
}

export function createWorkflowNode(
  nodeType: CroxNodeType,
  position: { x: number; y: number }
): WorkflowNode {
  const entry = getCatalogEntry(nodeType);
  const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type: 'croxNode',
    position,
    data: {
      label: entry.label,
      nodeType: entry.type,
      category: entry.category,
      description: entry.shortDescription,
      config: entry.defaultConfig(),
    },
  };
}

export function createStickyNoteNode(
  position: { x: number; y: number },
  color: StickyNoteColor = 'amber'
): StickyNoteNode {
  const id = `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type: 'stickyNote',
    position,
    style: { width: 260, height: 150 },
    data: {
      title: 'Workflow Note',
      text: 'Document assumptions, payload examples, or team notes here.',
      color,
    },
  };
}

export function createGroupNode(
  position: { x: number; y: number },
  size: { width: number; height: number } = { width: 520, height: 320 },
  title = 'Node Group'
): CanvasGroupNode {
  const id = `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    type: 'group',
    position,
    style: { width: size.width, height: size.height },
    data: {
      title,
      color: 'zinc',
      collapsed: false,
    },
  };
}
