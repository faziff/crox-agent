import React from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { ChevronDown, ChevronRight, FolderTree, Trash2, Ungroup } from 'lucide-react';
import { GroupNodeData } from '../../types/workflow';
import { useEditorActions } from './EditorActionsContext';

const GROUP_PALETTES: Record<
  NonNullable<GroupNodeData['color']>,
  { bg: string; border: string; headerBg: string; swatch: string }
> = {
  zinc: {
    bg: 'bg-zinc-50/60 dark:bg-zinc-900/35',
    border: 'border-zinc-300 dark:border-zinc-700',
    headerBg: 'bg-zinc-100/90 dark:bg-zinc-900/90',
    swatch: 'bg-zinc-400',
  },
  rose: {
    bg: 'bg-rose-50/45 dark:bg-rose-950/20',
    border: 'border-rose-300 dark:border-rose-800/70',
    headerBg: 'bg-rose-50/90 dark:bg-rose-950/50',
    swatch: 'bg-[#E11D48]',
  },
  blue: {
    bg: 'bg-sky-50/45 dark:bg-sky-950/20',
    border: 'border-sky-300 dark:border-sky-800/70',
    headerBg: 'bg-sky-50/90 dark:bg-sky-950/50',
    swatch: 'bg-sky-500',
  },
  emerald: {
    bg: 'bg-emerald-50/45 dark:bg-emerald-950/20',
    border: 'border-emerald-300 dark:border-emerald-800/70',
    headerBg: 'bg-emerald-50/90 dark:bg-emerald-950/50',
    swatch: 'bg-emerald-500',
  },
  amber: {
    bg: 'bg-amber-50/45 dark:bg-amber-950/20',
    border: 'border-amber-300 dark:border-amber-800/70',
    headerBg: 'bg-amber-50/90 dark:bg-amber-950/50',
    swatch: 'bg-amber-500',
  },
};

export const GroupNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const groupData = data as unknown as GroupNodeData;
  const actions = useEditorActions();
  const colorKey = groupData.color || 'zinc';
  const palette = GROUP_PALETTES[colorKey] || GROUP_PALETTES.zinc;
  const collapsed = Boolean(groupData.collapsed);

  return (
    <div
      className={`w-full h-full min-w-[280px] rounded-2xl border border-dashed ${palette.bg} ${palette.border} ${
        selected ? 'ring-2 ring-[#E11D48]/30' : ''
      } flex flex-col overflow-hidden transition-colors`}
    >
      {!collapsed && (
        <NodeResizer
          minWidth={280}
          minHeight={180}
          isVisible={selected}
          lineClassName="!border-[#E11D48]"
          handleClassName="!w-2.5 !h-2.5 !bg-[#E11D48] !border-white"
        />
      )}

      <div
        className={`px-3 py-2 border-b ${
          collapsed ? 'border-transparent' : palette.border
        } ${palette.headerBg} flex items-center justify-between gap-2`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actions.onToggleCollapseGroup(id);
            }}
            className="nodrag p-0.5 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            title={collapsed ? 'Expand group' : 'Collapse group'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <FolderTree className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            type="text"
            value={groupData.title || ''}
            onChange={(e) => actions.onUpdateGroupNode(id, { title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Group name..."
            className="nodrag nowheel flex-1 min-w-0 bg-transparent text-xs font-semibold text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
          />
        </div>

        <div className="nodrag flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {(['zinc', 'rose', 'blue', 'emerald', 'amber'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => actions.onUpdateGroupNode(id, { color: c })}
              className={`w-2.5 h-2.5 rounded-full ${GROUP_PALETTES[c].swatch} ${
                colorKey === c ? 'ring-1 ring-offset-1 ring-zinc-700' : 'opacity-65 hover:opacity-100'
              }`}
              title={`Group color: ${c}`}
            />
          ))}
          <button
            type="button"
            onClick={() => actions.onUngroupNode(id)}
            className="ml-1 p-1 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            title="Ungroup nodes"
          >
            <Ungroup className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => actions.onDeleteNode(id)}
            className="p-1 rounded text-zinc-500 hover:text-red-600"
            title="Delete group frame"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {collapsed && (
        <div className="px-3 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          Collapsed group · Click chevron to expand steps
        </div>
      )}
    </div>
  );
};
