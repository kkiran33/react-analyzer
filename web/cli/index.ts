/**
 * Headless CLI — runs the same static analysis as the web app for CI/local gates.
 * Reads a directory from disk (no File System Access API), computes debt + risk,
 * optionally diffs a baseline, and exits non-zero when thresholds are exceeded so
 * a PR that adds debt or regresses coverage fails the build.
 *
 *   node cli/analyze.mjs <dir> [options]
 *     --lang react|swift|kotlin     (auto-detected if omitted)
 *     --top <n>                     show top N risky files (default 10)
 *     --base <git-ref>              compare against a base branch (PR gate);
 *                                   analyzes the ref in a temp git worktree
 *     --baseline <file.json>        compare against a saved baseline file
 *     --save-baseline <file.json>   write a baseline snapshot and exit
 *     --max-critical <n>            fail if more than n critical-risk files
 *     --max-risk <n>                fail if any file's risk exceeds n
 *     --fail-on-regression          fail if any regression vs base/baseline
 *     --review                      PR triage: focus on changed files, emit a
 *                                   fast-track vs needs-review verdict (with --base)
 *     --test-cmd "<cmd>"            run the project's real test suite; a failure
 *                                   hard-blocks (the behavioral layer)
 *     --json                        machine-readable output
 *
 *   Exit: 0 ok · 1 threshold/test failure · 2 regression · 3 usage/error
 *
 *   NOTE: --review is triage, not approval. It routes PRs and accelerates human
 *   review; it does not check correctness, security, or design and must not be
 *   used to auto-merge non-trivial changes without a human.
 */
import { readFileSync, readdirSync, writeFileSync, statSync, mkdtempSync, rmSync } from 'fs';
import { join, relative, extname, resolve } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { parseFiles } from '@/lib/parser';
import { analyzeDebt } from '@/lib/techDebtAnalyzer';
import { assessAll, rankByRisk } from '@/lib/remediation';
import { buildSnapshot, diffSnapshot, parseSnapshot } from '@/lib/snapshot';
import { LANGUAGE_CONFIG, type Language, type Snapshot } from '@/types/graph';

const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'out', '.turbo',
  'coverage', '.cache', '.vercel', '.expo', 'storybook-static',
  'Pods', 'Carthage', 'DerivedData', '.swiftpm', '.gradle', '.idea', 'gradle', 'captures', '.cxx',
]);

interface Opts {
  dir: string; lang?: Language; top: number;
  base?: string; baseline?: string; saveBaseline?: string;
  maxCritical?: number; maxRisk?: number; failOnRegression: boolean; json: boolean;
  review: boolean; testCmd?: string;
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { dir: '', top: 10, failOnRegression: false, json: false, review: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--lang': o.lang = next() as Language; break;
      case '--top': { const n = parseInt(next(), 10); o.top = Number.isNaN(n) ? 10 : n; break; }
      case '--base': o.base = next(); break;
      case '--baseline': o.baseline = next(); break;
      case '--save-baseline': o.saveBaseline = next(); break;
      case '--max-critical': o.maxCritical = parseInt(next(), 10); break;
      case '--max-risk': o.maxRisk = parseInt(next(), 10); break;
      case '--fail-on-regression': o.failOnRegression = true; break;
      case '--review': o.review = true; break;
      case '--test-cmd': o.testCmd = next(); break;
      case '--json': o.json = true; break;
      default: if (!a.startsWith('--') && !o.dir) o.dir = a;
    }
  }
  return o;
}

