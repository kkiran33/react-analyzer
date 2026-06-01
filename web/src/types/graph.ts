export type FileType =
  | 'page'
  | 'component'
  | 'hook'
  | 'store'
  | 'service'
  | 'router'
  | 'config'
  | 'util'
  | 'test';

export interface ParsedFile {
  id: string;
  path: string;
  name: string;
  dir: string;
  extension: string;
  type: FileType;
  imports: ImportInfo[];
  resolvedImports: string[];
  exports: string[];
  components: string[];
  hooks: string[];
  routes: string[];
  navLinks: NavLink[];
  allFunctions: FunctionDef[];
  linesOfCode: number;
}

export interface ImportInfo {
  raw: string;
  isRelative: boolean;
  names: string[];
}

export type AnalysisStatus = 'idle' | 'reading' | 'parsing' | 'building' | 'done' | 'error';

export type ViewMode = 'files' | 'journey' | 'functions' | 'techdebt';

export type DebtFlag =
  | 'god-file'
  | 'high-fan-in'
  | 'high-fan-out'
  | 'circular'
  | 'no-test'
  | 'unused-exports'
  | 'high-complexity';

export interface TechDebtMetrics {
  fileId: string;
  fanIn: number;
  fanOut: number;
  linesOfCode: number;
  circularWith: string[];
  hasTest: boolean;
  unusedExports: string[];
  debtScore: number;
  flags: DebtFlag[];
}

export interface ImpactChain {
  rootFileId: string;
  direct: string[];
  transitive: string[];
  affectedRoutes: string[];
  affectedTests: string[];
  totalImpact: number;
}

export type TypeOverride = Record<string, FileType>;

export interface NavLink {
  target: string;
  type: 'link' | 'navigate';
}

export interface FunctionDef {
  name: string;
  kind: 'component' | 'hook' | 'async' | 'function';
  isExported: boolean;
}

export const FILE_TYPE_CONFIG: Record<
  FileType,
  { label: string; color: string; bg: string; dimBg: string }
> = {
  page:      { label: 'Page',      color: '#3B82F6', bg: '#1E3A5F', dimBg: '#172554' },
  component: { label: 'Component', color: '#10B981', bg: '#064E3B', dimBg: '#022c22' },
  hook:      { label: 'Hook',      color: '#F59E0B', bg: '#451A03', dimBg: '#1c0a00' },
  store:     { label: 'Store',     color: '#EF4444', bg: '#450A0A', dimBg: '#1c0404' },
  service:   { label: 'Service',   color: '#8B5CF6', bg: '#2E1065', dimBg: '#170730' },
  router:    { label: 'Router',    color: '#EC4899', bg: '#500724', dimBg: '#2d0410' },
  config:    { label: 'Config',    color: '#94A3B8', bg: '#1E293B', dimBg: '#0f172a' },
  util:      { label: 'Util',      color: '#64748B', bg: '#1E293B', dimBg: '#0f172a' },
  test:      { label: 'Test',      color: '#4B5563', bg: '#111827', dimBg: '#0a0f18' },
};
