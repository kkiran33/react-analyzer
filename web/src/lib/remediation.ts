/**
 * Remediation engine — turns debt flags + blast-radius into a prioritized,
 * specific action plan. The organizing idea: internal debt score alone is not a
 * to-do list. What actually causes regressions in an existing codebase is
 * changing a file that many others depend on without test coverage. So risk is
 * modeled as blast-radius × coverage-gap, and each flag maps to a concrete fix
 * with the real counts/names filled in.
 */
import type {
  ParsedFile, TechDebtMetrics, FileRisk, RemediationAction, RiskTier,
} from '@/types/graph';
import { buildReverseMap } from './impactAnalyzer';

interface ImpactCounts {
  direct: string[];
  transitive: string[];
}

/** BFS dependents using a prebuilt reverse map (counts + ids, no per-call rebuild). */
function impactFrom(fileId: string, reverse: Map<string, Set<string>>): ImpactCounts {
  const visited = new Set<string>([fileId]);
  const direct = [...(reverse.get(fileId) ?? [])].filter(id => !visited.has(id) && (visited.add(id), true));
  const transitive: string[] = [];
  let frontier = [...direct];
  while (frontier.length) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const dep of reverse.get(node) ?? []) {
        if (!visited.has(dep)) { visited.add(dep); transitive.push(dep); next.push(dep); }
      }
    }
    frontier = next;
  }
  return { direct, transitive };
}

