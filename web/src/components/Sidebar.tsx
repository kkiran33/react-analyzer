import { Search, Eye, EyeOff, Download } from 'lucide-react';
import { useGraphStore } from '@/store/useGraphStore';
import { FILE_TYPE_CONFIG, typeLabel, type FileType } from '@/types/graph';
import {
  generateModuleDiagram,
  generateJourneyDiagram,
  generateClassDiagram,
  downloadPlantUml,
} from '@/lib/plantUmlGenerator';

const TYPE_ORDER: FileType[] = [
  'page', 'component', 'hook', 'store', 'service', 'router', 'config', 'util', 'test',
];

function DiagramDownload({ label, desc, filename, generate }: {
  label: string; desc: string; filename: string; generate: () => string;
}) {
  return (
    <div className="p-3 border-t border-slate-800 mt-auto flex-shrink-0">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">PlantUML</p>
      <button
        onClick={() => downloadPlantUml(filename, generate())}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-pink-900 rounded-md text-slate-400 hover:text-pink-300 transition-colors text-left"
      >
        <Download size={11} className="flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-medium truncate">{label}</div>
          <div className="text-slate-600 truncate">{desc}</div>
        </div>
      </button>
    </div>
  );
}

export function Sidebar() {
  const status = useGraphStore((s) => s.status);
  const view = useGraphStore((s) => s.view);
  const files = useGraphStore((s) => s.files);
  const language = useGraphStore((s) => s.language);
  const enabledTypes = useGraphStore((s) => s.enabledTypes);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const toggleType = useGraphStore((s) => s.toggleType);
  const setSearch = useGraphStore((s) => s.setSearch);

  if (status !== 'done') return null;

  if (view === 'journey') return <JourneySidebar files={files} />;
  if (view === 'functions') return <FunctionsSidebar files={files} />;
  if (view === 'techdebt') return <TechDebtSidebar />;

  // Files view
  const counts: Partial<Record<FileType, number>> = {};
  for (const f of files.values()) {
    counts[f.type] = (counts[f.type] ?? 0) + 1;
  }
  const allOn = enabledTypes.size === TYPE_ORDER.length;

  return (
    <div className="w-52 flex-shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950">
      <div className="p-3 border-b border-slate-800">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Types</span>
        <button
          onClick={() => TYPE_ORDER.forEach((t) => { const on = enabledTypes.has(t); if (allOn ? true : !on) toggleType(t); })}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
        >
          {allOn ? <EyeOff size={11} /> : <Eye size={11} />}
          {allOn ? 'Hide all' : 'Show all'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {TYPE_ORDER.map((type) => {
          const count = counts[type] ?? 0;
          if (count === 0) return null;
          const cfg = FILE_TYPE_CONFIG[type];
          const active = enabledTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors text-xs ${
                active ? 'bg-slate-800 hover:bg-slate-700' : 'opacity-40 hover:opacity-60 hover:bg-slate-900'
              }`}
            >
              <span style={{ background: cfg.color }} className="w-2.5 h-2.5 rounded-full flex-shrink-0" />
              <span className="flex-1 text-slate-200 font-medium">{typeLabel(type, language)}</span>
              <span className="text-slate-500 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      <DiagramDownload
        label="Module Map"
        desc="All files + import dependencies"
        filename="module-map.puml"
        generate={() => generateModuleDiagram(files)}
      />
    </div>
  );
}

function JourneySidebar({ files }: { files: Map<string, import('@/types/graph').ParsedFile> }) {
  const totalRoutes = new Set([...files.values()].flatMap(f => f.routes)).size;
  const totalNavLinks = [...files.values()].reduce((n, f) => n + f.navLinks.length, 0);
  const protectedCount = [...files.values()].filter(f =>
    f.routes.length > 0 && f.imports.some(i => /PrivateRoute|AuthRoute|RequireAuth/.test(i.raw))
  ).length;

  return (
    <div className="w-52 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-950">
      <div className="p-3 border-b border-slate-800">
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Journey</p>
        <div className="space-y-2">
          <Stat label="Routes" value={totalRoutes} color="#3B82F6" />
          <Stat label="Protected" value={protectedCount} color="#EF4444" />
          <Stat label="Nav links" value={totalNavLinks} color="#10B981" />
        </div>
      </div>

      <div className="p-3 space-y-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Legend</p>
        <LegendRow color="#475569" dash label="Route nesting" />
        <LegendRow color="#10B981" label="&lt;Link&gt; navigation" />
        <LegendRow color="#3B82F6" animated label="navigate() call" />
        <div className="mt-4 space-y-1.5 text-xs text-slate-500">
          <p><span style={{ color: '#94a3b8' }}>L0</span> = root, <span style={{ color: '#8b5cf6' }}>L1</span> = top-level, …</p>
          <p>Badge shows nesting depth.</p>
        </div>
      </div>
      <DiagramDownload
        label="Journey Map"
        desc="Routes as state machine"
        filename="journey-map.puml"
        generate={() => generateJourneyDiagram(files)}
      />
    </div>
  );
}

function FunctionsSidebar({ files }: { files: Map<string, import('@/types/graph').ParsedFile> }) {
  const allFns = [...files.values()].flatMap(f => f.allFunctions);
  const components = allFns.filter(f => f.kind === 'component').length;
  const hooks = allFns.filter(f => f.kind === 'hook').length;
  const asyncFns = allFns.filter(f => f.kind === 'async').length;
  const utilFns = allFns.filter(f => f.kind === 'function').length;
  const exported = allFns.filter(f => f.isExported).length;

  return (
    <div className="w-52 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-950">
      <div className="p-3 border-b border-slate-800">
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Functions</p>
        <div className="space-y-2">
          <Stat label="Components" value={components} color="#10B981" />
          <Stat label="Hooks" value={hooks} color="#F59E0B" />
          <Stat label="Async fns" value={asyncFns} color="#3B82F6" />
          <Stat label="Utilities" value={utilFns} color="#94A3B8" />
          <Stat label="Exported" value={exported} color="#8B5CF6" />
        </div>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Badge key</p>
        {[
          { badge: 'C', color: '#10B981', label: 'Component' },
          { badge: 'H', color: '#F59E0B', label: 'Hook' },
          { badge: 'A', color: '#3B82F6', label: 'Async fn' },
          { badge: 'F', color: '#94A3B8', label: 'Function' },
        ].map(({ badge, color, label }) => (
          <div key={badge} className="flex items-center gap-2">
            <span style={{ background: color + '25', color, fontFamily: 'monospace' }}
              className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded">
              {badge}
            </span>
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>
      <DiagramDownload
        label="Interface Map"
        desc="TypeScript interfaces + components"
        filename="interface-map.puml"
        generate={() => generateClassDiagram(files)}
      />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span style={{ color }} className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function TechDebtSidebar() {
  const techDebt = useGraphStore((s) => s.techDebt);
  const rows = Array.from(techDebt.values());
  const avgScore = rows.length ? Math.round(rows.reduce((s, m) => s + m.debtScore, 0) / rows.length) : 0;
  const circularCount = rows.filter(m => m.circularWith.length > 0).length;
  const noTestCount = rows.filter(m => !m.hasTest).length;
  const criticalCount = rows.filter(m => m.debtScore > 60).length;

  const scoreColor = (s: number) =>
    s <= 20 ? '#10B981' : s <= 40 ? '#84CC16' : s <= 60 ? '#F59E0B' : s <= 80 ? '#EF4444' : '#DC2626';

  return (
    <div className="w-52 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-950">
      <div className="p-3 border-b border-slate-800 space-y-2">
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Summary</p>
        <Stat label="Avg Score" value={avgScore} color={scoreColor(avgScore)} />
        <Stat label="Circular Deps" value={circularCount} color={circularCount > 0 ? '#EF4444' : '#10B981'} />
        <Stat label="No Test File" value={noTestCount} color={noTestCount > 0 ? '#F59E0B' : '#10B981'} />
        <Stat label="Critical" value={criticalCount} color={criticalCount > 0 ? '#DC2626' : '#10B981'} />
      </div>
      <div className="p-3 space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Score Legend</p>
        {[
          { label: 'Clean', range: '0–20', color: '#10B981' },
          { label: 'Low',   range: '21–40', color: '#84CC16' },
          { label: 'Medium',range: '41–60', color: '#F59E0B' },
          { label: 'High',  range: '61–80', color: '#EF4444' },
          { label: 'Critical',range:'81–100',color: '#DC2626' },
        ].map(({ label, range, color }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span style={{ background: color }} className="w-2 h-2 rounded-full" />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
            <span className="text-xs text-slate-600">{range}</span>
          </div>
        ))}
      </div>
      <div className="p-3 text-xs text-slate-600 border-t border-slate-800">
        Click any row to jump to the file in the Files graph.
      </div>
    </div>
  );
}

function LegendRow({ color, dash, animated, label }: { color: string; dash?: boolean; animated?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="10">
        <line
          x1="0" y1="5" x2="24" y2="5"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={dash ? '3,3' : undefined}
        >
          {animated && (
            <animate attributeName="stroke-dashoffset" values="6;0" dur="0.8s" repeatCount="indefinite" />
          )}
        </line>
      </svg>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}
