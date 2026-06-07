import { FolderOpen, Layers } from 'lucide-react';
import { isFSAccessSupported } from '@/lib/fsReader';
import { LANGUAGE_CONFIG, type Language } from '@/types/graph';

interface Props {
  onOpen: (language: Language) => void;
  isLoading: boolean;
}

const ENTRIES: { language: Language; features: string[] }[] = [
  { language: 'react',  features: ['Pages & Routes', 'Components', 'Hooks', 'Stores', 'API Services'] },
  { language: 'swift',  features: ['Screens & Flow', 'ViewModels', 'Coordinators', 'State / Repos', 'Networking'] },
  { language: 'kotlin', features: ['Activities & Flow', 'ViewModels', 'Navigation', 'Repositories', 'Retrofit / API'] },
];

export function EmptyState({ onOpen, isLoading }: Props) {
  const supported = isFSAccessSupported();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-8 text-center overflow-y-auto py-12">
      <div className="flex flex-col items-center gap-3">
        <Layers size={36} className="text-blue-500" />
        <h1 className="text-2xl font-bold text-slate-100">Module Analyzer</h1>
        <p className="text-slate-400 text-sm max-w-md">
          Static analysis for your codebase — no server, no AI. Pick a platform and open a
          project folder to map its modules, screens, flow, state, and APIs.
        </p>
      </div>

      {!supported ? (
        <div className="px-4 py-3 bg-amber-950 border border-amber-700 rounded-lg text-amber-300 text-sm max-w-sm">
          File System Access API is not supported in this browser. Use Chrome, Edge, Arc, or Brave.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl">
          {ENTRIES.map(({ language, features }) => {
            const cfg = LANGUAGE_CONFIG[language];
            return (
              <button
                key={language}
                onClick={() => onOpen(language)}
                disabled={isLoading}
                className="group flex flex-col items-start gap-4 p-6 bg-slate-900 border border-slate-800 hover:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{cfg.emoji}</span>
                  <div>
                    <div className="text-base font-semibold text-slate-100">{cfg.label}</div>
                    <div className="text-xs text-slate-500">{cfg.sublabel}</div>
                  </div>
                </div>

                <ul className="text-xs text-slate-400 space-y-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-slate-600" />
                      {f}
                    </li>
                  ))}
                </ul>

                <span className="mt-auto flex items-center gap-1.5 text-xs font-medium text-blue-400 group-hover:text-blue-300">
                  <FolderOpen size={13} />
                  {isLoading ? 'Analyzing…' : 'Open folder'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-600 max-w-md">
        Everything runs in your browser. No files leave your machine.
      </p>
    </div>
  );
}
