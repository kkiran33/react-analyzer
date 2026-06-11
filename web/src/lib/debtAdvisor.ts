import type { ParsedFile, TechDebtMetrics, Language } from '@/types/graph';
import { DEBT_THRESHOLDS as T } from './techDebtAnalyzer';

// A single, human-readable explanation of one debt problem on a file:
// what's wrong, *why* it matters, and a concrete *how-to-fix*. Evidence ids are
// other files involved (clickable so the user can drill straight to them).
export interface DebtFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  why: string;
  fix: string;
  evidenceIds?: string[];   // related file ids — rendered as clickable chips
  evidenceText?: string[];  // related symbol names / labels
}

export const SEVERITY_COLOR: Record<DebtFinding['severity'], string> = {
  critical: '#DC2626',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#84CC16',
};

const SEVERITY_RANK: Record<DebtFinding['severity'], number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

// Native (Swift/Kotlin) link files by symbol reference, not import path, so the
// wording shifts from "imports" to "references".
function depWord(language: Language): { in: string; out: string } {
  if (language === 'swift' || language === 'kotlin') {
    return { in: 'reference this type', out: 'types referenced' };
  }
  return { in: 'import this file', out: 'imports' };
}

export function adviseDebt(
  file: ParsedFile,
  metrics: TechDebtMetrics,
  files: Map<string, ParsedFile>,
  language: Language,
): DebtFinding[] {
  const findings: DebtFinding[] = [];
  const w = depWord(language);

  // ── Circular dependency (most damaging) ─────────────────────────────────────
  if (metrics.circularWith.length > 0) {
    findings.push({
      id: 'circular',
      severity: 'critical',
      title: `Circular dependency with ${metrics.circularWith.length} file${metrics.circularWith.length > 1 ? 's' : ''}`,
      why: `This file and ${metrics.circularWith.length === 1 ? 'another file' : 'others'} depend on each other in a loop. Cycles make modules impossible to load, test, or reason about in isolation, and are a common source of "undefined on import" and initialization-order bugs.`,
      fix: 'Break the loop: extract the shared types/constants both files need into a third, dependency-free module, or invert one direction with dependency injection (pass the collaborator in) or an event/callback. Target the edge that looks most accidental first.',
      evidenceIds: metrics.circularWith,
    });
  }

  // ── God file ────────────────────────────────────────────────────────────────
  if (metrics.linesOfCode >= T.godFileLoc) {
    findings.push({
      id: 'god-file',
      severity: 'high',
      title: `Very large file — ${metrics.linesOfCode} lines`,
      why: `At ${metrics.linesOfCode} lines this is well past the ${T.godFileLoc}-line mark where files become hard to scan, review, and change safely. Large files usually mean several responsibilities are tangled together.`,
      fix: `Split by responsibility — move helpers, sub-components, and type definitions into their own files. Aim for under ${T.largeFileLoc} lines per file.`,
    });
  } else if (metrics.linesOfCode >= T.largeFileLoc) {
    findings.push({
      id: 'large-file',
      severity: 'low',
      title: `Getting large — ${metrics.linesOfCode} lines`,
      why: `Approaching the ${T.godFileLoc}-line threshold. Not urgent, but worth watching before it grows further.`,
      fix: 'Look for a cohesive chunk (a sub-component, a group of pure helpers) that could move to its own file.',
    });
  }

  // ── High fan-in (high blast radius) ─────────────────────────────────────────
  if (metrics.fanIn > T.highFanIn) {
    const importers = [...files.values()]
      .filter(f => f.resolvedImports.includes(file.id))
      .map(f => f.id);
    findings.push({
      id: 'high-fan-in',
      severity: 'high',
      title: `High blast radius — ${metrics.fanIn} dependents`,
      why: `${metrics.fanIn} other files ${w.in}, so any change here ripples widely and risks breaking unrelated features. High fan-in itself is fine for stable utilities, but dangerous if this file also changes often or has no tests.`,
      fix: 'Keep the public surface small and stable. If it bundles several concerns, split it so each consumer depends only on the slice it needs. Make sure it is well-tested before changing it.',
      evidenceIds: importers,
    });
  }

  // ── High fan-out (too many collaborators) ───────────────────────────────────
  if (metrics.fanOut > T.highFanOut) {
    findings.push({
      id: 'high-fan-out',
      severity: 'medium',
      title: `Too many collaborators — ${metrics.fanOut} dependencies`,
      why: `This file pulls in ${metrics.fanOut} other modules (${w.out}). High fan-out is a sign it is orchestrating too much and is tightly coupled to the rest of the codebase, which makes it fragile and hard to reuse.`,
      fix: 'Push orchestration logic up to a parent, or hide a cluster of related dependencies behind a single facade/service so this file talks to fewer things directly.',
      evidenceIds: file.resolvedImports.filter(r => files.has(r)),
    });
  }

  // ── No tests ────────────────────────────────────────────────────────────────
  if (!metrics.hasTest) {
    const risky = metrics.fanIn > T.warnFanIn || metrics.complexity > T.highComplexity || metrics.circularWith.length > 0;
    findings.push({
      id: 'no-test',
      severity: risky ? 'high' : 'medium',
      title: 'No test file found',
      why: risky
        ? 'No test references this file, yet it is depended on or complex enough that a regression here would be costly and hard to catch.'
        : 'No test file references this module, so changes here are unverified.',
      fix: 'Add a unit/integration test covering its main exports and edge cases. Prioritise it given its fan-in and complexity.',
    });
  }

  // ── High complexity ─────────────────────────────────────────────────────────
  if (metrics.complexity > T.highComplexity) {
    findings.push({
      id: 'high-complexity',
      severity: 'medium',
      title: `High complexity — ${metrics.complexity} symbols`,
      why: `Imports + exports + functions total ${metrics.complexity} (threshold ${T.highComplexity}). A lot of moving parts in one file raises the cognitive load and the chance of bugs.`,
      fix: 'Group related functions and extract them into focused modules; collapse near-duplicate helpers.',
    });
  }

  // ── Unused / unreachable exports ────────────────────────────────────────────
  if (metrics.unusedExports.length > 0) {
    findings.push({
      id: 'unused-exports',
      severity: 'low',
      title: `${metrics.unusedExports.length} possibly-unused export${metrics.unusedExports.length > 1 ? 's' : ''}`,
      why: 'Nothing else in the project depends on this file, so its exports look like dead code. (This can be a false positive for genuine entry points — route targets, DI registrations, reflection — that the static analyzer can\'t see.)',
      fix: 'If truly unused, delete the exports (and the file if it empties out). If it is an entry point, that\'s expected — no action needed.',
      evidenceText: metrics.unusedExports,
    });
  }

  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
