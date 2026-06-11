import { useState, useMemo, Fragment } from 'react';
import { ChevronUp, ChevronDown, ChevronRight, AlertTriangle, XCircle, CheckCircle, ArrowUpRight } from 'lucide-react';
import { useGraphStore } from '@/store/useGraphStore';
import { FILE_TYPE_CONFIG, type TechDebtMetrics, type ParsedFile } from '@/types/graph';
import { DebtFindings } from './DebtFindings';

type SortKey = 'name' | 'type' | 'linesOfCode' | 'fanIn' | 'fanOut' | 'hasTest' | 'debtScore';
type SortDir = 'asc' | 'desc';

interface Row { file: ParsedFile; metrics: TechDebtMetrics }

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

export function TechDebtDashboard() {
  const files = useGraphStore((s) => s.files);
  const techDebt = useGraphStore((s) => s.techDebt);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const language = useGraphStore((s) => s.language);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const setView = useGraphStore((s) => s.setView);

  const [sortKey, setSortKey] = useState<SortKey>('debtScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Drilling into one row from another (e.g. clicking circular-partner evidence)
  // keeps the user in the table — select the file and expand its findings.
  const drillTo = (id: string) => {
    if (!techDebt.has(id)) { setSelectedNode(id); setView('files'); return; }
    setExpandedId(id);
  };

  const rows: Row[] = useMemo(() => {
    const result: Row[] = [];
    for (const [id, file] of files) {
      const metrics = techDebt.get(id);
      if (metrics) result.push({ file, metrics });
    }
    return result;
  }, [files, techDebt]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return rows.filter(r => !q || r.file.name.toLowerCase().includes(q) || r.file.path.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case 'name':       av = a.file.name;            bv = b.file.name;            break;
        case 'type':       av = a.file.type;            bv = b.file.type;            break;
        case 'linesOfCode':av = a.metrics.linesOfCode;  bv = b.metrics.linesOfCode;  break;
        case 'fanIn':      av = a.metrics.fanIn;        bv = b.metrics.fanIn;        break;
        case 'fanOut':     av = a.metrics.fanOut;       bv = b.metrics.fanOut;       break;
        case 'hasTest':    av = a.metrics.hasTest ? 1 : 0; bv = b.metrics.hasTest ? 1 : 0; break;
        case 'debtScore':  av = a.metrics.debtScore;    bv = b.metrics.debtScore;    break;
        default:           av = 0; bv = 0;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  // Summary stats
  const avgScore = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.metrics.debtScore, 0) / rows.length) : 0;
  const circularCount = rows.filter(r => r.metrics.circularWith.length > 0).length;
  const noTestCount = rows.filter(r => !r.metrics.hasTest).length;
  const criticalCount = rows.filter(r => r.metrics.debtScore > 60).length;

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? null : sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />;

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
      onClick={() => handleSort(k)}
    >
      <span className="flex items-center gap-1">{label}<SortIcon k={k} /></span>
    </th>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      {/* Summary bar */}
      <div className="flex gap-4 p-4 border-b border-slate-800 flex-shrink-0">
        {[
          { label: 'Avg Debt Score', value: avgScore, color: debtColor(avgScore) },
          { label: 'Circular Deps', value: circularCount, color: circularCount > 0 ? '#EF4444' : '#10B981' },
          { label: 'No Test File', value: noTestCount, color: noTestCount > 0 ? '#F59E0B' : '#10B981' },
          { label: 'Critical Files', value: criticalCount, color: criticalCount > 0 ? '#DC2626' : '#10B981' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 min-w-0">
            <div style={{ color }} className="text-2xl font-bold tabular-nums">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
            <tr>
              <th className="w-6" />
              <Th label="File" k="name" />
              <Th label="Type" k="type" />
              <Th label="LOC" k="linesOfCode" />
              <Th label="Fan-in" k="fanIn" />
              <Th label="Fan-out" k="fanOut" />
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Circular</th>
              <Th label="Test" k="hasTest" />
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Unused</th>
              <Th label="Debt Score" k="debtScore" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ file, metrics }) => {
              const cfg = FILE_TYPE_CONFIG[file.type];
              const isExpanded = expandedId === file.id;
              return (
                <Fragment key={file.id}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : file.id)}
                  className={`border-b border-slate-900 hover:bg-slate-900 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-900' : ''}`}
                >
                  {/* Expander */}
                  <td className="pl-2 text-slate-500">
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </td>

                  {/* File */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span style={{ background: cfg.color }} className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
                      <span className="font-mono text-xs text-slate-200 truncate max-w-[160px]" title={file.path}>
                        {file.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-mono truncate max-w-[200px] ml-3.5">{file.dir}</div>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2">
                    <span style={{ background: cfg.color, color: '#000' }} className="text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                      {cfg.label}
                    </span>
                  </td>

                  {/* LOC */}
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs tabular-nums ${metrics.linesOfCode >= 500 ? 'text-red-400 font-bold' : metrics.linesOfCode >= 300 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {metrics.linesOfCode}
                    </span>
                  </td>

                  {/* Fan-in */}
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs tabular-nums ${metrics.fanIn > 10 ? 'text-red-400 font-bold' : metrics.fanIn > 5 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {metrics.fanIn}
                    </span>
                  </td>

                  {/* Fan-out */}
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs tabular-nums ${metrics.fanOut > 10 ? 'text-red-400 font-bold' : metrics.fanOut > 5 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {metrics.fanOut}
                    </span>
                  </td>

                  {/* Circular */}
                  <td className="px-3 py-2">
                    {metrics.circularWith.length > 0 ? (
                      <span className="flex items-center gap-1 text-red-400 text-xs">
                        <AlertTriangle size={11} />
                        {metrics.circularWith.length}
                      </span>
                    ) : (
                      <span className="text-slate-700 text-xs">—</span>
                    )}
                  </td>

                  {/* Test */}
                  <td className="px-3 py-2">
                    {metrics.hasTest ? (
                      <CheckCircle size={13} className="text-emerald-500" />
                    ) : (
                      <XCircle size={13} className="text-red-500 opacity-70" />
                    )}
                  </td>

                  {/* Unused exports */}
                  <td className="px-3 py-2">
                    <span className={`text-xs tabular-nums ${metrics.unusedExports.length > 0 ? 'text-amber-400' : 'text-slate-700'}`}>
                      {metrics.unusedExports.length > 0 ? metrics.unusedExports.length : '—'}
                    </span>
                  </td>

                  {/* Debt score */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-[90px]">
                      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${metrics.debtScore}%`, background: debtColor(metrics.debtScore) }}
                        />
                      </div>
                      <span style={{ color: debtColor(metrics.debtScore) }} className="text-xs font-bold tabular-nums w-7 text-right">
                        {metrics.debtScore}
                      </span>
                      <span className="text-xs text-slate-600 hidden xl:inline">{debtBand(metrics.debtScore)}</span>
                    </div>
                  </td>
                </tr>

                {/* Drill-down: why this file is in debt + how to fix */}
                {isExpanded && (
                  <tr className="bg-slate-950">
                    <td />
                    <td colSpan={9} className="px-4 py-3">
                      <div className="max-w-3xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Issues & how to fix — {file.name}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedNode(file.id); setView('files'); }}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                          >
                            View in graph <ArrowUpRight size={11} />
                          </button>
                        </div>
                        <DebtFindings file={file} metrics={metrics} files={files} language={language} onSelect={drillTo} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">No files match the current filter.</div>
        )}
      </div>
    </div>
  );
}
