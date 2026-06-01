import type { Node, Edge } from '@xyflow/react';
import type { ParsedFile } from '@/types/graph';
import { applyDagreLayout } from './dagreLayout';

const JOURNEY_NODE_W = 220;
const JOURNEY_NODE_H = 72;

export interface JourneyRoute {
  path: string;
  componentName: string;
  fileId: string;
  depth: number;
  isProtected: boolean;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

const PROTECTED_PATTERNS = /PrivateRoute|AuthRoute|RequireAuth|ProtectedRoute|withAuth/;

export function buildJourneyGraph(files: Map<string, ParsedFile>): GraphData {
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
        isProtected,
      });
    }
  }

  if (routeMap.size === 0) return { nodes: [], edges: [] };

  // 2. Build React Flow nodes
  const nodes: Node[] = [];
  for (const [path, route] of routeMap) {
    nodes.push({
      id: `route:${path}`,
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

  // Route nesting: /dashboard is parent of /dashboard/settings
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
      const targetKey = findBestMatchingRoute(link.target, routeMap);
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

  applyDagreLayout(nodes, edges, {
    rankdir: 'TB',
    nodesep: 80,
    ranksep: 100,
    getSize: () => ({ w: JOURNEY_NODE_W, h: JOURNEY_NODE_H }),
  });

  return { nodes, edges };
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
