import type { ParsedFile, ImportInfo, NavLink, FunctionDef, TypeOverride, Language } from '@/types/graph';
import { classifyFile } from './classifier';
import { parseAST } from './astParser';
import { parseNativeFiles } from './nativeParser';

export function parseFiles(
  fileMap: Map<string, string>,
  overrides?: TypeOverride,
  language: Language = 'react',
): Map<string, ParsedFile> {
  if (language === 'swift' || language === 'kotlin') {
    return parseNativeFiles(fileMap, language, overrides);
  }

  const parsed = new Map<string, ParsedFile>();
  for (const [path, content] of fileMap) {
    parsed.set(path, parseFile(path, content, overrides));
  }

  // Second pass: resolve relative imports to actual file paths
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

  // Try AST parser first; it returns astParsed=false on any failure
  const ast = parseAST(path, content, extension);

  // Fall back to regex for any field the AST parser couldn't produce
  const imports = ast.astParsed ? ast.imports : regexImports(content);
  const exports = ast.astParsed ? ast.exports : regexExports(content);
  const components = ast.astParsed ? ast.components : regexComponents(content);
  const hooks = ast.astParsed ? ast.hooks : regexHooks(content);
  const routes = ast.astParsed ? ast.routes : regexRoutes(content);
  const navLinks = ast.astParsed ? ast.navLinks : regexNavLinks(content);
  const allFunctions = ast.astParsed ? ast.allFunctions : regexAllFunctions(content);

  return {
    id: path,
    path,
    name,
    dir,
    extension,
    type: classifyFile(path, name, content, overrides),
    imports,
    resolvedImports: [],
    exports,
    components,
    hooks,
    routes,
    navLinks,
    allFunctions,
    linesOfCode: content.split('\n').length,
    componentInfo: ast.componentInfo,
    interfaceDefinitions: ast.interfaceDefinitions,
    definedHooks: ast.definedHooks,
    astParsed: ast.astParsed,
  };
}

// ─── Regex fallbacks (used when AST parse fails) ──────────────────────────────

function regexImports(content: string): ImportInfo[] {
  const results: ImportInfo[] = [];
  const seen = new Set<string>();

  const staticRe = /import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(content)) !== null) {
    const raw = m[1];
    if (!seen.has(raw)) {
      seen.add(raw);
      results.push({ raw, isRelative: raw.startsWith('.') || raw.startsWith('/'), names: [], isTypeOnly: false });
    }
  }
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(content)) !== null) {
    const raw = m[1];
    if (!seen.has(raw)) {
      seen.add(raw);
      results.push({ raw, isRelative: raw.startsWith('.') || raw.startsWith('/'), names: [], isTypeOnly: false });
    }
  }
  return results;
}

function regexExports(content: string): string[] {
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
      if (re === patterns[2]) m[1].split(',').forEach(n => add(n.trim().split(/\s+as\s+/)[0].trim()));
      else add(m[1]);
    }
  }
  return names;
}

function regexComponents(content: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => { if (n && /^[A-Z]/.test(n) && !seen.has(n)) { seen.add(n); names.push(n); } };
  for (const re of [
    /(?:^|\s)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_$]*)\s*[(<]/gm,
    /(?:^|\s)(?:export\s+)?(?:const|let)\s+([A-Z][A-Za-z0-9_$]*)\s*(?::\s*\w[^=]*?)?\s*=\s*(?:React\.|memo\(|forwardRef\(|\()/gm,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) add(m[1]);
  }
  return names;
}

function regexHooks(content: string): string[] {
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = /\b(use[A-Z][A-Za-z0-9]*)\s*[(<(]/g;
  while ((m = re.exec(content)) !== null) seen.add(m[1]);
  return Array.from(seen).sort();
}

function regexRoutes(content: string): string[] {
  const seen = new Set<string>();
  for (const re of [/path\s*[:=]\s*['"`]([^'"`]+)['"`]/g, /<Route[^>]+path=['"]([^'"]+)['"]/g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) seen.add(m[1]);
  }
  return Array.from(seen);
}

function regexNavLinks(content: string): NavLink[] {
  const links: NavLink[] = [];
  const seen = new Set<string>();
  const add = (t: string, type: NavLink['type']) => {
    const clean = t.split('?')[0].split('#')[0];
    if (clean.startsWith('/') && !seen.has(clean)) { seen.add(clean); links.push({ target: clean, type }); }
  };
  let m: RegExpExecArray | null;
  const linkRe = /<(?:Link|NavLink)\s[^>]*\bto=['"`]([^'"`?#\s]+)/g;
  while ((m = linkRe.exec(content)) !== null) add(m[1], 'link');
  const navRe = /(?:navigate|router\.push|history\.push|router\.replace|history\.replace)\s*\(\s*['"`]([^'"`?#\s]+)/g;
  while ((m = navRe.exec(content)) !== null) add(m[1], 'navigate');
  return links;
}

function regexAllFunctions(content: string): FunctionDef[] {
  const fns: FunctionDef[] = [];
  const seen = new Set<string>();
  const add = (name: string, isAsync: boolean, isExported: boolean) => {
    if (seen.has(name)) return; seen.add(name);
    const kind: FunctionDef['kind'] = /^[A-Z]/.test(name) ? 'component' : /^use[A-Z]/.test(name) ? 'hook' : isAsync ? 'async' : 'function';
    fns.push({ name, kind, isExported });
  };
  let m: RegExpExecArray | null;
  const fnRe = /(export\s+)?(async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<]/gm;
  while ((m = fnRe.exec(content)) !== null) add(m[3], !!m[2], !!m[1]);
  const arrowRe = /(export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(async\s+)?(?:\([^)]*\)|[A-Za-z_$]\w*)\s*=>/gm;
  while ((m = arrowRe.exec(content)) !== null) add(m[2], !!m[3], !!m[1]);
  return fns;
}

// ─── Import resolution ────────────────────────────────────────────────────────

function resolveImport(
  fromPath: string,
  importPath: string,
  allFiles: Map<string, ParsedFile>,
): string | null {
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) return null;

  const fromDir = fromPath.split('/').slice(0, -1).join('/');
  // Guard empty fromDir: a root-level file importing './sibling' must normalize to
  // 'sibling', not '/sibling' — otherwise top-level sibling imports never resolve.
  const base = importPath.startsWith('/')
    ? importPath.slice(1)
    : normalizePath(fromDir ? `${fromDir}/${importPath}` : importPath);

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
