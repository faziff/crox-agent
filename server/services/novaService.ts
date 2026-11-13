import { GoogleGenAI, Type } from '@google/genai';
import {
  CroxNodeConfig,
  CroxNodeType,
  NovaGenerationResult,
  WorkflowEdge,
  WorkflowNode,
} from '../../src/types/workflow.ts';
import { getGeminiApiKey } from '../config.ts';
import { generateRandomToken } from '../utils/crypto.ts';
import { validateWorkflowGraph } from './workflowValidator.ts';

function buildRuleBasedWorkflow(prompt: string): NovaGenerationResult {
  const lower = prompt.toLowerCase();
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const unsupportedRequirements: string[] = [];

  const wantsSchedule = /\b(every|daily|morning|hourly|weekly|cron|schedule|each day)\b/.test(lower);
  const wantsChat = /\b(chat|chatbot|conversation|assistant|agent)\b/.test(lower);
  const wantsForm = /\b(form|intake|survey|lead form)\b/.test(lower);
  const wantsWebhook = /\b(webhook|submit|signup|register|registration|event|incoming)\b/.test(lower);
  const wantsAgentCluster = /\b(agent|tool|calculator|memory|autonomous)\b/.test(lower);
  const wantsApi = /\b(api|fetch|http|endpoint|request|pull|get data)\b/.test(lower);
  const wantsCode = /\b(code|script|javascript|calculate|compute|transform)\b/.test(lower);
  const wantsAi = /\b(ai|summarize|summary|generate|draft|analyze|classify|llm|gemini)\b/.test(lower);
  const wantsCondition = /\b(if|when|condition|filter|urgent|critical|only if|branch|check)\b/.test(lower);
  const wantsSlackDiscord = /\b(slack|discord|teams)\b/.test(lower);
  const wantsEmail = /\b(email|mail|inbox|digest|notify|notification|alert)\b/.test(lower);

  if (/\b(sms|twilio|whatsapp|stripe|notion|airtable|google sheets)\b/.test(lower)) {
    unsupportedRequirements.push(
      'Native SMS/Stripe/Notion connectors are not bundled; use an HTTP Request node with their REST API endpoint.'
    );
  }

  let x = 80;
  const stepX = 310;
  const triggerId = `node_${generateRandomToken(5)}`;

  if (wantsChat && !wantsWebhook) {
    nodes.push({
      id: triggerId,
      type: 'croxNode',
      position: { x, y: 180 },
      data: {
        label: 'Chat Trigger',
        nodeType: 'chat_trigger',
        category: 'triggers',
        description: 'Conversational input trigger',
        config: {
          welcomeMessage: 'How can I help automate your workflow today?',
          sessionKey: 'default_chat',
          sampleMessage: prompt.slice(0, 140),
        },
      },
    });
  } else if (wantsForm) {
    nodes.push({
      id: triggerId,
      type: 'croxNode',
      position: { x, y: 180 },
      data: {
        label: 'Form Submission Trigger',
        nodeType: 'form_trigger',
        category: 'triggers',
        description: 'Receives structured form submission',
        config: {
          formTitle: 'Intake Form',
          formDescription: 'Submit details to start automation',
          fields: [
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
          ],
          sampleSubmission: JSON.stringify({ name: 'Jordan Lee', email: 'jordan@acme.io' }, null, 2),
        },
      },
    });
  } else if (wantsSchedule && !wantsWebhook) {
    const isHourly = /\bhourly\b/.test(lower);
    const isWeekly = /\bweekly\b/.test(lower);
    nodes.push({
      id: triggerId,
      type: 'croxNode',
      position: { x, y: 180 },
      data: {
        label: isHourly ? 'Hourly Schedule' : isWeekly ? 'Weekly Schedule' : 'Daily Morning Schedule',
        nodeType: 'schedule_trigger',
        category: 'triggers',
        description: 'Automated recurring trigger',
        config: {
          frequency: isHourly ? 'hourly' : isWeekly ? 'weekly' : 'daily',
          intervalMinutes: isHourly ? 60 : isWeekly ? 10080 : 1440,
          cronExpression: isHourly ? '0 * * * *' : isWeekly ? '0 9 * * 1' : '0 9 * * *',
          timezone: 'UTC',
        },
      },
    });
  } else {
    nodes.push({
      id: triggerId,
      type: 'croxNode',
      position: { x, y: 180 },
      data: {
        label: 'Webhook Trigger',
        nodeType: 'webhook_trigger',
        category: 'triggers',
        description: 'Receives incoming event payload',
        config: {
          method: 'POST',
          path: '/automation',
          requireSecret: false,
          samplePayload: JSON.stringify(
            {
              event: 'submission',
              email: 'alex@example.com',
              message: prompt.slice(0, 120),
              priority: 'high',
            },
            null,
            2
          ),
          responseMode: 'immediate',
        },
      },
    });
  }

  let prevId = triggerId;
  x += stepX;

  if (wantsApi) {
    const httpId = `node_${generateRandomToken(5)}`;
    nodes.push({
      id: httpId,
      type: 'croxNode',
      position: { x, y: 180 },
      data: {
        label: 'Fetch External Data',
        nodeType: 'http_request',
        category: 'core',
        description: 'Request JSON data from external endpoint',
        config: {
          url: 'https://jsonplaceholder.typicode.com/posts?_limit=3',
          method: 'GET',
          headers: [],
          queryParams: [],
          body: '',
          credentialId: '',
          timeoutMs: 10000,
          responseType: 'json',
        },
      },
    });
    edges.push({ id: `edge_${generateRandomToken(5)}`, source: prevId, target: httpId, edgeKind: 'main' });
    prevId = httpId;
    x += stepX;
  }

  if (wantsCode && !wantsAgentCluster) {
    const codeId = `node_${generateRandomToken(5)}`;
    nodes.push({
      id: codeId,
      type: 'croxNode',
      position: { x, y: 180 },
      data: {
        label: 'Process Payload (JS)',
        nodeType: 'code_node',
        category: 'core',
        description: 'Transform fields in sandboxed JavaScript',
        config: {
          language: 'javascript',
          code: 'return { ...(prev || {}), processedAt: new Date().toISOString() };',
        },
      },
    });
    edges.push({ id: `edge_${generateRandomToken(5)}`, source: prevId, target: codeId, edgeKind: 'main' });
    prevId = codeId;
    x += stepX;
  }

  if (wantsCondition) {
    const condId = `node_${generateRandomToken(5)}`;
    nodes.push({
      id: condId,
      type: 'croxNode',
      position: { x, y: 180 },
      data: {
        label: 'Check Condition',
        nodeType: 'condition',
        category: 'flow',
        description: 'Route execution based on payload value',
        config: {
          inputVariable: 'trigger.body.priority',
          operator: 'equals',
          comparisonValue: 'high',
        },
      },
    });
    edges.push({ id: `edge_${generateRandomToken(5)}`, source: prevId, target: condId, edgeKind: 'main' });
    prevId = condId;
    x += stepX;
  }

  const prevNodeIsCondition = nodes[nodes.length - 1]?.data && (nodes[nodes.length - 1].data as { nodeType: string }).nodeType === 'condition';

  if (wantsAgentCluster) {
    const agentId = `node_${generateRandomToken(5)}`;
    const modelId = `node_${generateRandomToken(5)}`;
    const memId = `node_${generateRandomToken(5)}`;
    const calcId = `node_${generateRandomToken(5)}`;
    const agentY = prevNodeIsCondition ? 100 : 180;

    nodes.push(
      {
        id: agentId,
        type: 'croxNode',
        position: { x, y: agentY },
        data: {
          label: 'AI Agent',
          nodeType: 'ai_agent',
          category: 'ai',
          description: 'Multi-turn AI Agent with attached Chat Model, Memory & Tools',
          config: {
            prompt: `Fulfill this task using attached tools when helpful ("${prompt.slice(0, 120)}"):\n{{prev}}`,
            systemMessage: 'You are a helpful CROX AI agent.',
            maxIterations: 5,
            temperature: 0.2,
          },
        },
      },
      {
        id: modelId,
        type: 'croxNode',
        position: { x: x - 180, y: agentY + 200 },
        data: {
          label: 'Gemini Chat Model',
          nodeType: 'gemini_chat_model',
          category: 'ai',
          description: 'Language model for AI Agent',
          config: { model: 'gemini-3.8-flash', credentialId: '', temperature: 0.2, maxOutputTokens: 2048 },
        },
      },
      {
        id: memId,
        type: 'croxNode',
        position: { x, y: agentY + 200 },
        data: {
          label: 'Windowed Memory',
          nodeType: 'windowed_memory',
          category: 'ai',
          description: 'Remembers recent conversation turns',
          config: { sessionKey: 'nova_agent', conversationIdExpression: 'default', windowSize: 6 },
        },
      },
      {
        id: calcId,
        type: 'croxNode',
        position: { x: x + 180, y: agentY + 200 },
        data: {
          label: 'Calculator Tool',
          nodeType: 'tool_calculator',
          category: 'ai',
          description: 'Safe math expression tool',
          config: { description: 'Evaluate math formulas accurately.' },
        },
      }
    );

    edges.push(
      {
        id: `edge_${generateRandomToken(5)}`,
        source: prevId,
        target: agentId,
        edgeKind: 'main',
        ...(prevNodeIsCondition ? { sourceHandle: 'true', label: 'True' } : {}),
      },
      {
        id: `edge_${generateRandomToken(5)}`,
        source: modelId,
        target: agentId,
        targetHandle: 'ai_languageModel',
        edgeKind: 'ai_languageModel',
      },
      {
        id: `edge_${generateRandomToken(5)}`,
        source: memId,
        target: agentId,
        targetHandle: 'ai_memory',
        edgeKind: 'ai_memory',
      },
      {
        id: `edge_${generateRandomToken(5)}`,
        source: calcId,
        target: agentId,
        targetHandle: 'ai_tool',
        edgeKind: 'ai_tool',
      }
    );
    prevId = agentId;
    x += stepX;
  } else if (wantsAi) {
    const aiId = `node_${generateRandomToken(5)}`;
    nodes.push({
      id: aiId,
      type: 'croxNode',
      position: { x, y: prevNodeIsCondition ? 100 : 180 },
      data: {
        label: 'AI Summary & Processing',
        nodeType: 'ai_node',
        category: 'ai',
        description: 'Process and summarize workflow input',
        config: {
          provider: 'gemini',
          model: 'gemini-3.8-flash',
          credentialId: '',
          prompt: `Process this workflow data cleanly based on goal ("${prompt.slice(0, 100)}"):\n{{prev}}`,
          systemInstruction: 'Return clear, concise prose ready for downstream actions.',
          outputFormat: 'text',
        },
      },
    });
    edges.push({
      id: `edge_${generateRandomToken(5)}`,
      source: prevId,
      target: aiId,
      edgeKind: 'main',
      ...(prevNodeIsCondition ? { sourceHandle: 'true', label: 'True' } : {}),
    });
    prevId = aiId;
    x += stepX;
  }

  if (wantsSlackDiscord) {
    const notifyId = `node_${generateRandomToken(5)}`;
    const isDiscord = lower.includes('discord');
    nodes.push({
      id: notifyId,
      type: 'croxNode',
      position: { x, y: prevNodeIsCondition && !wantsAi && !wantsAgentCluster ? 100 : 180 },
      data: {
        label: isDiscord ? 'Notify Discord Channel' : 'Notify Slack Channel',
        nodeType: 'webhook_notify',
        category: 'communication',
        description: 'Post automated alert via webhook',
        config: {
          platform: isDiscord ? 'discord' : 'slack',
          webhookUrl: '',
          message: wantsAi || wantsAgentCluster ? '{{prev.text}}' : 'New automation event: {{trigger.body}}',
          username: 'CROX Bot',
        },
      },
    });
    edges.push({
      id: `edge_${generateRandomToken(5)}`,
      source: prevId,
      target: notifyId,
      edgeKind: 'main',
      ...(prevNodeIsCondition && !wantsAi && !wantsAgentCluster ? { sourceHandle: 'true', label: 'True' } : {}),
    });
  } else if (wantsEmail || (!wantsApi && !wantsAi && !wantsAgentCluster)) {
    const emailId = `node_${generateRandomToken(5)}`;
    nodes.push({
      id: emailId,
      type: 'croxNode',
      position: { x, y: prevNodeIsCondition && !wantsAi && !wantsAgentCluster ? 100 : 180 },
      data: {
        label: 'Send Email Notification',
        nodeType: 'send_email',
        category: 'communication',
        description: 'Deliver formatted email notification',
        config: {
          to: 'team@example.com',
          subject: 'CROX Automation Update',
          body: wantsAi || wantsAgentCluster ? '{{prev.text}}' : 'New automation triggered: {{trigger.body}}',
          credentialId: '',
          isHtml: false,
        },
      },
    });
    edges.push({
      id: `edge_${generateRandomToken(5)}`,
      source: prevId,
      target: emailId,
      edgeKind: 'main',
      ...(prevNodeIsCondition && !wantsAi && !wantsAgentCluster ? { sourceHandle: 'true', label: 'True' } : {}),
    });
  }

  return {
    name: wantsAgentCluster
      ? 'AI Agent Automation Workflow'
      : wantsSchedule
        ? 'Scheduled Automation Workflow'
        : 'Webhook Automation Workflow',
    description: prompt.trim().slice(0, 220),
    nodes,
    edges,
    explanation:
      'Generated using CROX deterministic rule-based builder (no external LLM key is active for natural-language planning). You can edit every node, connection, and field in the canvas.',
    unsupportedRequirements,
    mode: 'rule-based',
  };
}

