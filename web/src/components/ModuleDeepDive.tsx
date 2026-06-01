import { useState, useMemo } from 'react';
import {
  X, FileCode, ArrowRight, ArrowLeft, Package,
  AlertTriangle, Download, Copy, Check,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { useGraphStore } from '@/store/useGraphStore';
import { FILE_TYPE_CONFIG, type ParsedFile, type FunctionDef } from '@/types/graph';
import { computeImpact } from '@/lib/impactAnalyzer';
import { generateSpecDoc, generateBRD, generateSITCases, generateUATCases, downloadMarkdown } from '@/lib/docGenerator';

type TabId = 'overview' | 'logic' | 'impact' | 'spec' | 'generate';

// ─── Hook purpose ─────────────────────────────────────────────────────────────

const HOOK_PURPOSE: Record<string, string> = {
  useState: 'state', useReducer: 'state', useImperativeHandle: 'state',
  useEffect: 'side-effect', useLayoutEffect: 'side-effect', useInsertionEffect: 'side-effect',
  useQuery: 'data-fetch', useMutation: 'data-fetch', useInfiniteQuery: 'data-fetch',
  useSWR: 'data-fetch', useSWRInfinite: 'data-fetch', useFetch: 'data-fetch',
  useSubscription: 'data-fetch', useLazyQuery: 'data-fetch',
  useCallback: 'performance', useMemo: 'performance', useTransition: 'performance',
  useDeferredValue: 'performance',
  useContext: 'context',
  useRef: 'ref', useId: 'ref',
  useNavigate: 'navigation', useLocation: 'navigation', useParams: 'navigation',
  useSearchParams: 'navigation', useRouter: 'navigation', usePathname: 'navigation',
  useHistory: 'navigation',
  useForm: 'form', useController: 'form', useFormContext: 'form',
  useWatch: 'form', useField: 'form', useFieldArray: 'form',
};

const PURPOSE_COLOR: Record<string, string> = {
  'state': '#3B82F6', 'side-effect': '#EF4444', 'data-fetch': '#8B5CF6',
  'performance': '#F59E0B', 'context': '#10B981', 'ref': '#64748B',
  'navigation': '#EC4899', 'form': '#06B6D4', 'custom': '#475569',
};

const PURPOSE_LABEL: Record<string, string> = {
  'state': 'State', 'side-effect': 'Side Effect', 'data-fetch': 'Data Fetch',
  'performance': 'Performance', 'context': 'Context', 'ref': 'Ref',
  'navigation': 'Navigation', 'form': 'Form', 'custom': 'Custom',
};

function getHookPurpose(name: string): string {
  if (HOOK_PURPOSE[name]) return HOOK_PURPOSE[name];
  if (/^use(Query|Fetch|Get|Load|Request)/.test(name)) return 'data-fetch';
  if (/^use(State|Reducer|Toggle|Boolean)/.test(name)) return 'state';
  if (/^use(Navigate|Router|Route|Location|Path)/.test(name)) return 'navigation';
  return 'custom';
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ModuleDeepDive() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const files = useGraphStore((s) => s.files);
  const techDebt = useGraphStore((s) => s.techDebt);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);

  const file = selectedNodeId ? files.get(selectedNodeId) : null;
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  if (!file) return null;

  const cfg = FILE_TYPE_CONFIG[file.type];
  const metrics = techDebt.get(file.id);

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logic',    label: 'Logic' },
    { id: 'impact',   label: 'Impact' },
    { id: 'spec',     label: 'Spec' },
    { id: 'generate', label: 'Generate' },
  ];

  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-800 flex flex-col overflow-hidden bg-slate-950">
      {/* Header */}
      <div className="flex items-start justify-between p-3 border-b border-slate-800 flex-shrink-0">
        <div className="flex-1 min-w-0 mr-2">
          <div className="flex items-center gap-2 mb-1">
            <span style={{ background: cfg.color, color: '#000' }} className="text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
              {cfg.label}
            </span>
            {metrics && (
              <span className="text-xs font-bold" style={{ color: debtColor(metrics.debtScore) }}>
                {metrics.debtScore}
              </span>
            )}
          </div>
          <h2 className="text-slate-100 font-mono font-semibold text-sm truncate">
            {file.name}.{file.extension}
          </h2>
          <p className="text-slate-600 text-xs truncate mt-0.5">{file.path}</p>
        </div>
        <button onClick={() => setSelectedNode(null)} className="text-slate-600 hover:text-slate-400 flex-shrink-0 p-0.5">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 flex-shrink-0 overflow-x-auto">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'text-slate-100 border-b-2 border-blue-500'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab file={file} files={files} metrics={metrics} />}
        {activeTab === 'logic'    && <LogicTab file={file} />}
        {activeTab === 'impact'   && <ImpactTab file={file} files={files} />}
        {activeTab === 'spec'     && <SpecTab file={file} files={files} metrics={metrics} />}
        {activeTab === 'generate' && <GenerateTab file={file} files={files} metrics={metrics} />}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ file, files, metrics }: { file: ParsedFile; files: Map<string, ParsedFile>; metrics?: import('@/types/graph').TechDebtMetrics }) {
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const importedBy = [...files.values()].filter((f: ParsedFile) => f.resolvedImports.includes(file.id));
  const internalImports = file.imports.filter(i => i.isRelative);
  const externalImports = file.imports.filter(i => !i.isRelative);
  const cfg = FILE_TYPE_CONFIG[file.type];

  return (
    <div className="p-4 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-px bg-slate-800 rounded overflow-hidden">
        {[
          { label: 'LOC', value: file.linesOfCode },
          { label: 'Fan-in', value: metrics?.fanIn ?? importedBy.length },
          { label: 'Fan-out', value: file.resolvedImports.length },
          { label: 'Components', value: file.components.length },
          { label: 'Hooks', value: file.hooks.length },
          { label: 'Routes', value: file.routes.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-950 p-2.5 text-center">
            <div className="text-base font-bold text-slate-100">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Debt score */}
      {metrics && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Debt Score</span>
            <span className="text-xs font-bold" style={{ color: debtColor(metrics.debtScore) }}>
              {metrics.debtScore}/100 — {debtBand(metrics.debtScore)}
            </span>
          </div>
          <div className="bg-slate-800 rounded-full h-2">
            <div
              className="h-full rounded-full"
              style={{ width: `${metrics.debtScore}%`, background: debtColor(metrics.debtScore) }}
            />
          </div>
          {metrics.flags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {metrics.flags.map(f => (
                <span key={f} className="text-xs px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-amber-400">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Internal imports */}
      {internalImports.length > 0 && (
        <Section icon={<ArrowLeft size={12} className="text-slate-400" />} title={`Imports (${internalImports.length})`}>
          {internalImports.map(i => {
            const resolved = file.resolvedImports.find(r => {
              const parts = r.split('/'); return parts[parts.length - 1].startsWith(i.raw.split('/').pop()?.split('.')[0] ?? '');
            });
            const target = resolved ? files.get(resolved) : undefined;
            return (
              <button key={i.raw} onClick={() => resolved && setSelectedNode(resolved)}
                disabled={!resolved}
                className={`block w-full text-left truncate text-xs font-mono px-2 py-1 rounded transition-colors ${resolved ? 'text-slate-300 hover:bg-slate-800 cursor-pointer' : 'text-slate-600 cursor-default'}`}
                title={i.raw}
              >
                {target ? <span style={{ color: FILE_TYPE_CONFIG[target.type].color }}>{target.name}</span> : i.raw}
              </button>
            );
          })}
        </Section>
      )}

      {/* Used by */}
      {importedBy.length > 0 && (
        <Section icon={<Package size={12} className="text-slate-400" />} title={`Used by (${importedBy.length})`}>
          {importedBy.map(f => (
            <button key={f.id} onClick={() => setSelectedNode(f.id)}
              className="block w-full text-left truncate text-xs font-mono px-2 py-1 rounded hover:bg-slate-800 transition-colors">
              <span style={{ color: FILE_TYPE_CONFIG[f.type].color }}>{f.name}</span>
            </button>
          ))}
        </Section>
      )}

      {/* Exports */}
      {file.exports.length > 0 && (
        <Section icon={<ArrowRight size={12} className="text-slate-400" />} title="Exports">
          {file.exports.map(e => <CodeTag key={e} text={e} color={cfg.color} />)}
        </Section>
      )}

      {/* External packages */}
      {externalImports.length > 0 && (
        <Section icon={<Package size={12} className="text-slate-500" />} title="NPM packages">
          <div className="flex flex-wrap gap-1">
            {externalImports.map(i => (
              <span key={i.raw} className="text-xs font-mono px-1.5 py-0.5 bg-slate-900 text-slate-500 border border-slate-800 rounded">
                {i.raw}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Logic tab ────────────────────────────────────────────────────────────────

const KIND_COLOR: Record<FunctionDef['kind'], string> = {
  component: '#10B981', hook: '#F59E0B', async: '#3B82F6', function: '#94A3B8',
};
const KIND_LABEL: Record<FunctionDef['kind'], string> = {
  component: 'C', hook: 'H', async: 'A', function: 'F',
};

function LogicTab({ file }: { file: ParsedFile }) {
  const hooksByPurpose = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const h of file.hooks) {
      const p = getHookPurpose(h);
      if (!groups[p]) groups[p] = [];
      groups[p].push(h);
    }
    return groups;
  }, [file.hooks]);

  const exported = file.allFunctions.filter(f => f.isExported);
  const internal = file.allFunctions.filter(f => !f.isExported);

  return (
    <div className="p-4 space-y-5">
      {/* AST badge */}
      {file.astParsed && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          AST parsed — full accuracy
        </div>
      )}

      {/* Component props (AST only) */}
      {file.componentInfo.length > 0 && (
        <div className="space-y-3">
          {file.componentInfo.map(ci => (
            <div key={ci.name} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              {/* Component header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800">
                <span className="text-xs font-bold text-emerald-400 font-mono">{ci.name}</span>
                {ci.isDefaultExport && (
                  <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">default</span>
                )}
                {ci.isWrapped && (
                  <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    {ci.wrapperName ?? 'wrapped'}
                  </span>
                )}
                {ci.propsTypeName && ci.props.length === 0 && (
                  <span className="text-xs text-slate-500 font-mono ml-auto">{ci.propsTypeName}</span>
                )}
              </div>
              {/* Props table */}
              {ci.props.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Prop</th>
                      <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Type</th>
                      <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Req</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ci.props.map(prop => (
                      <tr key={prop.name} className="border-b border-slate-800 last:border-0">
                        <td className="px-3 py-1 font-mono text-slate-200">
                          {prop.name}
                          {!prop.required && <span className="text-slate-600">?</span>}
                        </td>
                        <td className="px-3 py-1 font-mono text-purple-400 truncate max-w-[100px]" title={prop.type}>
                          {prop.type}
                        </td>
                        <td className="px-3 py-1">
                          {prop.required
                            ? <span className="text-amber-500">✓</span>
                            : <span className="text-slate-600">–</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-3 py-2 text-xs text-slate-600">
                  {ci.propsTypeName
                    ? `Props type: ${ci.propsTypeName} (defined elsewhere)`
                    : 'No props'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Defined hooks (AST only) */}
      {file.definedHooks.length > 0 && (
        <Section icon={<span className="text-amber-400 text-xs">⚡</span>} title={`Defines (${file.definedHooks.length} hook${file.definedHooks.length > 1 ? 's' : ''})`}>
          {file.definedHooks.map(h => <CodeTag key={h} text={h} color="#F59E0B" />)}
        </Section>
      )}

      {/* Functions */}
      {exported.length > 0 && (
        <Section icon={<FileCode size={12} className="text-slate-400" />} title={`Exported (${exported.length})`}>
          {exported.map(fn => <FnRow key={fn.name} fn={fn} />)}
        </Section>
      )}

      {internal.length > 0 && (
        <Section icon={<FileCode size={12} className="text-slate-600" />} title={`Internal (${internal.length})`}>
          {internal.map(fn => <FnRow key={fn.name} fn={fn} />)}
        </Section>
      )}

      {file.allFunctions.length === 0 && (
        <div className="text-xs text-slate-600">No functions detected in this file.</div>
      )}

      {/* Hooks by purpose */}
      {Object.keys(hooksByPurpose).length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs">🪝</span>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Hooks by Purpose</span>
          </div>
          <div className="space-y-2">
            {Object.entries(hooksByPurpose).map(([purpose, hooks]) => (
              <div key={purpose}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span style={{ background: PURPOSE_COLOR[purpose] + '25', color: PURPOSE_COLOR[purpose] }}
                    className="text-xs font-bold px-1.5 py-0.5 rounded">
                    {PURPOSE_LABEL[purpose] ?? purpose}
                  </span>
                </div>
                <div className="pl-2 space-y-0.5">
                  {hooks.map(h => (
                    <div key={h} className="text-xs font-mono" style={{ color: PURPOSE_COLOR[purpose] }}>
                      {h}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Components (fallback when no AST componentInfo) */}
      {file.componentInfo.length === 0 && file.components.length > 0 && (
        <Section icon={<span className="text-xs">🧩</span>} title="Components">
          {file.components.map(c => <CodeTag key={c} text={c} color="#10B981" />)}
        </Section>
      )}

      {/* Routes */}
      {file.routes.length > 0 && (
        <Section icon={<span className="text-xs">🔀</span>} title="Routes">
          {file.routes.map(r => <CodeTag key={r} text={r} color="#10B981" mono />)}
        </Section>
      )}
    </div>
  );
}

function FnRow({ fn }: { fn: FunctionDef }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span style={{ background: KIND_COLOR[fn.kind] + '25', color: KIND_COLOR[fn.kind] }}
        className="text-xs font-bold w-4 h-4 flex items-center justify-center rounded flex-shrink-0">
        {KIND_LABEL[fn.kind]}
      </span>
      <span style={{ color: KIND_COLOR[fn.kind] }} className="text-xs font-mono truncate">
        {fn.name}
      </span>
    </div>
  );
}

// ─── Impact tab ───────────────────────────────────────────────────────────────

function ImpactTab({ file, files }: { file: ParsedFile; files: Map<string, ParsedFile> }) {
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const [showAll, setShowAll] = useState(false);

  const impact = useMemo(() => computeImpact(file.id, files), [file.id, files]);

  const severityLabel = () => {
    if (impact.totalImpact === 0) return { text: 'Leaf node — safe to modify', color: '#10B981' };
    if (impact.totalImpact <= 5) return { text: 'Low impact', color: '#84CC16' };
    if (impact.totalImpact <= 20) return { text: 'Moderate — review before changing', color: '#F59E0B' };
    return { text: 'High impact — changes cascade widely', color: '#EF4444' };
  };

  const sev = severityLabel();
  const transitiveToShow = showAll ? impact.transitive : impact.transitive.slice(0, 10);

  return (
    <div className="p-4 space-y-4">
      <div className="p-3 rounded-lg border" style={{ borderColor: sev.color + '40', background: sev.color + '10' }}>
        <div className="flex items-center gap-2">
          {impact.totalImpact > 5 && <AlertTriangle size={13} style={{ color: sev.color }} />}
          <span className="text-xs font-medium" style={{ color: sev.color }}>{sev.text}</span>
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {impact.direct.length} direct · {impact.transitive.length} transitive
        </div>
      </div>

      {impact.direct.length > 0 && (
        <Section icon={<span className="text-orange-400 text-xs">●</span>} title={`Direct (${impact.direct.length})`}>
          {impact.direct.map(id => {
            const f = files.get(id);
            return f ? (
              <button key={id} onClick={() => setSelectedNode(id)}
                className="block w-full text-left truncate text-xs font-mono px-2 py-1 rounded hover:bg-slate-800 transition-colors">
                <span style={{ color: FILE_TYPE_CONFIG[f.type].color }}>{f.name}</span>
                <span className="text-slate-600 ml-1">({FILE_TYPE_CONFIG[f.type].label})</span>
              </button>
            ) : null;
          })}
        </Section>
      )}

      {impact.transitive.length > 0 && (
        <Section icon={<span className="text-yellow-500 text-xs opacity-70">●</span>} title={`Transitive (${impact.transitive.length})`}>
          {transitiveToShow.map(id => {
            const f = files.get(id);
            return f ? (
              <button key={id} onClick={() => setSelectedNode(id)}
                className="block w-full text-left truncate text-xs font-mono px-2 py-1 rounded hover:bg-slate-800 transition-colors opacity-75">
                <span style={{ color: FILE_TYPE_CONFIG[f.type].color }}>{f.name}</span>
              </button>
            ) : null;
          })}
          {impact.transitive.length > 10 && (
            <button onClick={() => setShowAll(s => !s)} className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 flex items-center gap-1">
              {showAll ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {showAll ? 'Show less' : `Show ${impact.transitive.length - 10} more`}
            </button>
          )}
        </Section>
      )}

      {impact.affectedRoutes.length > 0 && (
        <Section icon={<span className="text-xs">🔀</span>} title="Affected Routes">
          {impact.affectedRoutes.map(r => <CodeTag key={r} text={r} color="#10B981" mono />)}
        </Section>
      )}

      {impact.affectedTests.length > 0 && (
        <Section icon={<span className="text-xs">🧪</span>} title="Test files in impact zone">
          {impact.affectedTests.map(id => {
            const f = files.get(id);
            return f ? (
              <button key={id} onClick={() => setSelectedNode(id)}
                className="block w-full text-left truncate text-xs font-mono px-2 py-1 rounded hover:bg-slate-800 text-slate-400">
                {f.name}
              </button>
            ) : null;
          })}
        </Section>
      )}

      {impact.totalImpact === 0 && (
        <div className="text-xs text-slate-600 text-center py-4">
          No other files depend on this module.
        </div>
      )}
    </div>
  );
}

// ─── Spec tab ─────────────────────────────────────────────────────────────────

function SpecTab({ file, files, metrics }: { file: ParsedFile; files: Map<string, ParsedFile>; metrics?: import('@/types/graph').TechDebtMetrics }) {
  const [copied, setCopied] = useState(false);
  const spec = useMemo(() => generateSpecDoc({ file, files, metrics }), [file, files, metrics]);

  const copy = () => {
    navigator.clipboard.writeText(spec).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 flex-shrink-0">
        <span className="text-xs text-slate-500">Spec document</span>
        <button onClick={copy} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
          {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
        {spec}
      </pre>
    </div>
  );
}

// ─── Generate tab ─────────────────────────────────────────────────────────────

function GenerateTab({ file, files, metrics }: { file: ParsedFile; files: Map<string, ParsedFile>; metrics?: import('@/types/graph').TechDebtMetrics }) {
  const impact = useMemo(() => computeImpact(file.id, files), [file.id, files]);
  const ctx = { file, files, metrics, impact };

  const DOCS = [
    {
      label: 'Spec Document',
      desc: 'Technical overview — exports, deps, routes, impact',
      fn: () => generateSpecDoc(ctx),
      filename: `${file.name}-spec.md`,
      color: '#3B82F6',
    },
    {
      label: 'BRD',
      desc: 'Business requirements — scope, integrations, constraints',
      fn: () => generateBRD(ctx),
      filename: `${file.name}-brd.md`,
      color: '#8B5CF6',
    },
    {
      label: 'SIT Test Cases',
      desc: 'System integration tests — module load, renders, routes',
      fn: () => generateSITCases(ctx),
      filename: `${file.name}-sit.md`,
      color: '#F59E0B',
    },
    {
      label: 'UAT Test Cases',
      desc: 'User acceptance tests — navigation, interactions, performance',
      fn: () => generateUATCases(ctx),
      filename: `${file.name}-uat.md`,
      color: '#10B981',
    },
  ];

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-slate-500 mb-4">
        Generate template-based markdown documents from static analysis of <span className="font-mono text-slate-300">{file.name}</span>.
      </p>
      {DOCS.map(({ label, desc, fn, filename, color }) => (
        <button
          key={label}
          onClick={() => downloadMarkdown(filename, fn())}
          className="w-full flex items-start gap-3 p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors text-left"
        >
          <div style={{ background: color + '20', color }} className="p-1.5 rounded flex-shrink-0 mt-0.5">
            <Download size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200">{label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
            <div className="text-xs font-mono text-slate-600 mt-1">{filename}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CodeTag({ text, color, mono }: { text: string; color?: string; mono?: boolean }) {
  return (
    <span style={color ? { color } : {}}
      className={`inline-block text-xs px-2 py-0.5 bg-slate-900 border border-slate-800 rounded mr-1 mb-1 ${mono ? 'font-mono' : 'font-medium'} ${!color ? 'text-slate-300' : ''}`}>
      {text}
    </span>
  );
}

function debtColor(score: number): string {
  if (score <= 20) return '#10B981';
  if (score <= 40) return '#84CC16';
  if (score <= 60) return '#F59E0B';
  if (score <= 80) return '#EF4444';
  return '#DC2626';
}

function debtBand(score: number): string {
  if (score <= 20) return 'Clean';
  if (score <= 40) return 'Low';
  if (score <= 60) return 'Medium';
  if (score <= 80) return 'High';
  return 'Critical';
}
