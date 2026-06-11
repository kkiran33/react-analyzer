import type { ParsedFile, TechDebtMetrics, DebtFlag } from '@/types/graph';
import { detectCircularDeps } from './circularDetector';

// Thresholds and scoring weights live here as the single source of truth so the
// dashboard, the deep-dive, and the debt advisor all describe debt the same way.
export const DEBT_THRESHOLDS = {
  godFileLoc: 500,    // ≥ this LOC → "god file"
  largeFileLoc: 300,  // ≥ this LOC → getting large
  highFanIn: 10,      // > this → high blast radius
  warnFanIn: 5,
  highFanOut: 10,     // > this → too many collaborators
  warnFanOut: 5,
  highComplexity: 20, // imports + exports + functions
} as const;

export const DEBT_WEIGHTS = {
  godFile: 20,
  highFanIn: 15,
  highFanOut: 15,
  circular: 25,
  noTest: 15,
  unusedExports: 10,
} as const;

export interface ScoreContribution {
  label: string;
  points: number;
}

// Re-derive how each factor contributed to the final debt score, so the UI can
// explain "why is this 78?" without re-implementing the weighting logic.
export function scoreContributions(m: TechDebtMetrics): ScoreContribution[] {
  const T = DEBT_THRESHOLDS;
  const W = DEBT_WEIGHTS;
  const out: ScoreContribution[] = [];

  const locScore = m.linesOfCode >= T.godFileLoc ? 1 : m.linesOfCode >= T.largeFileLoc ? 0.5 : 0;
  if (locScore > 0) out.push({ label: `${m.linesOfCode} lines of code`, points: Math.round(locScore * W.godFile) });

  const fanInScore = m.fanIn > T.highFanIn ? 1 : m.fanIn > T.warnFanIn ? 0.5 : 0;
  if (fanInScore > 0) out.push({ label: `Fan-in of ${m.fanIn}`, points: Math.round(fanInScore * W.highFanIn) });

  const fanOutScore = m.fanOut > T.highFanOut ? 1 : m.fanOut > T.warnFanOut ? 0.5 : 0;
  if (fanOutScore > 0) out.push({ label: `Fan-out of ${m.fanOut}`, points: Math.round(fanOutScore * W.highFanOut) });

  if (m.circularWith.length > 0) out.push({ label: `Circular dependency (${m.circularWith.length} file${m.circularWith.length > 1 ? 's' : ''})`, points: W.circular });

  if (!m.hasTest) out.push({ label: 'No test file', points: W.noTest });

  const unusedScore = Math.min(m.unusedExports.length / 5, 1);
  if (m.unusedExports.length > 0) out.push({ label: `${m.unusedExports.length} unused export${m.unusedExports.length > 1 ? 's' : ''}`, points: Math.round(unusedScore * W.unusedExports) });

  return out.sort((a, b) => b.points - a.points);
}

export function analyzeDebt(
  files: Map<string, ParsedFile>,
): Map<string, TechDebtMetrics> {
  const circularMap = detectCircularDeps(files);

  // Build fan-in counts (reverse scan)
  const fanInMap = new Map<string, number>();
  for (const id of files.keys()) fanInMap.set(id, 0);
  for (const file of files.values()) {
    for (const dep of file.resolvedImports) {
      if (files.has(dep)) fanInMap.set(dep, (fanInMap.get(dep) ?? 0) + 1);
    }
  }

  const result = new Map<string, TechDebtMetrics>();

  for (const [id, file] of files) {
    const fanIn = fanInMap.get(id) ?? 0;
    const fanOut = file.resolvedImports.filter(r => files.has(r)).length;
    const circularWith = circularMap.get(id) ?? [];
    const hasTest = detectTestFile(id, file.name, files);

    // Unused exports: safe approximation — flag exports only when fanIn === 0
    // (nothing imports this file at all, so all exports are unreachable)
    const unusedExports = fanIn === 0 && file.exports.length > 0
      ? [...file.exports]
      : [];

    const complexity = file.imports.length + file.exports.length + file.allFunctions.length;

    const { debtScore, flags } = scoreDebt({
      linesOfCode: file.linesOfCode,
      fanIn,
      fanOut,
      circularWith,
      hasTest,
      unusedExports,
      complexity,
    });

    result.set(id, {
      fileId: id,
      fanIn,
      fanOut,
      linesOfCode: file.linesOfCode,
      circularWith,
      hasTest,
      unusedExports,
      complexity,
      debtScore,
      flags,
    });
  }

  return result;
}

function detectTestFile(
  fileId: string,
  fileName: string,
  files: Map<string, ParsedFile>,
): boolean {
  const lower = fileName.toLowerCase();
  for (const [id, f] of files) {
    if (id === fileId) continue;
    if (f.type === 'test' && f.name.toLowerCase().includes(lower)) return true;
    // Also check if a test file has this file in its resolvedImports
    if (f.type === 'test' && f.resolvedImports.includes(fileId)) return true;
  }
  return false;
}

function scoreDebt(input: {
  linesOfCode: number;
  fanIn: number;
  fanOut: number;
  circularWith: string[];
  hasTest: boolean;
  unusedExports: string[];
  complexity: number;
}): { debtScore: number; flags: DebtFlag[] } {
  const { linesOfCode, fanIn, fanOut, circularWith, hasTest, unusedExports, complexity } = input;
  const T = DEBT_THRESHOLDS;
  const W = DEBT_WEIGHTS;
  const flags: DebtFlag[] = [];

  const locScore = linesOfCode >= T.godFileLoc ? 1 : linesOfCode >= T.largeFileLoc ? 0.5 : 0;
  if (linesOfCode >= T.godFileLoc) flags.push('god-file');

  const fanInScore = fanIn > T.highFanIn ? 1 : fanIn > T.warnFanIn ? 0.5 : 0;
  if (fanIn > T.highFanIn) flags.push('high-fan-in');

  const fanOutScore = fanOut > T.highFanOut ? 1 : fanOut > T.warnFanOut ? 0.5 : 0;
  if (fanOut > T.highFanOut) flags.push('high-fan-out');

  const circularScore = circularWith.length > 0 ? 1 : 0;
  if (circularWith.length > 0) flags.push('circular');

  const noTestScore = hasTest ? 0 : 1;
  if (!hasTest) flags.push('no-test');

  const unusedScore = Math.min(unusedExports.length / 5, 1);
  if (unusedExports.length > 0) flags.push('unused-exports');

  if (complexity > T.highComplexity) flags.push('high-complexity');

  const raw = locScore * W.godFile + fanInScore * W.highFanIn + fanOutScore * W.highFanOut
    + circularScore * W.circular + noTestScore * W.noTest + unusedScore * W.unusedExports;

  return { debtScore: Math.round(Math.min(raw, 100)), flags };
}
