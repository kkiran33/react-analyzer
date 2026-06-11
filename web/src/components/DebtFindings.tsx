import { CheckCircle } from 'lucide-react';
import type { ParsedFile, TechDebtMetrics, Language } from '@/types/graph';
import { FILE_TYPE_CONFIG } from '@/types/graph';
import { adviseDebt, SEVERITY_COLOR } from '@/lib/debtAdvisor';
import { scoreContributions } from '@/lib/techDebtAnalyzer';

interface Props {
  file: ParsedFile;
  metrics: TechDebtMetrics;
  files: Map<string, ParsedFile>;
  language: Language;
  onSelect?: (id: string) => void;
}

// Renders the "why is this file in debt, and how do I fix it" drill-down:
// a score breakdown (which factors added how many points) followed by per-issue
// findings with a plain-English cause, a concrete fix, and clickable evidence.
export function DebtFindings({ file, metrics, files, language, onSelect }: Props) {
  const findings = adviseDebt(file, metrics, files, language);
  const contributions = scoreContributions(metrics);

  if (findings.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-500 py-1">
        <CheckCircle size={13} />
        No debt issues detected — this file looks healthy.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Score breakdown */}
      {contributions.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
            Score breakdown
          </div>
          <div className="space-y-1">
            {contributions.map((c) => (
              <div key={c.label} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 truncate">{c.label}</span>
                <span className="font-mono font-bold text-amber-400 flex-shrink-0">+{c.points}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 text-xs border-t border-slate-800 pt-1 mt-1">
              <span className="text-slate-300 font-medium">Debt score</span>
              <span className="font-mono font-bold text-slate-100">{metrics.debtScore}/100</span>
            </div>
          </div>
        </div>
      )}

      {/* Findings */}
      <div className="space-y-2">
        {findings.map((f) => (
          <div
            key={f.id}
            className="border rounded-lg p-2.5"
            style={{ borderColor: SEVERITY_COLOR[f.severity] + '40', background: SEVERITY_COLOR[f.severity] + '0d' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: SEVERITY_COLOR[f.severity] + '22', color: SEVERITY_COLOR[f.severity] }}
              >
                {f.severity}
              </span>
              <span className="text-xs font-semibold text-slate-200">{f.title}</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">{f.why}</p>

            <p className="text-xs text-slate-300 leading-relaxed mt-1.5">
              <span className="font-semibold text-emerald-400">Fix: </span>
              {f.fix}
            </p>

            {/* Clickable file evidence */}
            {f.evidenceIds && f.evidenceIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {f.evidenceIds.map((id) => {
                  const ef = files.get(id);
                  if (!ef) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => onSelect?.(id)}
                      className="text-xs font-mono px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded hover:border-slate-500 transition-colors"
                      style={{ color: FILE_TYPE_CONFIG[ef.type].color }}
                      title={ef.path}
                    >
                      {ef.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Symbol-name evidence */}
            {f.evidenceText && f.evidenceText.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {f.evidenceText.map((t) => (
                  <span key={t} className="text-xs font-mono px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
