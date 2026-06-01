import type { ParsedFile } from '@/types/graph';

type Color = 'white' | 'gray' | 'black';

/**
 * Detects all circular import dependencies using iterative DFS.
 * Returns a Map: fileId → array of fileIds it forms a cycle with.
 * Files not in any cycle map to [].
 */
export function detectCircularDeps(
  files: Map<string, ParsedFile>,
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const [id, file] of files) {
    adjacency.set(id, file.resolvedImports.filter(r => files.has(r)));
  }

  const colors = new Map<string, Color>();
  const cyclePartners = new Map<string, Set<string>>();

  for (const id of files.keys()) {
    colors.set(id, 'white');
    cyclePartners.set(id, new Set());
  }

  for (const id of files.keys()) {
    if (colors.get(id) === 'white') {
      dfs(id, adjacency, colors, [], cyclePartners);
    }
  }

  const result = new Map<string, string[]>();
  for (const [id, partners] of cyclePartners) {
    result.set(id, Array.from(partners));
  }
  return result;
}

function dfs(
  nodeId: string,
  adjacency: Map<string, string[]>,
  colors: Map<string, Color>,
  stack: string[],
  cyclePartners: Map<string, Set<string>>,
): void {
  colors.set(nodeId, 'gray');
  stack.push(nodeId);

  for (const neighbor of adjacency.get(nodeId) ?? []) {
    if (colors.get(neighbor) === 'white') {
      dfs(neighbor, adjacency, colors, stack, cyclePartners);
    } else if (colors.get(neighbor) === 'gray') {
      // Back edge → found a cycle
      const cycleStart = stack.indexOf(neighbor);
      if (cycleStart !== -1) {
        const cycle = stack.slice(cycleStart);
        for (const a of cycle) {
          for (const b of cycle) {
            if (a !== b) cyclePartners.get(a)?.add(b);
          }
        }
      }
    }
  }

  stack.pop();
  colors.set(nodeId, 'black');
}
