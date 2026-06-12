import { useMemo, useState } from 'react';
import { useGraphStore } from '@/store/useGraphStore';
import { rankByRisk } from '@/lib/remediation';
import { FILE_TYPE_CONFIG, typeLabel } from '@/types/graph';
import type { ActionEffort, RiskTier } from '@/types/graph';

const TIER_COLOR: Record<RiskTier, string> = {
  critical: '#DC2626', high: '#EF4444', medium: '#F59E0B', low: '#10B981',
};
const EFFORT_COLOR: Record<ActionEffort, string> = {
  quick: '#10B981', medium: '#F59E0B', large: '#EF4444',
};
const EFFORT_LABEL: Record<ActionEffort, string> = {
  quick: 'Quick', medium: 'Medium', large: 'Large',
};

export function ActionPlan() {
  const files = useGraphStore((s) => s.files);
  const risks = useGraphStore((s) => s.risks);
  const language = useGraphStore((s) => s.language);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const setView = useGraphStore((s) => s.setView);

  const [effortFilter, setEffortFilter] = useState<ActionEffort | 'all'>('all');
  const [tierFilter, setTierFilter] = useState<RiskTier | 'all'>('all');

  const ranked = useMemo(() => {
    let list = rankByRisk(risks).filter(r => r.actions.length > 0);
    const q = searchQuery.toLowerCase();
    if (q) list = list.filter(r => (files.get(r.fileId)?.name ?? '').toLowerCase().includes(q));
    if (tierFilter !== 'all') list = list.filter(r => r.tier === tierFilter);
    if (effortFilter !== 'all') list = list.filter(r => r.actions.some(a => a.effort === effortFilter));
    return list;
  }, [risks, files, searchQuery, tierFilter, effortFilter]);

  // Aggregate counters
  const totals = useMemo(() => {
    const t = { critical: 0, high: 0, medium: 0, low: 0, quickWins: 0, untestedHubs: 0 };
    for (const r of risks.values()) {
      if (r.actions.length === 0) continue;
      t[r.tier]++;
      if (r.actions.some(a => a.effort === 'quick')) t.quickWins++;
      if (r.actions.some(a => a.kind === 'regression-risk')) t.untestedHubs++;
    }
    return t;
  }, [risks]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      {/* Summary */}
      <div className="flex gap-3 p-4 border-b border-slate-800 flex-shrink-0 flex-wrap">
        {([
          { label: 'Critical', value: totals.critical, color: TIER_COLOR.critical },
          { label: 'High', value: totals.high, color: TIER_COLOR.high },
          { label: 'Untested hubs', value: totals.untestedHubs, color: '#F97316' },
          { label: 'Quick wins', value: totals.quickWins, color: '#10B981' },
        ]).map(({ label, value, color }) => (
          <div key={label} className="flex-1 min-w-[120px] bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div style={{ color }} className="text-2xl font-bold tabular-nums">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 flex-shrink-0 text-xs">
        <span className="text-slate-500">Tier:</span>
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map(t => (
          <button key={t} onClick={() => setTierFilter(t)}
            className={`px-2 py-0.5 rounded transition-colors ${tierFilter === t ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
        <span className="text-slate-600 mx-1">·</span>
        <span className="text-slate-500">Effort:</span>
        {(['all', 'quick', 'medium', 'large'] as const).map(e => (
          <button key={e} onClick={() => setEffortFilter(e)}
            className={`px-2 py-0.5 rounded transition-colors ${effortFilter === e ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            {e}
          </button>
        ))}
        <span className="ml-auto text-slate-600">{ranked.length} files with actions</span>
      </div>

      {/* Ranked list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {ranked.map((r, i) => {
          const f = files.get(r.fileId);
          if (!f) return null;
          const cfg = FILE_TYPE_CONFIG[f.type];
          return (
            <div key={r.fileId} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              {/* Card header */}
              <div
                className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 cursor-pointer hover:bg-slate-850"
                onClick={() => { setSelectedNode(r.fileId); setView('files'); }}
              >
                <span className="text-slate-600 text-sm font-mono w-6 text-right">{i + 1}</span>
                <span
                  style={{ background: TIER_COLOR[r.tier] }}
                  className="text-xs font-bold text-white px-2 py-0.5 rounded uppercase tracking-wide"
                >
                  {r.tier}
                </span>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span style={{ background: cfg.color }} className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
                  <span className="font-mono text-sm text-slate-100 truncate">{f.name}</span>
                  <span className="text-xs text-slate-600">{typeLabel(f.type, language)}</span>
                </div>
                <span className="text-xs text-slate-500">blast {r.blastRadius}</span>
                <span style={{ color: TIER_COLOR[r.tier] }} className="text-sm font-bold tabular-nums w-9 text-right">
                  {r.riskScore}
                </span>
              </div>

              {/* Why + actions */}
              <div className="px-4 py-2.5">
                <div className="text-xs text-slate-500 mb-2">{r.reason}</div>
                <div className="space-y-2">
                  {r.actions.map((a, j) => (
                    <div key={j} className="flex gap-2.5">
                      <span
                        style={{ background: EFFORT_COLOR[a.effort] + '22', color: EFFORT_COLOR[a.effort] }}
                        className="text-xs font-medium px-1.5 py-0.5 rounded h-fit flex-shrink-0 mt-0.5"
                      >
                        {EFFORT_LABEL[a.effort]}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 font-medium">{a.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {ranked.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm">
            {risks.size === 0 ? 'Open a folder to generate an action plan.' : 'No files match the current filters — nothing to fix here.'}
          </div>
        )}
      </div>
    </div>
  );
}