/** Files the PR changed (added/copied/modified/renamed), as keys relative to `dir`. */
function changedFiles(base: string, dir: string): Set<string> | null {
  let gitRoot: string;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch { return null; }
  let out: string;
  try {
    out = execSync(`git diff --name-only --diff-filter=ACMR "${base}"...HEAD`, { cwd: gitRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch { return null; }
  const relDir = relative(gitRoot, resolve(dir));
  const prefix = relDir ? relDir + '/' : '';
  const set = new Set<string>();
  for (const line of out.split('\n')) {
    const p = line.trim();
    if (!p || (prefix && !p.startsWith(prefix))) continue;
    set.add(prefix ? p.slice(prefix.length) : p);
  }
  return set;
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

/** Run the full analysis pipeline on a directory. */
function runPipeline(dir: string, lang: Language) {
  const raw = readDir(dir, lang);
  const files = parseFiles(raw, undefined, lang);
  const debt = analyzeDebt(files);
  const risks = assessAll(files, debt);
  return { files, debt, risks };
}

/**
 * Build a baseline snapshot from a git ref by materializing it in a throwaway
 * worktree — leaves the working tree untouched (safe to run on a dirty PR branch).
 */
function baselineFromRef(ref: string, dir: string, lang: Language): Snapshot {
  let gitRoot: string;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    console.error('--base requires a git repository.'); process.exit(3);
  }
  // Verify the ref exists
  try {
    execSync(`git rev-parse --verify --quiet "${ref}^{commit}"`, { cwd: gitRoot, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    console.error(`Base ref not found: ${ref} (try \`git fetch origin\` first)`); process.exit(3);
  }
  const rel = relative(gitRoot, resolve(dir));
  const wt = mkdtempSync(join(tmpdir(), 'module-analyzer-base-'));
  try {
    execSync(`git worktree add --detach --quiet "${wt}" "${ref}"`, { cwd: gitRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    const baseDir = join(wt, rel);
    const r = runPipeline(baseDir, lang);
    return buildSnapshot(`${ref}`, lang, r.files, r.debt, r.risks);
  } finally {
    try { execSync(`git worktree remove --force "${wt}"`, { cwd: gitRoot, stdio: 'ignore' }); } catch { /* best effort */ }
    try { rmSync(wt, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.dir) { console.error('Usage: analyze <dir> [options]'); process.exit(3); }
  try { if (!statSync(o.dir).isDirectory()) throw new Error(); }
  catch { console.error(`Not a directory: ${o.dir}`); process.exit(3); }

  const lang = o.lang ?? detectLang(o.dir);
  const head = runPipeline(o.dir, lang);
  if (head.files.size === 0) { console.error(`No ${lang} source files found in ${o.dir}`); process.exit(3); }
  const { files, debt, risks } = head;
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

  // Optionally run the project's REAL test suite (the behavioral layer this static
  // tool cannot replace). A failure here blocks everything — no triage can override
  // red tests.
  let testsFailed = false;
  if (o.testCmd) {
    if (!o.json) console.log(`\n  Running tests: ${o.testCmd}`);
    try {
      execSync(o.testCmd, { cwd: o.dir, stdio: o.json ? 'ignore' : 'inherit' });
    } catch {
      testsFailed = true;
    }
  }

  // Resolve the comparison baseline: --base (git ref) takes precedence over --baseline (file).
  let diff = null;
  let baselineLabel = '';
  if (o.base) {
    const snap = baselineFromRef(o.base, o.dir, lang);
    diff = diffSnapshot(snap, debt, risks);
    baselineLabel = o.base;
  } else if (o.baseline) {
    const snap = parseSnapshot(readFileSync(o.baseline, 'utf8'));
    if (!snap) { console.error(`Invalid baseline: ${o.baseline}`); process.exit(3); }
    diff = diffSnapshot(snap, debt, risks);
    baselineLabel = o.baseline;
  }

  // ── Review triage (changed-files focus + merge recommendation) ─────────────
  // This is TRIAGE, not approval. It routes a PR to fast-track vs human review;
  // it never certifies correctness, security, or design.
  type ReviewRow = { id: string; name: string; risk: number; tier: string; fanIn: number; hasTest: boolean; reasons: string[] };
  let review: { rows: ReviewRow[]; needsReview: ReviewRow[]; verdict: string } | null = null;
  if (o.review) {
    const changed = o.base ? changedFiles(o.base, o.dir) : null;
    const regressedIds = new Set((diff?.regressions ?? []).map(r => r.fileId));
    const newIds = new Set(diff?.newFiles ?? []);
    const ids = changed ? [...changed].filter(p => files.has(p)) : [...files.keys()];

    const rows: ReviewRow[] = ids.map(id => {
      const m = debt.get(id)!;
      const r = risks.get(id)!;
      const reasons: string[] = [];
      if (r.tier === 'critical' || r.tier === 'high') reasons.push(`${r.tier} regression risk (${r.riskScore})`);
      if (!m.hasTest && m.fanIn > 0) reasons.push(`untested, ${m.fanIn} file(s) depend on it`);
      if (m.fanIn > 5) reasons.push(`wide blast radius (${m.fanIn} dependents)`);
      if (m.circularWith.length > 0) reasons.push('in a dependency cycle');
      if (regressedIds.has(id)) reasons.push('regresses vs base');
      if (newIds.has(id) && !m.hasTest && files.get(id)!.exports.length > 0) reasons.push('new untested module');
      return { id, name: files.get(id)!.name, risk: r.riskScore, tier: r.tier, fanIn: m.fanIn, hasTest: m.hasTest, reasons };
    });

    const needsReview = rows.filter(r => r.reasons.length > 0);
    const verdict = testsFailed ? 'BLOCKED'
      : changed && changed.size > 0 && rows.length === 0 ? 'FAST-TRACK'  // only non-source files changed
      : needsReview.length === 0 ? 'FAST-TRACK'
      : 'NEEDS-HUMAN-REVIEW';
    review = { rows, needsReview, verdict };
  }

  // Thresholds → exit code. Failing tests are a hard block.
  const violations: string[] = [];
  if (testsFailed) violations.push('test suite failed');
  if (o.maxCritical !== undefined && tiers.critical > o.maxCritical)
    violations.push(`${tiers.critical} critical-risk files (max ${o.maxCritical})`);
  if (o.maxRisk !== undefined) {
    const over = ranked.filter(r => r.riskScore > o.maxRisk!);
    if (over.length) violations.push(`${over.length} files exceed risk ${o.maxRisk} (worst: ${files.get(over[0].fileId)?.name}=${over[0].riskScore})`);
  }
  const regressed = o.failOnRegression && diff && diff.regressions.length > 0;

  if (o.json) {
    console.log(JSON.stringify({
      lang, files: files.size, tiers, testsFailed: o.testCmd ? testsFailed : undefined,
      top: ranked.slice(0, o.top).map(r => ({ file: files.get(r.fileId)?.name, risk: r.riskScore, tier: r.tier, reason: r.reason })),
      diff: diff && { regressions: diff.regressions.length, improvements: diff.improvements, newFiles: diff.newFiles.length },
      review: review && {
        verdict: review.verdict,
        changedFiles: review.rows.length,
        needsReview: review.needsReview.map(r => ({ file: r.name, risk: r.risk, reasons: r.reasons })),
      },
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
      console.log(`\n  This change vs ${baselineLabel || diff.baselineDate.slice(0, 10)}: ` +
        `${diff.regressions.length} regressed, ${diff.improvements} improved, ${diff.newFiles.length} new file(s)`);
      for (const r of diff.regressions.slice(0, 8)) {
        const tags = [r.lostTest && 'lost-test', r.gainedCircular && 'new-cycle', ...r.newFlags].filter(Boolean).join(', ');
        console.log(`    ⚠ ${files.get(r.fileId)?.name}: risk ${r.riskBefore}→${r.riskAfter}${tags ? ` (${tags})` : ''}`);
      }
      if (diff.regressions.length === 0) console.log(`    ✓ no structural regressions introduced`);
    }

    // Review triage block
    if (review) {
      console.log(`\n  PR review triage — ${review.rows.length} source file(s) changed`);
      if (review.needsReview.length === 0) {
        console.log(`    no structural review flags on the changed files`);
      } else {
        for (const r of review.needsReview) {
          console.log(`    ⚑ ${r.name}: ${r.reasons.join('; ')}`);
        }
      }
      console.log(`\n  VERDICT: ${review.verdict}`);
      if (review.verdict === 'FAST-TRACK') {
        console.log(`    Mechanically low-risk. Still requires green tests + type-check;`);
        console.log(`    not a correctness/security guarantee — see notes below.`);
      } else if (review.verdict === 'NEEDS-HUMAN-REVIEW') {
        console.log(`    A reviewer should focus on the ⚑ files above and what they impact.`);
      } else {
        console.log(`    Tests failed — cannot proceed until they pass.`);
      }
      console.log(`\n  This triage covers structure only. It does NOT check correctness,`);
      console.log(`  security, business logic, or design — keep a human in the loop for those.`);
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