function tierOf(score: number): RiskTier {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

const nameOf = (id: string, files: Map<string, ParsedFile>) => files.get(id)?.name ?? id;

/** Build the action list for one file, ordered by weight (most important first). */
function recommendActions(
  file: ParsedFile,
  m: TechDebtMetrics,
  impact: ImpactCounts,
  files: Map<string, ParsedFile>,
): RemediationAction[] {
  const actions: RemediationAction[] = [];
  const directNames = impact.direct.slice(0, 3).map(id => nameOf(id, files));
  const depCount = impact.direct.length + impact.transitive.length;

  // Regression-safety is the headline action: untested AND depended-upon.
  if (!m.hasTest && depCount > 0) {
    const weight = Math.min(depCount, 25) + 15;
    actions.push({
      kind: 'regression-risk',
      title: 'Add tests before changing this',
      detail: `Untested, and ${impact.direct.length} file${impact.direct.length === 1 ? '' : 's'} import it directly`
        + (impact.transitive.length ? ` (${depCount} including transitive)` : '')
        + `. A change here can silently break ${directNames.join(', ')}${impact.direct.length > 3 ? ', …' : ''}. Cover it first.`,
      effort: 'medium',
      weight,
    });
  } else if (!m.hasTest && file.type !== 'test' && file.type !== 'config') {
    actions.push({
      kind: 'no-test',
      title: 'Add a test',
      detail: `No test file detected. Nothing depends on it yet, so low regression risk — but worth covering before it grows.`,
      effort: 'medium',
      weight: 8,
    });
  }

  if (m.circularWith.length > 0) {
    const partners = m.circularWith.slice(0, 2).map(id => nameOf(id, files));
    actions.push({
      kind: 'circular',
      title: `Break circular dependency with ${partners[0]}`,
      detail: `In an import cycle with ${m.circularWith.length} file${m.circularWith.length === 1 ? '' : 's'} (${partners.join(', ')}${m.circularWith.length > 2 ? ', …' : ''}). `
        + `Cycles make load order fragile and changes unpredictable — extract the shared types into a leaf module, or invert one edge.`,
      effort: 'large',
      weight: 20,
    });
  }

  if (m.flags.includes('god-file')) {
    actions.push({
      kind: 'god-file',
      title: 'Split this file',
      detail: `${m.linesOfCode} lines, ${file.exports.length} exports. Group related exports into focused modules so changes touch a smaller surface.`,
      effort: 'large',
      weight: 12,
    });
  }

  if (m.flags.includes('high-fan-in') && m.hasTest) {
    actions.push({
      kind: 'high-fan-in',
      title: 'Treat as a stable public API',
      detail: `${m.fanIn} files depend on this. It is tested — keep the interface frozen, version changes carefully, and avoid breaking signatures.`,
      effort: 'medium',
      weight: 6,
    });
  }

  if (m.flags.includes('high-fan-out')) {
    actions.push({
      kind: 'high-fan-out',
      title: 'Reduce coupling',
      detail: `Imports ${m.fanOut} local modules. Hard to reason about and test in isolation — consider a facade or passing dependencies in.`,
      effort: 'medium',
      weight: 7,
    });
  }

  if (m.unusedExports.length > 0) {
    actions.push({
      kind: 'unused-exports',
      title: 'Remove dead exports',
      detail: `${m.unusedExports.length} export${m.unusedExports.length === 1 ? '' : 's'} not imported anywhere (${m.unusedExports.slice(0, 3).join(', ')}${m.unusedExports.length > 3 ? ', …' : ''}). Quick win — delete or wire up.`,
      effort: 'quick',
      weight: 4,
    });
  }

  if (m.flags.includes('high-complexity') && !m.flags.includes('god-file')) {
    const complexity = file.imports.length + file.exports.length + file.allFunctions.length;
    actions.push({
      kind: 'high-complexity',
      title: 'Simplify surface area',
      detail: `High surface (imports + exports + functions = ${complexity}). Extract helpers and narrow what the file exposes.`,
      effort: 'medium',
      weight: 5,
    });
  }

  return actions.sort((a, b) => b.weight - a.weight);
}

/**
 * Regression risk = how dangerous it is to change this file, not how ugly it is.
 *   blast      = direct + 0.5·transitive dependents
 *   coverage   = 1 if untested, 0.25 if tested (tests make change safe)
 *   risk       = blast·coverage·4  +  debtScore·0.4  +  (circular ? 15 : 0)
 * A leaf file (no dependents) can't cause regressions elsewhere → stays low even
 * if internally messy. An untested hub rises to the top.
 */
export function assessFile(
  file: ParsedFile,
  m: TechDebtMetrics,
  reverse: Map<string, Set<string>>,
  files: Map<string, ParsedFile>,
): FileRisk {
  const impact = impactFrom(file.id, reverse);
  const blast = impact.direct.length + 0.5 * impact.transitive.length;
  const coverageGap = m.hasTest ? 0.25 : 1;
  const raw = blast * coverageGap * 4 + m.debtScore * 0.4 + (m.circularWith.length ? 15 : 0);
  const riskScore = Math.min(Math.round(raw), 100);

  const actions = recommendActions(file, m, impact, files);

  let reason: string;
  if (!m.hasTest && impact.direct.length > 0) {
    reason = `Untested with ${impact.direct.length} direct dependent${impact.direct.length === 1 ? '' : 's'}`;
  } else if (m.circularWith.length) {
    reason = `In an import cycle (${m.circularWith.length})`;
  } else if (impact.direct.length > 10) {
    reason = `High fan-in (${impact.direct.length}) — wide blast radius`;
  } else if (m.flags.includes('god-file')) {
    reason = `Large file (${m.linesOfCode} lines)`;
  } else if (actions.length) {
    reason = actions[0].title;
  } else {
    reason = 'Healthy';
  }

  return {
    fileId: file.id,
    riskScore,
    tier: tierOf(riskScore),
    blastRadius: Math.round(blast * 10) / 10,
    reason,
    actions,
  };
}

/** Assess every file once. Reverse map built a single time for the whole repo. */
export function assessAll(
  files: Map<string, ParsedFile>,
  techDebt: Map<string, TechDebtMetrics>,
): Map<string, FileRisk> {
  const reverse = buildReverseMap(files);
  const out = new Map<string, FileRisk>();
  for (const [id, file] of files) {
    const m = techDebt.get(id);
    if (m) out.set(id, assessFile(file, m, reverse, files));
  }
  return out;
}

/** Ranked worst-first list, optionally limited. */
export function rankByRisk(risks: Map<string, FileRisk>, limit?: number): FileRisk[] {
  const arr = [...risks.values()].sort((a, b) => b.riskScore - a.riskScore);
  return limit ? arr.slice(0, limit) : arr;
}
