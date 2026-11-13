import { Edge, Node } from '@xyflow/react';
import { CroxNodeType } from '../types/workflow';

type CanvasNode = Node<Record<string, unknown>>;

const CLUSTER_ROLES = new Set<CroxNodeType>([
  'gemini_chat_model',
  'openai_chat_model',
  'anthropic_chat_model',
  'simple_memory',
  'windowed_memory',
  'conversation_memory',
  'structured_output_parser',
  'autofix_output_parser',
  'tool_calculator',
  'tool_http_request',
  'tool_datetime',
  'tool_workflow',
  'tool_custom',
]);

function isClusterEdge(edge: Edge, nodeMap: Map<string, CanvasNode>): boolean {
  if (edge.data && (edge.data as { edgeKind?: string }).edgeKind && (edge.data as { edgeKind?: string }).edgeKind !== 'main') {
    return true;
  }
  if (typeof edge.targetHandle === 'string' && edge.targetHandle.startsWith('ai_')) return true;
  if (edge.sourceHandle === 'cluster_source') return true;
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  const srcType = src?.type === 'croxNode' ? (src.data?.nodeType as CroxNodeType | undefined) : undefined;
  const tgtType = tgt?.type === 'croxNode' ? (tgt.data?.nodeType as CroxNodeType | undefined) : undefined;
  return Boolean((srcType && CLUSTER_ROLES.has(srcType)) || (tgtType && CLUSTER_ROLES.has(tgtType)));
}

export function arrangeCanvasNodes(nodes: CanvasNode[], edges: Edge[]): CanvasNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const topLevelFunctional = nodes.filter(
    (n) =>
      n.type === 'croxNode' &&
      !n.parentId &&
      !CLUSTER_ROLES.has((n.data?.nodeType as CroxNodeType) || 'noop')
  );

  if (topLevelFunctional.length === 0) return nodes;

  const functionalIds = new Set(topLevelFunctional.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of topLevelFunctional) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  for (const e of edges) {
    if (isClusterEdge(e, nodeMap)) continue;
    if (!functionalIds.has(e.source) || !functionalIds.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  // Kahn's topological layering
  const layerByNode = new Map<string, number>();
  const queue: string[] = [];

  for (const n of topLevelFunctional) {
    if ((inDegree.get(n.id) || 0) === 0) {
      queue.push(n.id);
      layerByNode.set(n.id, 0);
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curLayer = layerByNode.get(cur) || 0;
    for (const next of outgoing.get(cur) || []) {
      layerByNode.set(next, Math.max(layerByNode.get(next) || 0, curLayer + 1));
      const nextDeg = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
      }
    }
  }

  for (const n of topLevelFunctional) {
    if (!layerByNode.has(n.id)) layerByNode.set(n.id, 0);
  }

  // Group by layer and preserve existing vertical order where possible
  const layers = new Map<number, CanvasNode[]>();
  for (const n of topLevelFunctional) {
    const l = layerByNode.get(n.id) || 0;
    const list = layers.get(l) || [];
    list.push(n);
    layers.set(l, list);
  }

  const newPosById = new Map<string, { x: number; y: number }>();
  const sortedLayerNums = Array.from(layers.keys()).sort((a, b) => a - b);

  for (const l of sortedLayerNums) {
    const column = (layers.get(l) || []).slice().sort((a, b) => a.position.y - b.position.y);
    column.forEach((n, idx) => {
      newPosById.set(n.id, {
        x: 120 + l * 330,
        y: 130 + idx * 170,
      });
    });
  }

  // Arrange sub-nodes below their attached AI Agent
  const subnodesByAgent = new Map<string, CanvasNode[]>();
  for (const e of edges) {
    if (!isClusterEdge(e, nodeMap)) continue;
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;
    const srcType = src.data?.nodeType as CroxNodeType | undefined;
    const tgtType = tgt.data?.nodeType as CroxNodeType | undefined;
    if (srcType && CLUSTER_ROLES.has(srcType) && tgt.type === 'croxNode') {
      const list = subnodesByAgent.get(tgt.id) || [];
      if (!list.some((x) => x.id === src.id)) list.push(src);
      subnodesByAgent.set(tgt.id, list);
    } else if (tgtType && CLUSTER_ROLES.has(tgtType) && src.type === 'croxNode') {
      const list = subnodesByAgent.get(src.id) || [];
      if (!list.some((x) => x.id === tgt.id)) list.push(tgt);
      subnodesByAgent.set(src.id, list);
    }
  }

  for (const [agentId, children] of subnodesByAgent.entries()) {
    const agentPos = newPosById.get(agentId) || nodeMap.get(agentId)?.position;
    if (!agentPos) continue;
    const startX = agentPos.x - ((children.length - 1) * 215) / 2;
    children.forEach((child, idx) => {
      if (!child.parentId) {
        newPosById.set(child.id, {
          x: Math.round(startX + idx * 215),
          y: agentPos.y + 205,
        });
      }
    });
  }

  return nodes.map((n) => {
    const updated = newPosById.get(n.id);
    return updated ? { ...n, position: updated } : n;
  });
}
