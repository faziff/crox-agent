import React, { useState } from 'react';
import {
  Bot,
  FilePlus2,
  GitBranch,
  GitFork,
  Network,
  Webhook,
  X,
} from 'lucide-react';
import { createWorkflowNode } from '../../constants/nodeCatalog';
import {
  CroxNodeType,
  ProjectRecord,
  WorkflowEdge,
  WorkflowNode,
  WorkflowStructureType,
} from '../../types/workflow';

interface NewWorkflowModalProps {
  open: boolean;
  projects: ProjectRecord[];
  defaultProjectId?: string;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    description: string;
    projectId?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  }) => Promise<void>;
}

const STRUCTURE_CARDS: Array<{
  type: WorkflowStructureType;
  title: string;
  subtitle: string;
  defaultName: string;
  icon: React.ComponentType<{ className?: string }>;
  previewNodes: string[];
}> = [
  {
    type: 'blank',
    title: 'Blank Workflow',
    subtitle: 'Open a clean canvas and add triggers or steps manually.',
    defaultName: 'Untitled Workflow',
    icon: FilePlus2,
    previewNodes: ['Empty Canvas'],
  },
  {
    type: 'linear',
    title: 'Linear Pipeline',
    subtitle: 'Sequential trigger → data transform → AI prompt → alert.',
    defaultName: 'Linear AI Pipeline',
    icon: GitBranch,
    previewNodes: ['Trigger', 'Set Data', 'AI Prompt', 'Alert'],
  },
  {
    type: 'flowchart',
    title: 'Flowchart / Branching',
    subtitle: 'Conditional IF/ELSE paths routing true and false outcomes.',
    defaultName: 'Conditional Router',
    icon: GitFork,
    previewNodes: ['Webhook', 'If', 'True / False'],
  },
  {
    type: 'ai_agent',
    title: 'AI Agent Pipeline',
    subtitle: 'Autonomous agent wired with Gemini Model, Memory & Tools.',
    defaultName: 'AI Operations Agent',
    icon: Bot,
    previewNodes: ['Chat', 'AI Agent', 'Model + Tools'],
  },
  {
    type: 'event_driven',
    title: 'Event-Driven Automation',
    subtitle: 'Start from Webhook, Schedule, Form, or Chat event trigger.',
    defaultName: 'Event Automation',
    icon: Webhook,
    previewNodes: ['Event Trigger', 'Transform', 'Action'],
  },
  {
    type: 'multi_agent',
    title: 'Multi-Agent Workflow',
    subtitle: 'Coordinate multiple sub-agent workflows with a synthesis model.',
    defaultName: 'Multi-Agent Orchestrator',
    icon: Network,
    previewNodes: ['Trigger', 'Orchestrator', 'Sub-Agents'],
  },
];

function buildStarterGraph(
  structure: WorkflowStructureType,
  eventTriggerType: CroxNodeType
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  if (structure === 'blank') {
    return { nodes: [], edges: [] };
  }

  if (structure === 'linear') {
    const t = createWorkflowNode('manual_trigger', { x: 80, y: 180 });
    const s = createWorkflowNode('set_data', { x: 360, y: 180 });
    const ai = createWorkflowNode('ai_node', { x: 640, y: 180 });
    const notify = createWorkflowNode('webhook_notify', { x: 920, y: 180 });
    return {
      nodes: [t, s, ai, notify],
      edges: [
        { id: `e_${t.id}_${s.id}`, source: t.id, target: s.id, edgeKind: 'main' },
        { id: `e_${s.id}_${ai.id}`, source: s.id, target: ai.id, edgeKind: 'main' },
        { id: `e_${ai.id}_${notify.id}`, source: ai.id, target: notify.id, edgeKind: 'main' },
      ],
    };
  }

  if (structure === 'flowchart') {
    const trig = createWorkflowNode('webhook_trigger', { x: 80, y: 190 });
    const cond = createWorkflowNode('condition', { x: 380, y: 190 });
    const trueBranch = createWorkflowNode('webhook_notify', { x: 700, y: 90 });
    const falseBranch = createWorkflowNode('set_data', { x: 700, y: 290 });
    return {
      nodes: [trig, cond, trueBranch, falseBranch],
      edges: [
        { id: `e_${trig.id}_${cond.id}`, source: trig.id, target: cond.id, edgeKind: 'main' },
        {
          id: `e_${cond.id}_${trueBranch.id}`,
          source: cond.id,
          target: trueBranch.id,
          sourceHandle: 'true',
          label: 'True',
          edgeKind: 'main',
        },
        {
          id: `e_${cond.id}_${falseBranch.id}`,
          source: cond.id,
          target: falseBranch.id,
          sourceHandle: 'false',
          label: 'False',
          edgeKind: 'main',
        },
      ],
    };
  }

  if (structure === 'ai_agent') {
    const chat = createWorkflowNode('chat_trigger', { x: 80, y: 140 });
    const agent = createWorkflowNode('ai_agent', { x: 380, y: 140 });
    const model = createWorkflowNode('gemini_chat_model', { x: 180, y: 340 });
    const mem = createWorkflowNode('conversation_memory', { x: 390, y: 340 });
    const tool = createWorkflowNode('tool_calculator', { x: 600, y: 340 });
    const out = createWorkflowNode('edit_fields', { x: 720, y: 140 });
    return {
      nodes: [chat, agent, model, mem, tool, out],
      edges: [
        { id: `e_${chat.id}_${agent.id}`, source: chat.id, target: agent.id, edgeKind: 'main' },
        { id: `e_${agent.id}_${out.id}`, source: agent.id, target: out.id, edgeKind: 'main' },
        {
          id: `e_${model.id}_${agent.id}`,
          source: model.id,
          target: agent.id,
          targetHandle: 'ai_languageModel',
          edgeKind: 'ai_languageModel',
        },
        {
          id: `e_${mem.id}_${agent.id}`,
          source: mem.id,
          target: agent.id,
          targetHandle: 'ai_memory',
          edgeKind: 'ai_memory',
        },
        {
          id: `e_${tool.id}_${agent.id}`,
          source: tool.id,
          target: agent.id,
          targetHandle: 'ai_tool',
          edgeKind: 'ai_tool',
        },
      ],
    };
  }

  if (structure === 'event_driven') {
    const trig = createWorkflowNode(eventTriggerType, { x: 80, y: 180 });
    const transform = createWorkflowNode('edit_fields', { x: 380, y: 180 });
    const act = createWorkflowNode('integration_action', { x: 680, y: 180 });
    return {
      nodes: [trig, transform, act],
      edges: [
        { id: `e_${trig.id}_${transform.id}`, source: trig.id, target: transform.id, edgeKind: 'main' },
        { id: `e_${transform.id}_${act.id}`, source: transform.id, target: act.id, edgeKind: 'main' },
      ],
    };
  }

  // multi_agent
  const trig = createWorkflowNode('manual_trigger', { x: 80, y: 150 });
  const orch = createWorkflowNode('agent_orchestrator', { x: 390, y: 150 });
  const model = createWorkflowNode('gemini_chat_model', { x: 390, y: 350 });
  const out = createWorkflowNode('set_data', { x: 720, y: 150 });
  return {
    nodes: [trig, orch, model, out],
    edges: [
      { id: `e_${trig.id}_${orch.id}`, source: trig.id, target: orch.id, edgeKind: 'main' },
      { id: `e_${orch.id}_${out.id}`, source: orch.id, target: out.id, edgeKind: 'main' },
      {
        id: `e_${model.id}_${orch.id}`,
        source: model.id,
        target: orch.id,
        targetHandle: 'ai_languageModel',
        edgeKind: 'ai_languageModel',
      },
    ],
  };
}

