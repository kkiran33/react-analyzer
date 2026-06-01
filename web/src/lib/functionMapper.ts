import type { Node, Edge } from '@xyflow/react';
import type { ParsedFile } from '@/types/graph';
import { applyDagreLayout } from './dagreLayout';

const FN_NODE_W = 220;
const FN_HEADER_H = 52;
const FN_ROW_H = 22;
const FN_PADDING = 12;
const MAX_ROWS = 10;
const MAX_FILES = 80;

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

function fileNodeHeight(file: ParsedFile): number {
  const rows = Math.min(file.allFunctions.filter(f => f.isExported).length || file.exports.length, MAX_ROWS);
  return FN_HEADER_H + rows * FN_ROW_H + FN_PADDING;
}

export function buildFunctionGraph(files: Map<string, ParsedFile>): GraphData {
  // Only show meaningful non-test files
  const relevant = [...files.values()]
    .filter(f => f.type !== 'test' && f.type !== 'config' && (f.exports.length > 0 || f.allFunctions.length > 0))
    .slice(0, MAX_FILES);

  if (relevant.length === 0) return { nodes: [], edges: [] };

  const relevantIds = new Set(relevant.map(f => f.id));

  // File nodes (with expanded function list inside)
  const nodes: Node[] = relevant.map(file => ({
    id: file.id,
    type: 'functionFileNode',
    position: { x: 0, y: 0 },
    data: { file },
  }));

  // Edges: same as import graph but only between relevant files
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

  for (const file of relevant) {
    for (const targetId of file.resolvedImports) {
      if (!relevantIds.has(targetId)) continue;
      const id = `${file.id}→${targetId}`;
      if (edgeSet.has(id)) continue;
      edgeSet.add(id);
      edges.push({
        id,
        source: file.id,
        target: targetId,
        type: 'smoothstep',
        style: { stroke: '#334155', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#334155', width: 14, height: 14 },
      });
    }
  }

  applyDagreLayout(nodes, edges, {
    rankdir: 'LR',
    nodesep: 50,
    ranksep: 160,
    getSize: (n) => {
      const file = n.data.file as ParsedFile;
      return { w: FN_NODE_W, h: fileNodeHeight(file) };
    },
  });

  return { nodes, edges };
}
