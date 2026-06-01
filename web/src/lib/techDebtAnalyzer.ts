import type { ParsedFile, TechDebtMetrics, DebtFlag } from '@/types/graph';
import { detectCircularDeps } from './circularDetector';

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
  const flags: DebtFlag[] = [];

  const locScore = linesOfCode >= 500 ? 1 : linesOfCode >= 300 ? 0.5 : 0;
  if (linesOfCode >= 500) flags.push('god-file');

  const fanInScore = fanIn > 10 ? 1 : fanIn > 5 ? 0.5 : 0;
  if (fanIn > 10) flags.push('high-fan-in');

  const fanOutScore = fanOut > 10 ? 1 : fanOut > 5 ? 0.5 : 0;
  if (fanOut > 10) flags.push('high-fan-out');

  const circularScore = circularWith.length > 0 ? 1 : 0;
  if (circularWith.length > 0) flags.push('circular');

  const noTestScore = hasTest ? 0 : 1;
  if (!hasTest) flags.push('no-test');

  const unusedScore = Math.min(unusedExports.length / 5, 1);
  if (unusedExports.length > 0) flags.push('unused-exports');

  if (complexity > 20) flags.push('high-complexity');

  const raw = locScore * 20 + fanInScore * 15 + fanOutScore * 15
    + circularScore * 25 + noTestScore * 15 + unusedScore * 10;

  return { debtScore: Math.round(Math.min(raw, 100)), flags };
}
