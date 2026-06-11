import type { Node, Edge } from '@xyflow/react';
import type { ParsedFile, Language } from '@/types/graph';
import { applyDagreLayout } from './dagreLayout';

const JOURNEY_NODE_W = 220;
const JOURNEY_NODE_H = 72;

export interface JourneyRoute {
  path: string;
  componentName: string;
  fileId: string;
  depth: number;       // URL path-segment count (meaningful for web routes)
  level: number;       // position in the navigation flow (0 = entry screen)
  isEntry: boolean;    // no other screen navigates into it
  isProtected: boolean;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

const PROTECTED_PATTERNS = /PrivateRoute|AuthRoute|RequireAuth|ProtectedRoute|withAuth/;

export function buildJourneyGraph(
  files: Map<string, ParsedFile>,
  language: Language = 'react',
): GraphData {
  const isNative = language === 'swift' || language === 'kotlin';

  // 1. Collect all unique routes
  const routeMap = new Map<string, JourneyRoute>();

  for (const file of files.values()) {
    const isProtected = PROTECTED_PATTERNS.test(file.imports.map(i => i.raw).join(' '));

    for (const routePath of file.routes) {
      if (routeMap.has(routePath)) continue;
      routeMap.set(routePath, {
        path: routePath,
        componentName: file.components[0] ?? file.name,
        fileId: file.id,
        depth: routePath.split('/').filter(Boolean).length,
        level: 0,
        isEntry: true,
        isProtected,
      });
    }
  }

  if (routeMap.size === 0) return { nodes: [], edges: [] };

  // Native navigation targets a *type name* (e.g. ProfileViewController), but
  // routes are keyed by file name. Index every declared type → its route so a
  // `pushViewController(ProfileViewController())` resolves even when the screen
  // lives in a differently-named file.
  const routeByName = new Map<string, string>();
  for (const [path, route] of routeMap) {
    const owner = files.get(route.fileId);
    if (!owner) continue;
    routeByName.set(owner.name.toLowerCase(), path);
    for (const decl of owner.components) routeByName.set(decl.toLowerCase(), path);
  }

  // 2. Build React Flow nodes
  const nodes: Node[] = [];
  for (const [, route] of routeMap) {
    nodes.push({
      id: `route:${route.path}`,
      type: 'journeyNode',
      position: { x: 0, y: 0 },
      data: { route },
    });
  }

  // 3. Build edges
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

  const addEdge = (source: string, target: string, style: Partial<Edge>) => {
    const id = `${source}→${target}`;
    if (edgeSet.has(id)) return;
    edgeSet.add(id);
    edges.push({ id, source, target, type: 'smoothstep', ...style } as Edge);
  };

  // Route nesting: /dashboard is parent of /dashboard/settings (web only — native
  // routes are flat single segments, so nesting never applies there).
  for (const [path] of routeMap) {
    const parent = findParentRoute(path, routeMap);
    if (parent) {
      addEdge(`route:${parent}`, `route:${path}`, {
        style: { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '4,4' },
        markerEnd: { type: 'arrowclosed' as const, color: '#475569', width: 12, height: 12 },
        label: 'nested',
        labelStyle: { fill: '#64748b', fontSize: 9 },
        labelBgStyle: { fill: '#0f172a' },
      });
    }
  }

  // Navigation links: from files that have routes → to the nav target
  for (const file of files.values()) {
    const ownerRoute = findOwnerRoute(file, files, routeMap);
    if (!ownerRoute) continue;

    for (const link of file.navLinks) {
      const targetKey = resolveNavTarget(link.target, routeMap, routeByName);
      if (!targetKey || targetKey === ownerRoute) continue;

      addEdge(`route:${ownerRoute}`, `route:${targetKey}`, {
        animated: link.type === 'navigate',
        style: {
          stroke: link.type === 'navigate' ? '#3B82F6' : '#10B981',
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: 'arrowclosed' as const,
          color: link.type === 'navigate' ? '#3B82F6' : '#10B981',
          width: 12,
          height: 12,
        },
        label: link.type === 'navigate' ? 'navigate()' : '<Link>',
        labelStyle: { fill: link.type === 'navigate' ? '#60a5fa' : '#34d399', fontSize: 9 },
        labelBgStyle: { fill: '#0f172a' },
      });
    }
  }

  // Inferred native flow: explicit nav-call detection is regex-based and misses
  // the common "build the VC in a variable, then push it" pattern. But the native
  // parser already links files by symbol reference, so a screen that *references*
  // another screen type is almost certainly navigating to it. Use those edges to
  // recover the flow (otherwise every screen lands flat at L0 with no hierarchy).
  if (isNative) {
    for (const file of files.values()) {
      if (file.type !== 'page' || file.routes.length === 0) continue;
      const ownerRoute = file.routes[0];
      for (const depId of file.resolvedImports) {
        const dep = files.get(depId);
        if (!dep || dep.type !== 'page' || dep.routes.length === 0) continue;
        const targetRoute = dep.routes[0];
        if (targetRoute === ownerRoute) continue;
        addEdge(`route:${ownerRoute}`, `route:${targetRoute}`, {
          style: { stroke: '#14B8A6', strokeWidth: 1.5, strokeDasharray: '5,4' },
          markerEnd: { type: 'arrowclosed' as const, color: '#14B8A6', width: 12, height: 12 },
          label: 'references',
          labelStyle: { fill: '#2dd4bf', fontSize: 9 },
          labelBgStyle: { fill: '#0f172a' },
        });
      }
    }
  }

  // 4. Compute journey level (BFS distance from entry screens) so the L-badge
  // reflects flow position, not URL nesting. Entry screens = nothing leads in.
  const levels = computeLevels(nodes.map(n => n.id), edges);
  const hasIncoming = new Set(edges.map(e => e.target));
  for (const node of nodes) {
    const route = (node.data as { route: JourneyRoute }).route;
    route.level = levels.get(node.id) ?? 0;
    route.isEntry = !hasIncoming.has(node.id);
  }

  applyDagreLayout(nodes, edges, {
    rankdir: 'TB',
    nodesep: 80,
    ranksep: 100,
    getSize: () => ({ w: JOURNEY_NODE_W, h: JOURNEY_NODE_H }),
  });

  return { nodes, edges };
}

// BFS shortest-distance from every entry (indegree-0) node. Safe with cycles:
// first assignment wins, so it always terminates. Nodes unreachable from any
// entry (pure cycles) fall back to level 0.
function computeLevels(nodeIds: string[], edges: Edge[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of nodeIds) { adj.set(id, []); indeg.set(id, 0); }
  for (const e of edges) {
    if (!adj.has(e.source) || !indeg.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }

  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    if ((indeg.get(id) ?? 0) === 0) { level.set(id, 0); queue.push(id); }
  }

  while (queue.length) {
    const cur = queue.shift()!;
    const cl = level.get(cur)!;
    for (const nb of adj.get(cur) ?? []) {
      if (!level.has(nb)) { level.set(nb, cl + 1); queue.push(nb); }
    }
  }

  for (const id of nodeIds) if (!level.has(id)) level.set(id, 0);
  return level;
}

function findParentRoute(
  path: string,
  routeMap: Map<string, JourneyRoute>,
): string | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // Walk up: /a/b/c → /a/b → /a → /
  for (let i = segments.length - 1; i >= 0; i--) {
    const candidate = '/' + segments.slice(0, i).join('/');
    const normalized = candidate === '/' ? '/' : candidate;
    if (routeMap.has(normalized) && normalized !== path) return normalized;
  }

