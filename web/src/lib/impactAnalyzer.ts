import type { ParsedFile, ImpactChain } from '@/types/graph';

export function buildReverseMap(
  files: Map<string, ParsedFile>,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  for (const id of files.keys()) reverse.set(id, new Set());

  for (const [importerId, file] of files) {
    for (const dep of file.resolvedImports) {
      if (files.has(dep)) {
        reverse.get(dep)?.add(importerId);
      }
    }
  }
  return reverse;
}

export function computeImpact(
  fileId: string,
  files: Map<string, ParsedFile>,
): ImpactChain {
  const reverse = buildReverseMap(files);
  const { direct, transitive } = bfs(fileId, reverse);

  const affected = new Set([...direct, ...transitive]);
  const affectedRoutes: string[] = [];
  const affectedTests: string[] = [];

  for (const id of affected) {
    const f = files.get(id);
    if (!f) continue;
    affectedRoutes.push(...f.routes);
    if (f.type === 'test') affectedTests.push(id);
  }

  return {
    rootFileId: fileId,
    direct,
    transitive,
    affectedRoutes: [...new Set(affectedRoutes)],
    affectedTests,
    totalImpact: direct.length + transitive.length,
  };
}

function bfs(
  fileId: string,
  reverseMap: Map<string, Set<string>>,
): { direct: string[]; transitive: string[] } {
  const visited = new Set<string>([fileId]);
  const direct: string[] = [];
  const transitive: string[] = [];

  // Level 0 → direct
  const firstLevel = Array.from(reverseMap.get(fileId) ?? []);
  for (const id of firstLevel) {
    if (!visited.has(id)) { visited.add(id); direct.push(id); }
  }

  // Level 1+ → transitive (BFS from direct nodes)
  let queue = [...direct];
  while (queue.length > 0) {
    const next: string[] = [];
    for (const node of queue) {
      for (const importer of reverseMap.get(node) ?? []) {
        if (!visited.has(importer)) {
          visited.add(importer);
          transitive.push(importer);
          next.push(importer);
        }
      }
    }
    queue = next;
  }

  return { direct, transitive };
}
