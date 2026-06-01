# React Analyzer

A browser-based static analysis tool for React codebases. Open any React project folder and instantly get an interactive visual map of your modules, pages, components, hooks, dependencies, and technical debt — with no server, no AI, and no configuration needed.

## Features

### Four views
| View | What it shows |
|------|---------------|
| **Files** | Import dependency graph — every file as a node, import edges between them |
| **Journey** | Page navigation flow — routes, `<Link>` connections, `navigate()` calls |
| **Functions** | Per-file export map — components (C), hooks (H), async (A), utilities (F) |
| **Tech Debt** | Sortable metrics table — LOC, fan-in, fan-out, circular deps, test coverage, debt score |

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