export const NewWorkflowModal: React.FC<NewWorkflowModalProps> = ({
  open,
  projects,
  defaultProjectId = '',
  onClose,
  onCreate,
}) => {
  const [selectedType, setSelectedType] = useState<WorkflowStructureType>('blank');
  const [eventTrigger, setEventTrigger] = useState<CroxNodeType>('webhook_trigger');
  const [name, setName] = useState('Untitled Workflow');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const activeProjects = projects.filter((p) => !p.isArchived);

  const handleSelectStructure = (type: WorkflowStructureType, defaultName: string) => {
    setSelectedType(type);
    if (
      !name.trim() ||
      STRUCTURE_CARDS.some((c) => c.defaultName === name.trim())
    ) {
      setName(defaultName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { nodes, edges } = buildStarterGraph(selectedType, eventTrigger);
      await onCreate({
        name: name.trim() || 'Untitled Workflow',
        description: description.trim(),
        ...(projectId ? { projectId } : {}),
        nodes,
        edges,
      });
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 shadow-2xl my-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white">
              What would you like to build?
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Start with a blank canvas or scaffold a structured automation architecture.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STRUCTURE_CARDS.map((card) => {
            const Icon = card.icon;
            const active = selectedType === card.type;
            return (
              <button
                key={card.type}
                type="button"
                onClick={() => handleSelectStructure(card.type, card.defaultName)}
                className={`text-left p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between gap-3 ${
                  active
                    ? 'border-[#E11D48] bg-rose-50/40 dark:bg-rose-950/20 shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        active
                          ? 'bg-[#E11D48] text-white'
                          : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-display text-sm font-semibold text-zinc-900 dark:text-white">
                      {card.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                    {card.subtitle}
                  </p>
                </div>

                {/* Mini schematic flow strip */}
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  {card.previewNodes.map((pn, i) => (
                    <React.Fragment key={pn}>
                      {i > 0 && <span className="text-[10px] text-zinc-400">→</span>}
                      <span className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono text-zinc-600 dark:text-zinc-300">
                        {pn}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {selectedType === 'event_driven' && (
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Select Event Trigger Type</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'webhook_trigger', label: 'Webhook' },
                  { id: 'schedule_trigger', label: 'Schedule (Cron)' },
                  { id: 'form_trigger', label: 'Form Intake' },
                  { id: 'chat_trigger', label: 'Chat Message' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEventTrigger(opt.id)}
                  className={`py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    eventTrigger === opt.id
                      ? 'border-[#E11D48] bg-white dark:bg-zinc-900 text-[#E11D48]'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Workflow Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="">Personal Workspace</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Description (Optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly note the purpose of this automation"
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-medium disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create & Open Editor'}
          </button>
        </div>
      </form>
    </div>
  );
};
