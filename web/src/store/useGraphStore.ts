import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type {
  AnalysisStatus, FileType, Language, ParsedFile, ViewMode,
  TechDebtMetrics, TypeOverride, FileRisk, Snapshot,
} from '@/types/graph';

interface GraphStore {
  status: AnalysisStatus;
  fileCount: number;
  rootName: string;
  language: Language;
  error: string | null;

  files: Map<string, ParsedFile>;
  nodes: Node[];
  edges: Edge[];
  techDebt: Map<string, TechDebtMetrics>;
  risks: Map<string, FileRisk>;
  baseline: Snapshot | null;
  typeOverrides: TypeOverride;

  view: ViewMode;
  selectedNodeId: string | null;
  enabledTypes: Set<FileType>;
  searchQuery: string;

  setView: (v: ViewMode) => void;
  setStatus: (s: AnalysisStatus) => void;
  setLanguage: (l: Language) => void;
  setFileCount: (n: number) => void;
  setGraph: (files: Map<string, ParsedFile>, nodes: Node[], edges: Edge[], rootName: string) => void;
  setTechDebt: (m: Map<string, TechDebtMetrics>) => void;
  setRisks: (m: Map<string, FileRisk>) => void;
  setBaseline: (s: Snapshot | null) => void;
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
  language: 'react',
  error: null,
  files: new Map(),
  nodes: [],
  edges: [],
  techDebt: new Map(),
  risks: new Map(),
  baseline: null,
  typeOverrides: {},
  view: 'files',
  selectedNodeId: null,
  enabledTypes: new Set(ALL_TYPES),
  searchQuery: '',

  setView: (view) => set({ view, selectedNodeId: null }),
  setStatus: (status) => set({ status }),
  setLanguage: (language) => set({ language }),
  setFileCount: (fileCount) => set({ fileCount }),

  setGraph: (files, nodes, edges, rootName) =>
    set({ files, nodes, edges, rootName, status: 'done', error: null }),

  setTechDebt: (techDebt) => set({ techDebt }),
  setRisks: (risks) => set({ risks }),
  setBaseline: (baseline) => set({ baseline }),

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
    set((s) => ({
      status: 'idle',
      fileCount: 0,
      rootName: '',
      language: s.language,
      error: null,
      files: new Map(),
      nodes: [],
      edges: [],
      techDebt: new Map(),
      risks: new Map(),
      baseline: s.baseline, // keep an imported baseline across re-analysis
      view: 'files',
      selectedNodeId: null,
      enabledTypes: new Set(ALL_TYPES),
      searchQuery: '',
    })),
}));