  // Root
  if (path !== '/' && routeMap.has('/')) return '/';
  return null;
}

function findOwnerRoute(
  file: ParsedFile,
  files: Map<string, ParsedFile>,
  routeMap: Map<string, JourneyRoute>,
): string | null {
  // If this file defines routes, use its first route
  if (file.routes.length > 0 && routeMap.has(file.routes[0])) return file.routes[0];

  // Check if a page file imports this file
  for (const importer of files.values()) {
    if (importer.routes.length > 0 && importer.resolvedImports.includes(file.id)) {
      return importer.routes[0];
    }
  }

  return null;
}

// Resolve a navigation target to a known route. Tries exact/path matching first
// (web routes), then falls back to matching a declared type name (native).
function resolveNavTarget(
  target: string,
  routeMap: Map<string, JourneyRoute>,
  routeByName: Map<string, string>,
): string | null {
  const byPath = findBestMatchingRoute(target, routeMap);
  if (byPath) return byPath;

  const name = target.replace(/^\//, '').toLowerCase();
  return routeByName.get(name) ?? null;
}

function findBestMatchingRoute(
  target: string,
  routeMap: Map<string, JourneyRoute>,
): string | null {
  if (routeMap.has(target)) return target;

  // Try matching dynamic segments: /user/123 matches /user/:id
  for (const [path] of routeMap) {
    const pathParts = path.split('/');
    const targetParts = target.split('/');
    if (pathParts.length !== targetParts.length) continue;
    const matches = pathParts.every((p, i) => p.startsWith(':') || p === targetParts[i]);
    if (matches) return path;
  }

  // Prefix match: /dashboard/anything → /dashboard
  const parts = target.split('/').filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const candidate = '/' + parts.slice(0, i).join('/');
    if (routeMap.has(candidate)) return candidate;
  }

  return null;
}
