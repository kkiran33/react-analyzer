import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type {
  AnalysisStatus, FileType, ParsedFile, ViewMode,
  TechDebtMetrics, TypeOverride,
} from '@/types/graph';

interface GraphStore {
  status: AnalysisStatus;
  fileCount: number;
  rootName: string;
  error: string | null;

  files: Map<string, ParsedFile>;
  nodes: Node[];
  edges: Edge[];
  techDebt: Map<string, TechDebtMetrics>;
  typeOverrides: TypeOverride;

  view: ViewMode;
  selectedNodeId: string | null;
  enabledTypes: Set<FileType>;
  searchQuery: string;

  setView: (v: ViewMode) => void;
  setStatus: (s: AnalysisStatus) => void;
  setFileCount: (n: number) => void;
  setGraph: (files: Map<string, ParsedFile>, nodes: Node[], edges: Edge[], rootName: string) => void;
  setTechDebt: (m: Map<string, TechDebtMetrics>) => void;
  setTypeOverride: (pattern: string, type: FileType) => void;
  removeTypeOverride: (pattern: string) => void;
  setError: (msg: string) => void;
  setSelectedNode: (id: string | null) => void;
  toggleType: (type: FileType) => void;
  setSearch: (q: string) => void;
  reset: () => void;
}

const ALL_TYPES = new Set<FileType>([
  'page', 'component', 'hook', 'store', 'service', 'router', 'config', 'util', 'test',
]);

export const useGraphStore = create<GraphStore>((set) => ({
  status: 'idle',
  fileCount: 0,
  rootName: '',
  error: null,
  files: new Map(),
  nodes: [],
  edges: [],
  techDebt: new Map(),
  typeOverrides: {},
  view: 'files',
  selectedNodeId: null,
  enabledTypes: new Set(ALL_TYPES),
  searchQuery: '',

  setView: (view) => set({ view, selectedNodeId: null }),
  setStatus: (status) => set({ status }),
  setFileCount: (fileCount) => set({ fileCount }),

  setGraph: (files, nodes, edges, rootName) =>
    set({ files, nodes, edges, rootName, status: 'done', error: null }),

  setTechDebt: (techDebt) => set({ techDebt }),

  setTypeOverride: (pattern, type) =>
    set((s) => ({ typeOverrides: { ...s.typeOverrides, [pattern]: type } })),

  removeTypeOverride: (pattern) =>
    set((s) => {
      const next = { ...s.typeOverrides };
      delete next[pattern];
      return { typeOverrides: next };
    }),

  setError: (error) => set({ error, status: 'error' }),
  setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),

  toggleType: (type) =>
    set((s) => {
      const next = new Set(s.enabledTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { enabledTypes: next };
    }),

  setSearch: (searchQuery) => set({ searchQuery }),

  reset: () =>
    set({
      status: 'idle',
      fileCount: 0,
      rootName: '',
      error: null,
      files: new Map(),
      nodes: [],
      edges: [],
      techDebt: new Map(),
      view: 'files',
      selectedNodeId: null,
      enabledTypes: new Set(ALL_TYPES),
      searchQuery: '',
    }),
}));
