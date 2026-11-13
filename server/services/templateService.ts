import Database from 'better-sqlite3';
import { WorkflowEdge, WorkflowNode, WorkflowRecord, WorkflowTemplate } from '../../src/types/workflow.ts';
import { generateRandomToken } from '../utils/crypto.ts';
import { resolveProjectForUser } from './projectService.ts';

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'tpl_welcome_email',
    name: 'Welcome Email on Signup',
    description:
      'Receives a new user signup webhook, drafts a personalized onboarding note with AI, and dispatches a welcome email.',
    category: 'Communication',
    featuredOnLanding: true,
    settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_n1',
        type: 'croxNode',
        position: { x: 80, y: 160 },
        data: {
          label: 'New User Signup',
          nodeType: 'webhook_trigger',
          category: 'triggers',
          description: 'Receives user registration payload',
          config: {
            method: 'POST',
            path: '/signup',
            requireSecret: false,
            samplePayload: JSON.stringify({ name: 'Elena Vance', email: 'elena@acme.io', plan: 'Pro' }, null, 2),
            responseMode: 'immediate',
          },
        },
      },
      {
        id: 'tpl_n2',
        type: 'croxNode',
        position: { x: 380, y: 160 },
        data: {
          label: 'Normalize Signup Fields',
          nodeType: 'transform_data',
          category: 'core',
          description: 'Clean and format subscriber details',
          config: {
            mode: 'merge',
            mappings: [
              { targetField: 'recipientEmail', sourceExpression: 'trigger.body.email', operation: 'trim' },
              { targetField: 'customerName', sourceExpression: 'trigger.body.name', operation: 'copy' },
              { targetField: 'planTier', sourceExpression: 'trigger.body.plan', operation: 'uppercase' },
            ],
          },
        },
      },
      {
        id: 'tpl_n3',
        type: 'croxNode',
        position: { x: 680, y: 160 },
        data: {
          label: 'Draft Welcome Message',
          nodeType: 'ai_node',
          category: 'ai',
          description: 'Generate personalized onboarding copy',
          config: {
            provider: 'gemini',
            model: 'gemini-3.8-flash',
            credentialId: '',
            prompt:
              'Write a concise, warm 3-sentence welcome email for {{prev.customerName}} who joined on the {{prev.planTier}} plan.',
            systemInstruction: 'Return plain email body copy without a subject line.',
            outputFormat: 'text',
          },
        },
      },
      {
        id: 'tpl_n4',
        type: 'croxNode',
        position: { x: 980, y: 160 },
        data: {
          label: 'Send Welcome Email',
          nodeType: 'send_email',
          category: 'communication',
          description: 'Deliver welcome email to user',
          config: {
            to: '{{nodes.tpl_n2.recipientEmail}}',
            subject: 'Welcome to CROX, {{nodes.tpl_n2.customerName}}',
            body: '{{prev.text}}',
            credentialId: '',
            isHtml: false,
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_e1', source: 'tpl_n1', target: 'tpl_n2', edgeKind: 'main' },
      { id: 'tpl_e2', source: 'tpl_n2', target: 'tpl_n3', edgeKind: 'main' },
      { id: 'tpl_e3', source: 'tpl_n3', target: 'tpl_n4', edgeKind: 'main' },
    ],
  },
  {
    id: 'tpl_ai_research_agent',
    name: 'AI Operations Agent with Tools & Memory',
    description:
      'Conversational AI Agent with Gemini Chat Model, persistent SQLite Memory, Calculator & DateTime tools, and structured JSON output.',
    category: 'AI Automation',
    featuredOnLanding: true,
    settings: { timeoutMs: 25000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_ag_trig',
        type: 'croxNode',
        position: { x: 80, y: 140 },
        data: {
          label: 'Chat Trigger',
          nodeType: 'chat_trigger',
          category: 'triggers',
          description: 'Starts conversation with user request',
          config: {
            welcomeMessage: 'Ask the CROX Operations Agent anything.',
            sessionKey: 'ops_assistant',
            sampleMessage: 'What is 1450 * 1.18 and what is today’s UTC date?',
          },
        },
      },
      {
        id: 'tpl_ag_root',
        type: 'croxNode',
        position: { x: 400, y: 140 },
        data: {
          label: 'CROX AI Agent',
          nodeType: 'ai_agent',
          category: 'ai',
          description: 'Autonomous reasoning agent with attached model, memory & tools',
          config: {
            prompt: '{{trigger.chatInput}}',
            systemMessage:
              'You are a precise operations assistant. Use attached tools whenever math or current dates are needed.',
            maxIterations: 5,
            temperature: 0.2,
          },
        },
      },
      {
        id: 'tpl_ag_model',
        type: 'croxNode',
        position: { x: 180, y: 340 },
        data: {
          label: 'Gemini Chat Model',
          nodeType: 'gemini_chat_model',
          category: 'ai',
          description: 'Primary LLM reasoning engine',
          config: {
            model: 'gemini-3.8-flash',
            credentialId: '',
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        },
      },
      {
        id: 'tpl_ag_mem',
        type: 'croxNode',
        position: { x: 400, y: 340 },
        data: {
          label: 'Windowed Memory',
          nodeType: 'windowed_memory',
          category: 'ai',
          description: 'Stores last 8 conversation turns in SQLite',
          config: {
            sessionKey: 'ops_assistant',
            conversationIdExpression: '{{trigger.sessionId}}',
            windowSize: 8,
          },
        },
      },
      {
        id: 'tpl_ag_calc',
        type: 'croxNode',
        position: { x: 620, y: 340 },
        data: {
          label: 'Calculator Tool',
          nodeType: 'tool_calculator',
          category: 'ai',
          description: 'Evaluates mathematical formulas safely',
          config: {
            description: 'Evaluate exact arithmetic and formulas.',
          },
        },
      },
      {
        id: 'tpl_ag_time',
        type: 'croxNode',
        position: { x: 820, y: 340 },
        data: {
          label: 'DateTime Tool',
          nodeType: 'tool_datetime',
          category: 'ai',
          description: 'Provides current UTC & timezone dates',
          config: {
            defaultTimezone: 'UTC',
            description: 'Return current formatted date and ISO timestamp.',
          },
        },
      },
      {
        id: 'tpl_ag_out',
        type: 'croxNode',
        position: { x: 740, y: 140 },
        data: {
          label: 'Format Agent Reply',
          nodeType: 'edit_fields',
          category: 'core',
          description: 'Normalize agent answer for downstream step',
          config: {
            mode: 'merge',
            fields: [{ name: 'handledBy', value: 'CROX Agent v2', type: 'string' }],
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_age1', source: 'tpl_ag_trig', target: 'tpl_ag_root', edgeKind: 'main' },
      { id: 'tpl_age2', source: 'tpl_ag_root', target: 'tpl_ag_out', edgeKind: 'main' },
      {
        id: 'tpl_age3',
        source: 'tpl_ag_model',
        target: 'tpl_ag_root',
        targetHandle: 'ai_languageModel',
        edgeKind: 'ai_languageModel',
      },
      {
        id: 'tpl_age4',
        source: 'tpl_ag_mem',
        target: 'tpl_ag_root',
        targetHandle: 'ai_memory',
        edgeKind: 'ai_memory',
      },
      {
        id: 'tpl_age5',
        source: 'tpl_ag_calc',
        target: 'tpl_ag_root',
        targetHandle: 'ai_tool',
        edgeKind: 'ai_tool',
      },
      {
        id: 'tpl_age6',
        source: 'tpl_ag_time',
        target: 'tpl_ag_root',
        targetHandle: 'ai_tool',
        edgeKind: 'ai_tool',
      },
    ],
  },
  {
    id: 'tpl_daily_ai_summary',
    name: 'Daily AI Summary Report',
    description:
      'Runs every morning at 09:00, fetches operational JSON updates from an API, summarizes priorities with AI, and emails the digest.',
    category: 'AI Automation',
    featuredOnLanding: false,
    settings: { timeoutMs: 20000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_d1',
        type: 'croxNode',
        position: { x: 80, y: 160 },
        data: {
          label: 'Every Morning 9 AM',
          nodeType: 'schedule_trigger',
          category: 'triggers',
          description: 'Daily recurring trigger',
          config: {
            frequency: 'daily',
            intervalMinutes: 1440,
            cronExpression: '0 9 * * *',
            timezone: 'UTC',
          },
        },
      },
      {
        id: 'tpl_d2',
        type: 'croxNode',
        position: { x: 380, y: 160 },
        data: {
          label: 'Fetch Activity Feed',
          nodeType: 'http_request',
          category: 'core',
          description: 'Pull latest public JSON activity',
          config: {
            url: 'https://jsonplaceholder.typicode.com/posts?_limit=5',
            method: 'GET',
            headers: [],
            queryParams: [],
            body: '',
            credentialId: '',
            timeoutMs: 10000,
            responseType: 'json',
          },
        },
      },
      {
        id: 'tpl_d3',
        type: 'croxNode',
        position: { x: 680, y: 160 },
        data: {
          label: 'Summarize with AI',
          nodeType: 'ai_node',
          category: 'ai',
          description: 'Condense feed into executive bullets',
          config: {
            provider: 'gemini',
            model: 'gemini-3.8-flash',
            credentialId: '',
            prompt: 'Summarize these recent updates into 3 actionable bullet points:\n{{prev.data}}',
            systemInstruction: 'Be concise, factual, and executive-ready.',
            outputFormat: 'text',
          },
        },
      },
      {
        id: 'tpl_d4',
        type: 'croxNode',
        position: { x: 980, y: 160 },
        data: {
          label: 'Email Daily Digest',
          nodeType: 'send_email',
          category: 'communication',
          description: 'Send briefing to team inbox',
          config: {
            to: 'ops-team@example.com',
            subject: 'Daily Operations AI Summary',
            body: '{{prev.text}}',
            credentialId: '',
            isHtml: false,
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_de1', source: 'tpl_d1', target: 'tpl_d2', edgeKind: 'main' },
      { id: 'tpl_de2', source: 'tpl_d2', target: 'tpl_d3', edgeKind: 'main' },
      { id: 'tpl_de3', source: 'tpl_d3', target: 'tpl_d4', edgeKind: 'main' },
    ],
  },
  {
    id: 'tpl_webhook_notification',
    name: 'Incident Severity Router',
    description:
      'Evaluates incoming webhook severity with conditional IF/ELSE branching and sends urgent alerts while archiving routine events.',
    category: 'Business Operations',
    featuredOnLanding: true,
    settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_w1',
        type: 'croxNode',
        position: { x: 80, y: 180 },
        data: {
          label: 'Incoming Event Webhook',
          nodeType: 'webhook_trigger',
          category: 'triggers',
          description: 'Trigger on incoming alert event',
          config: {
            method: 'POST',
            path: '/events',
            requireSecret: false,
            samplePayload: JSON.stringify({ service: 'billing-api', severity: 'critical', message: 'Latency > 2s' }, null, 2),
            responseMode: 'immediate',
          },
        },
      },
      {
        id: 'tpl_w2',
        type: 'croxNode',
        position: { x: 400, y: 180 },
        data: {
          label: 'Is Critical Severity?',
          nodeType: 'condition',
          category: 'flow',
          description: 'Route critical events to alert email',
          config: {
            inputVariable: 'trigger.body.severity',
            operator: 'equals',
            comparisonValue: 'critical',
          },
        },
      },
      {
        id: 'tpl_w3',
        type: 'croxNode',
        position: { x: 740, y: 80 },
        data: {
          label: 'Send Urgent Alert',
          nodeType: 'send_email',
          category: 'communication',
          description: 'Notify on-call engineer immediately',
          config: {
            to: 'oncall@example.com',
            subject: '[CRITICAL] {{trigger.body.service}} alert',
            body: 'Alert details: {{trigger.body.message}}',
            credentialId: '',
            isHtml: false,
          },
        },
      },
      {
        id: 'tpl_w4',
        type: 'croxNode',
        position: { x: 740, y: 290 },
        data: {
          label: 'Format Standard Log',
          nodeType: 'transform_data',
          category: 'core',
          description: 'Prepare non-critical audit record',
          config: {
            mode: 'map',
            mappings: [
              { targetField: 'status', sourceExpression: 'logged_non_critical', operation: 'static' },
              { targetField: 'service', sourceExpression: 'trigger.body.service', operation: 'copy' },
            ],
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_we1', source: 'tpl_w1', target: 'tpl_w2', edgeKind: 'main' },
      { id: 'tpl_we2', source: 'tpl_w2', target: 'tpl_w3', sourceHandle: 'true', label: 'True', edgeKind: 'main' },
      { id: 'tpl_we3', source: 'tpl_w2', target: 'tpl_w4', sourceHandle: 'false', label: 'False', edgeKind: 'main' },
    ],
  },
  {
    id: 'tpl_lead_qualification',
    name: 'Inbound Form Lead Qualifier',
    description:
      'Captures lead intake forms, enriches score via sandboxed JavaScript, routes high-intent prospects to Slack & Sales.',
    category: 'Lead Generation',
    featuredOnLanding: false,
    settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_ld1',
        type: 'croxNode',
        position: { x: 80, y: 170 },
        data: {
          label: 'Lead Intake Form',
          nodeType: 'form_trigger',
          category: 'triggers',
          description: 'Collects prospect company size and email',
          config: {
            formTitle: 'Book a Demo',
            formDescription: 'Tell us about your team.',
            fields: [
              { name: 'name', label: 'Full Name', type: 'text', required: true },
              { name: 'email', label: 'Work Email', type: 'email', required: true },
              { name: 'teamSize', label: 'Team Size', type: 'number', required: true },
            ],
            sampleSubmission: JSON.stringify({ name: 'Marcus Chen', email: 'marcus@orbit.io', teamSize: 120 }, null, 2),
          },
        },
      },
      {
        id: 'tpl_ld2',
        type: 'croxNode',
        position: { x: 380, y: 170 },
        data: {
          label: 'Score Lead Tier',
          nodeType: 'code_node',
          category: 'core',
          description: 'Classify enterprise vs self-serve leads',
          config: {
            language: 'javascript',
            code: 'const size = Number(prev?.body?.teamSize || 0);\nreturn { ...prev.body, tier: size >= 50 ? "enterprise" : "standard", score: Math.min(100, size) };',
          },
        },
      },
      {
        id: 'tpl_ld3',
        type: 'croxNode',
        position: { x: 680, y: 170 },
        data: {
          label: 'Enterprise Lead?',
          nodeType: 'condition',
          category: 'flow',
          description: 'Route enterprise leads to Slack alert',
          config: {
            inputVariable: 'prev.tier',
            operator: 'equals',
            comparisonValue: 'enterprise',
          },
        },
      },
      {
        id: 'tpl_ld4',
        type: 'croxNode',
        position: { x: 990, y: 100 },
        data: {
          label: 'Notify Sales Channel',
          nodeType: 'webhook_notify',
          category: 'communication',
          description: 'Ping sales team on Slack',
          config: {
            platform: 'slack',
            webhookUrl: '',
            username: 'CROX Lead Bot',
            message: 'New Enterprise Lead: {{nodes.tpl_ld2.name}} ({{nodes.tpl_ld2.email}}, team {{nodes.tpl_ld2.teamSize}})',
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_lde1', source: 'tpl_ld1', target: 'tpl_ld2', edgeKind: 'main' },
      { id: 'tpl_lde2', source: 'tpl_ld2', target: 'tpl_ld3', edgeKind: 'main' },
      { id: 'tpl_lde3', source: 'tpl_ld3', target: 'tpl_ld4', sourceHandle: 'true', label: 'True', edgeKind: 'main' },
    ],
  },
  {
    id: 'tpl_api_data_processing',
    name: 'API Data Pipeline & Aggregation',
    description:
      'Fetches items from a REST API, sorts and deduplicates records, and computes aggregate statistics cleanly.',
    category: 'Data Processing',
    featuredOnLanding: false,
    settings: { timeoutMs: 20000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_dp1',
        type: 'croxNode',
        position: { x: 80, y: 170 },
        data: {
          label: 'Manual Run Trigger',
          nodeType: 'manual_trigger',
          category: 'triggers',
          description: 'Trigger data batch run on demand',
          config: { samplePayload: JSON.stringify({ source: 'jsonplaceholder' }) },
        },
      },
      {
        id: 'tpl_dp2',
        type: 'croxNode',
        position: { x: 360, y: 170 },
        data: {
          label: 'Fetch Posts API',
          nodeType: 'http_request',
          category: 'core',
          description: 'Pull external JSON collection',
          config: {
            url: 'https://jsonplaceholder.typicode.com/posts?_limit=10',
            method: 'GET',
            headers: [],
            queryParams: [],
            body: '',
            credentialId: '',
            timeoutMs: 10000,
            responseType: 'json',
          },
        },
      },
      {
        id: 'tpl_dp3',
        type: 'croxNode',
        position: { x: 640, y: 170 },
        data: {
          label: 'Limit Top 5 Items',
          nodeType: 'limit_items',
          category: 'core',
          description: 'Keep first 5 API records',
          config: {
            itemsPath: 'prev.data',
            limit: 5,
            offset: 0,
          },
        },
      },
      {
        id: 'tpl_dp4',
        type: 'croxNode',
        position: { x: 920, y: 170 },
        data: {
          label: 'Count Processed Items',
          nodeType: 'aggregate_items',
          category: 'core',
          description: 'Summarize batch size',
          config: {
            itemsPath: 'prev.items',
            operation: 'count',
            field: 'id',
            outputField: 'processedCount',
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_dpe1', source: 'tpl_dp1', target: 'tpl_dp2', edgeKind: 'main' },
      { id: 'tpl_dpe2', source: 'tpl_dp2', target: 'tpl_dp3', edgeKind: 'main' },
      { id: 'tpl_dpe3', source: 'tpl_dp3', target: 'tpl_dp4', edgeKind: 'main' },
    ],
  },
  {
    id: 'tpl_developer_api_monitor',
    name: 'Scheduled Endpoint Health Monitor',
    description:
      'Polls a production endpoint hourly, parses headers/status, and alerts engineering if checks fail.',
    category: 'Developer Automation',
    featuredOnLanding: false,
    settings: { timeoutMs: 15000, retryOnFailure: true, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_dev1',
        type: 'croxNode',
        position: { x: 80, y: 170 },
        data: {
          label: 'Hourly Health Check',
          nodeType: 'schedule_trigger',
          category: 'triggers',
          description: 'Every hour at :00',
          config: {
            frequency: 'hourly',
            intervalMinutes: 60,
            cronExpression: '0 * * * *',
            timezone: 'UTC',
          },
        },
      },
      {
        id: 'tpl_dev2',
        type: 'croxNode',
        position: { x: 380, y: 170 },
        data: {
          label: 'Ping Service API',
          nodeType: 'http_request',
          category: 'core',
          description: 'Verify HTTP 200 response',
          config: {
            url: 'https://jsonplaceholder.typicode.com/todos/1',
            method: 'GET',
            headers: [],
            queryParams: [],
            body: '',
            credentialId: '',
            timeoutMs: 8000,
            responseType: 'json',
          },
        },
      },
      {
        id: 'tpl_dev3',
        type: 'croxNode',
        position: { x: 680, y: 170 },
        data: {
          label: 'Record Check Metadata',
          nodeType: 'datetime_operations',
          category: 'core',
          description: 'Stamp check timestamp in UTC',
          config: {
            operation: 'now',
            inputExpression: '',
            amount: 0,
            timezone: 'UTC',
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_deve1', source: 'tpl_dev1', target: 'tpl_dev2', edgeKind: 'main' },
      { id: 'tpl_deve2', source: 'tpl_dev2', target: 'tpl_dev3', edgeKind: 'main' },
    ],
  },
  {
    id: 'tpl_marketing_campaign_digest',
    name: 'Marketing Campaign AI Copywriter',
    description:
      'Turns raw campaign product notes into structured social + newsletter copy using Gemini AI and routes approval alerts.',
    category: 'Marketing',
    featuredOnLanding: false,
    settings: { timeoutMs: 20000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_mk1',
        type: 'croxNode',
        position: { x: 80, y: 160 },
        data: {
          label: 'Campaign Brief Webhook',
          nodeType: 'webhook_trigger',
          category: 'triggers',
          description: 'Receives product launch brief',
          config: {
            method: 'POST',
            path: '/campaign-brief',
            requireSecret: false,
            samplePayload: JSON.stringify(
              { product: 'Crox 2.0', highlight: 'Visual AI Agents & Projects', audience: 'Automation engineers' },
              null,
              2
            ),
            responseMode: 'immediate',
          },
        },
      },
      {
        id: 'tpl_mk2',
        type: 'croxNode',
        position: { x: 400, y: 160 },
        data: {
          label: 'Draft Campaign Copy',
          nodeType: 'ai_node',
          category: 'ai',
          description: 'Generates structured launch messaging',
          config: {
            provider: 'gemini',
            model: 'gemini-3.8-flash',
            credentialId: '',
            prompt:
              'Draft a punchy 2-sentence newsletter teaser for {{trigger.body.product}} highlighting {{trigger.body.highlight}} for {{trigger.body.audience}}.',
            systemInstruction: 'Write sharp, non-hype developer SaaS copy.',
            outputFormat: 'text',
          },
        },
      },
      {
        id: 'tpl_mk3',
        type: 'croxNode',
        position: { x: 720, y: 160 },
        data: {
          label: 'Send Draft to Marketing',
          nodeType: 'send_email',
          category: 'communication',
          description: 'Emails draft for review',
          config: {
            to: 'marketing@example.com',
            subject: 'Draft Ready: {{trigger.body.product}}',
            body: '{{prev.text}}',
            credentialId: '',
            isHtml: false,
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_mke1', source: 'tpl_mk1', target: 'tpl_mk2', edgeKind: 'main' },
      { id: 'tpl_mke2', source: 'tpl_mk2', target: 'tpl_mk3', edgeKind: 'main' },
    ],
  },
  {
    id: 'tpl_sales_deal_alert',
    name: 'Sales Deal Stage Switch Router',
    description:
      'Uses multi-branch Switch logic to route closed-won deals to celebration alerts and stalled deals to follow-up sequences.',
    category: 'Sales',
    featuredOnLanding: false,
    settings: { timeoutMs: 15000, retryOnFailure: false, maxRetries: 1 },
    nodes: [
      {
        id: 'tpl_sl1',
        type: 'croxNode',
        position: { x: 80, y: 170 },
        data: {
          label: 'CRM Stage Webhook',
          nodeType: 'webhook_trigger',
          category: 'triggers',
          description: 'Receives CRM deal stage changes',
          config: {
            method: 'POST',
            path: '/crm-deal',
            requireSecret: false,
            samplePayload: JSON.stringify({ account: 'Northstar Labs', stage: 'closed_won', arr: 24000 }, null, 2),
            responseMode: 'immediate',
          },
        },
      },
      {
        id: 'tpl_sl2',
        type: 'croxNode',
        position: { x: 400, y: 170 },
        data: {
          label: 'Route by Deal Stage',
          nodeType: 'switch_node',
          category: 'flow',
          description: 'Routes based on stage key',
          config: {
            inputVariable: 'trigger.body.stage',
            rules: [
              { outputKey: 'case_0', label: 'Won', operator: 'equals', comparisonValue: 'closed_won' },
              { outputKey: 'case_1', label: 'Lost', operator: 'equals', comparisonValue: 'closed_lost' },
            ],
            includeDefault: true,
          },
        },
      },
      {
        id: 'tpl_sl3',
        type: 'croxNode',
        position: { x: 740, y: 90 },
        data: {
          label: 'Celebrate Closed Won',
          nodeType: 'webhook_notify',
          category: 'communication',
          description: 'Announce won deal in #wins',
          config: {
            platform: 'slack',
            webhookUrl: '',
            username: 'CROX Revenue Bot',
            message: 'Closed Won: {{trigger.body.account}} (${{trigger.body.arr}} ARR)',
          },
        },
      },
      {
        id: 'tpl_sl4',
        type: 'croxNode',
        position: { x: 740, y: 260 },
        data: {
          label: 'Tag Deal Follow-up',
          nodeType: 'edit_fields',
          category: 'core',
          description: 'Mark non-won deals for pipeline review',
          config: {
            mode: 'merge',
            fields: [{ name: 'pipelineAction', value: 'review_required', type: 'string' }],
          },
        },
      },
    ],
    edges: [
      { id: 'tpl_sle1', source: 'tpl_sl1', target: 'tpl_sl2', edgeKind: 'main' },
      { id: 'tpl_sle2', source: 'tpl_sl2', target: 'tpl_sl3', sourceHandle: 'case_0', label: 'Won', edgeKind: 'main' },
      { id: 'tpl_sle3', source: 'tpl_sl2', target: 'tpl_sl4', sourceHandle: 'default', label: 'Default', edgeKind: 'main' },
    ],
  },
];

export function cloneTemplateNodesAndEdges(template: WorkflowTemplate): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  const idMap = new Map<string, string>();
  for (const node of template.nodes) {
    idMap.set(node.id, `node_${generateRandomToken(6)}`);
  }

  const nodes: WorkflowNode[] = template.nodes.map((node) => {
    const newId = idMap.get(node.id)!;
    const clonedData = JSON.parse(JSON.stringify(node.data));
    return {
      ...node,
      id: newId,
      position: { ...node.position },
      data: clonedData,
    };
  });

  // Remap any template variable references like {{nodes.tpl_n2.field}} to the new node IDs
  const serializedNodes = JSON.stringify(nodes);
  let remappedNodesStr = serializedNodes;
  for (const [oldId, newId] of idMap.entries()) {
    remappedNodesStr = remappedNodesStr.split(`nodes.${oldId}.`).join(`nodes.${newId}.`);
  }
  const finalNodes: WorkflowNode[] = JSON.parse(remappedNodesStr);

  const edges: WorkflowEdge[] = template.edges.map((edge) => ({
    ...edge,
    id: `edge_${generateRandomToken(6)}`,
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
  }));

  return { nodes: finalNodes, edges };
}

export function installTemplateForUser(
  db: Database.Database,
  templateId: string,
  userId: string,
  projectId?: string
): WorkflowRecord | null {
  const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;

  const project = resolveProjectForUser(db, userId, projectId);
  const { nodes, edges } = cloneTemplateNodesAndEdges(template);
  const id = `wf_${generateRandomToken(8)}`;
  const webhookSecret = generateRandomToken(16);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO workflows (id, user_id, project_id, name, description, is_active, nodes_json, edges_json, settings_json, webhook_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    project.id,
    template.name,
    template.description,
    JSON.stringify(nodes),
    JSON.stringify(edges),
    JSON.stringify(template.settings),
    webhookSecret,
    now,
    now
  );

  return {
    id,
    userId,
    projectId: project.id,
    projectName: project.name,
    workspaceName: project.workspaceName,
    name: template.name,
    description: template.description,
    isActive: false,
    nodes,
    edges,
    settings: template.settings,
    webhookSecret,
    lastExecutionStatus: null,
    lastExecutedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
