/**
 * Baseline snapshot + regression diff. The "avoid regression" half of the tool:
 * export a compact snapshot of the current debt/risk state, then later re-import
 * it and diff against a fresh analysis to surface what got WORSE — new untested
 * dependents, new cycles, files crossing risk thresholds — before it ships.
 */
import type {
  ParsedFile, TechDebtMetrics, FileRisk, Language,
  Snapshot, SnapshotEntry, RegressionDiff, RegressionItem, DebtFlag,
} from '@/types/graph';

const RISK_REGRESSION_DELTA = 8; // ignore noise; only flag meaningful risk increases

export function buildSnapshot(
  rootName: string,
  language: Language,
  files: Map<string, ParsedFile>,
  techDebt: Map<string, TechDebtMetrics>,
  risks: Map<string, FileRisk>,
): Snapshot {
  const entries: Record<string, SnapshotEntry> = {};
  for (const [id, m] of techDebt) {
    entries[id] = {
      debtScore: m.debtScore,
      riskScore: risks.get(id)?.riskScore ?? 0,
      fanIn: m.fanIn,
      hasTest: m.hasTest,
      circular: m.circularWith.length,
      flags: m.flags,
    };
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    rootName,
    language,
    fileCount: files.size,
    files: entries,
  };
}

export function diffSnapshot(
  baseline: Snapshot,
  techDebt: Map<string, TechDebtMetrics>,
  risks: Map<string, FileRisk>,
): RegressionDiff {
  const nowIds = new Set(techDebt.keys());
  const baseIds = new Set(Object.keys(baseline.files));

  const newFiles = [...nowIds].filter(id => !baseIds.has(id));
  const removedFiles = [...baseIds].filter(id => !nowIds.has(id));

  const regressions: RegressionItem[] = [];
  let improvements = 0;
  let unchanged = 0;

  for (const id of nowIds) {
    const before = baseline.files[id];
    if (!before) continue; // brand-new file handled via newFiles
    const m = techDebt.get(id)!;
    const riskAfter = risks.get(id)?.riskScore ?? 0;

    const newFlags = m.flags.filter((f): f is DebtFlag => !before.flags.includes(f));
    const lostTest = before.hasTest && !m.hasTest;
    const gainedCircular = before.circular === 0 && m.circularWith.length > 0;
    const riskUp = riskAfter - before.riskScore >= RISK_REGRESSION_DELTA;

    if (riskUp || lostTest || gainedCircular || newFlags.length > 0) {
      regressions.push({
        fileId: id,
        riskBefore: before.riskScore,
        riskAfter,
        newFlags,
        lostTest,
        gainedCircular,
      });
    } else if (riskAfter < before.riskScore - RISK_REGRESSION_DELTA) {
      improvements++;
    } else {
      unchanged++;
    }
  }

  // Worst regressions first
  regressions.sort((a, b) => (b.riskAfter - b.riskBefore) - (a.riskAfter - a.riskBefore));

  return {
    baselineDate: baseline.createdAt,
    newFiles,
    removedFiles,
    regressions,
    improvements,
    unchanged,
  };
}

export function downloadSnapshot(snapshot: Snapshot): void {
  const name = `${snapshot.rootName || 'analysis'}-baseline-${snapshot.createdAt.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse + validate an imported baseline file. Returns null if not a valid snapshot. */
export function parseSnapshot(text: string): Snapshot | null {
  try {
    const obj = JSON.parse(text);
    if (obj && obj.version === 1 && obj.files && typeof obj.files === 'object') return obj as Snapshot;
  } catch { /* fall through */ }
  return null;
}
