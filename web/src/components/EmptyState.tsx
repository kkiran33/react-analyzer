import { FolderOpen, GitBranch, Layers } from 'lucide-react';
import { isFSAccessSupported } from '@/lib/fsReader';

interface Props {
  onOpen: () => void;
  isLoading: boolean;
}

export function EmptyState({ onOpen, isLoading }: Props) {
  const supported = isFSAccessSupported();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8 text-center">
      <div className="flex items-center gap-3 text-slate-500">
        <GitBranch size={28} />
        <Layers size={32} className="text-blue-500" />
        <GitBranch size={28} className="scale-x-[-1]" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">MFE Analyzer</h1>
        <p className="text-slate-400 text-sm max-w-xs">
          Open a React codebase to visualize how your modules, components, and hooks connect.
        </p>
      </div>

      {supported ? (
        <button
          onClick={onOpen}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm"
        >
          <FolderOpen size={16} />
          {isLoading ? 'Analyzing…' : 'Open Folder'}
        </button>
      ) : (
        <div className="px-4 py-3 bg-amber-950 border border-amber-700 rounded-lg text-amber-300 text-sm max-w-xs">
          File System Access API is not supported in this browser. Use Chrome, Edge, or Arc.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 text-xs text-slate-500 max-w-sm">
        {[
          { icon: '📄', label: 'Pages & Routes' },
          { icon: '🧩', label: 'Components' },
          { icon: '🪝', label: 'Custom Hooks' },
          { icon: '🗄️', label: 'State Stores' },
          { icon: '🔌', label: 'API Services' },
          { icon: '🔗', label: 'Import Graph' },
        ].map(({ icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="text-lg">{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
