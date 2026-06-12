# Module Analyzer

A browser-based static analysis tool for **React, iOS (Swift), and Android (Kotlin)** codebases. Open any project folder and instantly get an interactive visual map of its modules, screens, navigation flow, state, dependencies, and technical debt — with no server, no AI, and no configuration needed.

## Entry points

On launch you pick a platform card:

| Entry point | Reads | Maps |
|-------------|-------|------|
| **React / Web** | `.ts .tsx .js .jsx` | Pages, components, hooks, stores, API services — graph from import paths |
| **iOS · Swift** | `.swift` | Screens (VC/SwiftUI), ViewModels, coordinators, state/repos, networking |
| **Android · Kotlin** | `.kt .kts` | Activities/Fragments/Composables, ViewModels, navigation, repositories, Retrofit APIs |

All three feed the **same four views** (Files / Journey / Functions / Tech Debt) and the same Module Deep-Dive panel.

### How native analysis works (no AST library, no model)

Swift and Kotlin `import` statements are *module-level*, so — unlike React — they can't drive a file dependency graph. Instead the native analyzer links files by **symbol reference**: every top-level type a file declares (`class` / `struct` / `enum` / `protocol` / `object` / `interface`) is registered, then any other file that mentions that type name gets a dependency edge. Screens additionally get a synthetic `/ScreenName` route, and navigation calls (`pushViewController`, `NavigationLink`, `startActivity`, fragment transactions) become edges in the **Journey** view — so you get a real screen-flow map. The same `FileType` slots are reused with native labels (ViewModel, State/Repo, Navigation, …).

## Features

### Five views
| View | What it shows |
|------|---------------|
| **Files** | Import dependency graph — every file as a node, import edges between them |
| **Journey** | Page navigation flow — routes, `<Link>` connections, `navigate()` calls |
| **Functions** | Per-file export map — components (C), hooks (H), async (A), utilities (F) |
| **Tech Debt** | Sortable metrics table — LOC, fan-in, fan-out, circular deps, test coverage, debt score |
| **Action Plan** | Prioritized fixes ranked by **regression risk** = blast-radius × coverage-gap. Each item has a concrete action and an effort estimate. |

### Actionable remediation & regression guard
Tech-debt scores tell you what's messy; the **Action Plan** tells you what to *do* and in what order. The key idea: a debt score isn't a to-do list — what causes regressions is changing a heavily-depended-on file with no test coverage. So:

