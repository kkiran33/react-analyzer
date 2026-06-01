import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import { useGraphStore } from '@/store/useGraphStore';
import { FILE_TYPE_CONFIG, type FileType } from '@/types/graph';
import type { ParsedFile } from '@/types/graph';
import { FileNode } from './nodes/FileNode';
import { JourneyNode } from './nodes/JourneyNode';
import { FunctionFileNode } from './nodes/FunctionFileNode';
import { buildJourneyGraph } from '@/lib/journeyBuilder';
import { buildFunctionGraph } from '@/lib/functionMapper';
import { computeImpact } from '@/lib/impactAnalyzer';

const nodeTypes = {
  fileNode: FileNode,
  journeyNode: JourneyNode,
  functionFileNode: FunctionFileNode,
};

function Canvas() {
  const rawNodes = useGraphStore((s) => s.nodes);
  const rawEdges = useGraphStore((s) => s.edges);
  const files = useGraphStore((s) => s.files);
  const view = useGraphStore((s) => s.view);
  const enabledTypes = useGraphStore((s) => s.enabledTypes);
  const searchQuery = useGraphStore((s) => s.searchQuery);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const { fitView } = useReactFlow();
  const didFit = useRef(false);

  // Impact chain for files view highlighting
  const impactChain = useMemo(() => {
    if (!selectedNodeId || view !== 'files') return null;
    return computeImpact(selectedNodeId, files);
  }, [selectedNodeId, view, files]);

  // Compute the graph for the active view
  const { activeNodes, activeEdges } = useMemo(() => {
    if (view === 'journey') {
      const g = buildJourneyGraph(files);
      return { activeNodes: g.nodes, activeEdges: g.edges };
    }
    if (view === 'functions') {
      const g = buildFunctionGraph(files);
      return { activeNodes: g.nodes, activeEdges: g.edges };
    }
    // Files view: apply type + search filters + impact highlighting
    const filteredNodes = rawNodes.map((n) => {
      const file = n.data.file as ParsedFile;
      const typeHidden = !enabledTypes.has(file.type as FileType);
      const searchHidden = searchQuery.length > 1
        ? !file.name.toLowerCase().includes(searchQuery.toLowerCase())
        : false;
      return {
        ...n,
        hidden: typeHidden || searchHidden,
        data: {
          ...n.data,
          isDirectImpact: impactChain?.direct.includes(n.id) ?? false,
          isTransitiveImpact: impactChain?.transitive.includes(n.id) ?? false,
        },
      };
    });
    const hiddenIds = new Set(filteredNodes.filter((n) => n.hidden).map((n) => n.id));
    const filteredEdges = rawEdges.map((e) => ({
      ...e,
      hidden: hiddenIds.has(e.source) || hiddenIds.has(e.target),
    }));
    return { activeNodes: filteredNodes, activeEdges: filteredEdges };
  }, [view, files, rawNodes, rawEdges, enabledTypes, searchQuery]);

  const [nodes, setNodes, onNodesChange] = useNodesState(activeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(activeEdges);

  useEffect(() => {
    setNodes(activeNodes);
    setEdges(activeEdges);
  }, [activeNodes, activeEdges, setNodes, setEdges]);

  // Fit view whenever the view mode changes or graph first loads
  const prevView = useRef(view);
  useEffect(() => {
    if (prevView.current !== view || !didFit.current) {
      prevView.current = view;
      didFit.current = false;
    }
  }, [view]);

  useEffect(() => {
    if (rawNodes.length > 0) didFit.current = false;
  }, [rawNodes]);

  const onInit = useCallback(() => {
    if (!didFit.current) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.12, duration: 400 });
        didFit.current = true;
      });
    }
  }, [fitView]);

  // Refit when view changes (after nodes settle)
  useEffect(() => {
    requestAnimationFrame(() => {
      fitView({ padding: 0.12, duration: 400 });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const onNodeClick: NodeMouseHandler<Node> = useCallback(
    (_, node) => setSelectedNode(node.id),
    [setSelectedNode],
  );
  const onPaneClick = useCallback(() => setSelectedNode(null), [setSelectedNode]);

  const miniMapNodeColor = useCallback((node: Node) => {
    const file = node.data?.file as ParsedFile | undefined;
    return file ? FILE_TYPE_CONFIG[file.type]?.color ?? '#64748b' : '#64748b';
  }, []);

  const viewLabel: Record<string, string> = {
    files: 'Import graph',
    journey: 'Page journey — top-to-bottom flow',
    functions: 'Function map — exported symbols per file',
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onInit={onInit}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.03}
      maxZoom={2}
      style={{ background: '#0f172a' }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
      <Controls style={{ background: '#1e293b', border: '1px solid #334155' }} showInteractive={false} />
      <MiniMap
        nodeColor={miniMapNodeColor}
        maskColor="rgba(15,23,42,0.7)"
        style={{ background: '#1e293b', border: '1px solid #334155' }}
      />

      {/* View label */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <div className="text-xs text-slate-600 bg-slate-950 border border-slate-800 px-3 py-1 rounded-full">
          {viewLabel[view]}
          {view === 'journey' && nodes.length === 0 && ' — no routes detected'}
          {view === 'functions' && nodes.length === 0 && ' — no exports detected'}
        </div>
      </div>
    </ReactFlow>
  );
}

export function FlowCanvas() {
  const status = useGraphStore((s) => s.status);
  if (status !== 'done') return null;
  return (
    <div className="flex-1 relative">
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
    </div>
  );
}