export async function generateWorkflowWithNova(prompt: string): Promise<NovaGenerationResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error('Please describe the workflow you want NOVA to build.');
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return buildRuleBasedWorkflow(cleanPrompt);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Create a CROX visual automation workflow for this user request:\n"${cleanPrompt}"`,
      config: {
        systemInstruction: `You are NOVA, the workflow architect inside CROX (an n8n-style AI workflow automation builder).
Design a valid, acyclic directed workflow graph using ONLY these exact nodeType values:
Triggers: "manual_trigger", "webhook_trigger", "schedule_trigger", "chat_trigger", "form_trigger"
AI: "ai_node", "ai_agent", "gemini_chat_model", "simple_memory", "windowed_memory", "structured_output_parser", "tool_calculator", "tool_datetime", "tool_http_request"
Core: "http_request", "edit_fields", "transform_data", "code_node", "filter_items", "sort_items", "limit_items", "aggregate_items"
Flow: "condition", "switch_node", "merge_node", "wait_node", "noop"
Communication: "send_email", "webhook_notify"

Rules:
1. Always start with one trigger node at x: 80, y: 180.
2. Space subsequent main nodes horizontally by +300px on x, and branch vertically (y: 90 and y: 280) after any "condition" node.
3. If using "ai_agent", attach at least one "gemini_chat_model" sub-node below it (y + 200) via an edge with source=modelId, target=agentId, targetHandle="ai_languageModel". Any "tool_*" connects with targetHandle="ai_tool", memory with "ai_memory", parser with "ai_outputParser".
4. For edges coming from a "condition" node, set sourceHandle to "true" or "false".
5. Reference upstream outputs safely with {{trigger.body}}, {{prev.text}}, or {{prev.data}}.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            explanation: { type: Type.STRING },
            unsupportedRequirements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  nodeType: { type: Type.STRING },
                  label: { type: Type.STRING },
                  description: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  configJson: {
                    type: Type.STRING,
                    description: 'JSON stringified configuration object appropriate for this nodeType.',
                  },
                },
                required: ['id', 'nodeType', 'label', 'x', 'y', 'configJson'],
              },
            },
            edges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING },
                  target: { type: Type.STRING },
                  sourceHandle: { type: Type.STRING },
                  targetHandle: { type: Type.STRING },
                },
                required: ['source', 'target'],
              },
            },
          },
          required: ['name', 'description', 'explanation', 'nodes', 'edges'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      name: string;
      description: string;
      explanation: string;
      unsupportedRequirements?: string[];
      nodes: Array<{
        id: string;
        nodeType: string;
        label: string;
        description?: string;
        x: number;
        y: number;
        configJson: string;
      }>;
      edges: Array<{
        source: string;
        target: string;
        sourceHandle?: string;
        targetHandle?: string;
      }>;
    };

    const allowedTypes = new Set<CroxNodeType>([
      'manual_trigger',
      'webhook_trigger',
      'schedule_trigger',
      'chat_trigger',
      'form_trigger',
      'http_request',
      'edit_fields',
      'transform_data',
      'code_node',
      'filter_items',
      'sort_items',
      'limit_items',
      'aggregate_items',
      'condition',
      'switch_node',
      'merge_node',
      'wait_node',
      'noop',
      'send_email',
      'webhook_notify',
      'ai_node',
      'ai_agent',
      'gemini_chat_model',
      'simple_memory',
      'windowed_memory',
      'structured_output_parser',
      'tool_calculator',
      'tool_datetime',
      'tool_http_request',
    ]);

    const idMap = new Map<string, string>();
    const nodes: WorkflowNode[] = [];

    for (let i = 0; i < (parsed.nodes || []).length; i++) {
      const raw = parsed.nodes[i];
      if (!allowedTypes.has(raw.nodeType as CroxNodeType)) continue;
      const nodeType = raw.nodeType as CroxNodeType;
      const newId = `node_${generateRandomToken(5)}`;
      idMap.set(raw.id, newId);

      let parsedCfg: Record<string, unknown> = {};
      try {
        parsedCfg = JSON.parse(raw.configJson || '{}');
      } catch {
        parsedCfg = {};
      }

      const category = [
        'manual_trigger',
        'webhook_trigger',
        'schedule_trigger',
        'chat_trigger',
        'form_trigger',
      ].includes(nodeType)
        ? 'triggers'
        : [
              'ai_node',
              'ai_agent',
              'gemini_chat_model',
              'simple_memory',
              'windowed_memory',
              'structured_output_parser',
              'tool_calculator',
              'tool_datetime',
              'tool_http_request',
            ].includes(nodeType)
          ? 'ai'
          : ['condition', 'switch_node', 'merge_node', 'wait_node', 'noop'].includes(nodeType)
            ? 'flow'
            : ['send_email', 'webhook_notify'].includes(nodeType)
              ? 'communication'
              : 'core';

      nodes.push({
        id: newId,
        type: 'croxNode',
        position: {
          x: typeof raw.x === 'number' ? raw.x : 80 + i * 300,
          y: typeof raw.y === 'number' ? raw.y : 180,
        },
        data: {
          label: raw.label || nodeType,
          nodeType,
          category,
          description: raw.description || '',
          config: normalizeNodeConfig(nodeType, parsedCfg) as CroxNodeConfig,
        },
      });
    }

    const edges: WorkflowEdge[] = (parsed.edges || [])
      .map((e) => {
        const src = idMap.get(e.source);
        const tgt = idMap.get(e.target);
        if (!src || !tgt || src === tgt) return null;
        const edge: WorkflowEdge = {
          id: `edge_${generateRandomToken(5)}`,
          source: src,
          target: tgt,
        };
        if (e.sourceHandle === 'true' || e.sourceHandle === 'false') {
          edge.sourceHandle = e.sourceHandle;
          edge.label = e.sourceHandle === 'true' ? 'True' : 'False';
        }
        if (
          e.targetHandle === 'ai_languageModel' ||
          e.targetHandle === 'ai_memory' ||
          e.targetHandle === 'ai_tool' ||
          e.targetHandle === 'ai_outputParser'
        ) {
          edge.targetHandle = e.targetHandle;
          edge.edgeKind = e.targetHandle;
        } else {
          edge.edgeKind = 'main';
        }
        return edge;
      })
      .filter((e): e is WorkflowEdge => e !== null);

    const validation = validateWorkflowGraph(nodes, edges);
    if (!validation.valid || nodes.length === 0) {
      return buildRuleBasedWorkflow(cleanPrompt);
    }

    return {
      name: parsed.name || 'NOVA Generated Workflow',
      description: parsed.description || cleanPrompt,
      nodes,
      edges,
      explanation: parsed.explanation || 'Workflow generated with Gemini AI.',
      unsupportedRequirements: parsed.unsupportedRequirements || [],
      mode: 'gemini',
    };
  } catch {
    return buildRuleBasedWorkflow(cleanPrompt);
  }
}

