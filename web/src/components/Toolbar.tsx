import { FolderOpen, RefreshCw, GitBranch, Network, Map, FunctionSquare, BarChart2 } from 'lucide-react';
import { useGraphStore } from '@/store/useGraphStore';
import type { ViewMode } from '@/types/graph';

interface Props {
  onOpen: () => void;
}

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode; title: string }[] = [
  { id: 'files',     label: 'Files',     icon: <Network size={13} />,        title: 'Import dependency graph' },
  { id: 'journey',   label: 'Journey',   icon: <Map size={13} />,            title: 'Page navigation flow' },
  { id: 'functions', label: 'Functions', icon: <FunctionSquare size={13} />, title: 'Function-level module map' },
  { id: 'techdebt',  label: 'Tech Debt', icon: <BarChart2 size={13} />,      title: 'Technical debt metrics' },
];

export function Toolbar({ onOpen }: Props) {
  const status = useGraphStore((s) => s.status);
  const fileCount = useGraphStore((s) => s.fileCount);
  const rootName = useGraphStore((s) => s.rootName);
  const edges = useGraphStore((s) => s.edges);
  const view = useGraphStore((s) => s.view);
  const setView = useGraphStore((s) => s.setView);
  const reset = useGraphStore((s) => s.reset);

  const isLoading = status === 'reading' || status === 'parsing' || status === 'building';
  const isDone = status === 'done';

  const statusText: Record<string, string> = {
    reading: `Reading files… (${fileCount})`,
    parsing: `Parsing ${fileCount} files…`,
    building: 'Building graph…',
  };

  return (
    <div className="flex items-center gap-3 h-12 px-4 border-b border-slate-800 bg-slate-950 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 text-slate-100 flex-shrink-0">
        <GitBranch size={15} className="text-blue-500" />
        <span className="font-semibold text-sm">MFE Analyzer</span>
      </div>

      {rootName && (
        <span className="text-xs text-slate-500 font-mono border border-slate-800 px-2 py-0.5 rounded flex-shrink-0">
          {rootName}
        </span>
      )}

      {/* View tabs — only shown when analysis is done */}
      {isDone && (
        <div className="flex items-center gap-0.5 ml-2 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          {VIEWS.map(({ id, label, icon, title }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              title={title}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === id
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {isLoading && (
        <span className="text-xs text-slate-400 animate-pulse">
          {statusText[status] ?? 'Working…'}
        </span>
      )}

      {isDone && (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{fileCount} files</span>
          <span>·</span>
          <span>{edges.length} connections</span>
        </div>
      )}

      {isDone && (
        <button
          onClick={() => { reset(); onOpen(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 border border-slate-700 hover:border-slate-500 rounded-md transition-colors"
        >
          <RefreshCw size={12} />
          Re-analyze
        </button>
      )}

      {!isDone && !isLoading && (
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
        >
          <FolderOpen size={12} />
          Open Folder
        </button>
      )}
    </div>
  );
}
