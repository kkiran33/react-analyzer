import type { ParsedFile, ImportInfo, NavLink, FunctionDef, TypeOverride } from '@/types/graph';
import { classifyFile } from './classifier';

export function parseFiles(
  fileMap: Map<string, string>,
  overrides?: TypeOverride,
): Map<string, ParsedFile> {
  const parsed = new Map<string, ParsedFile>();
  for (const [path, content] of fileMap) {
    parsed.set(path, parseFile(path, content, overrides));
  }

  // Second pass: resolve imports to actual file paths
  for (const file of parsed.values()) {
    file.resolvedImports = file.imports
      .filter(i => i.isRelative)
      .map(i => resolveImport(file.path, i.raw, parsed))
      .filter((p): p is string => p !== null);
  }

  return parsed;
}

function parseFile(path: string, content: string, overrides?: TypeOverride): ParsedFile {
  const segments = path.split('/');
  const filename = segments[segments.length - 1];
  const dotIdx = filename.lastIndexOf('.');
  const name = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const extension = dotIdx > 0 ? filename.slice(dotIdx + 1) : '';
  const dir = segments.slice(0, -1).join('/');

  return {
    id: path,
    path,
    name,
    dir,
    extension,
    type: classifyFile(path, name, content, overrides),
    imports: extractImports(content),
    resolvedImports: [],
    exports: extractExports(content),
    components: extractComponents(content),
    hooks: extractHooks(content),
    routes: extractRoutes(content),
    navLinks: extractNavLinks(content),
    allFunctions: extractAllFunctions(content),
    linesOfCode: content.split('\n').length,
  };
}

function extractImports(content: string): ImportInfo[] {
  const results: ImportInfo[] = [];
  const seen = new Set<string>();

  // static: import X from 'y'  /  import { A, B } from 'y'  /  import 'y'
  const staticRe = /import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;

  while ((m = staticRe.exec(content)) !== null) {
    const raw = m[1];
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push({ raw, isRelative: raw.startsWith('.') || raw.startsWith('/'), names: [] });
  }

  // dynamic: import('./foo')
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(content)) !== null) {
    const raw = m[1];
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push({ raw, isRelative: raw.startsWith('.') || raw.startsWith('/'), names: [] });
  }

  return results;
}

function extractExports(content: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => { if (n && !seen.has(n)) { seen.add(n); names.push(n); } };

  const patterns = [
    /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|enum|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
    /^export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
    /^export\s+\{\s*([^}]+)\s*\}/gm,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (re === patterns[2]) {
        m[1].split(',').forEach(n => add(n.trim().split(/\s+as\s+/)[0].trim()));
      } else {
        add(m[1]);
      }
    }
  }

  return names;
}

function extractComponents(content: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => { if (n && /^[A-Z]/.test(n) && !seen.has(n)) { seen.add(n); names.push(n); } };

  const patterns = [
    /(?:^|\s)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_$]*)\s*[(<]/gm,
    /(?:^|\s)(?:export\s+)?(?:const|let)\s+([A-Z][A-Za-z0-9_$]*)\s*(?::\s*\w[^=]*?)?\s*=\s*(?:React\.|memo\(|forwardRef\(|\()/gm,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) add(m[1]);
  }

  return names;
}

function extractHooks(content: string): string[] {
  const seen = new Set<string>();
  const re = /\b(use[A-Z][A-Za-z0-9]*)\s*[(<(]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) seen.add(m[1]);
  return Array.from(seen).sort();
}

function extractRoutes(content: string): string[] {
  const seen = new Set<string>();
  const patterns = [
    /path\s*[:=]\s*['"`]([^'"`]+)['"`]/g,
    /<Route[^>]+path=['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) seen.add(m[1]);
  }
  return Array.from(seen);
}

function extractNavLinks(content: string): NavLink[] {
  const links: NavLink[] = [];
  const seen = new Set<string>();
  const add = (t: string, type: NavLink['type']) => {
    const clean = t.split('?')[0].split('#')[0];
    if (clean.startsWith('/') && !seen.has(clean)) { seen.add(clean); links.push({ target: clean, type }); }
  };

  // <Link to="/path"> <NavLink to="/path">
  const linkRe = /<(?:Link|NavLink)\s[^>]*\bto=['"`]([^'"`?#\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(content)) !== null) add(m[1], 'link');

  // navigate('/path')  router.push('/path')  history.push('/path')
  const navRe = /(?:navigate|router\.push|history\.push|router\.replace|history\.replace)\s*\(\s*['"`]([^'"`?#\s]+)/g;
  while ((m = navRe.exec(content)) !== null) add(m[1], 'navigate');

  return links;
}

function extractAllFunctions(content: string): FunctionDef[] {
  const fns: FunctionDef[] = [];
  const seen = new Set<string>();

  const add = (name: string, isAsync: boolean, isExported: boolean) => {
    if (seen.has(name)) return;
    seen.add(name);
    let kind: FunctionDef['kind'];
    if (/^[A-Z]/.test(name)) kind = 'component';
    else if (/^use[A-Z]/.test(name)) kind = 'hook';
    else if (isAsync) kind = 'async';
    else kind = 'function';
    fns.push({ name, kind, isExported });
  };

  // function foo(  /  async function foo(  /  export function foo(
  const fnRe = /(export\s+)?(async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<]/gm;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(content)) !== null) add(m[3], !!m[2], !!m[1]);

  // const foo = () =>  /  const foo = async () =>
  const arrowRe = /(export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(async\s+)?(?:\([^)]*\)|[A-Za-z_$]\w*)\s*=>/gm;
  while ((m = arrowRe.exec(content)) !== null) add(m[2], !!m[3], !!m[1]);

  return fns;
}

function resolveImport(
  fromPath: string,
  importPath: string,
  allFiles: Map<string, ParsedFile>,
): string | null {
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) return null;

  const fromDir = fromPath.split('/').slice(0, -1).join('/');
  const base = importPath.startsWith('/')
    ? importPath.slice(1)
    : normalizePath(`${fromDir}/${importPath}`);

  if (allFiles.has(base)) return base;

  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (allFiles.has(base + ext)) return base + ext;
  }

  for (const idx of ['index.tsx', 'index.ts', 'index.jsx', 'index.js']) {
    const candidate = `${base}/${idx}`;
    if (allFiles.has(candidate)) return candidate;
  }

  return null;
}

function normalizePath(path: string): string {
  const parts = path.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
}
