# MFE Analyzer — Quick Paste Version

Drop this into any Claude Code session opened inside your MFE repo.

---

Analyze this entire React MFE codebase and produce a structured knowledge map. Read actual files — do not guess.

Produce these 10 sections in order:

1. **MFE Topology** — list each app (host/remote), its entry point, module-federation config (exposes, remotes, shared deps)

2. **Routes & Pages** — for each app: every route path → component → file, lazy/eager, any auth guard

3. **Component Map** — grouped tree per app: component name, type (container/presentational), one-line purpose, what store/context it reads

4. **Hooks Catalog** — every custom hook: file, params, return type, one-line job, external deps (API / store / browser)

5. **State Management** — every Redux slice / Zustand store / Context: key state shape and main actions/selectors; note anything shared across MFE boundaries

6. **API & Data Layer** — every service/query file: base URL env var, endpoints (method + path), response shape

7. **Cross-MFE Communication** — CustomEvents (name, payload, emitter, listener), shared singletons, URL handoffs, host-injected props

8. **Shared Packages** — any packages/ or libs/: name, purpose, key exports, which apps consume it

9. **Module Summary Cards** — per MFE: business domain, entry shell, page count, state deps, APIs, what it exposes/consumes, anything worth flagging ⚠️

10. **Quick-Reference Index** — flat lookup: feature area → files to open

Format each section with the header and use code blocks for structured data. Write `(none found)` for any section with no results. Flag bugs, dead code, or anti-patterns with ⚠️. Be concise and factual.
