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

### Four views
| View | What it shows |
|------|---------------|
| **Files** | Import dependency graph — every file as a node, import edges between them |
| **Journey** | Screen navigation flow — entry screens, `L0→L1→L2…` levels (BFS depth through the flow), `<Link>`/`navigate()` connections. For Swift/Kotlin it also infers screen→screen edges from the symbol-reference graph, so flows aren't flat even when explicit nav calls aren't matched |
| **Functions** | Per-file export map — components (C), hooks (H), async (A), utilities (F) |
| **Tech Debt** | Sortable metrics table — LOC, fan-in, fan-out, circular deps, test coverage, debt score. **Click any row to drill down** into a per-issue explanation: a score breakdown, *why* each problem matters, and a concrete *how-to-fix*, with clickable links to the files involved (e.g. circular-dependency partners) |

### Module Deep-Dive (right panel)
Click any node to open a 5-tab panel:
- **Overview** — stats, debt score meter with an **Issues & how-to-fix** breakdown (why each flag fired + a concrete recommendation), imports, used-by, exports
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

## Extra tools (CLI)

| Script | Purpose |
|--------|---------|
| `scan.sh [path]` | No-AI static scan — produces `mfe-map.md` from shell |
| `analyze-with-local-model.sh [path]` | Feed the scan output to a local Ollama/LM Studio model |
| `mfe-analyzer-quick.md` | Prompt to paste into Claude Code for a deep AI-assisted analysis |
| `mfe-analyzer-prompt.md` | Full 10-step detailed analysis prompt |

## Tech stack

- [Vite](https://vitejs.dev/) + React 18 + TypeScript
- [@xyflow/react](https://reactflow.dev/) v12 — interactive graph canvas
- [@dagrejs/dagre](https://github.com/dagrejs/dagre) — automatic graph layout
- [Zustand](https://zustand-demo.pmnd.rs/) — state management
- [Tailwind CSS](https://tailwindcss.com/) v3
- [Lucide React](https://lucide.dev/) — icons
- Zero AI / no backend / no tracking
