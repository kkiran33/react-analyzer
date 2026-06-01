import type { Node, Edge } from '@xyflow/react';
import type { ParsedFile } from '@/types/graph';
import { applyDagreLayout } from './dagreLayout';

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

export function buildGraph(files: Map<string, ParsedFile>): GraphData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

  for (const file of files.values()) {
    nodes.push({
      id: file.id,
      type: 'fileNode',
      position: { x: 0, y: 0 },
      data: { file },
    });
  }

  for (const file of files.values()) {
    for (const targetId of file.resolvedImports) {
      if (!files.has(targetId)) continue;
      const edgeId = `${file.id}→${targetId}`;
      if (edgeSet.has(edgeId)) continue;
      edgeSet.add(edgeId);
      edges.push({
        id: edgeId,
        source: file.id,
        target: targetId,
        type: 'smoothstep',
        style: { stroke: '#334155', strokeWidth: 1.5 },
        markerEnd: { type: 'arrowclosed' as const, color: '#334155', width: 14, height: 14 },
      });
    }
  }

  applyDagreLayout(nodes, edges);

  return { nodes, edges };
}