function normalizeNodeConfig(nodeType: CroxNodeType, raw: Record<string, unknown>): WorkflowNode['data']['config'] {
  switch (nodeType) {
    case 'manual_trigger':
      return {
        samplePayload:
          typeof raw.samplePayload === 'string'
            ? raw.samplePayload
            : JSON.stringify(raw.samplePayload || { event: 'manual_run' }, null, 2),
      };
    case 'webhook_trigger':
      return {
        method: (['GET', 'POST', 'PUT', 'DELETE'].includes(String(raw.method)) ? raw.method : 'POST') as 'POST',
        path: String(raw.path || '/webhook'),
        requireSecret: Boolean(raw.requireSecret),
        samplePayload:
          typeof raw.samplePayload === 'string'
            ? raw.samplePayload
            : JSON.stringify(raw.samplePayload || { event: 'triggered' }, null, 2),
        responseMode: raw.responseMode === 'last_node' ? 'last_node' : 'immediate',
      };
    case 'schedule_trigger':
      return {
        frequency: (['every_minute', 'hourly', 'daily', 'weekly', 'custom_cron'].includes(String(raw.frequency))
          ? raw.frequency
          : 'daily') as 'daily',
        intervalMinutes: Number(raw.intervalMinutes) || 1440,
        cronExpression: String(raw.cronExpression || '0 9 * * *'),
        timezone: String(raw.timezone || 'UTC'),
      };
    case 'chat_trigger':
      return {
        welcomeMessage: String(raw.welcomeMessage || 'How can I help?'),
        sessionKey: String(raw.sessionKey || 'chat_session'),
        sampleMessage: String(raw.sampleMessage || 'Summarize latest activity'),
      };
    case 'form_trigger':
      return {
        formTitle: String(raw.formTitle || 'CROX Intake Form'),
        formDescription: String(raw.formDescription || 'Submit entry'),
        fields: Array.isArray(raw.fields) ? raw.fields : [{ name: 'email', label: 'Email', type: 'email', required: true }],
        sampleSubmission:
          typeof raw.sampleSubmission === 'string'
            ? raw.sampleSubmission
            : JSON.stringify(raw.sampleSubmission || { email: 'alex@example.com' }, null, 2),
      };
    case 'http_request':
      return {
        url: String(raw.url || 'https://jsonplaceholder.typicode.com/posts/1'),
        method: (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(raw.method)) ? raw.method : 'GET') as 'GET',
        headers: Array.isArray(raw.headers) ? raw.headers : [],
        queryParams: Array.isArray(raw.queryParams) ? raw.queryParams : [],
        body: typeof raw.body === 'string' ? raw.body : raw.body ? JSON.stringify(raw.body) : '',
        credentialId: '',
        timeoutMs: Number(raw.timeoutMs) || 10000,
        responseType: 'json',
      };
    case 'edit_fields':
      return {
        mode: raw.mode === 'replace' ? 'replace' : 'merge',
        fields: Array.isArray(raw.fields) ? raw.fields : [{ name: 'processed', value: 'true', type: 'boolean' }],
      };
    case 'code_node':
      return {
        language: 'javascript',
        code: String(raw.code || 'return { ...(prev || {}), ok: true };'),
      };
    case 'filter_items':
      return {
        itemsPath: String(raw.itemsPath || 'prev.data'),
        field: String(raw.field || 'id'),
        operator: 'exists',
        value: String(raw.value || ''),
      };
    case 'sort_items':
      return {
        itemsPath: String(raw.itemsPath || 'prev.data'),
        field: String(raw.field || 'id'),
        direction: raw.direction === 'desc' ? 'desc' : 'asc',
      };
    case 'limit_items':
      return {
        itemsPath: String(raw.itemsPath || 'prev.data'),
        limit: Number(raw.limit) || 5,
        offset: Number(raw.offset) || 0,
      };
    case 'aggregate_items':
      return {
        itemsPath: String(raw.itemsPath || 'prev.items'),
        operation: 'count',
        field: String(raw.field || ''),
        outputField: String(raw.outputField || 'total'),
      };
    case 'send_email':
      return {
        to: String(raw.to || 'recipient@example.com'),
        subject: String(raw.subject || 'CROX Workflow Notification'),
        body: String(raw.body || '{{prev.text}}'),
        credentialId: '',
        isHtml: Boolean(raw.isHtml),
      };
    case 'condition':
      return {
        inputVariable: String(raw.inputVariable || 'trigger.body.status'),
        operator: ([
          'equals',
          'not_equals',
          'contains',
          'not_contains',
          'greater_than',
          'less_than',
          'exists',
          'is_empty',
        ].includes(String(raw.operator))
          ? raw.operator
          : 'equals') as 'equals',
        comparisonValue: String(raw.comparisonValue || 'ok'),
      };
    case 'transform_data':
      return {
        mode: raw.mode === 'map' ? 'map' : 'merge',
        mappings: Array.isArray(raw.mappings)
          ? raw.mappings
          : [{ targetField: 'processedAt', sourceExpression: 'trigger.triggeredAt', operation: 'copy' }],
      };
    case 'webhook_notify':
      return {
        platform: (['slack', 'discord', 'generic'].includes(String(raw.platform))
          ? raw.platform
          : 'slack') as 'slack',
        webhookUrl: String(raw.webhookUrl || ''),
        message: String(raw.message || '{{prev.text}}'),
        username: String(raw.username || 'CROX Bot'),
      };
    case 'wait_node':
      return {
        durationMs: Math.min(Math.max(Number(raw.durationMs) || 1000, 0), 10000),
      };
    case 'ai_agent':
      return {
        prompt: String(raw.prompt || '{{trigger.body}}'),
        systemMessage: String(raw.systemMessage || 'You are a helpful CROX AI workflow agent.'),
        maxIterations: Number(raw.maxIterations) || 5,
        temperature: typeof raw.temperature === 'number' ? raw.temperature : 0.2,
      };
    case 'gemini_chat_model':
      return {
        model: raw.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.8-flash',
        credentialId: '',
        temperature: 0.2,
        maxOutputTokens: 2048,
      };
    case 'simple_memory':
      return {
        sessionKey: String(raw.sessionKey || 'agent_session'),
        conversationIdExpression: String(raw.conversationIdExpression || 'default'),
        maxMessages: Number(raw.maxMessages) || 12,
      };
    case 'windowed_memory':
      return {
        sessionKey: String(raw.sessionKey || 'agent_session'),
        conversationIdExpression: String(raw.conversationIdExpression || 'default'),
        windowSize: Number(raw.windowSize) || 6,
      };
    case 'structured_output_parser':
      return {
        schemaJson: String(raw.schemaJson || JSON.stringify({ type: 'object', required: ['summary'], properties: { summary: { type: 'string' } } }, null, 2)),
        strict: true,
      };
    case 'tool_calculator':
      return { description: String(raw.description || 'Evaluate arithmetic expressions safely.') };
    case 'tool_datetime':
      return { defaultTimezone: String(raw.defaultTimezone || 'UTC'), description: 'Return current formatted date/time.' };
    case 'tool_http_request':
      return {
        toolName: String(raw.toolName || 'fetch_api'),
        description: String(raw.description || 'Fetch external JSON API'),
        url: String(raw.url || 'https://jsonplaceholder.typicode.com/posts/1'),
        method: 'GET',
        headers: [],
        credentialId: '',
        bodyTemplate: '',
      };
    case 'ai_node':
    default:
      return {
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        credentialId: '',
        prompt: String(raw.prompt || 'Summarize the following input:\n{{prev}}'),
        systemInstruction: String(raw.systemInstruction || 'Be concise and structured.'),
        outputFormat: raw.outputFormat === 'json' ? 'json' : 'text',
      };
  }
}
