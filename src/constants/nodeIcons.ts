import React from 'react';
import {
  AlertOctagon,
  ArrowUpDown,
  Blocks,
  Bot,
  Braces,
  BrainCircuit,
  Calculator,
  CalendarClock,
  Clock,
  Code2,
  Cpu,
  Database,
  FileJson,
  FileText,
  Filter,
  GitBranch,
  GitFork,
  GitMerge,
  Globe,
  Layers,
  ListFilter,
  Mail,
  MessageSquare,
  MessageSquareText,
  Network,
  Play,
  Repeat,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Split,
  StopCircle,
  Timer,
  Webhook,
  Workflow,
  Wrench,
} from 'lucide-react';
import { ClusterRole, CroxNodeType, NodeCategory } from '../types/workflow';

const NODE_ICON_MAP: Record<CroxNodeType, React.ComponentType<{ className?: string }>> = {
  // Triggers
  manual_trigger: Play,
  webhook_trigger: Webhook,
  schedule_trigger: Clock,
  chat_trigger: MessageSquareText,
  form_trigger: FileText,
  error_trigger: ShieldAlert,

  // AI & Agent Cluster
  ai_agent: Bot,
  agent_orchestrator: Network,
  ai_node: BrainCircuit,
  gemini_chat_model: Sparkles,
  openai_chat_model: Cpu,
  anthropic_chat_model: BrainCircuit,
  simple_memory: Database,
  windowed_memory: Layers,
  conversation_memory: Database,
  structured_output_parser: FileJson,
  autofix_output_parser: Wrench,
  tool_calculator: Calculator,
  tool_http_request: Globe,
  tool_datetime: CalendarClock,
  tool_workflow: Workflow,
  tool_custom: Code2,

  // Core & Data
  http_request: Globe,
  edit_fields: SlidersHorizontal,
  set_data: SlidersHorizontal,
  transform_data: Braces,
  code_node: Code2,
  filter_items: Filter,
  sort_items: ArrowUpDown,
  limit_items: ListFilter,
  aggregate_items: Layers,
  split_out: Split,
  remove_duplicates: ShieldAlert,
  json_operations: FileJson,
  datetime_operations: CalendarClock,

  // Flow Control
  condition: GitFork,
  switch_node: GitBranch,
  merge_node: GitMerge,
  loop_items: Repeat,
  wait_node: Timer,
  stop_and_error: StopCircle,
  execute_workflow: Workflow,
  noop: AlertOctagon,

  // Communication
  send_email: Mail,
  webhook_notify: MessageSquare,

  // Integrations
  integration_action: Blocks,
};

export function getNodeIcon(nodeType: CroxNodeType): React.ComponentType<{ className?: string }> {
  return NODE_ICON_MAP[nodeType] || Globe;
}

export function getCategoryIconBadgeClass(category: NodeCategory | string, clusterRole?: ClusterRole): string {
  if (clusterRole === 'languageModel') {
    return 'bg-rose-50 text-[#E11D48] dark:bg-rose-950/50 dark:text-rose-400';
  }
  if (clusterRole === 'memory') {
    return 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300';
  }
  if (clusterRole === 'tool') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
  }
  if (clusterRole === 'outputParser') {
    return 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300';
  }

  switch (category) {
    case 'triggers':
      return 'bg-rose-50 text-[#E11D48] dark:bg-rose-950/50 dark:text-rose-400';
    case 'ai':
      return 'bg-zinc-900 text-white dark:bg-rose-950/60 dark:text-rose-300';
    case 'flow':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    case 'communication':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'integrations':
      return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300';
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200';
  }
}
