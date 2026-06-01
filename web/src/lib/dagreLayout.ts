import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

export const NODE_W = 200;
export const NODE_H = 56;

export interface LayoutOptions {
  rankdir?: 'LR' | 'TB';
  nodesep?: number;
  ranksep?: number;
  getSize?: (node: Node) => { w: number; h: number };
}

export function applyDagreLayout(nodes: Node[], edges: Edge[], opts: LayoutOptions = {}): void {
  if (nodes.length === 0) return;

  const { rankdir = 'LR', nodesep = 60, ranksep = 140, getSize } = opts;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep, ranksep, marginx: 60, marginy: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const size = getSize?.(node) ?? { w: NODE_W, h: NODE_H };
    g.setNode(node.id, { width: size.w, height: size.h });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      const size = getSize?.(node) ?? { w: NODE_W, h: NODE_H };
      node.position = {
        x: pos.x - size.w / 2,
        y: pos.y - size.h / 2,
      };
    }
  }
}
