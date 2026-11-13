import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Sparkles, Star, StickyNote, X } from 'lucide-react';
import { CATEGORY_LABELS, NODE_CATALOG, NodeCatalogEntry, getCatalogEntry } from '../../constants/nodeCatalog';
import { getCategoryIconBadgeClass, getNodeIcon } from '../../constants/nodeIcons';
import { ClusterRole, CroxNodeType } from '../../types/workflow';

const FAVORITES_KEY = 'crox_favorite_nodes';
const RECENT_KEY = 'crox_recent_nodes';

function readStoredList(key: string): CroxNodeType[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CroxNodeType[]) : [];
  } catch {
    return [];
  }
}

interface NodePickerPanelProps {
  open: boolean;
  mode: 'sidebar' | 'modal';
  sourceNodeType?: CroxNodeType | null;
  clusterRoleFilter?: ClusterRole | null;
  onSelectNode: (nodeType: CroxNodeType) => void;
  onAddStickyNote?: () => void;
  onClose?: () => void;
}

export const NodePickerPanel: React.FC<NodePickerPanelProps> = ({
  open,
  mode,
  sourceNodeType,
  clusterRoleFilter,
  onSelectNode,
  onAddStickyNote,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<CroxNodeType[]>(() => readStoredList(FAVORITES_KEY));
  const [recents, setRecents] = useState<CroxNodeType[]>(() => readStoredList(RECENT_KEY));

  const toggleFavorite = (e: React.MouseEvent, type: CroxNodeType) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [type, ...prev].slice(0, 8);
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handlePick = (type: CroxNodeType) => {
    setRecents((prev) => {
      const next = [type, ...prev.filter((t) => t !== type)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    onSelectNode(type);
  };

  const suggestedEntries = useMemo(() => {
    if (!sourceNodeType || clusterRoleFilter) return [];
    const entry = getCatalogEntry(sourceNodeType);
    return (entry.suggestedNext || []).map((t) => getCatalogEntry(t));
  }, [sourceNodeType, clusterRoleFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return NODE_CATALOG.filter((item) => {
      if (clusterRoleFilter && item.clusterRole !== clusterRoleFilter) return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.shortDescription.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.searchTerms || []).some((term) => term.toLowerCase().includes(q))
      );
    });
  }, [search, clusterRoleFilter]);

  if (!open) return null;

  const categories: Array<NodeCatalogEntry['category']> = [
    'triggers',
    'ai',
    'integrations',
    'core',
    'flow',
    'communication',
  ];

  const renderNodeCard = (item: NodeCatalogEntry) => {
    const Icon = getNodeIcon(item.type);
    const isFav = favorites.includes(item.type);
    return (
      <div
        key={item.type}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/crox-node', item.type);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => handlePick(item.type)}
        className="group p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 hover:bg-white dark:hover:bg-zinc-900 hover:border-[#E11D48]/60 hover:shadow-xs cursor-pointer transition-all duration-150"
      >
        <div className="flex items-start gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${getCategoryIconBadgeClass(
              item.category,
              item.clusterRole
            )}`}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {item.label}
              </p>
              <button
                type="button"
                onClick={(e) => toggleFavorite(e, item.type)}
                className={`p-0.5 rounded transition-opacity ${
                  isFav ? 'opacity-100 text-amber-500' : 'opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-amber-500'
                }`}
                title={isFav ? 'Remove favorite' : 'Star favorite'}
              >
                <Star className={`w-3 h-3 ${isFav ? 'fill-amber-400' : ''}`} />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5 line-clamp-2">
              {item.shortDescription}
            </p>
            {(item.requiresCredential || item.clusterRole === 'languageModel') && (
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                {item.clusterRole === 'languageModel' ? 'AI Provider Connection' : item.type === 'integration_action' ? 'App Credential' : 'Credential Required'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const innerBody = (
    <>
      <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {clusterRoleFilter ? `Attach ${clusterRoleFilter}` : 'Node Library'}
            </h3>
            {sourceNodeType && !clusterRoleFilter && (
              <p className="text-[11px] text-[#E11D48] mt-0.5">
                Auto-connects after {getCatalogEntry(sourceNodeType).label}
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close node library"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus={mode === 'modal'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${NODE_CATALOG.length}+ nodes, apps, and models...`}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#E11D48]/20 focus:border-[#E11D48]"
          />
        </div>

        {onAddStickyNote && !clusterRoleFilter && (
          <button
            type="button"
            onClick={onAddStickyNote}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-50 transition-colors"
          >
            <StickyNote className="w-3.5 h-3.5" />
            <span>Add Sticky Note</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {suggestedEntries.length > 0 && !search.trim() && (
          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[#E11D48] flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Suggested Next
            </p>
            <div className="space-y-1.5">{suggestedEntries.map(renderNodeCard)}</div>
          </div>
        )}

        {!search.trim() && !clusterRoleFilter && favorites.length > 0 && (
          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Favorites
            </p>
            <div className="space-y-1.5">
              {favorites.map((t) => renderNodeCard(getCatalogEntry(t)))}
            </div>
          </div>
        )}

        {!search.trim() && !clusterRoleFilter && recents.length > 0 && (
          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Recently Used
            </p>
            <div className="flex flex-wrap gap-1.5 px-1">
              {recents.map((t) => {
                const entry = getCatalogEntry(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handlePick(t)}
                    className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:border-[#E11D48] text-[11px] font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {categories.map((cat) => {
          const items = filtered.filter((i) => i.category === cat);
          if (items.length === 0) return null;
          const isCollapsed = Boolean(collapsed[cat]) && !search.trim() && !clusterRoleFilter;
          return (
            <div key={cat} className="space-y-2">
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [cat]: !p[cat] }))}
                className="w-full flex items-center justify-between px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                <span>{CATEGORY_LABELS[cat]}</span>
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {!isCollapsed && <div className="space-y-1.5">{items.map(renderNodeCard)}</div>}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center text-xs text-zinc-500 py-8">No nodes match &ldquo;{search}&rdquo;.</p>
        )}
      </div>
    </>
  );

  if (mode === 'modal') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md max-h-[82vh] rounded-2xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {innerBody}
        </div>
      </div>
    );
  }

  return (
    <aside className="w-[272px] shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141416] flex flex-col z-20">
      {innerBody}
    </aside>
  );
};
