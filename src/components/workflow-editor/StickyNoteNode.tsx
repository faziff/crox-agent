import React from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { StickyNoteColor, StickyNoteNodeData } from '../../types/workflow';
import { useEditorActions } from './EditorActionsContext';

const COLOR_STYLES: Record<
  StickyNoteColor,
  { bg: string; border: string; swatch: string }
> = {
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800/70',
    swatch: 'bg-amber-400',
  },
  slate: {
    bg: 'bg-zinc-100 dark:bg-zinc-900',
    border: 'border-zinc-300 dark:border-zinc-700',
    swatch: 'bg-zinc-400',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-200 dark:border-rose-800/70',
    swatch: 'bg-[#E11D48]',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800/70',
    swatch: 'bg-emerald-500',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    border: 'border-sky-200 dark:border-sky-800/70',
    swatch: 'bg-sky-500',
  },
};

export const StickyNoteNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const noteData = data as unknown as StickyNoteNodeData;
  const actions = useEditorActions();
  const palette = COLOR_STYLES[noteData.color || 'amber'] || COLOR_STYLES.amber;

  return (
    <div
      className={`w-full h-full min-w-[180px] min-h-[110px] rounded-xl border ${palette.bg} ${palette.border} ${
        selected ? 'ring-2 ring-[#E11D48]/30' : ''
      } p-3 flex flex-col gap-2 shadow-xs`}
    >
      <NodeResizer
        minWidth={180}
        minHeight={110}
        isVisible={selected}
        lineClassName="!border-[#E11D48]"
        handleClassName="!w-2 !h-2 !bg-[#E11D48] !border-white"
      />

      <div className="flex items-center justify-between gap-2">
        <input
          type="text"
          value={noteData.title || ''}
          onChange={(e) => actions.onUpdateStickyNote(id, { title: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Note title..."
          className="nodrag nowheel flex-1 min-w-0 bg-transparent text-xs font-semibold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
        />

        <div className="nodrag flex items-center gap-1 shrink-0">
          {(['amber', 'slate', 'rose', 'emerald', 'sky'] as StickyNoteColor[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => actions.onUpdateStickyNote(id, { color: c })}
              className={`w-2.5 h-2.5 rounded-full ${COLOR_STYLES[c].swatch} ${
                noteData.color === c ? 'ring-1 ring-offset-1 ring-zinc-700' : 'opacity-65 hover:opacity-100'
              }`}
              title={`Color: ${c}`}
            />
          ))}
          <button
            type="button"
            onClick={() => actions.onDeleteNode(id)}
            className="ml-1 p-0.5 text-zinc-400 hover:text-red-600"
            title="Delete sticky note"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <textarea
        value={noteData.text || ''}
        onChange={(e) => actions.onUpdateStickyNote(id, { text: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Write workflow notes..."
        className="nodrag nowheel flex-1 w-full bg-transparent text-xs text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 resize-none focus:outline-none leading-relaxed"
      />
    </div>
  );
};