- **Risk = blast-radius × coverage-gap.** An untested file 20 others import ranks at the top; a messy util nothing imports stays low (it can't break anything else).
- **Specific actions with real names/counts** — "Add tests before changing this — 23 files import it; a change can break ConversationList, MessageList, …", "Break circular dependency with X", "Split this 883-line file", "Remove N dead exports" (quick win).
- **Per-file actions** appear in the Deep-Dive → Impact tab for the selected file.
- **Regression guard** (Action Plan sidebar): **Save baseline** exports a JSON snapshot of current debt/risk/coverage; **Compare to baseline** re-imports it and flags only what got *worse* — risk increases, lost test coverage, new cycles — so you catch regressions before they land.

### Module Deep-Dive (right panel)
Click any node to open a 5-tab panel:
- **Overview** — stats, debt score meter, imports, used-by, exports
- **Logic** — all functions with kind badges; hooks categorised by purpose (state, side-effect, data-fetch, navigation, form…)
- **Impact** — change impact analysis: direct dependents (orange glow), transitive cascade (yellow glow), severity rating
- **Spec** — auto-generated markdown specification document (copy to clipboard)
- **Generate** — download 4 template-based documents: Spec Doc, BRD, SIT Test Cases, UAT Test Cases

### Change impact highlighting
Select any file in the Files view — direct dependents glow orange, transitive dependents glow yellow. Shows the blast radius before you make a change.

### Works on any React project structure
Flexible path-pattern type overrides let you remap folder conventions to the correct file types.

## Requirements

- **Chrome, Edge, Arc, or Brave** (requires the [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access))
- Node.js 18+ (for local dev)

## Getting started

```bash
cd web
npm install
npm run dev
# Open http://localhost:5173 in Chrome
```

Click **Open Folder** and select any React project directory. Analysis runs entirely in the browser — no files leave your machine.

## Build

```bash
cd web
npm run build
# Produces web/dist/ — a static site you can host anywhere
```

## What gets analysed

The tool reads all `.ts`, `.tsx`, `.js`, `.jsx` files (skipping `node_modules`, `dist`, `build`, `.git`). For each file it extracts:

- Imports (static + dynamic) and resolves them to actual files
- Exports, components, custom hooks
- Route paths and navigation links
- All function definitions (components, hooks, async, utilities)
- Tech debt metrics: lines of code, fan-in, fan-out, circular dependencies, missing tests

## CLI / CI gate

Run the exact same analysis headlessly to gate pull requests. The CLI auto-detects the language (React / Swift / Kotlin) and exits non-zero when thresholds are exceeded.

```bash
cd web

# Show the prioritized fix list for any project
npm run analyze -- /path/to/project

# Fail CI if any file's regression risk exceeds 70
npm run analyze -- /path/to/project --max-risk 70

# PR gate: compare a branch against its base — no baseline file needed.
# Analyzes the base ref in a throwaway git worktree (working tree untouched).
npm run analyze -- ./src --base origin/main --fail-on-regression --max-risk 85
```

| Option | Effect |
|--------|--------|
| `--lang react\|swift\|kotlin` | Force language (auto-detected if omitted) |
| `--top <n>` | Show top N risky files (default 10) |
| `--base <git-ref>` | **PR gate** — compare against a base branch via git worktree |
| `--max-critical <n>` | Fail if more than n critical-risk files |
| `--max-risk <n>` | Fail if any file's risk exceeds n |
| `--baseline <file>` / `--save-baseline <file>` | Compare to / write a baseline snapshot file |
| `--fail-on-regression` | Fail if the change regressed vs base/baseline |

## Using it to protect pull requests

**No tool can guarantee a PR is 100% regression-free — this one included.** It is *static* analysis: it reads structure, it never runs your code, so it cannot catch logic bugs, runtime errors, or whether your tests actually pass. Treating any single check as a 100% guarantee is how broken code ships with a green checkmark.

What it *does* guarantee for a PR: it will **fail the build if the change introduces a structural regression** — a new circular dependency, a file that lost its test coverage, a new untested hub, or a file crossing your risk ceiling. That is the architectural layer. Combine it with the layers it can't replace:

| Layer | Catches | Run |
|-------|---------|-----|
| Type check | type / contract breakage | `tsc --noEmit` |
| **Test suite** (actually run it) | behavioral regressions | `npm test` |
| Lint | smells, footguns | eslint |
| **Module Analyzer** | new debt, new cycles, lost coverage, blast radius | `analyze --base` |
| Human review | intent, edge cases | the diff + the Impact report |

A ready-to-use GitHub Actions workflow combining these layers is in [`.github/workflows/quality-gate.yml`](.github/workflows/quality-gate.yml). The PR gate step is one line:

```yaml
- run: npm run analyze -- ./src --base "origin/${{ github.base_ref }}" --fail-on-regression --max-risk 85
```
| `--json` | Machine-readable output |

Exit codes: `0` ok · `1` threshold violation · `2` regression · `3` usage error.

## Prompt toolkit (paste into Claude Code)

| File | Purpose |
|--------|---------|
| `scan.sh [path]` | No-AI static scan — produces `mfe-map.md` from shell |
| `analyze-with-local-model.sh [path]` | Feed the scan output to a local Ollama/LM Studio model |
| `mfe-analyzer-quick.md` / `mfe-analyzer-prompt.md` | React MFE deep-read prompts |
| `ios-swift-analyzer-prompt.md` / `android-kotlin-analyzer-prompt.md` | Native deep-read prompts |

## Tech stack

- [Vite](https://vitejs.dev/) + React 18 + TypeScript
- [@xyflow/react](https://reactflow.dev/) v12 — interactive graph canvas
- [@dagrejs/dagre](https://github.com/dagrejs/dagre) — automatic graph layout
- [Zustand](https://zustand-demo.pmnd.rs/) — state management
- [Tailwind CSS](https://tailwindcss.com/) v3
- [Lucide React](https://lucide.dev/) — icons
- Zero AI / no backend / no tracking
