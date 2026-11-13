import React, { createContext, useContext } from 'react';
import {
  ClusterRole,
  EdgeKind,
  GroupNodeData,
  StickyNoteNodeData,
  ValidationIssue,
} from '../../types/workflow';

export interface EditorActionsContextValue {
  onTestNodeById: (nodeId: string) => void;
  onRunFromNodeById: (nodeId: string) => void;
  onToggleDisableNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onOpenAddNextNode: (sourceNodeId: string, sourceHandle?: string) => void;
  onOpenAttachClusterNode: (agentNodeId: string, role: ClusterRole, targetHandle: EdgeKind) => void;
  onUpdateStickyNote: (nodeId: string, patch: Partial<StickyNoteNodeData>) => void;
  onUpdateGroupNode: (nodeId: string, patch: Partial<GroupNodeData>) => void;
  onToggleCollapseGroup: (groupId: string) => void;
  onUngroupNode: (groupId: string) => void;
  validationIssuesByNode: Record<string, ValidationIssue[]>;
}

const NOOP = () => {};

const EditorActionsContext = createContext<EditorActionsContextValue>({
  onTestNodeById: NOOP,
  onRunFromNodeById: NOOP,
  onToggleDisableNode: NOOP,
  onDeleteNode: NOOP,
  onOpenAddNextNode: NOOP,
  onOpenAttachClusterNode: NOOP,
  onUpdateStickyNote: NOOP,
  onUpdateGroupNode: NOOP,
  onToggleCollapseGroup: NOOP,
  onUngroupNode: NOOP,
  validationIssuesByNode: {},
});

export const EditorActionsProvider: React.FC<{
  value: EditorActionsContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <EditorActionsContext.Provider value={value}>{children}</EditorActionsContext.Provider>
);

export function useEditorActions(): EditorActionsContextValue {
  return useContext(EditorActionsContext);
}
