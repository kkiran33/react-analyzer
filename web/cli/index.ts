/**
 * Headless CLI — runs the same static analysis as the web app for CI/local gates.
 * Reads a directory from disk (no File System Access API), computes debt + risk,
 * optionally diffs a baseline, and exits non-zero when thresholds are exceeded so
 * a PR that adds debt or regresses coverage fails the build.
 *
 *   node cli/analyze.mjs <dir> [options]
 *     --lang react|swift|kotlin     (auto-detected if omitted)
 *     --top <n>                     show top N risky files (default 10)
 *     --baseline <file.json>        compare against a saved baseline
 *     --save-baseline <file.json>   write a baseline snapshot and exit
 *     --max-critical <n>            fail if more than n critical-risk files
 *     --max-risk <n>                fail if any file's risk exceeds n
 *     --fail-on-regression          fail if any regression vs baseline
 *     --json                        machine-readable output
 *
 *   Exit: 0 ok · 1 threshold violation · 2 regression · 3 usage/error
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { parseFiles } from '@/lib/parser';
import { analyzeDebt } from '@/lib/techDebtAnalyzer';
import { assessAll, rankByRisk } from '@/lib/remediation';
import { buildSnapshot, diffSnapshot, parseSnapshot } from '@/lib/snapshot';
import { LANGUAGE_CONFIG, type Language } from '@/types/graph';

const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', '.turbo',
  'coverage', '.cache', '.vercel', '.expo', 'storybook-static',
  'Pods', 'Carthage', 'DerivedData', '.swiftpm', '.gradle', '.idea', 'gradle', 'captures', '.cxx',
]);

interface Opts {
  dir: string; lang?: Language; top: number;
  baseline?: string; saveBaseline?: string;
  maxCritical?: number; maxRisk?: number; failOnRegression: boolean; json: boolean;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { dir: '', top: 10, failOnRegression: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--lang': o.lang = next() as Language; break;
      case '--top': o.top = parseInt(next(), 10) || 10; break;
      case '--baseline': o.baseline = next(); break;
      case '--save-baseline': o.saveBaseline = next(); break;
      case '--max-critical': o.maxCritical = parseInt(next(), 10); break;
      case '--max-risk': o.maxRisk = parseInt(next(), 10); break;
      case '--fail-on-regression': o.failOnRegression = true; break;
      case '--json': o.json = true; break;
      default: if (!a.startsWith('--') && !o.dir) o.dir = a;
    }
  }
  return o;
}

function detectLang(dir: string): Language {
  const counts: Record<Language, number> = { react: 0, swift: 0, kotlin: 0 };
  const ext2lang: Record<string, Language> = {
    '.ts': 'react', '.tsx': 'react', '.js': 'react', '.jsx': 'react',
    '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin',
  };
  (function walk(d: string, depth: number) {
    if (depth > 4) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(join(d, e.name), depth + 1); }
      else { const l = ext2lang[extname(e.name)]; if (l) counts[l]++; }
    }
  })(dir, 0);
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Language) || 'react';
}

function readDir(dir: string, lang: Language): Map<string, string> {
  const exts = new Set(LANGUAGE_CONFIG[lang].extensions.map(e => '.' + e));
  const out = new Map<string, string>();
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(full); }
      else if (exts.has(extname(e.name))) out.set(relative(dir, full), readFileSync(full, 'utf8'));
    }
  })(dir);
  return out;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.dir) { console.error('Usage: analyze <dir> [options]'); process.exit(3); }
  try { if (!statSync(o.dir).isDirectory()) throw new Error(); }
  catch { console.error(`Not a directory: ${o.dir}`); process.exit(3); }

  const lang = o.lang ?? detectLang(o.dir);
  const raw = readDir(o.dir, lang);
  if (raw.size === 0) { console.error(`No ${lang} source files found in ${o.dir}`); process.exit(3); }

  const files = parseFiles(raw, undefined, lang);
  const debt = analyzeDebt(files);
  const risks = assessAll(files, debt);
  const ranked = rankByRisk(risks);

  const rootName = o.dir.replace(/\/+$/, '').split('/').pop() || 'project';

  if (o.saveBaseline) {
    const snap = buildSnapshot(rootName, lang, files, debt, risks);
    writeFileSync(o.saveBaseline, JSON.stringify(snap, null, 2));
    if (!o.json) console.log(`Baseline written: ${o.saveBaseline} (${files.size} files)`);
    process.exit(0);
  }

  const tiers = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of risks.values()) tiers[r.tier]++;

  let diff = null;
  if (o.baseline) {
    const snap = parseSnapshot(readFileSync(o.baseline, 'utf8'));
    if (!snap) { console.error(`Invalid baseline: ${o.baseline}`); process.exit(3); }
    diff = diffSnapshot(snap, debt, risks);
  }

  // Thresholds → exit code
  const violations: string[] = [];
  if (o.maxCritical !== undefined && tiers.critical > o.maxCritical)
    violations.push(`${tiers.critical} critical-risk files (max ${o.maxCritical})`);
  if (o.maxRisk !== undefined) {
    const over = ranked.filter(r => r.riskScore > o.maxRisk!);
    if (over.length) violations.push(`${over.length} files exceed risk ${o.maxRisk} (worst: ${files.get(over[0].fileId)?.name}=${over[0].riskScore})`);
  }
  const regressed = o.failOnRegression && diff && diff.regressions.length > 0;

  if (o.json) {
    console.log(JSON.stringify({
      lang, files: files.size, tiers,
      top: ranked.slice(0, o.top).map(r => ({ file: files.get(r.fileId)?.name, risk: r.riskScore, tier: r.tier, reason: r.reason })),
      diff: diff && { regressions: diff.regressions.length, improvements: diff.improvements, newFiles: diff.newFiles.length },
      violations, exit: violations.length ? 1 : regressed ? 2 : 0,
    }, null, 2));
  } else {
    console.log(`\n  ${rootName} · ${lang} · ${files.size} files`);
    console.log(`  Risk: ${tiers.critical} critical · ${tiers.high} high · ${tiers.medium} medium · ${tiers.low} low\n`);
    console.log(`  Fix next (top ${Math.min(o.top, ranked.length)} by regression risk):`);
    for (const r of ranked.slice(0, o.top)) {
      if (r.actions.length === 0) continue;
      const f = files.get(r.fileId)!;
      console.log(`    [${String(r.riskScore).padStart(3)}] ${r.tier.padEnd(8)} ${f.name}`);
      console.log(`          ${r.actions[0].title} — ${r.reason}`);
    }
    if (diff) {
      console.log(`\n  vs baseline ${diff.baselineDate.slice(0, 10)}: ` +
        `${diff.regressions.length} regressed, ${diff.improvements} improved, ${diff.newFiles.length} new`);
      for (const r of diff.regressions.slice(0, 8)) {
        const tags = [r.lostTest && 'lost-test', r.gainedCircular && 'new-cycle', ...r.newFlags].filter(Boolean).join(', ');
        console.log(`    ⚠ ${files.get(r.fileId)?.name}: risk ${r.riskBefore}→${r.riskAfter}${tags ? ` (${tags})` : ''}`);
      }
    }
    if (violations.length) {
      console.log(`\n  ✗ FAILED: ${violations.join('; ')}`);
    } else if (regressed) {
      console.log(`\n  ✗ FAILED: ${diff!.regressions.length} regression(s) vs baseline`);
    } else {
      console.log(`\n  ✓ passed`);
    }
  }

  process.exit(violations.length ? 1 : regressed ? 2 : 0);
}

main();
